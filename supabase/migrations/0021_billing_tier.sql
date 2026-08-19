-- Backs the entitlement model in lib/tiers.ts. profiles.tier defaults to
-- 'PRACTICE' (free) so every existing row is unaffected by this migration.
-- stripe_customer_id/stripe_subscription_id let the webhook handler
-- (app/api/billing/webhook/route.ts) find the right profile row when Stripe
-- calls back, without ever storing payment details ourselves.

create type public.platform_tier as enum (
  'PRACTICE', 'STANDARD', 'INVESTOR_MODE', 'SYSTEM_MASTERY'
);

alter table public.profiles
  add column tier public.platform_tier not null default 'PRACTICE',
  add column stripe_customer_id text,
  add column stripe_subscription_id text;

create unique index profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Row Level Security already covers `profiles` (see 0001_initial_schema.sql);
-- these columns need no policy changes since they're read/written through
-- the same "own profile" policies plus the service-role webhook handler,
-- which bypasses RLS by design.
