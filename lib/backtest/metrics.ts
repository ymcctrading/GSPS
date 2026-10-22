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

/** Deterministic PRNG, so a report's CIs are reproducible (the same one `scripts/backtest-universe.mjs` uses). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Percentile bootstrap 95% CI for the mean of `values`, null below 2 samples.
 * Same resamples and seed as `scripts/backtest-universe.mjs#bootstrapMeanCI`,
 * so the report and the universe summary agree on the same trades.
 */
export function bootstrapMeanCI95(values: number[], resamples = 5000, seed = 20260925): [number, number] | null {
  if (values.length < 2) return null;
  const rand = mulberry32(seed);
  const means = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[Math.floor(rand() * values.length)];
    means[r] = sum / values.length;
  }
  means.sort();
  return [means[Math.floor(0.025 * resamples)], means[Math.min(resamples - 1, Math.ceil(0.975 * resamples) - 1)]];
}

/**
 * A scope's trades without the ones still open when the data ended
 * (`exitReason: "open_at_end"`), whose R is marked to market rather than
 * realised (2026-10-21). Gann's exits cut losers early, so the open trades
 * are mostly winners and the scope's own expectancy reads higher than its
 * closed trades do: on the 2026-10-21 15-minute run the 1,110 timeouts
 * averaged +0.648R while every closed exit was at or below zero.
 *
 * It still includes trades held to the replay's 10-session limit
 * (`held_to_limit`), which are also marked at that bar's close rather than
 * realised: production has no 10-session exit (Q14). So this is "excluding
 * data-end only", not a realised-only figure (review of #389).
 */
export interface ClosedSummary {
  n: number;
  expectancyR: number;
  expectancyCI95: [number, number] | null;
  winRate: number;
  /** Gross profit / gross loss, outcome-based as in `RequiredMetrics`. `null` with no losing R. */
  profitFactor: number | null;
  totalR: number;
}

export function computeClosedSummary(trades: ReplayTrade[]): ClosedSummary {
  const closed = trades.filter((t) => t.exitReason !== "open_at_end");
  const rs = closed.map((t) => t.rMultiple);
  const totalR = rs.reduce((s, r) => s + r, 0);
  return {
    n: closed.length,
    expectancyR: closed.length > 0 ? totalR / closed.length : 0,
    expectancyCI95: bootstrapMeanCI95(rs),
    winRate: closed.length > 0 ? closed.filter((t) => t.outcome === "win").length / closed.length : 0,
    profitFactor: computeRequiredMetrics(closed).profitFactor,
    totalR,
  };
}
