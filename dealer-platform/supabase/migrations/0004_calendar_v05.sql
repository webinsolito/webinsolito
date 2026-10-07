-- MALÙ23 Dealer Platform — Calendario V0.5

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  event_type text not null check (event_type in ('APPOINTMENT','CALLBACK','TEST_DRIVE','DELIVERY','PAYMENT','DOCUMENT','WORK','OTHER')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  customer_id uuid,
  vehicle_id uuid,
  assigned_to uuid references auth.users(id) on delete set null,
  reminder_minutes integer not null default 30 check (reminder_minutes >= 0),
  source text not null default 'MANUAL',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict,
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

grant select,insert,update on public.calendar_events to authenticated;
alter table public.calendar_events enable row level security;

create policy calendar_events_member_select on public.calendar_events
for select to authenticated using (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=calendar_events.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
  )
);

create policy calendar_events_member_insert on public.calendar_events
for insert to authenticated with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=calendar_events.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'calendar_write')='true' or m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE','OPERATORE'))
  )
);

create policy calendar_events_member_update on public.calendar_events
for update to authenticated using (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=calendar_events.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'calendar_write')='true' or m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE','OPERATORE'))
  )
) with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=calendar_events.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'calendar_write')='true' or m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE','OPERATORE'))
  )
);

create index if not exists calendar_events_dealer_start_idx on public.calendar_events(dealer_id,starts_at);
create index if not exists calendar_events_dealer_status_idx on public.calendar_events(dealer_id,status,starts_at);
create index if not exists calendar_events_customer_idx on public.calendar_events(dealer_id,customer_id,starts_at);
create index if not exists calendar_events_vehicle_idx on public.calendar_events(dealer_id,vehicle_id,starts_at);
