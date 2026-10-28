/**
 * Monte Carlo resampling of a backtest's trade list (Q2 item 1, "Prove the
 * edge"). The report's expectancy CI (`bootstrapMeanCI95`) already says how
 * far the mean could move; it says nothing about the path. A run whose mean
 * is positive can still have drawdowns and losing streaks a trader would not
 * sit through, and those depend on the order the trades came in. This reads
 * the spread of expectancy, total R, maximum drawdown and the longest losing
 * streak across resampled sequences of the same trades.
 *
 * How it resamples: a circular moving block bootstrap (Künsch 1989; Politis
 * and Romano 1992) over the trades in `openedAt` order. Whole blocks of
 * consecutive trades are drawn, so losses that cluster in one stretch of the
 * market stay clustered, which is what a drawdown is made of. Drawing single
 * trades (the plain bootstrap) would scatter them and understate both the
 * drawdown and the streak. Engineering choices, labelled: the block length
 * defaults to the cube root of n, the rate Hall, Horowitz and Jing (1995) give
 * for variance and distribution estimates, and the bands are the 5th, 50th
 * and 95th percentiles of 5,000 seeded resamples, so a report is reproducible.
 *
 * What it leaves out: trades still open when the data ended (`open_at_end`),
 * whose R is marked to market rather than realised (`computeClosedSummary`);
 * the count left out is reported. Trades held to the replay's 10-session
 * limit stay in, as they do in `closed`. Derived trades (reversals and
 * re-buys) are resampled in their own scope by the caller, never with the
 * scored buckets.
 *
 * Design basis (AGENTS.md mandate). Gann: none; this is measurement, not a
 * rule, and it changes no verdict, score or trade. Cycles: it serves Dewey's
 * call for a significance test and for persistence through changed
 * conditions, read here as how the result holds across reorderings that keep
 * the run's local sequence; it makes no periodicity claim. Hermetic: Rhythm,
 * since losses come in runs and the block keeps the run; the other six don't
 * shape the design. Law of Creation: the trades ⊗ their order is a creation,
 * the drawdown and the streak exist in neither the R values alone nor the
 * calendar alone.
 */

import type { ReplayTrade } from "@/lib/backtest/replay";

export type MonteCarloTrade = Pick<ReplayTrade, "rMultiple" | "outcome" | "openedAt" | "symbol" | "exitReason">;

export interface MonteCarloBand {
  p5: number;
  p50: number;
  p95: number;
}

export interface MonteCarloSummary {
  /** Trades resampled (open-at-end trades excluded). */
  n: number;
  /** Trades left out because they were still open when the data ended. */
  excludedOpenAtEnd: number;
  /** Trades left out because their R was not a finite number (none expected; counted so a bad row shows). */
  excludedNonFinite: number;
  resamples: number;
  blockLength: number;
  seed: number;
  /** The figures on the run's own order, for comparison with the bands. */
  observed: { expectancyR: number; totalR: number; maxDrawdownR: number; longestLosingStreak: number };
  expectancyR: MonteCarloBand;
  totalR: MonteCarloBand;
  maxDrawdownR: MonteCarloBand;
  longestLosingStreak: MonteCarloBand;
  /** Share of resampled sequences whose expectancy was at or below zero. */
  shareNonPositiveExpectancy: number;
}

export interface MonteCarloOptions {
  resamples?: number;
  /** Trades per block; defaults to round(n^(1/3)), at least 1. */
  blockLength?: number;
  seed?: number;
}

export const MONTE_CARLO_RESAMPLES = 5000;
export const MONTE_CARLO_SEED = 20261028;

/** Deterministic PRNG, the one `metrics.ts` and `scripts/backtest-universe.mjs` use. */
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

export function defaultBlockLength(n: number): number {
  return Math.max(1, Math.round(Math.cbrt(n)));
}

interface PathStats {
  totalR: number;
  maxDrawdownR: number;
  longestLosingStreak: number;
}

