-- GSPS — 0104: whether a monitor's plan still waits on its crossing
--
-- A daily plan priced from a crossing of an old top (bottom) is armed by a
-- daily close 3 points past the level, and its entry is the reaction buy 1
-- point past it (W006 Rule 3(b)-(c), pp. 46-47). The intraday scan's "Daily
-- plan's level held" alert times that reaction, so it must know whether the
-- crossing is made. daily_scans carries it in `detail`; active_monitors has
-- no detail column, so it gets one boolean. Null means unknown (rows written
-- before this), which the intraday scan reads from the prior close instead.
--
-- Forward-only. Rollback:
--   alter table public.active_monitors drop column if exists entry_awaits_crossing;

alter table public.active_monitors
  add column if not exists entry_awaits_crossing boolean;
