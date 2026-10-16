-- Hardening for the monthly renewal rollout.
revoke all on function public.refresh_dealer_access_on_registration_activation() from public,anon,authenticated;
create index if not exists dealer_renewal_requests_requested_by_idx on public.dealer_renewal_requests(requested_by);
