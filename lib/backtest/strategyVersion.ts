/**
 * "Freeze a strategy version before shadow/live-paper tracking" — the
 * Validation, Backtesting, Audit & Compliance spec pack's requirement that a
 * performance claim be tied to the exact rule set that produced it, not to
 * "whatever the code does today".
 *
 * This is a manually bumped identifier, not a hash of the scoring modules:
 * a hash would change on any refactor that touches those files even when no
 * rule changed, which is noise this is meant to avoid. Bump it deliberately
 * whenever a change lands that could move backtest results — the same set
 * `docs/BACKTESTING.md`'s "So what does move the numbers" section lists
 * (`lib/scoring/score.ts`, `lib/scoring/proximity.ts`, `lib/scoring/weights.ts`,
 * `lib/strat/patterns.ts`, `lib/strat/levels.ts`, the Signal and Regime Engine
 * states) — and note the bump in `CHANGELOG.md`.
 */
// 2026-09-27: Gann's own swing charts (3-Day Chart and 7-day weekly chart on
// highs and lows, trend turns on breaking the last swing extreme) replace the
// close-count 3/9 charts under swingChartTrend, the regime engine, readTrend
// and the entry trigger's pivots. Conflict X3, owner decision.
// Same day, second bump: Gann's change-of-trend rules in the trend read
// (over-balance of space/time, monthly-low break), his fractions of the year
// and day-count bands in the time windows, his major percentage-of-price
// levels in the S/R list, and the Rule of Three scored on weekly and monthly
// closes as well as daily.
// Third bump (owner decision 5): Gann's breakaway rule. A range-bound setup
// whose entry stays inside its 13-week range is held from Execute to Watch.
export const STRATEGY_VERSION = "2026-09-27-gann-breakaway";
