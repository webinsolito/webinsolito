-- MALÙ23 Dealer Platform — Clienti / CRM V0.4

alter table public.customers
  add column if not exists source text,
  add column if not exists notes text,
  add column if not exists preferred_contact text;

create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  customer_id uuid not null,
  channel text not null default 'NOTE' check (channel in ('TELEFONO','WHATSAPP','EMAIL','VISITA','TEST_DRIVE','NOTE')),
  title text not null,
  happened_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict
);

create table if not exists public.customer_vehicle_interests (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid not null,
  status text not null default 'INTERESSATO' check (status in ('INTERESSATO','TEST_DRIVE','OFFERTA','TRATTATIVA','VINTA','PERSA')),
  offer_amount numeric(12,2),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  unique (dealer_id,customer_id,vehicle_id),
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict,
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

grant select,insert,update on public.customer_interactions, public.customer_vehicle_interests to authenticated;

alter table public.customer_interactions enable row level security;
alter table public.customer_vehicle_interests enable row level security;

create policy customer_interactions_member_select on public.customer_interactions for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=customer_interactions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy customer_interactions_member_insert on public.customer_interactions for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=customer_interactions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);
create policy customer_interactions_member_update on public.customer_interactions for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=customer_interactions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=customer_interactions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);

create policy customer_vehicle_interests_member_select on public.customer_vehicle_interests for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=customer_vehicle_interests.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy customer_vehicle_interests_member_insert on public.customer_vehicle_interests for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=customer_vehicle_interests.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);
create policy customer_vehicle_interests_member_update on public.customer_vehicle_interests for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=customer_vehicle_interests.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=customer_vehicle_interests.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'customers_write')::boolean,m.role in ('ADMIN','VENDITORE')))
);

create index if not exists customer_interactions_customer_time_idx on public.customer_interactions(dealer_id,customer_id,happened_at desc);
create index if not exists customer_vehicle_interests_customer_idx on public.customer_vehicle_interests(dealer_id,customer_id,status);
create index if not exists customers_status_next_idx on public.customers(dealer_id,status,next_contact_at) where deleted_at is null;
