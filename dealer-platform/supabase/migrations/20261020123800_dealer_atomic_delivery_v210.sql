-- Modifica 21 · Consegna atomica vendita + veicolo.
-- La vendita può diventare DELIVERED solo da ADMIN/AMMINISTRAZIONE (o supporto owner/service)
-- e il veicolo viene portato a CONSEGNATA nella stessa transazione Postgres.
create or replace function private.malu23_guard_delivery_role_v210()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if new.template_code <> 'VENDITA' then
    return new;
  end if;

  if new.sale_stage = 'DELIVERED' and old.sale_stage is distinct from 'DELIVERED' then
    if v_request_role = 'service_role' or session_user in ('postgres','supabase_admin') then
      return new;
    end if;

    if private.owner_support_allowed(new.dealer_id) then
      return new;
    end if;

    if v_uid is null then
      raise exception 'sale_delivery_unauthorized';
    end if;

    if not exists (
      select 1
      from public.memberships m
      where m.dealer_id = new.dealer_id
        and m.user_id = v_uid
        and m.status = 'ACTIVE'
        and m.role in ('ADMIN','AMMINISTRAZIONE')
        and coalesce(
          (m.permissions ->> 'contracts_write')::boolean,
          m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE')
        )
    ) then
      raise exception 'sale_delivery_role_forbidden';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.malu23_guard_delivery_role_v210() from public, anon, authenticated;

drop trigger if exists contracts_delivery_role_gate_v210 on public.contracts;
create trigger contracts_delivery_role_gate_v210
before update of sale_stage on public.contracts
for each row execute function private.malu23_guard_delivery_role_v210();

create or replace function private.malu23_sync_vehicle_on_delivery_v210()
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

    perform 1
    from public.vehicles v
    where v.id = new.vehicle_id
      and v.dealer_id = new.dealer_id;

    if not found then
      raise exception 'sale_vehicle_missing';
    end if;

    update public.vehicles
    set status = 'CONSEGNATA',
        updated_at = now()
    where id = new.vehicle_id
      and dealer_id = new.dealer_id
      and status is distinct from 'CONSEGNATA';
  end if;

  return new;
end;
$$;

revoke all on function private.malu23_sync_vehicle_on_delivery_v210() from public, anon, authenticated;

drop trigger if exists contracts_sync_vehicle_delivery_v210 on public.contracts;
create trigger contracts_sync_vehicle_delivery_v210
after update of sale_stage on public.contracts
for each row execute function private.malu23_sync_vehicle_on_delivery_v210();
