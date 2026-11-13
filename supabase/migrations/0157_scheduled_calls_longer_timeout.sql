-- Give the market scan and the portfolio manager 5 minutes on the scheduled-job log (2026-11-13).
--
-- On Render (docs/THIRD_PARTY_LIMITS.md, "Render") these routes run past the
-- one-argument call_endpoint's 60-second wait: on 2026-11-13 the 16:00 UTC
-- market scan finished at about 16:03 and the 16:09 manager run at about
-- 16:11:42. Both finished; only the log in gsps_ops.endpoint_calls (0153)
-- recorded them as timed out, so gsps_ops.endpoint_failures reported calls
-- that had worked. The two-argument call_endpoint (0153) waits 300,000 ms.
--
-- Schedules are unchanged (times UTC, matching cron.job on 2026-11-13):
--   gsps-premarket-scan       30 12 * * 1-5       /api/market-scan
--   gsps-full-market-scan     0,30 13-21 * * 1-5  /api/market-scan
--   gsps-evening-market-scan  0 0 * * 2-6         /api/market-scan
--   gsps-portfolio-manager    9,39 13-21 * * 1-5  /api/automation/portfolio-manager/run
--
-- Each job is unscheduled first, so no old copy keeps running beside the new
-- one, then scheduled again under the same name. 300,000 ms is an engineering
-- choice: about the longest a run was seen to take, with room to spare.
--
-- Revert: re-run the matching lines of 0089, 0143 and 0144 (the one-argument
-- form), for example once the app is back on Vercel.

do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job
    where jobname in ('gsps-premarket-scan', 'gsps-full-market-scan', 'gsps-evening-market-scan', 'gsps-portfolio-manager')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end
$$;

select cron.schedule('gsps-premarket-scan',      '30 12 * * 1-5',      $$select gsps_ops.call_endpoint('/api/market-scan', 300000)$$);
select cron.schedule('gsps-full-market-scan',    '0,30 13-21 * * 1-5', $$select gsps_ops.call_endpoint('/api/market-scan', 300000)$$);
select cron.schedule('gsps-evening-market-scan', '0 0 * * 2-6',        $$select gsps_ops.call_endpoint('/api/market-scan', 300000)$$);
select cron.schedule('gsps-portfolio-manager',   '9,39 13-21 * * 1-5', $$select gsps_ops.call_endpoint('/api/automation/portfolio-manager/run', 300000)$$);