/** Total R, peak-to-trough drawdown of the cumulative-R curve (from 0), and the longest run of losses. */
function pathStats(rs: ArrayLike<number>, losses: ArrayLike<number>): PathStats {
  let running = 0;
  let peak = 0;
  let worst = 0;
  let streak = 0;
  let longest = 0;
  for (let i = 0; i < rs.length; i++) {
    running += rs[i];
    if (running > peak) peak = running;
    if (peak - running > worst) worst = peak - running;
    if (losses[i] === 1) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 0;
    }
  }
  return { totalR: running, maxDrawdownR: worst, longestLosingStreak: longest };
}

/** Percentiles on the same index rule as `bootstrapMeanCI95`. */
function band(values: Float64Array): MonteCarloBand {
  values.sort();
  const r = values.length;
  return {
    p5: values[Math.floor(0.05 * r)],
    p50: values[Math.floor(0.5 * r)],
    p95: values[Math.min(r - 1, Math.ceil(0.95 * r) - 1)],
  };
}

/**
 * Resample `trades` as described in the header. `null` below 2 closed trades,
 * where a resample has nothing to vary. Trades are ordered by `openedAt`, then
 * symbol, then the order given (the sort is stable).
 */
export function monteCarloResample(
  trades: ReadonlyArray<MonteCarloTrade>,
  options: MonteCarloOptions = {},
): MonteCarloSummary | null {
  const closed = trades
    .filter((t) => t.exitReason !== "open_at_end" && Number.isFinite(t.rMultiple))
    .slice()
    .sort((a, b) =>
      a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0,
    );
  const n = closed.length;
  if (n < 2) return null;

  const resamples = Math.max(1, Math.floor(options.resamples ?? MONTE_CARLO_RESAMPLES));
  const blockLength = Math.min(n, Math.max(1, Math.floor(options.blockLength ?? defaultBlockLength(n))));
  const seed = options.seed ?? MONTE_CARLO_SEED;

  const rs = Float64Array.from(closed, (t) => t.rMultiple);
  const losses = Uint8Array.from(closed, (t) => (t.outcome === "loss" ? 1 : 0));
  const own = pathStats(rs, losses);

  const rand = mulberry32(seed);
  const sampleR = new Float64Array(n);
  const sampleLoss = new Uint8Array(n);
  const expectancy = new Float64Array(resamples);
  const total = new Float64Array(resamples);
  const drawdown = new Float64Array(resamples);
  const streak = new Float64Array(resamples);
  let nonPositive = 0;

  for (let r = 0; r < resamples; r++) {
    let filled = 0;
    while (filled < n) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < blockLength && filled < n; k++, filled++) {
        const i = (start + k) % n;
        sampleR[filled] = rs[i];
        sampleLoss[filled] = losses[i];
      }
    }
    const stats = pathStats(sampleR, sampleLoss);
    total[r] = stats.totalR;
    expectancy[r] = stats.totalR / n;
    drawdown[r] = stats.maxDrawdownR;
    streak[r] = stats.longestLosingStreak;
    if (expectancy[r] <= 0) nonPositive++;
  }

  return {
    n,
    excludedOpenAtEnd: trades.filter((t) => t.exitReason === "open_at_end").length,
    excludedNonFinite: trades.filter((t) => t.exitReason !== "open_at_end" && !Number.isFinite(t.rMultiple)).length,
    resamples,
    blockLength,
    seed,
    observed: {
      expectancyR: own.totalR / n,
      totalR: own.totalR,
      maxDrawdownR: own.maxDrawdownR,
      longestLosingStreak: own.longestLosingStreak,
    },
    expectancyR: band(expectancy),
    totalR: band(total),
    maxDrawdownR: band(drawdown),
    longestLosingStreak: band(streak),
    shareNonPositiveExpectancy: nonPositive / resamples,
  };
}
