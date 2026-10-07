-- Dealer Platform V0.9 — sales workflow orchestration on contracts.
-- Contracts remain the sale record; Invoices remain the payment source of truth.

alter table public.contracts add column if not exists sale_stage text;
alter table public.contracts add column if not exists sale_invoice_id uuid;
alter table public.contracts add column if not exists financing_status text not null default 'NOT_REQUESTED';
alter table public.contracts add column if not exists financing_provider text;
alter table public.contracts add column if not exists financing_amount numeric(12,2) not null default 0;
alter table public.contracts add column if not exists trade_in jsonb;
alter table public.contracts add column if not exists planned_delivery_at timestamptz;
alter table public.contracts add column if not exists delivered_at timestamptz;

do $$ begin
  alter table public.contracts add constraint contracts_sale_stage_check
    check (sale_stage is null or sale_stage in ('OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY','DELIVERED','CANCELLED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contracts add constraint contracts_financing_status_check
    check (financing_status in ('NOT_REQUESTED','REQUESTED','APPROVED','REJECTED','PAID'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contracts add constraint contracts_financing_amount_check check (financing_amount >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contracts add constraint contracts_trade_in_object_check
    check (trade_in is null or jsonb_typeof(trade_in)='object');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contracts add constraint contracts_sale_invoice_fk
    foreign key (dealer_id,sale_invoice_id) references public.invoices(dealer_id,id) on delete restrict;
exception when duplicate_object then null; end $$;

create index if not exists contracts_sales_stage_idx on public.contracts (dealer_id,sale_stage,contract_date desc) where template_code='VENDITA';
create index if not exists contracts_sales_delivery_idx on public.contracts (dealer_id,planned_delivery_at) where template_code='VENDITA' and sale_stage <> 'DELIVERED';
create index if not exists contracts_sale_invoice_idx on public.contracts (dealer_id,sale_invoice_id) where sale_invoice_id is not null;
