-- Dealer Platform V1.8 — security hardening.
-- Defense in depth: least privilege grants, protected finance roles,
-- server-only rate limiting and active-session validation.

begin;

-- 1) Data API least privilege. Anonymous users never need direct table access.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from authenticated;

-- Read-only account/bootstrap data.
grant select on public.dealers, public.branches, public.profiles, public.memberships to authenticated;

-- Offline-first business data used directly by the authenticated PWA.
grant select,insert,update on
  public.vehicles,
  public.vehicle_financials,
  public.vehicle_costs,
  public.vehicle_events,
  public.vehicle_work_items,
  public.vehicle_media,
  public.customers,
  public.customer_interactions,
  public.customer_vehicle_interests,
  public.calendar_events,
  public.documents,
  public.contracts,
  public.contract_versions,
  public.invoices,
  public.instagram_posts
  to authenticated;

-- Server-side integrations remain service-role only.
revoke all on public.activation_keys, public.telegram_links, public.audit_logs from authenticated, anon;
grant all privileges on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Future tables/functions do not inherit broad browser privileges.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant usage,select on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- 2) Worker-only security state.
create table if not exists public.security_rate_limits (
  action text not null check (action in ('LOGIN','ACTIVATE')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (action,subject_hash)
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  dealer_id uuid references public.dealers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  severity text not null default 'INFO' check (severity in ('INFO','WARN','CRITICAL')),
  subject_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.security_rate_limits enable row level security;
alter table public.security_events enable row level security;
revoke all on public.security_rate_limits, public.security_events from anon, authenticated;
grant all on public.security_rate_limits, public.security_events to service_role;
grant usage,select on sequence public.security_events_id_seq to service_role;

drop policy if exists security_rate_limits_deny_all on public.security_rate_limits;
create policy security_rate_limits_deny_all on public.security_rate_limits
  as restrictive for all to anon,authenticated using (false) with check (false);

drop policy if exists security_events_deny_all on public.security_events;
create policy security_events_deny_all on public.security_events
  as restrictive for all to anon,authenticated using (false) with check (false);

-- activation_keys intentionally has zero browser access; an explicit policy also
-- removes ambiguity and keeps security advisors from treating it as unfinished.
drop policy if exists activation_keys_deny_all on public.activation_keys;
create policy activation_keys_deny_all on public.activation_keys
  as restrictive for all to anon,authenticated using (false) with check (false);

-- 3) Membership permissions may reduce a role, never escalate a protected role.
alter table public.memberships drop constraint if exists memberships_sensitive_permissions_guard;
alter table public.memberships add constraint memberships_sensitive_permissions_guard check (
  not (role <> 'ADMIN' and coalesce(permissions->>'admin_manage','false') = 'true')
  and not (
    role in ('VENDITORE','OPERATORE') and (
      coalesce(permissions->>'invoices_view','false') = 'true'
      or coalesce(permissions->>'invoices_write','false') = 'true'
      or coalesce(permissions->>'finance_view','false') = 'true'
      or coalesce(permissions->>'view_costs','false') = 'true'
      or coalesce(permissions->>'costs_write','false') = 'true'
      or coalesce(permissions->>'reports_view','false') = 'true'
    )
  )
);

-- 4) Financial data requires an allowed role AND a non-disabled permission.
drop policy if exists financials_member_select on public.vehicle_financials;
create policy financials_member_select on public.vehicle_financials for select to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_financials.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'view_costs','true')='true')
);
drop policy if exists financials_member_insert on public.vehicle_financials;
create policy financials_member_insert on public.vehicle_financials for insert to authenticated with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_financials.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
);
drop policy if exists financials_member_update on public.vehicle_financials;
create policy financials_member_update on public.vehicle_financials for update to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_financials.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
) with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_financials.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
);

drop policy if exists costs_member_select on public.vehicle_costs;
create policy costs_member_select on public.vehicle_costs for select to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_costs.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'view_costs','true')='true')
);
drop policy if exists costs_member_insert on public.vehicle_costs;
create policy costs_member_insert on public.vehicle_costs for insert to authenticated with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_costs.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
);
drop policy if exists costs_member_update on public.vehicle_costs;
create policy costs_member_update on public.vehicle_costs for update to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_costs.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
) with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=vehicle_costs.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'costs_write','true')='true')
);

