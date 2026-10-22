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
-- A practice account is shared by every visitor who opens it, so its session
-- may look but not write. proxy.ts refuses its /api writes; the restrictive
-- policies below refuse the writes a browser makes straight to the database
-- with the member's own token (settings, automation, broker connections, the
-- profile, watchlists, saved setups, alerts, scripts, preferences, critiques,
-- and the history tables the account's pages read back).
-- A practice session's token carries app_metadata.practice_tier, which only
-- the service role can set; every member's token has none, so for members
-- these policies change nothing. The service role (the auto-trader, the
-- ledger writer) bypasses RLS as before. Read access is untouched.
-- guided_recommendations is left out on purpose: Guided Mode logs the cards
-- it shows through the member's client, and that log is all it is.
--
-- Rollback
-- --------
-- drop index if exists public.profiles_one_practice_account_per_tier;
-- and drop the "practice sessions do not <cmd>" policies on each table below.
-- select cron.unschedule(j) from unnest(array[
--   'gsps-demo-auto-trade-novice-1','gsps-demo-auto-trade-novice-2','gsps-demo-auto-trade-novice-3',
--   'gsps-demo-auto-trade-pro-1','gsps-demo-auto-trade-pro-2','gsps-demo-auto-trade-pro-3',
--   'gsps-demo-auto-trade-expert-1','gsps-demo-auto-trade-expert-2','gsps-demo-auto-trade-expert-3']) j;
-- and reschedule gsps-demo-auto-trade-1..3 on '/api/demo/auto-trade' (0097).

-- Fail fast rather than queue behind a busy table's lock.
set lock_timeout = '10s';

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

do $$
declare
  t text;
  c text;
  guard constant text := $g$(coalesce(auth.jwt() -> 'app_metadata' ->> 'practice_tier', '') = '')$g$;
begin
  foreach t in array array[
    'profiles', 'settings', 'user_automation_profiles', 'broker_connections',
    'trade_critiques', 'strategy_plugins', 'strategy_plugin_versions',
    'strategy_mode_preferences', 'notification_preferences', 'push_subscriptions',
    'watchlists', 'watchlist_items', 'saved_setups', 'setup_folders',
    'custom_price_alerts', 'scan_criteria_presets', 'school_trader_operating_system',
    -- Rows the account's pages show back to the next visitor (scan history,
    -- the intraday cooldown, the notification log) and the learning tables;
    -- GSPS writes these with the service role, so nothing it does is refused.
    'scan_results', 'intraday_alerts', 'notification_log', 'execution_events',
    'signal_lifecycle_events', 'user_actions', 'scan_events', 'pivot',
    'trend_state', 'volatility_state', 'volume_state', 'digital_root_feature'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    -- Created only where missing, so a rerun is a no-op and drops nothing.
    foreach c in array array['insert', 'update', 'delete'] loop
      if exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = t
                   and policyname = 'practice sessions do not ' || c) then
        continue;
      end if;
      if c = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check %s',
          'practice sessions do not insert', t, guard);
      elsif c = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s',
          'practice sessions do not update', t, guard, guard);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using %s',
          'practice sessions do not delete', t, guard);
      end if;
    end loop;
  end loop;
end
$$;
