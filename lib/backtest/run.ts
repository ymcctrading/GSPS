/**
 * Runs the replay across a set of symbols and reduces it to the numbers a
 * tuning decision actually needs: expectancy per verdict bucket, and per-factor
 * attribution inside whichever bucket is being interrogated.
 *
 * The replay itself is pure — bars in, trades out. This is the layer that goes
 * and gets the bars, which is why it lives apart from `replay.ts`: the harness
 * stays unit-testable with no network, and the fetching, the per-symbol failure
 * handling and the provenance labelling all sit here.
 *
 * Provenance is not decoration. `getMarketDataProvider()` silently falls back
 * to the deterministic synthetic generator when no vendor credentials are
 * configured, and the synthetic series is a seeded random walk — it will
 * produce an expectancy, a win rate and a full factor ranking that mean
 * precisely nothing. Every result carries `live` and `source` so a caller can
 * never mistake one for the other, and the dashboard refuses to present a
 * non-live run as a finding.
 *
 * A result also carries the window it covered and the win rate the target
 * requires to break even. Both exist because a headline win rate is not a
 * finding on its own: 29% is a loss at a 2R target and a win at 3R, and the
 * same number over three weeks and over three years are different claims.
 */

import type { Bar, Timeframe } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS } from "@/lib/timeframe";
import {
  byOutputState,
  combine,
  replay,
  type ReplayOptions,
  type ReplayResult,
} from "./replay";
import { attributeByAtrMultiple, attributeFactors, type FactorAttribution } from "./attribution";
import type { CriterionWeights } from "@/lib/scoring/weights";

/** Verdict buckets, plus the trades the score could not reach. */
export type Bucket = "Execute" | "Watch" | "Reject" | "unscored";

export const BUCKETS: Bucket[] = ["Execute", "Watch", "Reject", "unscored"];

export interface BacktestRequest {
  symbols: string[];
  /** Execution timeframe the patterns are detected on. Defaults to 15Min. */
  timeframe?: Timeframe;
  /** Take-profit distance as a multiple of risk. Defaults to 2, matching TP1. */
  targetR?: number;
  costPerShare?: number;
  /** Bucket to attribute factors within. Defaults to Execute. */
  attributeWithin?: Bucket;
  /** Criterion weights to score with. Defaults to one point each. */
  weights?: CriterionWeights;
}

export interface RunSummary {
  trades: number;
  winRate: number;
  expectancyR: number;
  totalR: number;
  /**
   * True when this bucket's expectancy is above zero after costs. Stated
   * explicitly because it is the question the run is being asked, and reading
   * it off a signed decimal is exactly where a summary gets misquoted.
   */
  profitable: boolean;
}

export interface BucketSummary extends RunSummary {
  bucket: Bucket;
}

/** The span of bars a run actually covered, oldest bar to newest. */
export interface RunWindow {
  from: string | null;
  to: string | null;
}

export interface BacktestReport {
  /** Provider that supplied the bars, e.g. "alpaca" or "synthetic". */
  source: string;
  /**
   * False when the bars came from the synthetic generator. Every number below
   * is then a property of a seeded random walk, not of the market.
   */
  live: boolean;
  timeframe: Timeframe;
  targetR: number;
  /**
   * Win rate this target must clear to break even, 1/(1+targetR), before costs.
   * At 2R that is 33.3% and at 3R it is 25% — which is why a bare win rate
   * decides nothing without the target beside it.
   */
  breakEvenWinRate: number;
  symbols: string[];
  /** Symbols whose bars could not be fetched, with the reason. */
  skipped: Array<{ symbol: string; reason: string }>;
  /** First and last execution bar seen across the universe. */
  window: RunWindow;
  /** Every trade taken, before the verdict split. */
  overall: RunSummary;
  buckets: BucketSummary[];
  /** Setups armed and triggered across the run, for a fill-rate sanity check. */
  armed: number;
  triggered: number;
  attributeWithin: Bucket;
  factors: FactorAttribution[];
  atrBands: Array<{ from: number; to: number | null; trades: number; winRate: number; expectancyR: number }>;
  generatedAt: string;
}

/** Break-even win rate for a fixed-R target, before costs. */
export function breakEvenWinRate(targetR: number): number {
  return targetR > 0 ? 1 / (1 + targetR) : 1;
}

