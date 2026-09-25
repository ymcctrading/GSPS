-- Adds the per-symbol Gann time-cycle read to the coarse-gate telemetry log
-- (0019_coarse_gate_telemetry.sql), alongside the ATR-relative measurements
-- already logged there. `lib/marketScan.ts`'s coarse pass now folds
-- `timeCycles()` (per-symbol pivot-anchored Master Time Factor projection,
-- previously only a post-hoc confluence flag — see scanTicker.ts/replay.ts)
-- into `coarseReversion`/`coarseContinuation` as a small rank bonus
-- (`CYCLE_WINDOW_BONUS`). These columns exist for the same reason the
-- ATR-multiple thresholds are logged here: so the bonus's value can be
-- calibrated against real outcomes later instead of staying a one-time
-- guess.
alter table public.coarse_gate_telemetry
  add column cycle_active boolean not null default false,
  add column cycle_direction text check (cycle_direction is null or cycle_direction in ('bullish', 'bearish'));
