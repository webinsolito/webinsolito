-- MALÙ23 Dealer Platform — Dealer Core V0.2 / Offline + Telegram
-- Fresh Supabase project schema. PostgreSQL + RLS + tenant-aware FKs.
-- No secrets are stored in this file.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.dealer_status as enum ('ACTIVE','SUSPENDED','ARCHIVED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.member_status as enum ('INVITED','ACTIVE','SUSPENDED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.member_role as enum ('ADMIN','VENDITORE','AMMINISTRAZIONE','OPERATORE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.vehicle_status as enum ('IN_ARRIVO','DA_CONTROLLARE','IN_PREPARAZIONE','DA_FOTOGRAFARE','DA_PUBBLICARE','IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA');
exception when duplicate_object then null; end $$;

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text not null,
  display_name text not null,
  logo_url text,
  status public.dealer_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  name text not null,
  city text,
  address text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dealer_id,id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  force_password_change boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  role public.member_role not null,
  status public.member_status not null default 'INVITED',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dealer_id,user_id)
);
create unique index if not exists memberships_username_per_dealer_uq on public.memberships (dealer_id,lower(username));

-- Worker-only. Plain activation keys are never stored.
create table if not exists public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  dealer_hint text,
  key_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  status text not null default 'READY' check (status in ('READY','USED','REVOKED','EXPIRED')),
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  location_branch_id uuid,
  plate text,
  vin text,
  brand text not null,
  model text not null,
  version text,
  first_registration date,
  year smallint,
  mileage integer,
  origin_country text,
  asking_price numeric(12,2),
  sale_price numeric(12,2),
  status public.vehicle_status not null default 'IN_ARRIVO',
  cover_object_key text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id,id),
  foreign key (dealer_id,location_branch_id) references public.branches(dealer_id,id) on delete restrict
);
create unique index if not exists vehicles_plate_per_dealer_uq on public.vehicles (dealer_id,upper(plate)) where plate is not null and deleted_at is null;
create unique index if not exists vehicles_vin_per_dealer_uq on public.vehicles (dealer_id,upper(vin)) where vin is not null and deleted_at is null;

-- Purchase price / minimum price are physically separate from the normal vehicle row.
create table if not exists public.vehicle_financials (
  dealer_id uuid not null,
  vehicle_id uuid not null,
  supplier text,
  purchase_date date,
  purchase_price numeric(12,2) not null default 0,
  minimum_price numeric(12,2),
  vat_regime text not null default 'MARGINE' check (vat_regime in ('IVA_ESPOSTA','MARGINE','PRIVATO_FUORI_CAMPO')),
  updated_at timestamptz not null default now(),
  primary key (dealer_id,vehicle_id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  fiscal_code text,
  next_contact_at timestamptz,
  next_step text,
  status text not null default 'LEAD',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id,id)
);

-- Inbox supports an unassigned document first, then later links it to vehicle/customer.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  vehicle_id uuid,
  customer_id uuid,
  inbox_status text not null default 'UNASSIGNED' check (inbox_status in ('UNASSIGNED','ASSIGNED','ARCHIVED')),
  visibility text not null default 'PRIVATE' check (visibility in ('PUBLIC','PRIVATE')),
  object_key text not null,
  original_name text not null,
  mime_type text,
  sha256 text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict,
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict
);

create table if not exists public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  category text not null,
  supplier text,
  amount numeric(12,2) not null check (amount>=0),
  occurred_on date not null default current_date,
  source_document_id uuid,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict,
  foreign key (dealer_id,source_document_id) references public.documents(dealer_id,id) on delete restrict
);

create table if not exists public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  event_type text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

create table if not exists public.telegram_links (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint not null,
  linked_at timestamptz not null default now(),
  primary key (dealer_id,user_id),
  unique (dealer_id,telegram_user_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- 2026 Data API: GRANT and RLS are separate layers.
grant usage on schema public to authenticated,service_role;
grant select on public.dealers,public.branches,public.profiles,public.memberships to authenticated;
grant select,insert,update on public.vehicles,public.customers,public.documents,public.vehicle_events to authenticated;
grant select,insert,update on public.vehicle_financials,public.vehicle_costs to authenticated;
grant select on public.telegram_links,public.audit_logs to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
-- activation_keys intentionally receives no authenticated grant.

alter table public.dealers enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.activation_keys enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_financials enable row level security;
alter table public.customers enable row level security;
alter table public.documents enable row level security;
alter table public.vehicle_costs enable row level security;
alter table public.vehicle_events enable row level security;
alter table public.telegram_links enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy memberships_self_select on public.memberships for select to authenticated using ((select auth.uid())=user_id);

create policy dealers_member_select on public.dealers for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=dealers.id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy branches_member_select on public.branches for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=branches.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy vehicles_member_select on public.vehicles for select to authenticated using (
  deleted_at is null and exists(select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy vehicles_member_insert on public.vehicles for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);
create policy vehicles_member_update on public.vehicles for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);

create policy financials_member_select on public.vehicle_financials for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'view_costs')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy financials_member_insert on public.vehicle_financials for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy financials_member_update on public.vehicle_financials for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);

