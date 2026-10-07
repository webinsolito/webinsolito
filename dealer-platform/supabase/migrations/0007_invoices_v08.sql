-- Dealer Platform V0.8 — invoices and payment tracking.
-- Apply on the dedicated Dealer Platform Supabase project only.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  vehicle_id uuid,
  customer_id uuid,
  document_id uuid,
  vehicle_cost_id uuid,
  invoice_type text not null check (invoice_type in ('SALE','PURCHASE','EXPENSE')),
  number text not null check (length(trim(number)) > 0),
  issue_date date not null,
  due_date date,
  counterparty_name text not null check (length(trim(counterparty_name)) > 0),
  counterparty_vat_id text,
  vat_regime text not null default 'MARGINE' check (vat_regime in ('IVA_ESPOSTA','MARGINE','PRIVATO_FUORI_CAMPO')),
  taxable_amount numeric(12,2) not null default 0 check (taxable_amount >= 0),
  vat_rate numeric(5,2) not null default 0 check (vat_rate >= 0 and vat_rate <= 100),
  vat_amount numeric(12,2) not null default 0 check (vat_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PARTIAL','PAID')),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict,
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict,
  foreign key (dealer_id,document_id) references public.documents(dealer_id,id) on delete restrict,
  foreign key (dealer_id,vehicle_cost_id) references public.vehicle_costs(dealer_id,id) on delete restrict
);

create index if not exists invoices_dealer_issue_date_idx on public.invoices (dealer_id, issue_date desc);
create index if not exists invoices_dealer_vehicle_idx on public.invoices (dealer_id, vehicle_id) where vehicle_id is not null and deleted_at is null;
create index if not exists invoices_dealer_customer_idx on public.invoices (dealer_id, customer_id) where customer_id is not null and deleted_at is null;
create index if not exists invoices_open_due_idx on public.invoices (dealer_id, due_date) where payment_status <> 'PAID' and deleted_at is null;

revoke all on table public.invoices from anon, authenticated;
grant select,insert,update on table public.invoices to authenticated;
grant all privileges on table public.invoices to service_role;

alter table public.invoices enable row level security;

create policy invoices_member_select on public.invoices
for select to authenticated
using (
  deleted_at is null and exists (
    select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'invoices_view')='true' or m.role in ('ADMIN','AMMINISTRAZIONE'))
  )
);

create policy invoices_member_insert on public.invoices
for insert to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'invoices_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE'))
  )
);

create policy invoices_member_update on public.invoices
for update to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'invoices_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE'))
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=invoices.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'invoices_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE'))
  )
);
