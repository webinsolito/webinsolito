-- Dealer Platform V1.2 — Instagram editorial queue.
-- Apply on the dedicated Dealer Platform Supabase project only.

create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  vehicle_id uuid not null,
  content_type text not null default 'POST' check (content_type in ('POST','REEL','STORY')),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','SCHEDULED','PUBLISHED','ERROR')),
  caption text not null default '',
  hashtags text not null default '',
  media_url text,
  media_count integer not null default 0 check (media_count >= 0),
  scheduled_at timestamptz,
  published_at timestamptz,
  meta_container_id text,
  meta_media_id text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (dealer_id,id),
  foreign key (dealer_id,vehicle_id) references public.vehicles(dealer_id,id) on delete restrict
);

create index if not exists instagram_posts_dealer_status_idx on public.instagram_posts (dealer_id,status,updated_at desc) where deleted_at is null;
create index if not exists instagram_posts_dealer_vehicle_idx on public.instagram_posts (dealer_id,vehicle_id,updated_at desc) where deleted_at is null;
create index if not exists instagram_posts_schedule_idx on public.instagram_posts (dealer_id,scheduled_at) where status='SCHEDULED' and deleted_at is null;

revoke all on table public.instagram_posts from anon, authenticated;
grant select,insert,update on table public.instagram_posts to authenticated;
grant all privileges on table public.instagram_posts to service_role;

alter table public.instagram_posts enable row level security;

create policy instagram_posts_member_select on public.instagram_posts
for select to authenticated
using (
  deleted_at is null and exists (
    select 1 from public.memberships m
    where m.dealer_id=instagram_posts.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'instagram_view')='true' or m.role in ('ADMIN','VENDITORE'))
  )
);

create policy instagram_posts_member_insert on public.instagram_posts
for insert to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=instagram_posts.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'instagram_manage')='true' or m.role in ('ADMIN','VENDITORE'))
  )
);

create policy instagram_posts_member_update on public.instagram_posts
for update to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=instagram_posts.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'instagram_manage')='true' or m.role in ('ADMIN','VENDITORE'))
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.dealer_id=instagram_posts.dealer_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and ((m.permissions->>'instagram_manage')='true' or m.role in ('ADMIN','VENDITORE'))
  )
);
