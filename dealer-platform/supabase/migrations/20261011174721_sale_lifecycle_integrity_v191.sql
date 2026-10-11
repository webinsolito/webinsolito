create or replace function private.malu23_normalize_invoice_payment()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
begin
  v_total := greatest(coalesce(new.total_amount,0),0);
  v_paid := least(v_total,greatest(coalesce(new.paid_amount,0),0));
  new.total_amount := v_total;
  new.paid_amount := v_paid;
  new.payment_status := case
    when v_total <= 0 or v_paid <= 0 then 'UNPAID'
    when v_paid >= v_total then 'PAID'
    else 'PARTIAL'
  end;
  if v_paid <= 0 then new.paid_at := null; end if;
  return new;
end;
$$;

revoke all on function private.malu23_normalize_invoice_payment() from public, anon, authenticated;

drop trigger if exists invoices_normalize_payment_v191 on public.invoices;
create trigger invoices_normalize_payment_v191
before insert or update of total_amount, paid_amount, payment_status on public.invoices
for each row execute function private.malu23_normalize_invoice_payment();

create or replace function private.malu23_guard_sale_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
  v_transition boolean := false;
  v_link_changed boolean := false;
  v_missing integer := 0;
  v_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
begin
  if auth.uid() is null and v_role <> 'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'sale_lifecycle_unauthorized';
  end if;

  if new.template_code <> 'VENDITA' then return new; end if;

  if tg_op='INSERT' then
    v_transition := new.sale_stage='DELIVERED';
    v_link_changed := new.sale_invoice_id is not null;
  else
    v_transition := new.sale_stage='DELIVERED' and old.sale_stage is distinct from 'DELIVERED';
    v_link_changed := new.sale_invoice_id is not null and new.sale_invoice_id is distinct from old.sale_invoice_id;
  end if;

  if v_link_changed then
    select * into v_invoice from public.invoices i
    where i.id=new.sale_invoice_id and i.dealer_id=new.dealer_id and i.deleted_at is null;
    if not found then raise exception 'sale_invoice_missing'; end if;
    if v_invoice.invoice_type <> 'SALE' then raise exception 'sale_invoice_wrong_type'; end if;
    if v_invoice.vehicle_id is distinct from new.vehicle_id then raise exception 'sale_invoice_vehicle_mismatch'; end if;
    if v_invoice.customer_id is distinct from new.customer_id then raise exception 'sale_invoice_customer_mismatch'; end if;
    if abs(coalesce(v_invoice.total_amount,0)-coalesce(new.price,0)) > 0.01 then raise exception 'sale_invoice_amount_mismatch'; end if;
  end if;

  if not v_transition then return new; end if;

  if new.status <> 'SIGNED' then raise exception 'sale_contract_not_signed'; end if;

  if new.sale_invoice_id is not null then
    select * into v_invoice from public.invoices i
    where i.id=new.sale_invoice_id and i.dealer_id=new.dealer_id and i.deleted_at is null;
  else
    select * into v_invoice from public.invoices i
    where i.dealer_id=new.dealer_id
      and i.invoice_type='SALE'
      and i.deleted_at is null
      and i.vehicle_id is not distinct from new.vehicle_id
      and i.customer_id is not distinct from new.customer_id
    order by i.issue_date desc nulls last, i.updated_at desc nulls last
    limit 1;
  end if;

  if v_invoice.id is null then raise exception 'sale_invoice_missing'; end if;
  if v_invoice.invoice_type <> 'SALE' then raise exception 'sale_invoice_wrong_type'; end if;
  if v_invoice.vehicle_id is distinct from new.vehicle_id then raise exception 'sale_invoice_vehicle_mismatch'; end if;
  if v_invoice.customer_id is distinct from new.customer_id then raise exception 'sale_invoice_customer_mismatch'; end if;
  if abs(coalesce(v_invoice.total_amount,0)-coalesce(new.price,0)) > 0.01 then raise exception 'sale_invoice_amount_mismatch'; end if;
  if v_invoice.payment_status <> 'PAID' or coalesce(v_invoice.paid_amount,0) < coalesce(v_invoice.total_amount,0)-0.01 then raise exception 'sale_balance_open'; end if;

  if coalesce(new.financing_amount,0) > 0 and coalesce(new.financing_status,'') <> 'PAID' then
    raise exception 'sale_financing_not_paid';
  end if;

  select count(*) into v_missing
  from unnest(array[
    'Contratto firmato',
    'Saldo verificato',
    'Passaggio / documenti completati',
    'Libretto e documenti pronti',
    'Preparazione auto completata',
    'Doppie chiavi presenti',
    'Garanzia / documentazione consegnata'
  ]::text[]) req(title)
  where not exists (
    select 1 from public.vehicle_work_items w
    where w.dealer_id=new.dealer_id
      and w.vehicle_id=new.vehicle_id
      and w.category='CONSEGNA'
      and w.status='DONE'
      and trim(w.title)=req.title
  );

  if v_missing > 0 then raise exception 'sale_checklist_incomplete'; end if;

  new.sale_invoice_id := coalesce(new.sale_invoice_id,v_invoice.id);
  new.delivered_at := coalesce(new.delivered_at,now());
  return new;
end;
$$;

revoke all on function private.malu23_guard_sale_lifecycle() from public, anon, authenticated;

drop trigger if exists contracts_sale_lifecycle_v191 on public.contracts;
create trigger contracts_sale_lifecycle_v191
before insert or update of sale_stage, sale_invoice_id, status, price, customer_id, vehicle_id, financing_amount, financing_status on public.contracts
for each row execute function private.malu23_guard_sale_lifecycle();

create or replace function private.malu23_guard_vehicle_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_transition boolean := false;
  v_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
begin
  if auth.uid() is null and v_role <> 'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'vehicle_delivery_unauthorized';
  end if;

  if tg_op='INSERT' then
    v_transition := new.status='CONSEGNATA';
  else
    v_transition := new.status='CONSEGNATA' and old.status is distinct from 'CONSEGNATA';
  end if;

  if v_transition and not exists (
    select 1 from public.contracts c
    where c.dealer_id=new.dealer_id
      and c.vehicle_id=new.id
      and c.template_code='VENDITA'
      and c.sale_stage='DELIVERED'
      and c.status='SIGNED'
  ) then
    raise exception 'vehicle_delivery_contract_required';
  end if;

  return new;
end;
$$;

revoke all on function private.malu23_guard_vehicle_delivery() from public, anon, authenticated;

drop trigger if exists vehicles_delivery_guard_v191 on public.vehicles;
create trigger vehicles_delivery_guard_v191
before insert or update of status on public.vehicles
for each row execute function private.malu23_guard_vehicle_delivery();
