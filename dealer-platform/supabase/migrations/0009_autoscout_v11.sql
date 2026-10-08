-- MALÙ23 Dealer Platform — AutoScout V1.1
-- Stores dealership-owned publication metadata on the vehicle record.
-- AutoScout API credentials remain server-side only and are never stored here.

alter table public.vehicles add column if not exists autoscout_status text not null default 'NOT_READY' check (autoscout_status in ('NOT_READY','READY','PUBLISHED','PAUSED','SOLD','ERROR'));
alter table public.vehicles add column if not exists autoscout_listing_id text;
alter table public.vehicles add column if not exists autoscout_url text;
alter table public.vehicles add column if not exists autoscout_price numeric(12,2) check (autoscout_price is null or autoscout_price >= 0);
alter table public.vehicles add column if not exists autoscout_published_at timestamptz;
alter table public.vehicles add column if not exists autoscout_last_sync_at timestamptz;
alter table public.vehicles add column if not exists autoscout_error text;

create index if not exists vehicles_autoscout_status_idx on public.vehicles (dealer_id, autoscout_status) where deleted_at is null;
create index if not exists vehicles_autoscout_listing_idx on public.vehicles (dealer_id, autoscout_listing_id) where autoscout_listing_id is not null and deleted_at is null;
