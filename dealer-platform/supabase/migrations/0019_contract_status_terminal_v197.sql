-- MALÙ23 v1.9.7 — finalized contract status cannot be downgraded.
-- FROZEN may only remain FROZEN or advance to SIGNED. SIGNED and CANCELLED are terminal.

create or replace function private.malu23_guard_contract_status_terminal()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public','private'
as $$
begin
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
before update of status on public.contracts
for each row execute function private.malu23_guard_contract_status_terminal();
