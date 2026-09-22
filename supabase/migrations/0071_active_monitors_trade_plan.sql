-- "Your tracked Execute setups" (lib/dashboard/trackedExecute.ts) reads a
-- monitor's EXECUTE state from active_monitors, then joins each profile's
-- most recent scan_results row purely to get the trade-plan numbers to
-- display (entry/stop/TP1/master). scan_results is written by exactly one
-- caller -- app/api/batch-scan/route.ts's persistScanHistory -- while
-- active_monitors is written by every scan surface that can produce an
-- EXECUTE monitor: the single-ticker scan (app/api/scan/route.ts), the
-- scheduled system scans and batch-scan (both via
-- lib/entitlements/scan-fanout.ts), and intraday (app/api/intraday-scan/
-- route.ts). A monitor from any caller other than batch-scan has no
-- matching scan_results row, so getTrackedExecuteSetups silently drops it
-- (`.filter((row) => row != null)`) -- a real, previously-Execute-scoring
-- setup that never appears on the dashboard. See AGENTS.md's cross-platform
-- consistency principle: a mechanism (persisting the trade-plan numbers
-- somewhere `getTrackedExecuteSetups` can read) that exists for one caller
-- needs to exist for every caller that can produce the same state.
--
-- Fix: store the trade-plan numbers directly on the monitor row itself, so
-- the dashboard reader no longer depends on a second table only one writer
-- populates. All nullable -- a monitor evaluated with no trade plan (e.g.
-- an INVALIDATED candidate, or a caller that hasn't been updated to pass
-- levels yet) simply carries nulls, same as today's "no scan_results row"
-- case, but explicitly rather than by a silent join miss.
alter table public.active_monitors
  add column direction text check (direction is null or direction in ('bullish', 'bearish', 'none')),
  add column entry numeric,
  add column stop_loss numeric,
  add column take_profit_1 numeric,
  add column master_profit numeric,
  add column pattern_name text,
  add column output_state text check (output_state is null or output_state in ('Execute', 'Watch', 'Reject'));

-- Manual increase/decrease of a working staged exit's stop-loss (only once
-- the trade is in profit, and only tightened — see
-- lib/trade/attach-protocol-exit.ts's `updateProtocolExit`) needed a new
-- `applied_stop_reason` value distinct from the automated engine's existing
-- 'protocol'/'break_even'/'trailing'/'master_reversal' reasons, so a
-- manually-moved stop is still attributable as one at trade-log time
-- (lib/trade/exit-manager-sim.ts) rather than silently miscategorized.
alter table public.protocol_exits
  drop constraint if exists protocol_exits_applied_stop_reason_check;
alter table public.protocol_exits
  add constraint protocol_exits_applied_stop_reason_check
    check (applied_stop_reason is null or applied_stop_reason in
      ('protocol', 'break_even', 'trailing', 'master_reversal', 'manual'));
