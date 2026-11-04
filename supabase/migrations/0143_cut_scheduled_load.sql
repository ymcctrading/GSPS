-- Cut the scheduled load on Vercel until the Hobby month resets (2026-11-04).
--
-- The Vercel account is blocked ("This deployment is temporarily paused",
-- 402 DEPLOYMENT_DISABLED) after passing a Hobby monthly limit, and it
-- resets on 2026-11-30 (owner). Almost every function call it serves comes
-- from these pg_cron jobs through gsps_ops.call_endpoint (unchanged here).
-- Measured from cron.job_run_details for the 7 days to 2026-11-04 02:20 UTC:
-- about 6,500 calls a week, 4,800 of them the every-minute scan fan-out.
--
-- New cadences (engineering choices, not Gann-derived; times UTC):
--   gsps-scan-fanout          every minute 10-22 weekdays  -> every 5 minutes
--   gsps-scan-fanout-evening  every minute 00-02 Tue-Sat   -> every 5 minutes
--   gsps-full-market-scan     every 15 minutes              -> :00 and :30
--   gsps-portfolio-manager    :09 :24 :39 :54               -> :09 and :39
--   gsps-lifecycle-reaper     :25 and :55 every hour        -> :25 every hour
--   gsps-price-alert-sweep    every day                     -> weekdays only
-- Unchanged: the intraday scan (it times the 15Min execution bars), the
-- monitor sweep, notification retry, the universe sweep, the usage check and
-- the once-a-day scans.
--
-- Estimate: about 2,300 calls a week, a cut of about 65%.
--
-- Why these are safe:
-- * The fan-out queue's jobs live 60 minutes (JOB_MAX_AGE_MS) and every call
--   re-reads what is left, so a 5-minute wheel serves the same members, only
--   later (at most 5 minutes after a scan instead of 1).
-- * The market scan's rotation wheel keys its phase to the clock in
--   ROTATION_INTERVAL_MINUTES, which this change moves to 30 in the same PR
--   (lib/scan/universe-rotation.ts). Left at 15, a :00/:30 cadence would only
--   ever land on even chunks.
-- * The portfolio manager at 30 minutes still runs 18 times a session.
--
-- To restore the old cadence after the reset, re-run the matching lines of
-- 0089, 0097, 0116 and 0118 (or a later migration that supersedes this one), and put
-- ROTATION_INTERVAL_MINUTES back to 15.
--
-- cron.schedule with an existing name replaces that job's schedule.

select cron.schedule('gsps-scan-fanout',          '*/5 10-22 * * 1-5',     $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);
select cron.schedule('gsps-scan-fanout-evening',  '*/5 0-2 * * 2-6',       $$select gsps_ops.call_endpoint('/api/scan-fanout')$$);
select cron.schedule('gsps-full-market-scan',     '0,30 13-21 * * 1-5',    $$select gsps_ops.call_endpoint('/api/market-scan')$$);
select cron.schedule('gsps-portfolio-manager',    '9,39 13-21 * * 1-5',    $$select gsps_ops.call_endpoint('/api/automation/portfolio-manager/run')$$);
select cron.schedule('gsps-lifecycle-reaper',     '25 * * * *',            $$select gsps_ops.call_endpoint('/api/lifecycle/reaper')$$);
select cron.schedule('gsps-price-alert-sweep',    '13,43 13-21 * * 1-5',   $$select gsps_ops.call_endpoint('/api/price-alerts/sweep')$$);
