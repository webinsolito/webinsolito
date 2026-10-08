-- Dealer Platform V1.8.1 — immediate session containment.
-- Temporary/reset-password accounts cannot read business data, and sensitive
-- account actions can revoke Auth sessions immediately.

begin;

create or replace function public.security_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, pg_temp
as $$
  select u.id from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
$$;
revoke all on function public.security_user_id_by_email(text) from public,anon,authenticated;
grant execute on function public.security_user_id_by_email(text) to service_role;

create or replace function public.security_revoke_user_sessions(p_user_id uuid,p_except_session_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = auth, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update auth.refresh_tokens
     set revoked=true, updated_at=now()
   where user_id=p_user_id::text
     and (p_except_session_id is null or session_id is distinct from p_except_session_id)
     and coalesce(revoked,false)=false;

  delete from auth.sessions
   where user_id=p_user_id
     and (p_except_session_id is null or id is distinct from p_except_session_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.security_revoke_user_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.security_revoke_user_sessions(uuid,uuid) to service_role;

-- Restrictive gate layered on top of every existing tenant policy. A user whose
-- password was reset must complete the forced password change before any
-- business data can be read or changed, even with an old still-unexpired JWT.
do $$
declare
  t text;
  tables text[] := array[
    'vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media',
    'customers','customer_interactions','customer_vehicle_interests','calendar_events','documents',
    'contracts','contract_versions','invoices','instagram_posts'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists account_security_gate on public.%I',t);
    execute format($p$
      create policy account_security_gate on public.%I
      as restrictive for all to authenticated
      using (
        exists(select 1 from public.profiles p
          where p.user_id=(select auth.uid())
            and coalesce(p.force_password_change,false)=false)
      )
      with check (
        exists(select 1 from public.profiles p
          where p.user_id=(select auth.uid())
            and coalesce(p.force_password_change,false)=false)
      )
    $p$,t);
  end loop;
end $$;

commit;
