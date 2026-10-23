-- GSPS — 0118: widen the evening fan-out worker to 00:00-02:59 UTC
--
-- Vercel's Hobby plan fires a cron at any time within its hour, and the
-- "0 0 * * 2-6" market scan has landed at 00:35-00:36 UTC on every run since
-- 2026-10-14, but at 02:39 on 2026-10-13 (scan_executions). Its queued job
-- lives an hour (JOB_MAX_AGE_MS), so a worker that runs in hour 0 only
-- (migration 0117) would miss a late scan and drop its member updates. The
-- worker now runs through hour 2; a call with nothing pending reads one row.
--
-- Forward-only.
--
-- Rollback:
--   select cron.schedule('gsps-scan-fanout-evening', '* 0 * * 2-6', $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);

select cron.schedule('gsps-scan-fanout-evening', '* 0-2 * * 2-6', $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);
