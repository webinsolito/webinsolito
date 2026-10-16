-- Dealer Cockpit: platform OWNER console + audited temporary support access.

alter table public.platform_owners
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists platform_owners_auth_user_id_uidx
  on public.platform_owners(auth_user_id)
  where auth_user_id is not null;

-- Bootstrap the current private installation without hard-coding generated IDs:
-- only bind automatically when exactly one active platform owner and one Auth user exist.
do $$
declare
  v_owner_count integer;
  v_user_count integer;
  v_user_id uuid;
begin
  select count(*) into v_owner_count from public.platform_owners where active=true;
  select count(*) into v_user_count from auth.users;
  if v_owner_count=1 and v_user_count=1 then
    select id into v_user_id from auth.users limit 1;
    update public.platform_owners
       set auth_user_id=coalesce(auth_user_id,v_user_id)
     where active=true;
  end if;
end $$;

create table if not exists public.owner_support_sessions(
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  reason text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '60 minutes'),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expires_at>started_at)
);

create index if not exists owner_support_sessions_owner_idx
  on public.owner_support_sessions(owner_user_id,started_at desc);
create index if not exists owner_support_sessions_dealer_idx
  on public.owner_support_sessions(dealer_id,started_at desc);
create unique index if not exists owner_support_sessions_one_active_per_owner_idx
  on public.owner_support_sessions(owner_user_id)
  where ended_at is null;

alter table public.owner_support_sessions enable row level security;
drop policy if exists owner_support_sessions_deny_all on public.owner_support_sessions;
create policy owner_support_sessions_deny_all
  on public.owner_support_sessions
  for all to anon,authenticated
  using(false)
  with check(false);

create or replace function private.owner_support_allowed(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
      from public.platform_owners po
      join public.owner_support_sessions s
        on s.owner_user_id=po.auth_user_id
      join public.dealers d
        on d.id=s.dealer_id
     where po.auth_user_id=(select auth.uid())
       and po.active=true
       and s.dealer_id=p_dealer_id
       and s.ended_at is null
       and s.expires_at>now()
       and d.status<>'ARCHIVED'
  );
$$;

create or replace function private.owner_support_allowed_text(p_dealer_id text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if p_dealer_id is null then return false; end if;
  return private.owner_support_allowed(p_dealer_id::uuid);
exception when invalid_text_representation then return false;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.owner_support_allowed(uuid) to authenticated;
grant execute on function private.owner_support_allowed_text(text) to authenticated;

-- Existing tenant users keep the exact monthly/password gate.
-- A platform owner only gets cross-tenant access after an explicit, unexpired support session.
create or replace function private.dealer_access_allowed(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select private.owner_support_allowed(p_dealer_id)
  or exists(
    select 1
      from public.dealers d
      join public.memberships m on m.dealer_id=d.id
      join public.profiles p on p.user_id=m.user_id
     where d.id=p_dealer_id
       and d.status='ACTIVE'
       and d.access_expires_at is not null
       and d.access_expires_at>now()
       and m.user_id=(select auth.uid())
       and m.status='ACTIVE'
       and coalesce(p.force_password_change,false)=false
  );
$$;

create or replace function private.dealer_access_allowed_text(p_dealer_id text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if p_dealer_id is null then return false; end if;
  return private.dealer_access_allowed(p_dealer_id::uuid);
exception when invalid_text_representation then return false;
end;
$$;

grant execute on function private.dealer_access_allowed(uuid) to authenticated;
grant execute on function private.dealer_access_allowed_text(text) to authenticated;

create or replace function public.security_platform_owner_support_allowed(p_dealer_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
      from public.platform_owners po
      join public.owner_support_sessions s on s.owner_user_id=po.auth_user_id
      join public.dealers d on d.id=s.dealer_id
     where po.auth_user_id=p_user_id
       and po.active=true
       and s.dealer_id=p_dealer_id
       and s.ended_at is null
       and s.expires_at>now()
       and d.status<>'ARCHIVED'
  );
$$;
revoke all on function public.security_platform_owner_support_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_platform_owner_support_allowed(uuid,uuid) to service_role;

create or replace function public.security_dealer_user_access_allowed(p_dealer_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.security_platform_owner_support_allowed(p_dealer_id,p_user_id)
  or exists(
    select 1
      from public.dealers d
      join public.memberships m on m.dealer_id=d.id and m.user_id=p_user_id
      join public.profiles p on p.user_id=p_user_id
     where d.id=p_dealer_id
       and d.status='ACTIVE'
       and d.access_expires_at is not null
       and d.access_expires_at>now()
       and m.status='ACTIVE'
       and coalesce(p.force_password_change,false)=false
  );
$$;
revoke all on function public.security_dealer_user_access_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_dealer_user_access_allowed(uuid,uuid) to service_role;

-- RLS: owner access is a separate permissive path, but still passes the existing
-- restrictive dealer/account gates and only works while a support session is active.
do $$
declare
  t text;
begin
  foreach t in array array[
    'branches','calendar_events','contract_versions','contracts','customer_interactions',
    'customer_vehicle_interests','customers','documents','instagram_posts','invoices',
    'memberships','telegram_links','vehicle_costs','vehicle_events','vehicle_financials',
    'vehicle_media','vehicle_work_items','vehicles'
  ] loop
    execute format('drop policy if exists owner_support_access on public.%I',t);
    execute format(
      'create policy owner_support_access on public.%I for all to authenticated using (private.owner_support_allowed(dealer_id)) with check (private.owner_support_allowed(dealer_id))',
      t
    );
  end loop;
end $$;

drop policy if exists dealers_owner_support_select on public.dealers;
create policy dealers_owner_support_select
  on public.dealers
  for select to authenticated
  using(private.owner_support_allowed(id));

-- Private files/photos remain tenant isolated. The owner path is only opened for
-- the dealer selected through an explicit support session.
drop policy if exists dealer_vehicle_media_owner_support on storage.objects;
create policy dealer_vehicle_media_owner_support
  on storage.objects
  for all to authenticated
  using(
    bucket_id='dealer-vehicle-media'
    and (storage.foldername(name))[1]='private'
    and private.owner_support_allowed_text((storage.foldername(name))[2])
  )
  with check(
    bucket_id='dealer-vehicle-media'
    and (storage.foldername(name))[1]='private'
    and private.owner_support_allowed_text((storage.foldername(name))[2])
  );

drop policy if exists dealer_private_docs_owner_support on storage.objects;
create policy dealer_private_docs_owner_support
  on storage.objects
  for all to authenticated
  using(
    bucket_id='dealer-private-docs'
    and (storage.foldername(name))[1]='private'
    and private.owner_support_allowed_text((storage.foldername(name))[2])
  )
  with check(
    bucket_id='dealer-private-docs'
    and (storage.foldername(name))[1]='private'
    and private.owner_support_allowed_text((storage.foldername(name))[2])
  );