function summarise(r: ReplayResult): RunSummary {
  return {
    trades: r.trades.length,
    winRate: r.winRate,
    expectancyR: r.expectancyR,
    totalR: r.totalR,
    profitable: r.trades.length > 0 && r.expectancyR > 0,
  };
}

/**
 * Fetch the execution-timeframe bars and the daily bars for one symbol.
 * Daily bars are what switch the score on inside the replay; without them
 * every trade comes back unscored and there is nothing to attribute.
 */
async function fetchSeries(symbol: string, timeframe: Timeframe): Promise<{ bars: Bar[]; daily: Bar[] }> {
  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const now = Date.now();
  const window = (tf: Timeframe) => new Date(now - TF_LOOKBACK_DAYS[tf] * 86_400_000);

  const [bars, daily] = await Promise.all([
    provider.fetchBars(symbol, timeframe, window(timeframe), null, assetClass, TF_MAX_BARS[timeframe]),
    provider.fetchBars(symbol, "1Day", window("1Day"), null, assetClass, TF_MAX_BARS["1Day"]),
  ]);
  return { bars, daily };
}

export interface RunOutcome {
  source: string;
  live: boolean;
  timeframe: Timeframe;
  targetR: number;
  /** Symbols that produced bars. */
  symbols: string[];
  skipped: Array<{ symbol: string; reason: string }>;
  window: RunWindow;
  overall: ReplayResult;
}

/**
 * Fetch, replay, and hand back the trades themselves.
 *
 * Split out from `runBacktest` because a weight study needs the trades, not a
 * summary of them — and shipping thousands of trades through the report every
 * caller reads would be the wrong trade-off for a single consumer.
 */
export async function collectRun(request: BacktestRequest): Promise<RunOutcome> {
  const {
    symbols,
    timeframe = "15Min",
    targetR = 2,
    costPerShare,
    weights,
  } = request;

  const provider = getMarketDataProvider();
  const options: ReplayOptions = {
    targetR,
    ...(costPerShare !== undefined ? { costPerShare } : {}),
    ...(weights ? { weights } : {}),
  };

  const results: ReplayResult[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];
  const used: string[] = [];
  let from: string | null = null;
  let to: string | null = null;

  // Sequential rather than parallel: the vendor rate-limits, and a backtest
  // that trips the limiter reports a smaller universe than it was asked for
  // while looking like it succeeded.
  for (const symbol of symbols) {
    try {
      const { bars, daily } = await fetchSeries(symbol, timeframe);
      if (bars.length === 0) {
        skipped.push({ symbol, reason: "no execution-timeframe bars returned" });
        continue;
      }
      // The window is taken from the bars rather than from the requested
      // lookback: a symbol that only returned six months of history did not
      // cover the year the request asked for, and the report must say what was
      // actually replayed.
      const first = bars[0].t;
      const last = bars[bars.length - 1].t;
      if (from === null || first < from) from = first;
      if (to === null || last > to) to = last;

      results.push(replay(symbol, bars, { ...options, dailyBars: daily }));
      used.push(symbol);
    } catch (err) {
      skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    source: provider.name,
    live: provider.isLive,
    timeframe,
    targetR,
    symbols: used,
    skipped,
    window: { from, to },
    overall: combine(results),
  };
}

export async function runBacktest(request: BacktestRequest): Promise<BacktestReport> {
  const { attributeWithin = "Execute" } = request;

  const run = await collectRun(request);
  const split = byOutputState(run.overall);
  const target = split[attributeWithin];

  return {
    source: run.source,
    live: run.live,
    timeframe: run.timeframe,
    targetR: run.targetR,
    breakEvenWinRate: breakEvenWinRate(run.targetR),
    symbols: run.symbols,
    skipped: run.skipped,
    window: run.window,
    overall: summarise(run.overall),
    buckets: BUCKETS.map((b) => ({ bucket: b, ...summarise(split[b]) })),
    armed: run.overall.armed,
    triggered: run.overall.triggered,
    attributeWithin,
    factors: attributeFactors(target.trades),
    atrBands: attributeByAtrMultiple(target.trades).map(({ from, to, arm }) => ({
      from,
      to,
      trades: arm.n,
      winRate: arm.winRate,
      expectancyR: arm.expectancyR,
    })),
    generatedAt: new Date().toISOString(),
  };
}