drop policy if exists invoices_member_select on public.invoices;
create policy invoices_member_select on public.invoices for select to authenticated using (
  deleted_at is null and exists(select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'invoices_view','true')='true')
);
drop policy if exists invoices_member_insert on public.invoices;
create policy invoices_member_insert on public.invoices for insert to authenticated with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'invoices_write','true')='true')
);
drop policy if exists invoices_member_update on public.invoices;
create policy invoices_member_update on public.invoices for update to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'invoices_write','true')='true')
) with check (
  exists(select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'invoices_write','true')='true')
);

-- Audit logs are readable only through the server-side Admin flow.
drop policy if exists audit_admin_select on public.audit_logs;
create policy audit_admin_select on public.audit_logs for select to authenticated using (
  exists(select 1 from public.memberships m
    where m.dealer_id=audit_logs.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role='ADMIN')
);

-- 5) Strict server-side session revocation check.
create or replace function public.security_session_active(p_user_id uuid,p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = auth, pg_temp
as $$
  select exists(
    select 1 from auth.sessions s
    where s.id=p_session_id
      and s.user_id=p_user_id
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function public.security_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_session_active(uuid,uuid) to service_role;

-- 6) Atomic account-key rate limiter. Identifiers are SHA-256 hashes only.
create or replace function public.security_rate_limit(p_action text,p_subject_hash text,p_event text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.security_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_limit integer;
  v_window interval;
  v_block interval;
  v_retry integer := 0;
begin
  if p_subject_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_subject_hash'; end if;
  if p_action='LOGIN' then v_limit:=8; v_window:=interval '15 minutes'; v_block:=interval '15 minutes';
  elsif p_action='ACTIVATE' then v_limit:=6; v_window:=interval '15 minutes'; v_block:=interval '30 minutes';
  else raise exception 'invalid_rate_action'; end if;
  if p_event not in ('CHECK','FAIL','SUCCESS') then raise exception 'invalid_rate_event'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action||':'||p_subject_hash,0));

  if p_event='SUCCESS' then
    delete from public.security_rate_limits where action=p_action and subject_hash=p_subject_hash;
    return jsonb_build_object('allowed',true,'attempts',0,'retry_after',0);
  end if;

  select * into r from public.security_rate_limits
   where action=p_action and subject_hash=p_subject_hash for update;

  if found and r.blocked_until is not null and r.blocked_until > v_now then
    v_retry:=greatest(1,ceil(extract(epoch from (r.blocked_until-v_now)))::integer);
    return jsonb_build_object('allowed',false,'attempts',r.attempts,'retry_after',v_retry);
  end if;

  if p_event='CHECK' then
    return jsonb_build_object('allowed',true,'attempts',coalesce(r.attempts,0),'retry_after',0);
  end if;

  if not found then
    insert into public.security_rate_limits(action,subject_hash,window_started_at,attempts,updated_at)
    values(p_action,p_subject_hash,v_now,1,v_now)
    returning * into r;
  elsif r.window_started_at + v_window <= v_now then
    update public.security_rate_limits set window_started_at=v_now,attempts=1,blocked_until=null,updated_at=v_now
    where action=p_action and subject_hash=p_subject_hash returning * into r;
  else
    update public.security_rate_limits set attempts=attempts+1,updated_at=v_now
    where action=p_action and subject_hash=p_subject_hash returning * into r;
  end if;

  if r.attempts >= v_limit then
    update public.security_rate_limits set blocked_until=v_now+v_block,updated_at=v_now
    where action=p_action and subject_hash=p_subject_hash returning * into r;
    v_retry:=ceil(extract(epoch from v_block))::integer;
    return jsonb_build_object('allowed',false,'attempts',r.attempts,'retry_after',v_retry);
  end if;

  return jsonb_build_object('allowed',true,'attempts',r.attempts,'retry_after',0);
end;
$$;
revoke all on function public.security_rate_limit(text,text,text) from public,anon,authenticated;
grant execute on function public.security_rate_limit(text,text,text) to service_role;

-- Existing server-only Telegram secret RPC remains service-role only.
revoke all on function public.telegram_runtime_config() from public,anon,authenticated;
grant execute on function public.telegram_runtime_config() to service_role;

commit;
