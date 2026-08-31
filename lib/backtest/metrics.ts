/**
 * The performance-metric set the "Validation, Backtesting, Audit & Compliance
 * Plan" spec pack requires alongside win rate/expectancy, which
 * `lib/backtest/run.ts` already reported: sample size, average/median win and
 * loss, maximum loss, profit factor, maximum drawdown, and time-in-trade.
 * Kept separate from `replay.ts` (the trade simulator) and `run.ts` (the
 * fetch/report layer) so this stays pure and unit-testable against a fixed
 * trade list, same split as `attribution.ts`.
 */

import type { ReplayTrade } from "@/lib/backtest/replay";

export interface RequiredMetrics {
  /** Trades this was computed over. Report alongside every other number here —
   * a metric from a 3-trade sample is not evidence of anything. */
  sampleSize: number;
  avgWinR: number | null;
  medianWinR: number | null;
  avgLossR: number | null;
  medianLossR: number | null;
  /** The single worst trade's R-multiple (negative). `null` with no losing trades. */
  maxLossR: number | null;
  /** Gross profit / gross loss. `null` when there is no losing R to divide by. */
  profitFactor: number | null;
  /** Peak-to-trough drawdown over the cumulative-R curve, trades ordered by `openedAt`. */
  maxDrawdownR: number;
  avgBarsHeld: number | null;
  medianBarsHeld: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Peak-to-trough drawdown over a cumulative-R curve, in the order given. */
function maxDrawdown(cumulative: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const c of cumulative) {
    if (c > peak) peak = c;
    const dd = peak - c;
    if (dd > worst) worst = dd;
  }
  return worst;
}

export function computeRequiredMetrics(trades: ReplayTrade[]): RequiredMetrics {
  // outcome-based, not sign-of-rMultiple: matches the win/loss counts every
  // other report on this trade list already uses (replay.ts's summarise()),
  // and keeps a costs-only-negative "win" (a scratch that lost to friction)
  // out of both buckets rather than silently reclassifying it.
  const wins = trades.filter((t) => t.outcome === "win").map((t) => t.rMultiple);
  const losses = trades.filter((t) => t.outcome === "loss").map((t) => t.rMultiple);
  const barsHeld = trades.map((t) => t.barsHeld);

  const grossProfit = wins.reduce((s, r) => s + Math.max(r, 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + Math.min(r, 0), 0));

  const chronological = [...trades].sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : 0));
  let running = 0;
  const cumulative = chronological.map((t) => (running += t.rMultiple));

  return {
    sampleSize: trades.length,
    avgWinR: mean(wins),
    medianWinR: median(wins),
    avgLossR: mean(losses),
    medianLossR: median(losses),
    maxLossR: losses.length > 0 ? Math.min(...losses) : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    maxDrawdownR: maxDrawdown(cumulative),
    avgBarsHeld: mean(barsHeld),
    medianBarsHeld: median(barsHeld),
  };
}
