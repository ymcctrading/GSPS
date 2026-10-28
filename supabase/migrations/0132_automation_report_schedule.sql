-- GSPS — schedule /api/automation-report (owner, 2026-10-28: "turn on the auto
-- trader/portfolio managers for all current profiles ... Send the results to
-- the ymcctrading account daily at 5pm").
--
-- 5 PM New York time is 21:00 UTC under EDT and 22:00 UTC under EST, so it
-- runs at both, Monday to Friday: the route sends nothing before 5 PM New
-- York time or on a market holiday, and the report's idempotency key keeps
-- the later run from sending a second copy.
--
-- To stop it:
--   select cron.unschedule('gsps-automation-report');
--   select cron.unschedule('gsps-automation-report-late');

select cron.schedule('gsps-automation-report',      '0 21 * * 1-5', $$select gsps_ops.call_endpoint('/api/automation-report')$$);
select cron.schedule('gsps-automation-report-late', '0 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/automation-report')$$);
