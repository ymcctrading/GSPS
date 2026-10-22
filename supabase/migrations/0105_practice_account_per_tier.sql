-- One practice account per tier (owner, 2026-10-22): "each tier should have
-- their own 'practice account' so that either level can be previewed by a
-- potential new user, investor, or current user".
--
-- `profiles.is_demo` (0032) marked the one showcase account, which was
-- Wall Street. Now each tier (Novice PRACTICE, Pro STANDARD, Expert
-- INVESTOR_MODE, Wall Street SYSTEM_MASTERY) has one, created on first use by
-- lib/demo/practice.ts#ensurePracticeAccount. This index holds it to one a
-- tier, so the auto-trader and /api/demo/open can never pick between two.
--
-- The auto-trader runs one tier a call (/api/demo/auto-trade?tier=...), so
-- each run keeps its 60-second budget. The three existing runs a trading day
-- (0089, staggered by 0097) now name Wall Street, and each other tier runs
-- a few minutes after, clear of the :06 intraday scan, the :09 portfolio
-- manager and the :12/:13 sweeps.
--
-- Rollback
-- --------
-- drop index if exists public.profiles_one_practice_account_per_tier;
-- select cron.unschedule(j) from unnest(array[
--   'gsps-demo-auto-trade-novice-1','gsps-demo-auto-trade-novice-2','gsps-demo-auto-trade-novice-3',
--   'gsps-demo-auto-trade-pro-1','gsps-demo-auto-trade-pro-2','gsps-demo-auto-trade-pro-3',
--   'gsps-demo-auto-trade-expert-1','gsps-demo-auto-trade-expert-2','gsps-demo-auto-trade-expert-3']) j;
-- and reschedule gsps-demo-auto-trade-1..3 on '/api/demo/auto-trade' (0097).

create unique index if not exists profiles_one_practice_account_per_tier
  on public.profiles (tier)
  where is_demo;

select cron.schedule('gsps-demo-auto-trade-1',          '38 12 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=wall-street')$$);
select cron.schedule('gsps-demo-auto-trade-2',          '3 17 * * 1-5',  $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=wall-street')$$);
select cron.schedule('gsps-demo-auto-trade-3',          '33 19 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=wall-street')$$);
select cron.schedule('gsps-demo-auto-trade-novice-1',   '40 12 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=novice')$$);
select cron.schedule('gsps-demo-auto-trade-novice-2',   '16 17 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=novice')$$);
select cron.schedule('gsps-demo-auto-trade-novice-3',   '45 19 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=novice')$$);
select cron.schedule('gsps-demo-auto-trade-pro-1',      '42 12 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=pro')$$);
select cron.schedule('gsps-demo-auto-trade-pro-2',      '18 17 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=pro')$$);
select cron.schedule('gsps-demo-auto-trade-pro-3',      '47 19 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=pro')$$);
select cron.schedule('gsps-demo-auto-trade-expert-1',   '44 12 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=expert')$$);
select cron.schedule('gsps-demo-auto-trade-expert-2',   '20 17 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=expert')$$);
select cron.schedule('gsps-demo-auto-trade-expert-3',   '49 19 * * 1-5', $$select gsps_ops.call_endpoint('/api/demo/auto-trade?tier=expert')$$);
