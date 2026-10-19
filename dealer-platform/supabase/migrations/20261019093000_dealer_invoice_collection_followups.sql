-- Modifica 11 · Scadenziario e storico solleciti incassi.
create table public.invoice_collection_followups (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null,
  invoice_id uuid not null,
  contacted_on date not null default current_date,
  channel text not null check (channel in ('TELEFONO','WHATSAPP','EMAIL','PEC','ALTRO')),
  outcome text not null check (outcome in ('CONTATTATO','NESSUNA_RISPOSTA','PROMESSA_PAGAMENTO','CONTESTAZIONE','ALTRO')),
  note text,
  next_follow_up_on date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint invoice_collection_followups_invoice_fk foreign key (dealer_id,invoice_id) references public.invoices(dealer_id,id) on delete restrict,
  constraint invoice_collection_followups_note_length check (char_length(coalesce(note,'')) <= 400),
  constraint invoice_collection_followups_next_date check (next_follow_up_on is null or next_follow_up_on >= contacted_on)
);
create index invoice_collection_followups_invoice_idx on public.invoice_collection_followups(dealer_id,invoice_id,created_at desc);
create index invoice_collection_followups_next_idx on public.invoice_collection_followups(dealer_id,next_follow_up_on) where next_follow_up_on is not null;
alter table public.invoice_collection_followups enable row level security;
revoke all on table public.invoice_collection_followups from anon,authenticated;
grant select,insert on table public.invoice_collection_followups to authenticated;
create policy invoice_collection_followups_select on public.invoice_collection_followups for select to authenticated
using (
  private.owner_support_allowed(dealer_id)
  or (
    private.dealer_access_allowed(dealer_id)
    and exists (
      select 1 from public.memberships m
      where m.dealer_id=invoice_collection_followups.dealer_id
        and m.user_id=(select auth.uid())
        and m.status='ACTIVE'
        and m.role in ('ADMIN','AMMINISTRAZIONE')
        and coalesce(m.permissions->>'invoices_view','true')='true'
    )
  )
);
create policy invoice_collection_followups_insert on public.invoice_collection_followups for insert to authenticated
with check (
  private.dealer_access_allowed(dealer_id)
  and created_by=(select auth.uid())
  and exists (
    select 1 from public.memberships m
    where m.dealer_id=invoice_collection_followups.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('ADMIN','AMMINISTRAZIONE')
      and coalesce(m.permissions->>'invoices_write','true')='true'
  )
  and exists (
    select 1 from public.invoices i
    where i.dealer_id=invoice_collection_followups.dealer_id
      and i.id=invoice_collection_followups.invoice_id
      and i.invoice_type='SALE'
      and i.deleted_at is null
      and i.total_amount>i.paid_amount
  )
);
