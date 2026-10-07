-- MALÙ23 Dealer Platform — Dealer Core V0.1 / Garage V0.1
-- Fresh Supabase project schema. No secrets. PostgreSQL + RLS + tenant-aware FKs.

create extension if not exists pgcrypto;

create type public.dealer_status as enum ('ACTIVE','SUSPENDED','ARCHIVED');
create type public.member_status as enum ('INVITED','ACTIVE','SUSPENDED');
create type public.member_role as enum ('ADMIN','VENDITORE','AMMINISTRAZIONE','OPERATORE');
create type public.vehicle_status as enum ('IN_ARRIVO','DA_CONTROLLARE','IN_PREPARAZIONE','DA_FOTOGRAFARE','DA_PUBBLICARE','IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA');

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text not null,
  display_name text not null,
  logo_url text,
  status public.dealer_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  name text not null,
  city text,
  address text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dealer_id, id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  force_password_change boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_uq on public.profiles (lower(username));

create table public.memberships (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'INVITED',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (dealer_id, user_id)
);

-- Worker-only table. Plain activation keys are never stored.
create table public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  dealer_hint text,
  key_hash text not null unique,
  expires_at timestamptz,
  used_at timestamptz,
  status text not null default 'READY' check (status in ('READY','USED','REVOKED','EXPIRED')),
  created_at timestamptz not null default now()
);

create table public.vehicles (
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
  unique (dealer_id, id),
  foreign key (dealer_id, location_branch_id) references public.branches(dealer_id, id) on delete restrict
);
create unique index vehicles_plate_per_dealer_uq on public.vehicles (dealer_id, upper(plate)) where plate is not null and deleted_at is null;
create unique index vehicles_vin_per_dealer_uq on public.vehicles (dealer_id, upper(vin)) where vin is not null and deleted_at is null;

-- Sensitive economics are physically separated from normal vehicle rows.
-- A seller can see the car without automatically seeing purchase price or minimum price.
create table public.vehicle_financials (
  dealer_id uuid not null,
  vehicle_id uuid not null,
  supplier text,
  purchase_date date,
  purchase_price numeric(12,2) not null default 0,
  minimum_price numeric(12,2),
  vat_regime text not null default 'MARGINE' check (vat_regime in ('IVA_ESPOSTA','MARGINE','PRIVATO_FUORI_CAMPO')),
  updated_at timestamptz not null default now(),
  primary key (dealer_id, vehicle_id),
  foreign key (dealer_id, vehicle_id) references public.vehicles(dealer_id, id) on delete restrict
);

create table public.customers (
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
  unique (dealer_id, id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  vehicle_id uuid,
  customer_id uuid,
  visibility text not null default 'PRIVATE' check (visibility in ('PUBLIC','PRIVATE')),
  object_key text not null,
  original_name text not null,
  mime_type text,
  sha256 text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id, id),
  foreign key (dealer_id, vehicle_id) references public.vehicles(dealer_id, id) on delete restrict,
  foreign key (dealer_id, customer_id) references public.customers(dealer_id, id) on delete restrict,
  check (vehicle_id is not null or customer_id is not null)
);

create table public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  category text not null,
  supplier text,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  source_document_id uuid,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (dealer_id, vehicle_id) references public.vehicles(dealer_id, id) on delete restrict,
  foreign key (dealer_id, source_document_id) references public.documents(dealer_id, id) on delete restrict
);

create table public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  event_type text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  foreign key (dealer_id, vehicle_id) references public.vehicles(dealer_id, id) on delete restrict
);

create table public.telegram_links (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  linked_at timestamptz not null default now(),
  primary key (dealer_id, user_id)
);

create table public.audit_logs (
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

-- Supabase 2026: Data API access is explicit and separate from RLS.
grant usage on schema public to authenticated;
grant select on public.dealers, public.branches, public.profiles, public.memberships to authenticated;
grant select, insert, update on public.vehicles, public.customers, public.documents, public.vehicle_events to authenticated;
grant select, insert, update on public.vehicle_financials, public.vehicle_costs to authenticated;
grant select on public.telegram_links, public.audit_logs to authenticated;
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

create policy profiles_self_select on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy memberships_self_select on public.memberships for select to authenticated
using ((select auth.uid()) = user_id);

create policy dealers_member_select on public.dealers for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=dealers.id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy branches_member_select on public.branches for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=branches.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy vehicles_member_select on public.vehicles for select to authenticated using (
  deleted_at is null and exists (select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy vehicles_member_insert on public.vehicles for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);
create policy vehicles_member_update on public.vehicles for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicles.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);

create policy financials_member_select on public.vehicle_financials for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'view_costs')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy financials_member_insert on public.vehicle_financials for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy financials_member_update on public.vehicle_financials for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_financials.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);

create policy customers_member_select on public.customers for select to authenticated using (
  deleted_at is null and exists (select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy customers_member_insert on public.customers for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);
create policy customers_member_update on public.customers for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=customers.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);

create policy documents_member_select on public.documents for select to authenticated using (
  deleted_at is null and exists (select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy documents_member_insert on public.documents for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy documents_member_update on public.documents for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=documents.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy costs_member_select on public.vehicle_costs for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'view_costs')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy costs_member_insert on public.vehicle_costs for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);
create policy costs_member_update on public.vehicle_costs for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_costs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'costs_write')::boolean,m.role in ('ADMIN','AMMINISTRAZIONE')))
);

create policy events_member_select on public.vehicle_events for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy events_member_insert on public.vehicle_events for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_events.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);

create policy telegram_link_self_select on public.telegram_links for select to authenticated
using ((select auth.uid())=user_id);

create policy audit_admin_select on public.audit_logs for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=audit_logs.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and m.role='ADMIN')
);

create index memberships_user_active_idx on public.memberships (user_id,dealer_id,status);
create index vehicles_dealer_status_idx on public.vehicles (dealer_id,status) where deleted_at is null;
create index customers_dealer_next_idx on public.customers (dealer_id,next_contact_at) where deleted_at is null;
create index vehicle_costs_vehicle_idx on public.vehicle_costs (dealer_id,vehicle_id);
create index vehicle_events_vehicle_time_idx on public.vehicle_events (dealer_id,vehicle_id,happened_at desc);
create index documents_vehicle_idx on public.documents (dealer_id,vehicle_id) where deleted_at is null;
create index audit_dealer_time_idx on public.audit_logs (dealer_id,created_at desc);
