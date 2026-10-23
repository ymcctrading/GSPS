-- GSPS — 0117: serve the evening market scan's fan-out too
--
-- Review of #471 (B1): Vercel's own cron runs /api/market-scan at 00:00 UTC
-- Tuesday to Saturday (vercel.json, "0 0 * * 2-6"), and that run now queues
-- its member fan-out (migration 0116). gsps-scan-fanout runs only 10-22 UTC
-- weekdays, so the job would wait about ten hours and expire unserved
-- (JOB_MAX_AGE_MS, an hour), dropping the evening run's monitor updates,
-- alerts and broken-stop invalidations. A second job serves hour 0 on the
-- same days the evening scan runs.
--
-- Forward-only.
--
-- Rollback:
--   select cron.unschedule('gsps-scan-fanout-evening');

select cron.schedule('gsps-scan-fanout-evening', '* 0 * * 2-6', $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);
