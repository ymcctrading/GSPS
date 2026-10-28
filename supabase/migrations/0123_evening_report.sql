-- GSPS — schedule /api/evening-report (owner, 2026-10-28: "Start sending the
-- evening focus list as well as the daily recap ... starting tonight").
--
-- The route emails the owner the next session's focus list and the recap of
-- the session just closed. It needs the evening daily scan's stored plans
-- (daily_scans for the session, written about 00:35 UTC under EDT and an hour
-- later under EST), so it runs twice, Tuesday to Saturday UTC (Monday to
-- Friday evenings in New York): a run before the plans are stored sends
-- nothing, and each report's idempotency key keeps a second run on an evening
-- that already sent from sending again.
--
-- To stop it:
--   select cron.unschedule('gsps-evening-report');
--   select cron.unschedule('gsps-evening-report-late');

select cron.schedule('gsps-evening-report',      '45 1 * * 2-6', $$select gsps_ops.call_endpoint('/api/evening-report')$$);
select cron.schedule('gsps-evening-report-late', '45 2 * * 2-6', $$select gsps_ops.call_endpoint('/api/evening-report')$$);
