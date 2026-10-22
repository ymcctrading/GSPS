-- The Intraday style (lib/gann/intradayExit.ts, 2026-10-22): a trade taken
-- from an intraday alert closes at the session's end unless the trader chose
-- to hold it overnight on the order ticket. The owner asked for the close as
-- the default, "not mandatory", so the choice is the order's own and stays
-- with the trade: the exit managers read it once per pass
-- (lib/trade/exit-style.ts#positionExitStyle).
--
-- False by default: every existing order, and every order that is not
-- intraday-sourced, is unaffected (the column is read only when
-- intraday_sourced is true).

alter table public.orders
  add column hold_overnight boolean not null default false;
