-- Adds each symbol's own Gann time-cycle reads to the coarse-gate telemetry
-- log (0019_coarse_gate_telemetry.sql), alongside the ATR-relative
-- measurements already logged there. `lib/marketScan.ts` now uses them to
-- decide which symbols reach a full scan:
--   * cycle_active / cycle_direction — `timeCycles()` on the coarse pass's
--     daily bars (the day-count wheel), a small bonus on both coarse gates
--     (`CYCLE_WINDOW_BONUS`).
--   * year_cycle_bullish_hits / year_cycle_bearish_hits —
--     `yearCycleConvergence()` on monthly bars, the shortlist re-rank
--     (`YEAR_CYCLE_POOL_MULTIPLE`). Null when the monthly fetch returned
--     nothing for the symbol or hadn't landed in time that run.
-- Logged for the same reason the ATR-multiple thresholds are: so the bonus
-- values can be calibrated against real full-scan outcomes instead of
-- staying a one-time guess.
--
-- Apply before (or with) the deploy that ships the code: the telemetry upsert
-- writes these columns, and until they exist every telemetry batch is
-- rejected (best-effort — the scan itself is unaffected).
alter table public.coarse_gate_telemetry
  add column cycle_active boolean not null default false,
  add column cycle_direction text check (cycle_direction is null or cycle_direction in ('bullish', 'bearish', 'both')),
  add column year_cycle_bullish_hits int check (year_cycle_bullish_hits is null or year_cycle_bullish_hits >= 0),
  add column year_cycle_bearish_hits int check (year_cycle_bearish_hits is null or year_cycle_bearish_hits >= 0);
