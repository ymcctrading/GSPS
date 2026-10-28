-- GSPS — schedule /api/pre-open-lines (owner, 2026-10-28, on TXN: catch the
-- move before it runs). Before the open the route tells members which equity
-- plans' lines the prior close left within reach, by push and the bell.
--
-- The route acts only from 8:30 to the 9:30 open, New York time, on a trading
-- day, so it runs at 12:50 and 13:50 UTC on weekdays: 8:50 ET under daylight
-- time is the first, 8:50 ET under standard time the second, and the other run
-- each season returns without doing anything. Each line is written once a New
-- York day per member, symbol and side, so a second run in the window sends
-- nothing again.
--
-- To stop it:
--   select cron.unschedule('gsps-pre-open-lines');

select cron.schedule('gsps-pre-open-lines', '50 12,13 * * 1-5', $$select gsps_ops.call_endpoint('/api/pre-open-lines')$$);
