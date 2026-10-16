-- Dealer Cockpit: 30-day controlled access renewal.
-- Mirrors the live Supabase migrations applied on 2026-10-16.

alter table public.dealers add column if not exists access_expires_at timestamptz;
alter table public.dealers add column if not exists last_renewed_at timestamptz;
update public.dealers set access_expires_at=coalesce(access_expires_at,now()+interval '30 days'),last_renewed_at=coalesce(last_renewed_at,now()) where status='ACTIVE';
alter table public.dealers alter column access_expires_at set default (now()+interval '30 days');

alter table public.profiles add column if not exists password_changed_at timestamptz;
update public.profiles set password_changed_at=coalesce(password_changed_at,updated_at,created_at,now()) where force_password_change=false;

create table if not exists public.dealer_renewal_requests(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check(status in('PENDING','APPROVED','REJECTED')),
  previous_expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  new_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  claim_secret_hash text
);
create unique index if not exists dealer_renewal_requests_one_pending_idx on public.dealer_renewal_requests(dealer_id) where status='PENDING';
create index if not exists dealer_renewal_requests_status_requested_idx on public.dealer_renewal_requests(status,requested_at desc);
alter table public.dealer_renewal_requests enable row level security;
drop policy if exists dealer_renewal_requests_deny_all on public.dealer_renewal_requests;
create policy dealer_renewal_requests_deny_all on public.dealer_renewal_requests for all to anon,authenticated using(false) with check(false);

create or replace function private.dealer_access_allowed(p_dealer_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.dealers d
    join public.memberships m on m.dealer_id=d.id
    join public.profiles p on p.user_id=m.user_id
    where d.id=p_dealer_id and d.status='ACTIVE' and d.access_expires_at>now()
      and m.user_id=(select auth.uid()) and m.status='ACTIVE'
      and coalesce(p.force_password_change,false)=false
  );
$$;

create or replace function private.dealer_access_allowed_text(p_dealer_id text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_dealer_id is null then return false; end if;
  return private.dealer_access_allowed(p_dealer_id::uuid);
exception when invalid_text_representation then return false;
end;
$$;
grant usage on schema private to authenticated;
grant execute on function private.dealer_access_allowed(uuid) to authenticated;
grant execute on function private.dealer_access_allowed_text(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['branches','calendar_events','contract_versions','contracts','customer_interactions','customer_vehicle_interests','customers','documents','instagram_posts','invoices','memberships','telegram_links','vehicle_costs','vehicle_events','vehicle_financials','vehicle_media','vehicle_work_items','vehicles'] loop
    execute format('drop policy if exists dealer_access_gate on public.%I',t);
    execute format('create policy dealer_access_gate on public.%I as restrictive for all to authenticated using (private.dealer_access_allowed(dealer_id)) with check (private.dealer_access_allowed(dealer_id))',t);
  end loop;
end $$;
drop policy if exists dealer_access_gate on public.dealers;
create policy dealer_access_gate on public.dealers as restrictive for select to authenticated using(private.dealer_access_allowed(id));

drop policy if exists dealer_monthly_access_gate on storage.objects;
create policy dealer_monthly_access_gate on storage.objects as restrictive for all to authenticated
using(bucket_id not in('dealer-vehicle-media','dealer-private-docs') or ((storage.foldername(name))[1]='private' and private.dealer_access_allowed_text((storage.foldername(name))[2])))
with check(bucket_id not in('dealer-vehicle-media','dealer-private-docs') or ((storage.foldername(name))[1]='private' and private.dealer_access_allowed_text((storage.foldername(name))[2])));

create or replace function public.security_revoke_exact_session(p_user_id uuid,p_session_id uuid)
returns boolean language plpgsql security definer set search_path=auth,pg_temp as $$
begin
  update auth.refresh_tokens set revoked=true,updated_at=now() where user_id=p_user_id::text and session_id=p_session_id and coalesce(revoked,false)=false;
  delete from auth.sessions where user_id=p_user_id and id=p_session_id;
  return found;
end;
$$;
revoke all on function public.security_revoke_exact_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_revoke_exact_session(uuid,uuid) to service_role;

create or replace function public.security_dealer_user_access_allowed(p_dealer_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.dealers d
    join public.memberships m on m.dealer_id=d.id and m.user_id=p_user_id
    join public.profiles p on p.user_id=p_user_id
    where d.id=p_dealer_id and d.status='ACTIVE' and d.access_expires_at>now()
      and m.status='ACTIVE' and coalesce(p.force_password_change,false)=false
  );
$$;
revoke all on function public.security_dealer_user_access_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_dealer_user_access_allowed(uuid,uuid) to service_role;

create or replace function public.track_password_change_time()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.force_password_change=true and new.force_password_change=false then new.password_changed_at=now(); end if;
  return new;
end;
$$;
drop trigger if exists trg_track_password_change_time on public.profiles;
create trigger trg_track_password_change_time before update of force_password_change on public.profiles for each row execute function public.track_password_change_time();

create or replace function public.platform_approve_renewal(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare r public.dealer_renewal_requests%rowtype; d public.dealers%rowtype; v_new_expiry timestamptz; u record;
begin
  select * into r from public.dealer_renewal_requests where id=p_request_id for update;
  if not found then raise exception 'renewal_not_found'; end if;
  if r.status<>'PENDING' then raise exception 'renewal_not_pending'; end if;
  select * into d from public.dealers where id=r.dealer_id for update;
  if not found or d.status<>'ACTIVE' then raise exception 'dealer_not_active'; end if;
  v_new_expiry:=greatest(coalesce(d.access_expires_at,now()),now())+interval '30 days';
  update public.dealers set access_expires_at=v_new_expiry,last_renewed_at=now(),updated_at=now() where id=d.id;
  update public.profiles p set force_password_change=true,updated_at=now() where exists(select 1 from public.memberships m where m.dealer_id=d.id and m.user_id=p.user_id and m.status='ACTIVE');
  for u in select user_id from public.memberships where dealer_id=d.id and status='ACTIVE' loop perform public.security_revoke_user_sessions(u.user_id,null); end loop;
  update public.dealer_renewal_requests set status='APPROVED',approved_at=now(),new_expires_at=v_new_expiry,updated_at=now() where id=r.id;
  return jsonb_build_object('dealer_id',d.id,'display_name',d.display_name,'access_expires_at',v_new_expiry);
end;
$$;

create or replace function public.platform_reject_renewal(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.dealer_renewal_requests set status='REJECTED',rejected_at=now(),updated_at=now() where id=p_request_id and status='PENDING';
  return found;
end;
$$;
revoke all on function public.platform_approve_renewal(uuid) from public,anon,authenticated;
revoke all on function public.platform_reject_renewal(uuid) from public,anon,authenticated;
grant execute on function public.platform_approve_renewal(uuid) to service_role;
grant execute on function public.platform_reject_renewal(uuid) to service_role;

create or replace function public.refresh_dealer_access_on_registration_activation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='ACTIVATED' and old.status is distinct from 'ACTIVATED' and new.dealer_id is not null then
    update public.dealers set access_expires_at=now()+interval '30 days',last_renewed_at=now(),updated_at=now() where id=new.dealer_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_refresh_dealer_access_on_activation on public.dealer_registration_requests;
create trigger trg_refresh_dealer_access_on_activation after update of status on public.dealer_registration_requests for each row execute function public.refresh_dealer_access_on_registration_activation();
