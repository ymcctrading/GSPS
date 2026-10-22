-- GSPS — 0108: every trade log names its account (follow-up to 0107, R-002)
--
-- 0107 gave trade_logs.mode a default of 'paper' only to cover the window
-- between applying it and deploying the code that names the mode (#441).
-- That code is live, and every writer names its mode (insertTradeLog takes
-- it, recordPendingExit writes 'live', POST /api/trade-log writes 'journal').
-- Without the default, a future writer that forgets the mode fails loudly
-- instead of being filed as paper and counted in the paper account's profit
-- peak. Applied only after #441's deploy was READY.
--
-- Forward-only. Rollback:
--   alter table public.trade_logs alter column mode drop not null;
--   alter table public.trade_logs alter column mode set default 'paper';

update public.trade_logs set mode = 'paper' where mode is null;

alter table public.trade_logs
  alter column mode drop default,
  alter column mode set not null;
