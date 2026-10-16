alter table public.dealers
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

-- Existing production dealers must not be forced through first-run onboarding retroactively.
update public.dealers
set onboarding_started_at = coalesce(onboarding_started_at, created_at),
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_completed_at is null;
