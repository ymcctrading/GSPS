-- A single showcase profile for demos: perspective investors, partners, and
-- new team members sign into the same account and get a first-time
-- experience every time.
--
-- Why this exists
-- ----------------
-- Two behaviors, both keyed off `profiles.is_demo`:
--   1. The first-run tour (lib/onboarding/status.ts) always shows, regardless
--      of what `settings.prefs.onboarding` says was seen before — see the
--      GET handler in app/api/onboarding/route.ts.
--   2. Once a trading day rolls over (America/New_York, via
--      lib/market/session.ts's etDateKey), the next request that touches the
--      account wipes every open position/order/staged exit and resets cash to
--      STARTING_CASH — see lib/demo/reset.ts. There's no free Vercel cron slot
--      (vercel.json already runs 2/2 on the Hobby plan), so this follows the
--      same check-on-read pattern the exit manager already uses elsewhere in
--      this app rather than adding a scheduled job.
--
-- `demo_reset_date` records the ET trading-date key of the last reset, so the
-- check is a single indexed-free row read rather than a timestamp comparison
-- against "when does a day start" (a question `etDateKey` already answers
-- correctly around DST and midnight).
--
-- Rollback
-- --------
-- `alter table public.profiles drop column if exists is_demo;`
-- `alter table public.paper_accounts drop column if exists demo_reset_date;`
-- Both additive; no existing column is altered and no data is rewritten.

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

alter table public.paper_accounts
  add column if not exists demo_reset_date date;
