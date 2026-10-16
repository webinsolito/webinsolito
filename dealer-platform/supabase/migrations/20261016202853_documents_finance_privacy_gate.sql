create policy documents_finance_privacy_gate
on public.documents
as restrictive
for all
to authenticated
using (
  category not in ('FATTURA_ACQUISTO','FATTURA_SPESA')
  or private.owner_support_allowed(dealer_id)
  or exists (
    select 1 from public.memberships m
    where m.dealer_id=documents.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'::public.member_status
      and m.role in ('ADMIN'::public.member_role,'AMMINISTRAZIONE'::public.member_role)
  )
)
with check (
  category not in ('FATTURA_ACQUISTO','FATTURA_SPESA')
  or private.owner_support_allowed(dealer_id)
  or exists (
    select 1 from public.memberships m
    where m.dealer_id=documents.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'::public.member_status
      and m.role in ('ADMIN'::public.member_role,'AMMINISTRAZIONE'::public.member_role)
  )
);

create policy dealer_private_docs_finance_gate
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'dealer-private-docs'
  or exists (
    select 1 from public.documents d
    where d.object_key=storage.objects.name
      and d.deleted_at is null
      and (
        d.category not in ('FATTURA_ACQUISTO','FATTURA_SPESA')
        or private.owner_support_allowed(d.dealer_id)
        or exists (
          select 1 from public.memberships m
          where m.dealer_id=d.dealer_id
            and m.user_id=(select auth.uid())
            and m.status='ACTIVE'::public.member_status
            and m.role in ('ADMIN'::public.member_role,'AMMINISTRAZIONE'::public.member_role)
        )
      )
  )
)
with check (
  bucket_id <> 'dealer-private-docs'
  or exists (
    select 1 from public.documents d
    where d.object_key=storage.objects.name
      and d.deleted_at is null
      and (
        d.category not in ('FATTURA_ACQUISTO','FATTURA_SPESA')
        or private.owner_support_allowed(d.dealer_id)
        or exists (
          select 1 from public.memberships m
          where m.dealer_id=d.dealer_id
            and m.user_id=(select auth.uid())
            and m.status='ACTIVE'::public.member_status
            and m.role in ('ADMIN'::public.member_role,'AMMINISTRAZIONE'::public.member_role)
        )
      )
  )
);
