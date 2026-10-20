-- Dealer Cockpit V2 · Modifica 27 · storico prenotazioni append-only.
-- Eventi effettivi dalla data di attivazione, nessun passato ricostruito.
create table if not exists public.vehicle_reservation_events_v270 (
 id uuid primary key default gen_random_uuid(),
 dealer_id uuid not null references public.dealers(id),
 contract_id uuid not null references public.contracts(id) on delete restrict,
 vehicle_id uuid not null references public.vehicles(id) on delete restrict,
 event_type text not null check (event_type in ('BASELINE','RESERVED','EXTENDED','CANCELLED','RELEASED','DELIVERED')),
 occurred_at timestamptz not null default now(),
 actor_user_id uuid,
 actor_name text,
 actor_role text,
 sale_stage_before text,
 sale_stage_after text,
 expires_at_before timestamptz,
 expires_at_after timestamptz,
 reason text check (reason is null or length(reason)<=240)
);
create index if not exists vehicle_reservation_events_lookup_v270
 on public.vehicle_reservation_events_v270 (dealer_id,contract_id,occurred_at desc,id desc);

alter table public.vehicle_reservation_events_v270 enable row level security;
revoke all on public.vehicle_reservation_events_v270 from public,anon,authenticated,service_role;
grant select on public.vehicle_reservation_events_v270 to authenticated,service_role;

drop policy if exists vehicle_reservation_events_member_read_v270 on public.vehicle_reservation_events_v270;
create policy vehicle_reservation_events_member_read_v270
 on public.vehicle_reservation_events_v270 for select to authenticated
 using (
   private.owner_support_allowed(dealer_id)
   or (
     private.dealer_access_allowed(dealer_id)
     and exists (
       select 1 from public.memberships m
       where m.dealer_id=vehicle_reservation_events_v270.dealer_id
         and m.user_id=(select auth.uid()) and m.status='ACTIVE'
     )
     and exists (
       select 1 from public.profiles p
       where p.user_id=(select auth.uid()) and coalesce(p.force_password_change,false)=false
     )
   )
 );

-- Funzione privata, richiamata soltanto da trigger dopo che i guard esistenti
-- hanno convalidato la vendita. Nessun endpoint REST per scrivere lo storico.
create or replace function private.malu23_audit_vehicle_reservation_v270()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare
 old_booked boolean:=false;
 new_booked boolean:=false;
 actor_id uuid:=auth.uid();
 actor_label text;
 actor_level text;
begin
 new_booked:=new.template_code='VENDITA' and (
    new.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
    or (coalesce(new.sale_stage,'OPEN')='OPEN'
      and (coalesce(new.deposit,0)>0 or new.status in ('FROZEN','SIGNED')))
 );
 if tg_op='UPDATE' then
   old_booked:=old.template_code='VENDITA' and (
      old.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
      or (coalesce(old.sale_stage,'OPEN')='OPEN'
        and (coalesce(old.deposit,0)>0 or old.status in ('FROZEN','SIGNED')))
   );
 end if;
 if not old_booked and not new_booked then return new; end if;
 select coalesce(nullif(trim(p.display_name),''),nullif(trim(m.username),''))
   into actor_label from public.profiles p
   left join public.memberships m on m.user_id=p.user_id and m.dealer_id=new.dealer_id
   where p.user_id=actor_id limit 1;
 select m.role::text into actor_level
  from public.memberships m where m.user_id=actor_id and m.dealer_id=new.dealer_id
  and m.status='ACTIVE' limit 1;

 if tg_op='UPDATE' and old_booked
   and (not new_booked or new.vehicle_id is distinct from old.vehicle_id) then
   insert into public.vehicle_reservation_events_v270 (
     dealer_id,contract_id,vehicle_id,event_type,actor_user_id,actor_name,actor_role,
     sale_stage_before,sale_stage_after,expires_at_before,expires_at_after,reason
   ) values (
     old.dealer_id,old.id,old.vehicle_id,
     case when new.sale_stage='CANCELLED' then 'CANCELLED'
          when new.sale_stage='DELIVERED' then 'DELIVERED'
          else 'RELEASED' end,
     coalesce(actor_id,new.sale_cancelled_by),actor_label,actor_level,
     old.sale_stage,new.sale_stage,old.reservation_expires_at,new.reservation_expires_at,
     case when new.sale_stage='CANCELLED' then left(new.sale_cancel_reason,240) else null end
   );
 end if;

 if new_booked and (tg_op='INSERT' or not old_booked
    or new.vehicle_id is distinct from old.vehicle_id) then
   insert into public.vehicle_reservation_events_v270 (
     dealer_id,contract_id,vehicle_id,event_type,actor_user_id,actor_name,actor_role,
     sale_stage_before,sale_stage_after,expires_at_before,expires_at_after
   ) values (
     new.dealer_id,new.id,new.vehicle_id,'RESERVED',
     coalesce(actor_id,new.created_by),actor_label,actor_level,
     case when tg_op='UPDATE' then old.sale_stage else null end,
     new.sale_stage,case when tg_op='UPDATE' then old.reservation_expires_at else null end,
     new.reservation_expires_at
   );
 elsif tg_op='UPDATE' and new_booked and old_booked
   and new.vehicle_id is not distinct from old.vehicle_id
   and new.reservation_extension_count>old.reservation_extension_count
   and new.reservation_expires_at is distinct from old.reservation_expires_at then
   insert into public.vehicle_reservation_events_v270 (
     dealer_id,contract_id,vehicle_id,event_type,actor_user_id,actor_name,actor_role,
     sale_stage_before,sale_stage_after,expires_at_before,expires_at_after,reason
   ) values (
     new.dealer_id,new.id,new.vehicle_id,'EXTENDED',
     coalesce(actor_id,new.reservation_extended_by),actor_label,actor_level,
     old.sale_stage,new.sale_stage,old.reservation_expires_at,new.reservation_expires_at,
     left(new.reservation_extend_reason,240)
   );
 end if;
 return new;
end;
$$;
revoke all on function private.malu23_audit_vehicle_reservation_v270()
 from public, anon, authenticated, service_role;

drop trigger if exists contracts_reservation_audit_v270 on public.contracts;
create trigger contracts_reservation_audit_v270
after insert or update of template_code,sale_stage,status,deposit,vehicle_id,
 reservation_expires_at,reservation_extension_count
on public.contracts for each row
execute function private.malu23_audit_vehicle_reservation_v270();

-- Solo baseline allo stato corrente, non cronologia sintetica retroattiva.
insert into public.vehicle_reservation_events_v270 (
 dealer_id,contract_id,vehicle_id,event_type,sale_stage_after,expires_at_after
)
select c.dealer_id,c.id,c.vehicle_id,'BASELINE',c.sale_stage,c.reservation_expires_at
from public.contracts c
where c.template_code='VENDITA'
 and (c.sale_stage in ('AGREED','DEPOSIT','BALANCE_PENDING','READY')
   or (coalesce(c.sale_stage,'OPEN')='OPEN'
      and (coalesce(c.deposit,0)>0 or c.status in ('FROZEN','SIGNED')))
 and not exists (
   select 1 from public.vehicle_reservation_events_v270 e where e.contract_id=c.id
 );
