-- GSPS — 0128: the overnight sweep keeps its plan's levels
--
-- Gann alignment audit, scan share, SUS-21: a sweep Execute that the daily
-- lists never publish is timed by the intraday scan through the session
-- (lib/scanner/sessionSetups.ts), but the sweep row stored only the entry,
-- so nothing could tell when the session traded through its stop. Gann ends
-- a plan on a caught stop and takes a new one only from new structure
-- (Overnight Chart rule 4; New Stock Trend Detector Rule 6; owner,
-- 2026-09-30: "A breach retires the plan").
--
-- The sweep now stores the plan's stop, first target, master target and
-- whether its crossing still waits on the daily close, so the intraday scan
-- times it as it times a listed plan; and `invalidated_at` with
-- `invalidated_reason`, written once the session trades through that stop
-- or the day's market scan re-scores the stock and no longer reads the plan,
-- takes it off the session's setups and the market scan's first slots until
-- the next night's sweep reads new structure.
--
-- Server-only, as 0110: written and read with the service role, RLS on with
-- no policy. Additive: every column is nullable, and rows from before this
-- migration read as plans with no stored stop (not timed, as before).
--
-- Forward-only.
--
-- Rollback:
--   alter table public.universe_sweep
--     drop column if exists stop_loss,
--     drop column if exists take_profit_1,
--     drop column if exists master_profit,
--     drop column if exists entry_awaits_crossing,
--     drop column if exists invalidated_at,
--     drop column if exists invalidated_reason;

alter table public.universe_sweep
  add column if not exists stop_loss numeric,
  add column if not exists take_profit_1 numeric,
  add column if not exists master_profit numeric,
  add column if not exists entry_awaits_crossing boolean,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_reason text;
