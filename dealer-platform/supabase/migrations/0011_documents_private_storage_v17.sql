-- GestionaleJo V1.7.1 — private cloud storage for dealership documents.
-- Files are private, capped at 20 MB and tenant-scoped by object path:
-- private/<dealer_id>/<document_id>/<file_name>

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'dealer-private-docs',
  'dealer-private-docs',
  false,
  20971520,
  array['application/pdf','application/octet-stream','image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy dealer_private_docs_select
on storage.objects
for select
to authenticated
using (
  bucket_id='dealer-private-docs'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
  )
);

create policy dealer_private_docs_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='dealer-private-docs'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'documents_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE','OPERATORE'))
  )
);

create policy dealer_private_docs_update
on storage.objects
for update
to authenticated
using (
  bucket_id='dealer-private-docs'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'documents_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE','OPERATORE'))
  )
)
with check (
  bucket_id='dealer-private-docs'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'documents_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE','OPERATORE'))
  )
);

create policy dealer_private_docs_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='dealer-private-docs'
  and (storage.foldername(name))[1]='private'
  and exists (
    select 1 from public.memberships m
    where m.dealer_id::text=(storage.foldername(name))[2]
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'documents_write')='true' or m.role in ('ADMIN','AMMINISTRAZIONE','OPERATORE'))
  )
);
