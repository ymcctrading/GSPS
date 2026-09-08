/**
 * The one place the backtest's execution-cost assumption is named, so a
 * future comparison between backtested and paper/live performance starts
 * from a shared number instead of a magic `0.02` re-typed wherever it's
 * needed.
 *
 * Currently consumed by `lib/backtest/replay.ts` only. The paper broker
 * simulator (`lib/brokers/simulator.ts`) fills every order at the raw quote
 * with no cost applied — deliberately: it isolates "did the plan work" from
 * "what would execution have cost," which is what paper trading is for here.
 * That means a backtested edge is *not* directly comparable to the same
 * edge's paper P&L — the backtest is already net of an assumed round-trip
 * cost, the paper account isn't net of anything. Making paper fills apply
 * this same friction is a deliberate product decision (it changes every paper
 * account's realized P&L, not just this constant's definition), not something
 * to fold in silently — see the audit note in CHANGELOG.md.
 */

/**
 * Round-trip friction per share — spread crossed twice plus slippage on a
 * stop entry. Charged against every backtested trade, win or lose.
 */
export const DEFAULT_COST_PER_SHARE_USD = 0.02;
