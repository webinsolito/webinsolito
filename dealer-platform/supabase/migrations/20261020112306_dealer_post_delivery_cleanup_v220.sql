-- Modifica 22 · Chiusura automatica attività post-consegna.
-- Quando una vendita diventa DELIVERED, gli appuntamenti DELIVERY ancora OPEN
-- della stessa coppia cliente+veicolo vengono chiusi nella stessa transazione.
create or replace function private.malu23_close_delivery_events_v220()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.template_code = 'VENDITA'
     and new.template_code = 'VENDITA'
     and new.sale_stage = 'DELIVERED'
     and old.sale_stage is distinct from 'DELIVERED' then

    update public.calendar_events e
    set status = 'DONE',
        updated_at = now()
    where e.dealer_id = new.dealer_id
      and e.customer_id is not distinct from new.customer_id
      and e.vehicle_id is not distinct from new.vehicle_id
      and e.event_type = 'DELIVERY'
      and e.status = 'OPEN';
  end if;

  return new;
end;
$$;

revoke all on function private.malu23_close_delivery_events_v220() from public, anon, authenticated;

drop trigger if exists contracts_close_delivery_events_v220 on public.contracts;
create trigger contracts_close_delivery_events_v220
after update of sale_stage on public.contracts
for each row execute function private.malu23_close_delivery_events_v220();

-- Difesa per eventuali residui storici: chiude solo consegne senza una vendita attiva
-- sulla stessa coppia cliente+veicolo.
update public.calendar_events e
set status = 'DONE',
    updated_at = now()
where e.event_type = 'DELIVERY'
  and e.status = 'OPEN'
  and exists (
    select 1
    from public.contracts c
    where c.dealer_id = e.dealer_id
      and c.customer_id is not distinct from e.customer_id
      and c.vehicle_id is not distinct from e.vehicle_id
      and c.template_code = 'VENDITA'
      and c.sale_stage = 'DELIVERED'
  )
  and not exists (
    select 1
    from public.contracts c
    where c.dealer_id = e.dealer_id
      and c.customer_id is not distinct from e.customer_id
      and c.vehicle_id is not distinct from e.vehicle_id
      and c.template_code = 'VENDITA'
      and coalesce(c.sale_stage,'OPEN') not in ('DELIVERED','CANCELLED')
  );
