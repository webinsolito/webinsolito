-- Modifica 25 · prenotazione auto atomica dalla vendita.
-- Una trattativa OPEN senza impegni resta una proposta; AGREED o un impegno
-- (caparra / contratto bloccato o firmato) riservano l'auto.
-- Indice UNIQUE = protezione anche sotto transazioni simultanee.
create unique index if not exists contracts_vehicle_reservation_unique_v250
on public.contracts (dealer_id,vehicle_id)
where template_code = 'VENDITA'
  and (sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
    or (coalesce(sale_stage,'OPEN') = 'OPEN'
      and (coalesce(deposit,0) > 0 or status in ('FROZEN','SIGNED'))));

create or replace function private.malu23_guard_vehicle_reservation_v250()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_status text;
begin
  if new.template_code <> 'VENDITA' or not (
    new.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
    or (coalesce(new.sale_stage,'OPEN') = 'OPEN'
      and (coalesce(new.deposit,0) > 0 or new.status in ('FROZEN','SIGNED')))
  ) then return new; end if;

  -- Serializza le prenotazioni dello stesso veicolo, sempre nello stesso tenant.
  select v.status into v_status
    from public.vehicles v
    where v.id = new.vehicle_id and v.dealer_id = new.dealer_id
      and v.deleted_at is null
    for update;
  if not found then raise exception 'sale_reservation_vehicle_missing'; end if;
  if v_status in ('CONSEGNATA','VENDUTA','DA_CONSEGNARE') then
    raise exception 'sale_reservation_vehicle_unavailable';
  end if;
  if exists (
    select 1 from public.contracts c
     where c.dealer_id = new.dealer_id and c.vehicle_id = new.vehicle_id
       and c.template_code = 'VENDITA' and c.id is distinct from new.id
       and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
         or (coalesce(c.sale_stage,'OPEN') = 'OPEN'
           and (coalesce(c.deposit,0) > 0 or c.status in ('FROZEN','SIGNED'))))
  ) then raise exception 'sale_vehicle_already_reserved'; end if;
  return new;
end;
$$;
revoke all on function private.malu23_guard_vehicle_reservation_v250() from public, anon, authenticated;

drop trigger if exists contracts_reservation_guard_v250 on public.contracts;
create trigger contracts_reservation_guard_v250
before insert or update of sale_stage, deposit, status, vehicle_id, template_code
on public.contracts for each row
execute function private.malu23_guard_vehicle_reservation_v250();

create or replace function private.malu23_sync_vehicle_reservation_v250()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_active boolean;
begin
  if new.template_code = 'VENDITA' and (
    new.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
    or (coalesce(new.sale_stage,'OPEN') = 'OPEN'
      and (coalesce(new.deposit,0) > 0 or new.status in ('FROZEN','SIGNED')))
  ) then
    update public.vehicles v set status='PRENOTATA', updated_at=now()
     where v.id=new.vehicle_id and v.dealer_id=new.dealer_id
       and v.status is distinct from 'PRENOTATA';
  end if;

  -- Libera l'auto quando la prenotazione cessa; corregge anche il caso
  -- in cui la Modifica 24 lasci un'altra trattativa OPEN non vincolante.
  if tg_op='UPDATE' and old.template_code='VENDITA' and (
    old.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
    or (coalesce(old.sale_stage,'OPEN')='OPEN'
      and (coalesce(old.deposit,0)>0 or old.status in ('FROZEN','SIGNED')))
  ) and (
    new.vehicle_id is distinct from old.vehicle_id
    or new.template_code <> 'VENDITA'
    or not (new.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
      or (coalesce(new.sale_stage,'OPEN')='OPEN'
        and (coalesce(new.deposit,0)>0 or new.status in ('FROZEN','SIGNED'))))
  ) then
    select exists(
      select 1 from public.contracts c
       where c.dealer_id=old.dealer_id and c.vehicle_id=old.vehicle_id
         and c.template_code='VENDITA'
         and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
           or (coalesce(c.sale_stage,'OPEN')='OPEN'
             and (coalesce(c.deposit,0)>0 or c.status in ('FROZEN','SIGNED'))))
    ) into v_active;
    if not v_active then
      update public.vehicles v set status='IN_VENDITA',updated_at=now()
       where v.id=old.vehicle_id and v.dealer_id=old.dealer_id and v.status='PRENOTATA';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.malu23_sync_vehicle_reservation_v250() from public, anon, authenticated;

drop trigger if exists contracts_reservation_sync_v250 on public.contracts;
create trigger contracts_reservation_sync_v250
after insert or update of sale_stage, deposit, status, vehicle_id, template_code
on public.contracts for each row
execute function private.malu23_sync_vehicle_reservation_v250();

-- Il cambio manuale dello stato non può nascondere una prenotazione attiva.
create or replace function private.malu23_protect_reserved_vehicle_v250()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status is distinct from old.status and exists (
    select 1 from public.contracts c
     where c.dealer_id=new.dealer_id and c.vehicle_id=new.id
       and c.template_code='VENDITA'
       and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
         or (coalesce(c.sale_stage,'OPEN')='OPEN'
           and (coalesce(c.deposit,0)>0 or c.status in ('FROZEN','SIGNED'))))
  ) and new.status <> 'PRENOTATA' then
    raise exception 'vehicle_reserved_by_sale';
  end if;
  return new;
end;
$$;
revoke all on function private.malu23_protect_reserved_vehicle_v250() from public, anon, authenticated;
drop trigger if exists vehicles_reservation_protect_v250 on public.vehicles;
create trigger vehicles_reservation_protect_v250
before update of status on public.vehicles for each row
execute function private.malu23_protect_reserved_vehicle_v250();

-- Allineamento eventuali vendite già vincolanti; senza creare altre righe.
update public.vehicles v set status='PRENOTATA', updated_at=now()
where v.status not in ('PRENOTATA','CONSEGNATA')
  and exists (
    select 1 from public.contracts c
      where c.dealer_id=v.dealer_id and c.vehicle_id=v.id
        and c.template_code='VENDITA'
        and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
          or (coalesce(c.sale_stage,'OPEN')='OPEN'
            and (coalesce(c.deposit,0)>0 or c.status in ('FROZEN','SIGNED'))))
  );
