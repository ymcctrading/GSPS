-- Stagger the scheduled jobs across the quarter hour (owner, 2026-10-21:
-- "Stagger them").
--
-- 0089 kept the workflows' schedules, so the market scan, intraday scan,
-- portfolio manager and both sweeps all fired on the same second every
-- quarter hour. Together they ran into Alpaca's free-tier rate limit, and
-- 23 of the first 24 market scans that day timed out at 60 seconds.
--
-- Each job keeps its cadence. It only moves a few minutes off the others:
--   :00 market scan (up to 60 s)
--   :03 the once-a-day scans and the demo account
--   :06 intraday scan (up to 120 s)
--   :09 portfolio manager
--   :12 invalidation sweep, :13 price-alert sweep
--   :25 lifecycle reaper, :27 notification retry (no market data)
-- cron.schedule with an existing name replaces that job's schedule.

select cron.schedule('gsps-intraday-scan-session',    '6,21,36,51 13-21 * * 1-5',      $$select gsps_ops.call_endpoint('/api/intraday-scan')$$);
select cron.schedule('gsps-intraday-scan-crypto-wk',  '6,21,36,51 0-12,22-23 * * 1-5', $$select gsps_ops.call_endpoint('/api/intraday-scan?universe=crypto')$$);
select cron.schedule('gsps-intraday-scan-crypto-we',  '6,21,36,51 * * * 0,6',          $$select gsps_ops.call_endpoint('/api/intraday-scan?universe=crypto')$$);
select cron.schedule('gsps-portfolio-manager',        '9,24,39,54 13-21 * * 1-5',      $$select gsps_ops.call_endpoint('/api/automation/portfolio-manager/run')$$);
select cron.schedule('gsps-monitor-sweep',            '12,42 13-21 * * 1-5',           $$select gsps_ops.call_endpoint('/api/monitors/invalidation-sweep')$$);
select cron.schedule('gsps-price-alert-sweep',        '13,43 13-21 * * *',             $$select gsps_ops.call_endpoint('/api/price-alerts/sweep')$$);
select cron.schedule('gsps-lifecycle-reaper',         '25,55 * * * *',                 $$select gsps_ops.call_endpoint('/api/lifecycle/reaper')$$);
select cron.schedule('gsps-notification-retry',       '27,57 10-23 * * 1-5',           $$select gsps_ops.call_endpoint('/api/notifications/retry-deliveries')$$);
select cron.schedule('gsps-morning-confirmation',     '18 13 * * 1-5',                 $$select gsps_ops.call_endpoint('/api/scans/morning-confirmation')$$);
select cron.schedule('gsps-first-90min-scan',         '48 13 * * 1-5',                 $$select gsps_ops.call_endpoint('/api/scans/first-90min-confirmation')$$);
select cron.schedule('gsps-midday-scan',              '3 15 * * 1-5',                  $$select gsps_ops.call_endpoint('/api/scans/midday')$$);
select cron.schedule('gsps-afternoon-scan',           '3 18 * * 1-5',                  $$select gsps_ops.call_endpoint('/api/scans/afternoon')$$);
select cron.schedule('gsps-demo-auto-trade-1',        '38 12 * * 1-5',                 $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);
select cron.schedule('gsps-demo-auto-trade-2',        '3 17 * * 1-5',                  $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);
select cron.schedule('gsps-demo-auto-trade-3',        '33 19 * * 1-5',                 $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);
