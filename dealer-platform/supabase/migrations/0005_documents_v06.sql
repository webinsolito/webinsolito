-- Dealer Platform Documents V0.6
-- Extends document metadata without exposing file contents through PostgREST.

alter table public.documents add column if not exists title text;
alter table public.documents add column if not exists category text not null default 'ALTRO';
alter table public.documents add column if not exists document_date date;
alter table public.documents add column if not exists expires_on date;
alter table public.documents add column if not exists size_bytes bigint;
alter table public.documents add column if not exists storage_state text not null default 'PENDING_UPLOAD';
alter table public.documents add column if not exists note text;

update public.documents
set title=coalesce(nullif(title,''),original_name),
    category=coalesce(nullif(category,''),'ALTRO'),
    storage_state=coalesce(nullif(storage_state,''),'PENDING_UPLOAD')
where title is null or title='' or category is null or category='' or storage_state is null or storage_state='';

do $$ begin
  alter table public.documents add constraint documents_category_chk check (category in ('LIBRETTO','COC','CONTRATTO','FATTURA_ACQUISTO','FATTURA_SPESA','IDENTITA_CLIENTE','ASSICURAZIONE','GARANZIA','DOCUMENTO_VEICOLO','ALTRO'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.documents add constraint documents_storage_state_chk check (storage_state in ('LOCAL','PENDING_UPLOAD','CLOUD','UPLOAD_ERROR'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.documents add constraint documents_size_bytes_chk check (size_bytes is null or size_bytes>=0);
exception when duplicate_object then null; end $$;

create unique index if not exists documents_object_key_per_dealer_uq on public.documents(dealer_id,object_key) where deleted_at is null;
create index if not exists documents_dealer_category_idx on public.documents(dealer_id,category) where deleted_at is null;
create index if not exists documents_dealer_expiry_idx on public.documents(dealer_id,expires_on) where deleted_at is null and expires_on is not null;
create index if not exists documents_vehicle_idx on public.documents(dealer_id,vehicle_id) where deleted_at is null and vehicle_id is not null;
create index if not exists documents_customer_idx on public.documents(dealer_id,customer_id) where deleted_at is null and customer_id is not null;

-- Document files stay outside the Data API (R2/Worker). Only metadata is stored here.
comment on column public.documents.object_key is 'Private object key. Never expose a permanent public URL for private documents.';
comment on column public.documents.storage_state is 'Client-visible file state; file bytes live outside PostgreSQL.';
