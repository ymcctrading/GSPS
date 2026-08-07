-- Retire the pg_cron job that fills the dashboard with invented setups.
--
-- `gsps-daily-scan` (scheduled by an out-of-repo migration on 2026-07-21) POSTs
-- to the `daily-scan` edge function every weekday at 20:15 UTC. That function
-- reads GSPS_SCAN_ENDPOINT to reach the real scoring pass and, when the variable
-- is unset or the call fails, falls back to `mockScoredUniverse()` — a fixed
-- list priced at entry = 100 + i, stop = entry - 3, TP1 = entry + 4, master
-- profit = entry + 8.
--
-- That fallback is what has been writing the table. Every row stored between
-- 2026-07-23 and 2026-08-03 carries those arithmetic prices: SPY entering at
-- $100.00, AMD at $102.00, NVDA at $106.00. They are not scans of anything.
-- Placeholder prices on a screen a trader sizes positions against is the worst
-- failure in this repo, and it outlived its purpose the moment the real scan
-- existed.
--
-- `/api/market-scan` runs the actual multi-timeframe protocol and writes the
-- same table on the Vercel cron, so this job is not replaced, only removed.
--
-- PREREQUISITE: confirm CRON_SECRET is set on the Vercel project first. The
-- scheduled scan authorizes with it, and a deployment without it answers 503 —
-- unschedule this job before that is fixed and nothing writes the table at all.

DO $$
BEGIN
  PERFORM cron.unschedule('gsps-daily-scan');
EXCEPTION
  WHEN OTHERS THEN NULL; -- already gone, or pg_cron absent on this instance
END $$;
