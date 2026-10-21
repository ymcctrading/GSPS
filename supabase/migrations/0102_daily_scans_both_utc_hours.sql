-- Keep the five once-a-day scans on their ET times through the winter
-- (review of PR #403, 2026-10-21; DST ends 2026-11-01).
--
-- pg_cron runs in UTC, so the fixed-hour schedules from 0089/0097 drift an
-- hour earlier in ET each winter: the 9:15 and 9:45 scans would run before the
-- open, and the 11:00 midday scan inside the opening hour it waits out. Each
-- job now fires at both its EDT and EST hour. runScheduledScan takes a
-- 30-minute ET window (etWindowFrom in each route) and skips a firing outside
-- it, so exactly one firing runs each trading day in either season, and a
-- failed run is never retried an hour late.
--
--   job                         ET window      EDT firing  EST firing
--   morning preparation         6:30-7:00      10:30Z      11:30Z
--   morning confirmation        9:15-9:45      13:18Z      14:18Z
--   first 90 minutes            9:45-10:15     13:48Z      14:48Z
--   midday                      11:00-11:30    15:03Z      16:03Z
--   afternoon                   14:00-14:30    18:03Z      19:03Z
--
-- The times are product choices; nothing in Gann's method sets when a scan
-- runs. Left on UTC on purpose: the premarket market scan (12:30Z, 8:30 or
-- 7:30 ET, before the open either way) and the three demo auto-trade runs
-- (an hour earlier in winter, still inside or before the session; the demo
-- route does its own auth and has no ET window). The range-based jobs
-- (13-21 UTC) cover the session in both seasons.
--
-- Also corrects 0097's header: only 15:03, 17:03 and 18:03 sit at :03; the
-- other once-a-day jobs moved 3 minutes off their old minute.

select cron.schedule('gsps-morning-preparation-scan', '30 10,11 * * 1-5', $$select gsps_ops.call_endpoint('/api/scans/morning-preparation')$$);
select cron.schedule('gsps-morning-confirmation',     '18 13,14 * * 1-5', $$select gsps_ops.call_endpoint('/api/scans/morning-confirmation')$$);
select cron.schedule('gsps-first-90min-scan',         '48 13,14 * * 1-5', $$select gsps_ops.call_endpoint('/api/scans/first-90min-confirmation')$$);
select cron.schedule('gsps-midday-scan',              '3 15,16 * * 1-5',  $$select gsps_ops.call_endpoint('/api/scans/midday')$$);
select cron.schedule('gsps-afternoon-scan',           '3 18,19 * * 1-5',  $$select gsps_ops.call_endpoint('/api/scans/afternoon')$$);
