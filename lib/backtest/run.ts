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
  byLargeCap,
  byOutputState,
  byScoreRange,
  combine,
  replay,
  type ReplayOptions,
  type ReplayResult,
} from "./replay";
import { attributeByAtrMultiple, attributeFactors, type FactorAttribution } from "./attribution";
import { computeRequiredMetrics, type RequiredMetrics } from "./metrics";
import { STRATEGY_VERSION } from "./strategyVersion";
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
  /** Bucket to attribute factors within. Defaults to Execute. Ignored when `attributeScoreRange` is set. */
  attributeWithin?: Bucket;
  /**
   * Attribute factors within a score band instead of a verdict bucket —
   * `[5, 6]` for "one point short of Execute", say. Takes precedence over
   * `attributeWithin` when set, because a verdict bucket cannot express a
   * band narrower than itself (Watch is 4–6 in one bucket).
   */
  attributeScoreRange?: [number, number];
  /** Criterion weights to score with. Defaults to one point each. */
  weights?: CriterionWeights;
  /**
   * Replay only execution bars at or after this instant, inside whatever the
   * timeframe's lookback returned. Its purpose is to hold the period still
   * while the timeframe changes: each timeframe has its own lookback, so a
   * 1Hour run covers two years where a 15Min run covers two months, and a
   * result that differs between them differs for two reasons at once. Pinning
   * the start leaves one.
   *
   * Daily bars are deliberately not trimmed — they are the score's history, not
   * the replay's sample, and starving them would change the verdicts rather
   * than the window they are measured over.
   */
  since?: string;
  /**
   * Walk the P&L simulation against the leeway/large-cap-widened stop instead
   * of the raw pattern stop. See `ReplayOptions.useProductionStop` — the flag
   * exists so the same request can be run twice, once per stop model, and the
   * two `largeCap` bucket rows compared, which is the before/after
   * `docs/BACKTESTING.md` asks for on an unmeasured constant.
   */
  useProductionStop?: boolean;
  /**
   * Also run the same request a second time at `slippageMultiplier` times the
   * cost-per-share and report the expectancy delta — the spec pack's
   * "slippage sensitivity" metric, showing how much of a bucket's edge is a
   * bet on near-ideal execution. Off by default: it doubles the fetch/replay
   * work of the request, which matters against a rate-limited vendor.
   */
  includeSlippageSensitivity?: boolean;
  /** Multiplier applied to `costPerShare` for the slippage-sensitivity run. Defaults to 3. */
  slippageMultiplier?: number;
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
  /** Sample size, average/median win and loss, max loss, profit factor, max
   * drawdown, and time-in-trade — the metric set the Validation, Backtesting,
   * Audit & Compliance spec pack requires alongside win rate/expectancy. */
  required: RequiredMetrics;
}

