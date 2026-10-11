-- MALÙ23 v1.9.3 — operational data quality guards.
-- New/edited vehicles are normalized and cannot duplicate plate/VIN inside a dealer.
-- Vehicles cannot move into commercial/sold states without plate + valid VIN.
-- Vehicle costs must be positive and belong to a vehicle of the same dealer.

create or replace function private.malu23_normalize_vehicle_identity()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  new.plate := nullif(upper(regexp_replace(trim(coalesce(new.plate,'')), '\s+', '', 'g')), '');
  new.vin := nullif(upper(regexp_replace(trim(coalesce(new.vin,'')), '\s+', '', 'g')), '');

  if new.vin is not null and (length(new.vin) <> 17 or new.vin ~ '[IOQ]') then
    raise exception 'vehicle_vin_invalid';
  end if;

  if new.status::text in ('IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA') then
    if new.plate is null then raise exception 'vehicle_plate_required'; end if;
    if new.vin is null then raise exception 'vehicle_vin_required'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists malu23_normalize_vehicle_identity on public.vehicles;
create trigger malu23_normalize_vehicle_identity
before insert or update of plate,vin,status on public.vehicles
for each row execute function private.malu23_normalize_vehicle_identity();

create unique index if not exists vehicles_active_plate_unique
  on public.vehicles (dealer_id, upper(trim(plate)))
  where deleted_at is null and nullif(trim(plate),'') is not null;

create unique index if not exists vehicles_active_vin_unique
  on public.vehicles (dealer_id, upper(trim(vin)))
  where deleted_at is null and nullif(trim(vin),'') is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='vehicle_costs_amount_positive') then
    alter table public.vehicle_costs add constraint vehicle_costs_amount_positive check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_costs_category_not_blank') then
    alter table public.vehicle_costs add constraint vehicle_costs_category_not_blank check (length(trim(category)) > 0);
  end if;
end $$;

create or replace function private.malu23_guard_vehicle_cost_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  vehicle_dealer uuid;
begin
  if new.amount is null or new.amount <= 0 then raise exception 'vehicle_cost_amount_invalid'; end if;
  if new.category is null or trim(new.category) = '' then raise exception 'vehicle_cost_category_required'; end if;
  select v.dealer_id into vehicle_dealer from public.vehicles v
    where v.id=new.vehicle_id and v.deleted_at is null;
  if vehicle_dealer is null then raise exception 'vehicle_cost_vehicle_missing'; end if;
  if vehicle_dealer is distinct from new.dealer_id then raise exception 'vehicle_cost_dealer_mismatch'; end if;
  new.category := upper(trim(new.category));
  return new;
end;
$$;

drop trigger if exists malu23_guard_vehicle_cost_integrity on public.vehicle_costs;
create trigger malu23_guard_vehicle_cost_integrity
before insert or update on public.vehicle_costs
for each row execute function private.malu23_guard_vehicle_cost_integrity();
