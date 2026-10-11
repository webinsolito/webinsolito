-- MALÙ23 v1.9.7 — server-side photo gate for first publication.
-- Existing vehicles already in commercial states are grandfathered so normal edits/status progress are not blocked.
-- Any new vehicle must first exist in a pre-publication state, receive at least one PHOTO media row, then advance.

create or replace function private.malu23_require_photo_on_publish()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public','private'
as $$
declare
  old_is_advanced boolean := false;
  new_is_advanced boolean := false;
begin
  if new.deleted_at is not null then return new; end if;

  new_is_advanced := new.status::text in ('IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA');
  if tg_op = 'UPDATE' then
    old_is_advanced := old.status::text in ('IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA');
  end if;

  if new_is_advanced and not old_is_advanced then
    if not exists (
      select 1
      from public.vehicle_media m
      where m.dealer_id = new.dealer_id
        and m.vehicle_id = new.id
        and m.kind = 'PHOTO'
        and nullif(trim(m.object_key),'') is not null
    ) then
      raise exception 'vehicle_photo_required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists malu23_require_photo_on_publish on public.vehicles;
create trigger malu23_require_photo_on_publish
before insert or update of status on public.vehicles
for each row execute function private.malu23_require_photo_on_publish();
