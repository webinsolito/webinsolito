-- Dealer Cockpit V2 · Modifica 26
-- La scadenza segnala il bisogno di revisione ma non libera mai da sola l'auto:
-- vendita, caparra e contratti restano bloccati fino alla procedura v24.
alter table public.contracts
 add column if not exists reservation_expires_at timestamptz,
 add column if not exists reservation_extended_at timestamptz,
 add column if not exists reservation_extended_by uuid references auth.users(id) on delete set null,
 add column if not exists reservation_extend_reason text,
 add column if not exists reservation_extension_count integer not null default 0;

do $$
begin
 if not exists (select 1 from pg_constraint where conrelid='public.contracts'::regclass and conname='contracts_reservation_extension_count_v260') then
  alter table public.contracts add constraint contracts_reservation_extension_count_v260 check (reservation_extension_count >= 0);
 end if;
 if not exists (select 1 from pg_constraint where conrelid='public.contracts'::regclass and conname='contracts_reservation_reason_v260') then
  alter table public.contracts add constraint contracts_reservation_reason_v260 check (
    reservation_extend_reason is null or char_length(trim(reservation_extend_reason)) between 4 and 240
  );
 end if;
end $$;

-- Solo scadenza informativa per le prenotazioni già attive, senza liberare lo stock.
update public.contracts c set reservation_expires_at=now()+interval '7 days'
where c.reservation_expires_at is null and c.template_code='VENDITA'
 and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
      or (coalesce(c.sale_stage,'OPEN')='OPEN'
       and (coalesce(c.deposit,0)>0 or c.status in ('FROZEN','SIGNED'))));

create index if not exists contracts_reservation_due_v260
 on public.contracts (dealer_id,reservation_expires_at)
 where template_code='VENDITA' and sale_stage not in ('DELIVERED','CANCELLED');

create or replace function private.malu23_guard_reservation_deadline_v260()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
 was_booked boolean := false;
 is_booked boolean := false;
 v_role text;
 v_uid uuid := auth.uid();
 v_request_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
 v_privileged boolean;
begin
 is_booked := new.template_code='VENDITA' and (
  new.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
  or (coalesce(new.sale_stage,'OPEN')='OPEN'
   and (coalesce(new.deposit,0)>0 or new.status in ('FROZEN','SIGNED')))
 );
 if tg_op='INSERT' then
  if new.reservation_expires_at is not null or new.reservation_extend_reason is not null
    or new.reservation_extended_at is not null or new.reservation_extended_by is not null
    or new.reservation_extension_count<>0 then
   raise exception 'reservation_metadata_protected';
  end if;
  if is_booked then new.reservation_expires_at:=now()+interval '7 days'; end if;
  return new;
 end if;
 was_booked := old.template_code='VENDITA' and (
  old.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
  or (coalesce(old.sale_stage,'OPEN')='OPEN'
   and (coalesce(old.deposit,0)>0 or old.status in ('FROZEN','SIGNED')))
 );

 if new.reservation_extended_at is distinct from old.reservation_extended_at
 or new.reservation_extended_by is distinct from old.reservation_extended_by
 or new.reservation_extension_count is distinct from old.reservation_extension_count then
  raise exception 'reservation_metadata_protected';
 end if;

 if not was_booked and is_booked then
  if new.reservation_expires_at is distinct from old.reservation_expires_at
    or new.reservation_extend_reason is distinct from old.reservation_extend_reason then
   raise exception 'reservation_metadata_protected';
  end if;
  new.reservation_expires_at:=now()+interval '7 days';
  return new;
 end if;

 if new.reservation_expires_at is not distinct from old.reservation_expires_at then
  if new.reservation_extend_reason is distinct from old.reservation_extend_reason then
   raise exception 'reservation_extension_date_required';
  end if;
  return new;
 end if;

 if not was_booked or not is_booked then raise exception 'reservation_extension_not_active'; end if;
 if new.reservation_expires_at is null
    or new.reservation_expires_at <= greatest(now(),old.reservation_expires_at)
    or new.reservation_expires_at > now()+interval '30 days' then
  raise exception 'reservation_extension_date_invalid';
 end if;
 if char_length(trim(coalesce(new.reservation_extend_reason,''))) not between 4 and 240 then
  raise exception 'reservation_extension_reason_required';
 end if;
 -- Per una prenotazione con impegno contrattuale/economico il VENDITORE
 -- non può prorogare senza ADMIN/AMMINISTRAZIONE, lato database.
 v_privileged := v_request_role='service_role' or session_user in ('postgres','supabase_admin')
    or private.owner_support_allowed(new.dealer_id);
 if not v_privileged then
  if v_uid is null then raise exception 'reservation_extension_forbidden'; end if;
  select m.role::text into v_role from public.memberships m
  where m.dealer_id=new.dealer_id and m.user_id=v_uid and m.status='ACTIVE'
    and coalesce((m.permissions->>'contracts_write')::boolean,
      m.role in ('ADMIN','VENDITORE','AMMINISTRAZIONE'))
  limit 1;
  if v_role not in ('ADMIN','VENDITORE','AMMINISTRAZIONE') or v_role is null then
   raise exception 'reservation_extension_forbidden';
  end if;
  if v_role='VENDITORE' and not (
    coalesce(old.sale_stage,'OPEN')='AGREED'
    and old.status='DRAFT' and coalesce(old.deposit,0)=0
    and coalesce(old.financing_amount,0)=0 and old.sale_invoice_id is null
    and coalesce(new.sale_stage,'OPEN')='AGREED'
    and new.status='DRAFT' and coalesce(new.deposit,0)=0
    and coalesce(new.financing_amount,0)=0 and new.sale_invoice_id is null
  ) then raise exception 'reservation_extension_admin_required'; end if;
 end if;
 new.reservation_extend_reason:=trim(new.reservation_extend_reason);
 new.reservation_extension_count:=old.reservation_extension_count+1;
 new.reservation_extended_at:=now();
 new.reservation_extended_by:=v_uid;
 return new;
end;
$$;

revoke all on function private.malu23_guard_reservation_deadline_v260()
 from public, anon, authenticated;
drop trigger if exists contracts_reservation_deadline_v260 on public.contracts;
create trigger contracts_reservation_deadline_v260
before insert or update of
  sale_stage, deposit, status, template_code, reservation_expires_at,
  reservation_extend_reason, reservation_extended_at,
  reservation_extended_by, reservation_extension_count
on public.contracts
for each row execute function private.malu23_guard_reservation_deadline_v260();
