-- Modifica 10 · Registro incassi fatture vendita: allinea il database di sviluppo al deploy.
create table if not exists public.invoice_receipts (
 id uuid primary key,
 dealer_id uuid not null,
 invoice_id uuid not null,
 amount numeric(12,2) not null check (amount > 0),
 paid_on date not null,
 payment_method text not null check (payment_method in ('BONIFICO','POS','CONTANTI','ASSEGNO','FINANZIAMENTO','ALTRO')),
 reference text,
 note text,
 recorded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint invoice_receipts_invoice_fk foreign key (dealer_id,invoice_id) references public.invoices(dealer_id,id) on delete restrict,
 constraint invoice_receipts_reference_length check (char_length(coalesce(reference,'')) <= 120),
 constraint invoice_receipts_note_length check (char_length(coalesce(note,'')) <= 400)
);
create index if not exists invoice_receipts_invoice_idx on public.invoice_receipts(dealer_id,invoice_id,created_at desc);
create index if not exists invoice_receipts_recorded_idx on public.invoice_receipts(recorded_by);
alter table public.invoice_receipts enable row level security;
revoke all on public.invoice_receipts from anon,authenticated;
grant select on public.invoice_receipts to authenticated;
create policy invoice_receipts_finance_select on public.invoice_receipts for select to authenticated using (
 private.owner_support_allowed(dealer_id)
 or (private.dealer_access_allowed(dealer_id)
   and exists (select 1 from public.memberships m where m.dealer_id=invoice_receipts.dealer_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and m.role in ('ADMIN','AMMINISTRAZIONE') and coalesce(m.permissions->>'invoices_view','true')='true')
   and exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and coalesce(p.force_password_change,false)=false))
);
CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_dealer_id uuid, p_invoice_id uuid, p_request_id uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_session uuid; v_invoice public.invoices%rowtype; v_existing public.invoice_receipts%rowtype; v_paid numeric(12,2); v_method text; v_now timestamptz:=now();
begin
 v_user:=auth.uid();
 if v_user is null then raise exception 'unauthorized' using errcode='42501'; end if;
 v_session:=nullif(auth.jwt()->>'session_id','')::uuid;
 if v_session is null or public.security_session_active(v_user,v_session) is distinct from true then raise exception 'session_revoked' using errcode='42501'; end if;
 if p_dealer_id is null or p_invoice_id is null or p_request_id is null then raise exception 'invalid_request' using errcode='22023'; end if;
 if private.dealer_access_allowed(p_dealer_id) is distinct from true then raise exception 'dealer_access_locked' using errcode='42501'; end if;
 if not exists (select 1 from public.memberships m join public.profiles p on p.user_id=m.user_id where m.dealer_id=p_dealer_id and m.user_id=v_user and m.status='ACTIVE' and m.role in ('ADMIN','AMMINISTRAZIONE') and coalesce(m.permissions->>'invoices_write','true')='true' and coalesce(p.force_password_change,false)=false) then raise exception 'invoices_write_forbidden' using errcode='42501'; end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 or p_amount<>round(p_amount,2) then raise exception 'invalid_payment_amount' using errcode='22023'; end if;
 if p_paid_on is null or p_paid_on>current_date then raise exception 'invalid_payment_date' using errcode='22023'; end if;
 v_method:=upper(trim(coalesce(p_method,'')));
 if v_method not in ('BONIFICO','POS','CONTANTI','ASSEGNO','FINANZIAMENTO','ALTRO') then raise exception 'invalid_payment_method' using errcode='22023'; end if;
 if char_length(coalesce(p_reference,''))>120 or char_length(coalesce(p_note,''))>400 then raise exception 'payment_text_too_long' using errcode='22023'; end if;
 select * into v_invoice from public.invoices where dealer_id=p_dealer_id and id=p_invoice_id and invoice_type='SALE' and deleted_at is null for update;
 if not found then raise exception 'sale_invoice_not_found' using errcode='22023'; end if;
 select * into v_existing from public.invoice_receipts where id=p_request_id;
 if found then
   if v_existing.dealer_id<>p_dealer_id or v_existing.invoice_id<>p_invoice_id or v_existing.amount<>p_amount or v_existing.paid_on<>p_paid_on or v_existing.payment_method<>v_method or coalesce(v_existing.reference,'')<>trim(coalesce(p_reference,'')) or coalesce(v_existing.note,'')<>trim(coalesce(p_note,'')) then raise exception 'receipt_request_conflict' using errcode='23505'; end if;
   return jsonb_build_object('ok',true,'id',v_existing.id,'duplicate',true,'paid_amount',v_invoice.paid_amount,'payment_status',v_invoice.payment_status,'remaining',greatest(v_invoice.total_amount-v_invoice.paid_amount,0));
 end if;
 if v_invoice.total_amount<=0 or v_invoice.paid_amount+p_amount>v_invoice.total_amount then raise exception 'payment_exceeds_balance' using errcode='22023'; end if;
 insert into public.invoice_receipts(id,dealer_id,invoice_id,amount,paid_on,payment_method,reference,note,recorded_by)
 values(p_request_id,p_dealer_id,p_invoice_id,p_amount,p_paid_on,v_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_note,'')),''),v_user);
 v_paid:=v_invoice.paid_amount+p_amount;
 update public.invoices set paid_amount=v_paid,paid_at=v_now,payment_method=v_method,updated_at=v_now where id=v_invoice.id and dealer_id=p_dealer_id;
 insert into public.audit_logs(dealer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
 values(p_dealer_id,v_user,'invoice',v_invoice.id,'RECORD_PAYMENT',jsonb_build_object('paid_amount',v_invoice.paid_amount),jsonb_build_object('paid_amount',v_paid,'amount',p_amount,'receipt_id',p_request_id));
 return jsonb_build_object('ok',true,'id',p_request_id,'duplicate',false,'paid_amount',v_paid,'payment_status',case when v_paid>=v_invoice.total_amount then 'PAID' else 'PARTIAL' end,'remaining',greatest(v_invoice.total_amount-v_paid,0));
end $function$
;
revoke all on function public.record_invoice_receipt(uuid,uuid,uuid,numeric,date,text,text,text) from public,anon,authenticated;
grant execute on function public.record_invoice_receipt(uuid,uuid,uuid,numeric,date,text,text,text) to authenticated;
