-- MALÙ23 v1.9.8 — finalized and delivered contract terms are terminal.
-- FROZEN may only remain FROZEN or advance to SIGNED. SIGNED/CANCELLED are terminal.
-- Historical DELIVERED contracts are also immutable even when their legacy status is still DRAFT.

create or replace function private.malu23_guard_contract_status_terminal()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public','private'
as $$
begin
  if old.template_code = 'VENDITA' and old.sale_stage = 'DELIVERED' then
    if new.status is distinct from old.status then
      raise exception 'sale_delivered_terminal';
    end if;
    if new.contract_number is distinct from old.contract_number
      or new.contract_date is distinct from old.contract_date
      or new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.price is distinct from old.price
      or new.deposit is distinct from old.deposit
      or new.template_code is distinct from old.template_code
      or new.template_version is distinct from old.template_version
      or new.notes is distinct from old.notes then
      raise exception 'sale_contract_terms_locked';
    end if;
  end if;

  if old.status = 'FROZEN' and new.status not in ('FROZEN','SIGNED') then
    raise exception 'sale_contract_finalized_terminal';
  end if;
  if old.status = 'SIGNED' and new.status is distinct from 'SIGNED' then
    raise exception 'sale_contract_signed_terminal';
  end if;
  if old.status = 'CANCELLED' and new.status is distinct from 'CANCELLED' then
    raise exception 'sale_contract_cancelled_terminal';
  end if;
  return new;
end;
$$;

revoke all on function private.malu23_guard_contract_status_terminal() from public, anon, authenticated;

drop trigger if exists malu23_contract_status_terminal on public.contracts;
create trigger malu23_contract_status_terminal
before update of status, contract_number, contract_date, customer_id, vehicle_id, price, deposit, template_code, template_version, notes on public.contracts
for each row execute function private.malu23_guard_contract_status_terminal();
