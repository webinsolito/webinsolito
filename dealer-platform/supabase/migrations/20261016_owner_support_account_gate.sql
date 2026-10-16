-- Allow an explicitly active platform OWNER support session to pass the
-- restrictive password-change gate for the selected dealer only.
-- Normal dealership users keep the existing force_password_change requirement.

do $$
declare
  t text;
  gate text := '(private.owner_support_allowed(dealer_id) or exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and coalesce(p.force_password_change,false)=false))';
begin
  foreach t in array array[
    'calendar_events','contract_versions','contracts','customer_interactions',
    'customer_vehicle_interests','customers','documents','instagram_posts','invoices',
    'vehicle_costs','vehicle_events','vehicle_financials','vehicle_media',
    'vehicle_work_items','vehicles'
  ] loop
    execute format('drop policy if exists account_security_gate on public.%I',t);
    execute format(
      'create policy account_security_gate on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      t,gate,gate
    );
  end loop;
end $$;
