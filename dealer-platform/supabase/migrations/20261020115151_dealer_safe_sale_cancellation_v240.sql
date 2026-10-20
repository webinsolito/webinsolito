-- Modifica 24 · Annullamento vendita guidato e sicuro.
alter table public.contracts
  add column if not exists sale_cancel_reason text,
  add column if not exists sale_cancelled_at timestamptz,
  add column if not exists sale_cancelled_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contracts'::regclass
      and conname='contracts_sale_cancel_reason_check'
  ) then
    alter table public.contracts
      add constraint contracts_sale_cancel_reason_check
      check (sale_cancel_reason is null or (char_length(trim(sale_cancel_reason)) between 4 and 240));
  end if;
end;
$$;

create or replace function private.malu23_guard_sale_cancel_v240()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_member_role text;
begin
  if new.template_code <> 'VENDITA' then return new; end if;

  if old.sale_stage = 'CANCELLED' then
    if new.sale_cancel_reason is distinct from old.sale_cancel_reason
       or new.sale_cancelled_at is distinct from old.sale_cancelled_at
       or new.sale_cancelled_by is distinct from old.sale_cancelled_by then
      raise exception 'sale_cancel_metadata_locked';
    end if;
    return new;
  end if;

  if new.sale_stage = 'CANCELLED' and old.sale_stage is distinct from 'CANCELLED' then
    if old.sale_stage = 'DELIVERED' then raise exception 'sale_cancel_delivered_forbidden'; end if;
    if nullif(trim(new.sale_cancel_reason),'') is null
       or char_length(trim(new.sale_cancel_reason)) < 4 then
      raise exception 'sale_cancel_reason_required';
    end if;

    if v_request_role = 'service_role' or session_user in ('postgres','supabase_admin') then
      new.sale_cancel_reason := left(trim(new.sale_cancel_reason),240);
      new.sale_cancelled_at := coalesce(new.sale_cancelled_at,now());
      return new;
    end if;

    if private.owner_support_allowed(new.dealer_id) then
      new.sale_cancel_reason := left(trim(new.sale_cancel_reason),240);
      new.sale_cancelled_at := coalesce(new.sale_cancelled_at,now());
      new.sale_cancelled_by := coalesce(new.sale_cancelled_by,v_uid);
      return new;
    end if;

    if v_uid is null then raise exception 'sale_cancel_unauthorized'; end if;

    select m.role::text into v_member_role
    from public.memberships m
    where m.dealer_id = new.dealer_id
      and m.user_id = v_uid
      and m.status = 'ACTIVE'
      and coalesce((m.permissions ->> 'contracts_write')::boolean,m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE'))
    limit 1;

    if v_member_role is null or v_member_role not in ('ADMIN','VENDITORE','AMMINISTRAZIONE') then
      raise exception 'sale_cancel_forbidden';
    end if;

    if v_member_role = 'VENDITORE' and (
      coalesce(old.sale_stage,'OPEN') not in ('OPEN','AGREED')
      or old.status in ('FROZEN','SIGNED')
      or coalesce(old.deposit,0) > 0
      or coalesce(old.financing_amount,0) > 0
      or old.sale_invoice_id is not null
      or exists (
        select 1 from public.invoices i
        where i.dealer_id = old.dealer_id
          and i.invoice_type = 'SALE'
          and i.deleted_at is null
          and i.vehicle_id is not distinct from old.vehicle_id
          and i.customer_id is not distinct from old.customer_id
      )
    ) then raise exception 'sale_cancel_admin_required'; end if;

    new.sale_cancel_reason := left(trim(new.sale_cancel_reason),240);
    new.sale_cancelled_at := now();
    new.sale_cancelled_by := v_uid;
  end if;

  return new;
end;
$$;

revoke all on function private.malu23_guard_sale_cancel_v240() from public, anon, authenticated;

drop trigger if exists contracts_sale_cancel_guard_v240 on public.contracts;
create trigger contracts_sale_cancel_guard_v240
before update of sale_stage, sale_cancel_reason, sale_cancelled_at, sale_cancelled_by
on public.contracts
for each row execute function private.malu23_guard_sale_cancel_v240();

create or replace function private.malu23_cleanup_sale_cancel_v240()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.template_code = 'VENDITA'
     and new.template_code = 'VENDITA'
     and new.sale_stage = 'CANCELLED'
     and old.sale_stage is distinct from 'CANCELLED' then

    if not exists (
      select 1 from public.contracts c
      where c.dealer_id = new.dealer_id
        and c.customer_id = new.customer_id
        and c.vehicle_id = new.vehicle_id
        and c.template_code = 'VENDITA'
        and c.id <> new.id
        and coalesce(c.sale_stage,'OPEN') not in ('DELIVERED','CANCELLED')
    ) then
      update public.calendar_events e
      set status = 'CANCELLED', updated_at = now()
      where e.dealer_id = new.dealer_id
        and e.customer_id is not distinct from new.customer_id
        and e.vehicle_id is not distinct from new.vehicle_id
        and e.event_type = 'DELIVERY'
        and e.status = 'OPEN';
    end if;

    if not exists (
      select 1 from public.contracts c
      where c.dealer_id = new.dealer_id
        and c.vehicle_id = new.vehicle_id
        and c.template_code = 'VENDITA'
        and c.id <> new.id
        and coalesce(c.sale_stage,'OPEN') not in ('DELIVERED','CANCELLED')
    ) then
      update public.vehicles v
      set status = 'IN_VENDITA', updated_at = now()
      where v.id = new.vehicle_id
        and v.dealer_id = new.dealer_id
        and v.status in ('PRENOTATA','VENDUTA','DA_CONSEGNARE');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.malu23_cleanup_sale_cancel_v240() from public, anon, authenticated;

drop trigger if exists contracts_sale_cancel_cleanup_v240 on public.contracts;
create trigger contracts_sale_cancel_cleanup_v240
after update of sale_stage on public.contracts
for each row execute function private.malu23_cleanup_sale_cancel_v240();
