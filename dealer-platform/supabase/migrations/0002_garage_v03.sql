-- MALÙ23 Dealer Platform — Garage V0.3
-- Extends the Garage with work/checklist items, media metadata and idempotent financial rows.

alter table public.vehicle_financials
  add column if not exists id uuid default gen_random_uuid();

update public.vehicle_financials
set id=gen_random_uuid()
where id is null;

alter table public.vehicle_financials
  alter column id set not null;

create unique index if not exists vehicle_financials_id_uq
  on public.vehicle_financials(id);

create table if not exists public.vehicle_work_items (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  title text not null,
  category text not null default 'ALTRO',
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE','CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  due_date date,
  completed_at timestamptz,
  supplier text,
  estimated_cost numeric(12,2),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

create table if not exists public.vehicle_media (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  vehicle_id uuid not null,
  kind text not null default 'PHOTO' check (kind in ('PHOTO','VIDEO')),
  object_key text not null,
  thumb_object_key text,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

grant select,insert,update on public.vehicle_work_items, public.vehicle_media to authenticated;

alter table public.vehicle_work_items enable row level security;
alter table public.vehicle_media enable row level security;

create policy vehicle_work_items_member_select on public.vehicle_work_items for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_work_items.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy vehicle_work_items_member_insert on public.vehicle_work_items for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_work_items.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);
create policy vehicle_work_items_member_update on public.vehicle_work_items for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_work_items.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_work_items.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);

create policy vehicle_media_member_select on public.vehicle_media for select to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_media.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy vehicle_media_member_insert on public.vehicle_media for insert to authenticated with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_media.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);
create policy vehicle_media_member_update on public.vehicle_media for update to authenticated using (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_media.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
) with check (
  exists (select 1 from public.memberships m where m.dealer_id=vehicle_media.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'garage_write')::boolean,m.role in ('ADMIN','VENDITORE','OPERATORE')))
);

create index if not exists vehicle_work_items_vehicle_idx on public.vehicle_work_items(dealer_id,vehicle_id,status,due_date);
create index if not exists vehicle_media_vehicle_idx on public.vehicle_media(dealer_id,vehicle_id,sort_order);
