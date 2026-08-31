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
export const STRATEGY_VERSION = "2026-08-27-role-aware-proximity";