/** Expectancy at the base cost vs. at an elevated one, and how much of the edge that ate. */
export interface SlippageSensitivity {
  costPerShare: number;
  elevatedCostPerShare: number;
  baseExpectancyR: number;
  elevatedExpectancyR: number;
  expectancyDeltaR: number;
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
  /**
   * The run split by whether each trade's symbol read as large-cap at the
   * time — see `lib/strat/large-cap.ts`. Unlike `buckets`, this is computed
   * over every trade regardless of verdict, since the large-cap read needs no
   * score. Whether this split reflects the stop-widening itself depends on
   * `useProductionStop`: with it unset (the default), both rows are walked
   * against the identical, unwidened stop, and any difference between them is
   * a property of large-cap names generally — not of the widening.
   */
  largeCapSplit: { largeCap: RunSummary; notLargeCap: RunSummary };
  /** Echoes the request — a report has to say which stop model produced it. */
  useProductionStop: boolean;
  /** Setups armed and triggered across the run, for a fill-rate sanity check. */
  armed: number;
  triggered: number;
  /**
   * What `factors`/`atrBands` were computed within — a bucket name
   * ("Execute") or a score-band label ("score 5–6") when `attributeScoreRange`
   * was requested. A display label, not a re-parseable value.
   */
  attributeWithin: string;
  /** Echoes the request's score band, when one was given — see `attributeWithin`. */
  attributeScoreRange?: [number, number];
  factors: FactorAttribution[];
  atrBands: Array<{ from: number; to: number | null; trades: number; winRate: number; expectancyR: number }>;
  /**
   * The rule-set identifier this run describes — see `strategyVersion.ts`.
   * Every report carries one so a performance claim stays traceable to the
   * exact scoring/pattern logic in force when it was produced, per the
   * Validation, Backtesting, Audit & Compliance spec pack's "freeze a
   * strategy version" requirement.
   */
  strategyVersion: string;
  /** Present only when `includeSlippageSensitivity` was requested. */
  slippageSensitivity?: SlippageSensitivity;
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
    required: computeRequiredMetrics(r.trades),
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
    since,
    useProductionStop,
  } = request;

  const sinceMs = since === undefined ? null : Date.parse(since);
  if (sinceMs !== null && Number.isNaN(sinceMs)) {
    throw new Error(`Invalid 'since' timestamp: ${since}`);
  }

  const provider = getMarketDataProvider();
  const options: ReplayOptions = {
    targetR,
    ...(costPerShare !== undefined ? { costPerShare } : {}),
    ...(weights ? { weights } : {}),
    ...(useProductionStop !== undefined ? { useProductionStop } : {}),
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
      const { bars: fetched, daily } = await fetchSeries(symbol, timeframe);
      const bars = sinceMs === null ? fetched : fetched.filter((b) => Date.parse(b.t) >= sinceMs);
      if (bars.length === 0) {
        skipped.push({
          symbol,
          reason:
            sinceMs === null
              ? "no execution-timeframe bars returned"
              : `no execution-timeframe bars at or after ${since}`,
        });
        continue;
      }
      // The window is taken from the bars rather than from the requested
      // lookback: a symbol that only returned six months of history did not
      // cover the year the request asked for, and the report must say what was
      // actually replayed. That holds for `since` too — asking for a start the
      // feed cannot reach does not move the window there.
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

/**
 * Rerun the same request at an elevated cost-per-share and report the
 * expectancy delta on the overall (unbucketed) run — the spec pack's
 * "slippage sensitivity" metric. A second full fetch/replay, so callers opt
 * in via `includeSlippageSensitivity` rather than paying it on every request.
 */
async function computeSlippageSensitivity(
  request: BacktestRequest,
  baseExpectancyR: number,
): Promise<SlippageSensitivity> {
  const costPerShare = request.costPerShare ?? 0.02;
  const multiplier = request.slippageMultiplier ?? 3;
  const elevatedCostPerShare = costPerShare * multiplier;
  const elevated = await collectRun({ ...request, costPerShare: elevatedCostPerShare });
  return {
    costPerShare,
    elevatedCostPerShare,
    baseExpectancyR,
    elevatedExpectancyR: elevated.overall.expectancyR,
    expectancyDeltaR: elevated.overall.expectancyR - baseExpectancyR,
  };
}

export async function runBacktest(request: BacktestRequest): Promise<BacktestReport> {
  const { attributeWithin = "Execute", attributeScoreRange, useProductionStop = false } = request;

  const run = await collectRun(request);
  const split = byOutputState(run.overall);
  const target = attributeScoreRange
    ? byScoreRange(run.overall, attributeScoreRange[0], attributeScoreRange[1])
    : split[attributeWithin];
  const attributedLabel = attributeScoreRange
    ? `score ${attributeScoreRange[0]}–${attributeScoreRange[1]}`
    : attributeWithin;
  const capSplit = byLargeCap(run.overall);
  const slippageSensitivity = request.includeSlippageSensitivity
    ? await computeSlippageSensitivity(request, run.overall.expectancyR)
    : undefined;

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
    largeCapSplit: {
      largeCap: summarise(capSplit.largeCap),
      notLargeCap: summarise(capSplit.notLargeCap),
    },
    useProductionStop,
    armed: run.overall.armed,
    triggered: run.overall.triggered,
    attributeWithin: attributedLabel,
    ...(attributeScoreRange ? { attributeScoreRange } : {}),
    factors: attributeFactors(target.trades),
    atrBands: attributeByAtrMultiple(target.trades).map(({ from, to, arm }) => ({
      from,
      to,
      trades: arm.n,
      winRate: arm.winRate,
      expectancyR: arm.expectancyR,
    })),
    strategyVersion: STRATEGY_VERSION,
    ...(slippageSensitivity ? { slippageSensitivity } : {}),
    generatedAt: new Date().toISOString(),
  };
}