create policy customers_member_select on public.customers for select to authenticated using (
  deleted_at is null and exists(select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy customers_member_insert on public.customers for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);
create policy customers_member_update on public.customers for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);

create policy documents_member_select on public.documents for select to authenticated using (
  deleted_at is null and exists(select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy documents_member_insert on public.documents for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy documents_member_update on public.documents for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy costs_member_select on public.vehicle_costs for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'view_costs')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy costs_member_insert on public.vehicle_costs for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy costs_member_update on public.vehicle_costs for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);

create policy events_member_select on public.vehicle_events for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy events_member_insert on public.vehicle_events for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy events_member_update on public.vehicle_events for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy telegram_link_self_select on public.telegram_links for select to authenticated using ((select auth.uid())=user_id);
create policy audit_admin_select on public.audit_logs for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=audit_logs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and m.role='ADMIN')
);

-- Activation finalization. The Worker first creates the Auth user through Supabase Admin API,
-- then calls this private function. Dealer + branch + profile + membership + key consumption
-- happen in one database transaction. If this fails the Worker deletes the pre-created Auth user.
create or replace function private.finalize_dealer_activation(
  p_key_hash text,
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_slug text,
  p_legal_name text,
  p_dealer_name text,
  p_branch_name text default 'Sede principale',
  p_city text default null
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_key public.activation_keys%rowtype;
  v_dealer_id uuid;
begin
  select * into v_key from public.activation_keys
  where key_hash=p_key_hash and status='READY'
  for update;
  if not found then raise exception 'activation_key_invalid'; end if;
  if v_key.expires_at is not null and v_key.expires_at<now() then
    update public.activation_keys set status='EXPIRED' where id=v_key.id;
    raise exception 'activation_key_expired';
  end if;

  insert into public.dealers(slug,legal_name,display_name) values(lower(p_slug),p_legal_name,p_dealer_name) returning id into v_dealer_id;
  insert into public.branches(dealer_id,name,city,is_primary) values(v_dealer_id,p_branch_name,p_city,true);
  insert into public.profiles(user_id,display_name,force_password_change) values(p_user_id,p_display_name,true)
    on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now();
  insert into public.memberships(dealer_id,user_id,username,role,status,permissions)
    values(v_dealer_id,p_user_id,lower(p_username),'ADMIN','ACTIVE','{"garage_write":true,"customers_write":true,"view_costs":true,"costs_write":true}'::jsonb);
  update public.activation_keys set status='USED',used_at=now() where id=v_key.id;
  return v_dealer_id;
end;
$$;
revoke all on function private.finalize_dealer_activation(text,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.finalize_dealer_activation(text,uuid,text,text,text,text,text,text,text) to service_role;

create index if not exists memberships_user_active_idx on public.memberships(user_id,dealer_id,status);
create index if not exists memberships_dealer_username_idx on public.memberships(dealer_id,lower(username),status);
create index if not exists vehicles_dealer_status_idx on public.vehicles(dealer_id,status) where deleted_at is null;
create index if not exists customers_dealer_next_idx on public.customers(dealer_id,next_contact_at) where deleted_at is null;
create index if not exists vehicle_costs_vehicle_idx on public.vehicle_costs(dealer_id,vehicle_id);
create index if not exists vehicle_events_vehicle_time_idx on public.vehicle_events(dealer_id,vehicle_id,happened_at desc);
create index if not exists documents_vehicle_idx on public.documents(dealer_id,vehicle_id) where deleted_at is null;
create index if not exists documents_inbox_idx on public.documents(dealer_id,inbox_status,created_at desc) where deleted_at is null;
create index if not exists telegram_user_idx on public.telegram_links(telegram_user_id);
create index if not exists audit_dealer_time_idx on public.audit_logs(dealer_id,created_at desc);
