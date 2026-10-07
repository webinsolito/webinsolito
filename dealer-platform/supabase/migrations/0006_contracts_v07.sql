-- Dealer Platform V0.7 — Contracts + immutable frozen versions

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  customer_id uuid not null,
  vehicle_id uuid not null,
  contract_number text not null,
  contract_date date not null default current_date,
  template_code text not null check (template_code in ('VENDITA','CAPARRA','CONSEGNA')),
  template_version text not null default '1.0',
  price numeric(12,2) not null default 0 check (price >= 0),
  deposit numeric(12,2) not null default 0 check (deposit >= 0),
  notes text,
  status text not null default 'DRAFT' check (status in ('DRAFT','FROZEN','SIGNED','CANCELLED')),
  active_version_id uuid,
  snapshot_hash text,
  frozen_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  unique (dealer_id,contract_number),
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete restrict,
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

create table if not exists public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  contract_id uuid not null,
  version_no integer not null check (version_no > 0),
  template_code text not null,
  template_version text not null,
  snapshot_data jsonb not null,
  rendered_html text not null,
  snapshot_hash text not null,
  frozen_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id,id),
  unique (dealer_id,contract_id,version_no),
  foreign key (dealer_id,contract_id) references public.contracts(dealer_id,id) on delete restrict
);

do $$ begin
  alter table public.contracts add constraint contracts_active_version_fk foreign key (dealer_id,active_version_id) references public.contract_versions(dealer_id,id) on delete restrict;
exception when duplicate_object then null; end $$;

create index if not exists contracts_dealer_status_idx on public.contracts (dealer_id,status,contract_date desc);
create index if not exists contracts_customer_idx on public.contracts (dealer_id,customer_id);
create index if not exists contracts_vehicle_idx on public.contracts (dealer_id,vehicle_id);
create index if not exists contract_versions_contract_idx on public.contract_versions (dealer_id,contract_id,version_no desc);

grant select,insert,update on public.contracts,public.contract_versions to authenticated;

alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;

create policy contracts_member_select on public.contracts for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=contracts.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy contracts_member_insert on public.contracts for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=contracts.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
);
create policy contracts_member_update on public.contracts for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=contracts.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=contracts.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
);

create policy contract_versions_member_select on public.contract_versions for select to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=contract_versions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
);
create policy contract_versions_member_insert on public.contract_versions for insert to authenticated with check (
  exists(select 1 from public.memberships m where m.dealer_id=contract_versions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
);
create policy contract_versions_member_update on public.contract_versions for update to authenticated using (
  exists(select 1 from public.memberships m where m.dealer_id=contract_versions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
) with check (
  exists(select 1 from public.memberships m where m.dealer_id=contract_versions.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and coalesce((m.permissions->>'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')))
);

create or replace function private.guard_contract_version_immutable()
returns trigger language plpgsql security definer set search_path = public,pg_temp as $$
begin
  if new.dealer_id is distinct from old.dealer_id
     or new.contract_id is distinct from old.contract_id
     or new.version_no is distinct from old.version_no
     or new.template_code is distinct from old.template_code
     or new.template_version is distinct from old.template_version
     or new.snapshot_data is distinct from old.snapshot_data
     or new.rendered_html is distinct from old.rendered_html
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.frozen_at is distinct from old.frozen_at then
    raise exception 'contract_version_is_immutable';
  end if;
  return new;
end $$;
revoke all on function private.guard_contract_version_immutable() from public,anon,authenticated;

drop trigger if exists contract_versions_immutable on public.contract_versions;
create trigger contract_versions_immutable before update on public.contract_versions for each row execute function private.guard_contract_version_immutable();
