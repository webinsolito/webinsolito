-- MALÙ23 Dealer Cockpit V2 — private vehicle media storage
-- Private bucket, tenant-scoped object paths and garage_write authorization.
-- Object path: private/<dealer_id>/<vehicle_id>/<media_id>/<filename>

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'dealer-vehicle-media',
  'dealer-vehicle-media',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

grant delete on public.vehicle_media to authenticated;

create policy vehicle_media_member_delete_v2
on public.vehicle_media
for delete
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=vehicle_media.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'garage_write')='true' or m.role in ('ADMIN','VENDITORE','OPERATORE'))
  )
);

create policy dealer_vehicle_media_select
on storage.objects
for select
to authenticated
using (
  bucket_id='dealer-vehicle-media'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
  )
);

create policy dealer_vehicle_media_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='dealer-vehicle-media'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'garage_write')='true' or m.role in ('ADMIN','VENDITORE','OPERATORE'))
  )
);

create policy dealer_vehicle_media_update
on storage.objects
for update
to authenticated
using (
  bucket_id='dealer-vehicle-media'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'garage_write')='true' or m.role in ('ADMIN','VENDITORE','OPERATORE'))
  )
)
with check (
  bucket_id='dealer-vehicle-media'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'garage_write')='true' or m.role in ('ADMIN','VENDITORE','OPERATORE'))
  )
);

create policy dealer_vehicle_media_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='dealer-vehicle-media'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'garage_write')='true' or m.role in ('ADMIN','VENDITORE','OPERATORE'))
  )
);
