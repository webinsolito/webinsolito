-- Dealer Cockpit V2 · Modifica 42 · audit transazionale delle 7 verifiche consegna.
-- Non ricostruisce il passato: registra solo i cambiamenti avvenuti dopo l'attivazione.
-- Il registro non contiene dati finanziari e non è scrivibile via REST.

create table if not exists public.sale_checklist_events_v420 (
 id uuid primary key default gen_random_uuid(),
 dealer_id uuid not null references public.dealers(id) on delete restrict,
 vehicle_id uuid not null references public.vehicles(id) on delete restrict,
 work_item_id uuid not null references public.vehicle_work_items(id) on delete restrict,
 title text not null,
 event_type text not null check (event_type in ('COMPLETED','CORRECTED')),
 occurred_at timestamptz not null default now(),
 actor_user_id uuid,
 actor_name text,
 actor_role text
);
create index if not exists sale_checklist_events_lookup_v420
 on public.sale_checklist_events_v420(dealer_id,vehicle_id,occurred_at desc,id desc);

alter table public.sale_checklist_events_v420 enable row level security;
revoke all on public.sale_checklist_events_v420 from public,anon,authenticated,service_role;
grant select on public.sale_checklist_events_v420 to authenticated,service_role;

drop policy if exists sale_checklist_events_member_read_v420 on public.sale_checklist_events_v420;
create policy sale_checklist_events_member_read_v420
 on public.sale_checklist_events_v420 for select to authenticated
 using (
  private.owner_support_allowed(dealer_id)
  or (
   private.dealer_access_allowed(dealer_id)
   and exists (
    select 1 from public.memberships m
    where m.dealer_id=sale_checklist_events_v420.dealer_id
     and m.user_id=(select auth.uid()) and m.status='ACTIVE'
   )
   and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and coalesce(p.force_password_change,false)=false
   )
  )
 );

-- Il trigger lavora nella stessa transazione della verifica: nessuna cronologia falsa se la scrittura fallisce.
create or replace function private.malu23_audit_sale_checklist_v420()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $audit$
declare
 old_done boolean:=false;
 new_done boolean:=false;
 actor_id uuid:=auth.uid();
 actor_label text;
 actor_level text;
begin
 if tg_op='UPDATE' then
  old_done:=upper(coalesce(old.category,''))='CONSEGNA'
   and old.title in ('Contratto firmato','Saldo verificato','Passaggio / documenti completati',
    'Libretto e documenti pronti','Preparazione auto completata','Doppie chiavi presenti','Garanzia / documentazione consegnata')
   and upper(coalesce(old.status,''))='DONE';
 end if;
 new_done:=upper(coalesce(new.category,''))='CONSEGNA'
  and new.title in ('Contratto firmato','Saldo verificato','Passaggio / documenti completati',
   'Libretto e documenti pronti','Preparazione auto completata','Doppie chiavi presenti','Garanzia / documentazione consegnata')
  and upper(coalesce(new.status,''))='DONE';
 if not old_done and not new_done then return new; end if;
 if tg_op='UPDATE' and old_done and new_done and old.title is not distinct from new.title
  and old.vehicle_id is not distinct from new.vehicle_id
  and old.dealer_id is not distinct from new.dealer_id then return new; end if;

 select coalesce(nullif(trim(p.display_name),''),nullif(trim(m.username),''))
 into actor_label
 from public.memberships m left join public.profiles p on p.user_id=m.user_id
 where m.user_id=actor_id and m.dealer_id=new.dealer_id limit 1;
 select m.role::text into actor_level
 from public.memberships m where m.user_id=actor_id and m.dealer_id=new.dealer_id
  and m.status='ACTIVE' limit 1;

 if old_done and (not new_done or old.title is distinct from new.title
   or old.vehicle_id is distinct from new.vehicle_id or old.dealer_id is distinct from new.dealer_id) then
  insert into public.sale_checklist_events_v420(dealer_id,vehicle_id,work_item_id,title,event_type,actor_user_id,actor_name,actor_role)
   values(old.dealer_id,old.vehicle_id,old.id,old.title,'CORRECTED',actor_id,actor_label,actor_level);
 end if;
 if new_done and (not old_done or old.title is distinct from new.title
   or old.vehicle_id is distinct from new.vehicle_id or old.dealer_id is distinct from new.dealer_id) then
  insert into public.sale_checklist_events_v420(dealer_id,vehicle_id,work_item_id,title,event_type,actor_user_id,actor_name,actor_role)
   values(new.dealer_id,new.vehicle_id,new.id,new.title,'COMPLETED',actor_id,actor_label,actor_level);
 end if;
 return new;
end;
$audit$;
revoke all on function private.malu23_audit_sale_checklist_v420() from public,anon,authenticated,service_role;
drop trigger if exists work_item_sale_checklist_audit_v420 on public.vehicle_work_items;
create trigger work_item_sale_checklist_audit_v420
 after insert or update of status,category,title,vehicle_id,dealer_id
 on public.vehicle_work_items for each row
 execute function private.malu23_audit_sale_checklist_v420();
