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
 */

import type { Bar, Timeframe } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS } from "@/lib/timeframe";
import { byOutputState, combine, replay, type ReplayOptions, type ReplayResult } from "./replay";
import { attributeByAtrMultiple, attributeFactors, type FactorAttribution } from "./attribution";

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
}

export interface RunSummary {
  trades: number;
  winRate: number;
  expectancyR: number;
  totalR: number;
}

export interface BucketSummary extends RunSummary {
  bucket: Bucket;
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
  symbols: string[];
  /** Symbols whose bars could not be fetched, with the reason. */
  skipped: Array<{ symbol: string; reason: string }>;
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

function summarise(r: ReplayResult): RunSummary {
  return {
    trades: r.trades.length,
    winRate: r.winRate,
    expectancyR: r.expectancyR,
    totalR: r.totalR,
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

export async function runBacktest(request: BacktestRequest): Promise<BacktestReport> {
  const {
    symbols,
    timeframe = "15Min",
    targetR = 2,
    costPerShare,
    attributeWithin = "Execute",
  } = request;

  const provider = getMarketDataProvider();
  const options: ReplayOptions = { targetR, ...(costPerShare !== undefined ? { costPerShare } : {}) };

  const results: ReplayResult[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];
  const used: string[] = [];

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
      results.push(replay(symbol, bars, { ...options, dailyBars: daily }));
      used.push(symbol);
    } catch (err) {
      skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const overall = combine(results);
  const split = byOutputState(overall);
  const target = split[attributeWithin];

  return {
    source: provider.name,
    live: provider.isLive,
    timeframe,
    targetR,
    symbols: used,
    skipped,
    overall: summarise(overall),
    buckets: BUCKETS.map((b) => ({ bucket: b, ...summarise(split[b]) })),
    armed: overall.armed,
    triggered: overall.triggered,
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
