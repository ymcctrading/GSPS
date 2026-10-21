-- Keep the 9:15 and 9:45 ET morning scans on their ET times through the
-- winter (review of PR #403, 2026-10-21; DST ends 2026-11-01).
--
-- pg_cron runs in UTC, so 0089/0097's 13:18 and 13:48 UTC are 9:18 and 9:48
-- ET in summer but 8:18 and 8:48 ET in winter, before the open. Each job now
-- fires at both its EDT and EST hour. The route skips a run before its ET time
-- (runScheduledScan's notBeforeEtMinutes), and the (source, market date)
-- idempotency skips the second run once the first has completed, so each scan
-- still runs once a trading day, at 9:18 and 9:48 ET year round.
--
-- Also corrects 0097's header: only 15:03, 17:03 and 18:03 sit at :03; the
-- other once-a-day jobs moved 3 minutes off their old minute.

select cron.schedule('gsps-morning-confirmation', '18 13,14 * * 1-5', $$select gsps_ops.call_endpoint('/api/scans/morning-confirmation')$$);
select cron.schedule('gsps-first-90min-scan',     '48 13,14 * * 1-5', $$select gsps_ops.call_endpoint('/api/scans/first-90min-confirmation')$$);
