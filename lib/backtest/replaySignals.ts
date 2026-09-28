/**
 * Historical walk-forward over the Signal and Regime Engine (`lib/signals`),
 * parallel to `lib/backtest/replay.ts`'s walk-forward over the Gann/STRAT
 * score — but scoped to evidence-gathering, not trade simulation.
 *
 * `replay()` fills a trigger against subsequent bars and tracks a full R-
 * multiple outcome; this doesn't, because doing that honestly needs an entry-
 * fill and stop/target-touch model for the new engine's own plan shape that
 * hasn't been validated yet, and fabricating one to get a number would be
 * exactly the "public accuracy claims outrunning validated methodology" the
 * doctrine audit already flags (see `GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` §4).
 * What this *can* honestly report — how often each regime/tier came up
 * historically — is useful evidence on its own for judging whether the
 * engine's criteria are too strict, too loose, or reasonable before anyone
 * builds a P&L claim on top of them.
 *
 * Every bar is evaluated with every gate passing except the ones the bar
 * data itself can decide (closed candle) — there is no historical liquidity,
 * event-calendar, or account state to replay against — so `tradeable` here
 * means "the price-action criteria alone would have qualified", not "this
 * would have been a live recommendation". `accountContextAssumed` on each
 * verdict reflects that.
 */

import type { Bar, Timeframe } from "@/lib/types";
import { classifyRegime } from "@/lib/signals/regime";
import { evaluateTrendPullback } from "@/lib/signals/states/trendPullback";
import type { Regime, RulesAlignmentTier, SignalGates } from "@/lib/signals/types";
import { fetchSeries } from "@/lib/backtest/run";

const ALL_GATES_PASS: SignalGates = {
  eligibleUniverse: true,
  operatingCandleClosed: true,
  staleData: false,
  binaryEventInHoldPeriod: false,
  liquiditySpreadPass: true,
  benchmarkSectorAlignment: true,
  targetRoomAvailable: true,
  stopWithinNovicePolicy: true,
  positionSizeAvailable: true,
  correlationConcentrationPass: true,
  cooldownPass: true,
  totalOpenRiskPass: true,
  dataQualityOk: true,
};

export interface SignalReplayEvent {
  index: number;
  date: string;
  regime: Regime;
  tier: RulesAlignmentTier;
  tradeable: boolean;
}

export interface SignalReplayResult {
  symbol: string;
  barsEvaluated: number;
  events: SignalReplayEvent[];
  tierCounts: Record<RulesAlignmentTier, number>;
  tradeableCount: number;
}

const MIN_WINDOW_BARS = 70;

/** Walks `dailyBars` forward one bar at a time, evaluating Trend Pullback readiness on each closed history window. */
export function replaySignalEngine(symbol: string, dailyBars: Bar[]): SignalReplayResult {
  const events: SignalReplayEvent[] = [];
  const tierCounts: Record<RulesAlignmentTier, number> = {
    watchlistOnly: 0,
    qualified: 0,
    aTier: 0,
    aPlusTier: 0,
  };
  let tradeableCount = 0;

  for (let i = MIN_WINDOW_BARS; i < dailyBars.length; i++) {
    const window = dailyBars.slice(0, i + 1);
    const regime = classifyRegime({ bars: window });
    if (regime.regime !== "trend" || regime.direction === "sideways") continue;

    const verdict = evaluateTrendPullback({
      direction: regime.direction,
      htfBars: window,
      executionBars: window,
      gates: ALL_GATES_PASS,
      accountContextAssumed: true,
    });
    if (verdict.status !== "evaluated") continue;

    tierCounts[verdict.alignment.tier]++;
    if (verdict.tradeable) tradeableCount++;
    events.push({
      index: i,
      date: dailyBars[i].t,
      regime: verdict.regime.regime,
      tier: verdict.alignment.tier,
      tradeable: verdict.tradeable,
    });
  }

  return { symbol, barsEvaluated: dailyBars.length, events, tierCounts, tradeableCount };
}

export interface SignalReplayUniverseResult {
  results: SignalReplayResult[];
  skipped: Array<{ symbol: string; reason: string }>;
  aggregateTierCounts: Record<RulesAlignmentTier, number>;
  aggregateTradeableCount: number;
  aggregateEventCount: number;
}

/**
 * Fetches daily bars for each symbol and runs `replaySignalEngine` over each
 * — the wiring `replaySignalEngine` had none of before this (2026-09-17
 * orphan-module audit): the function existed, was tested, and had no caller
 * anywhere in the codebase. Reuses `lib/backtest/run.ts`'s own daily-bar
 * fetch (`fetchSeries`) rather than a second data-fetch path, same source
 * `lib/backtest/replay.ts`'s walk-forward already reads its `dailyBars` from.
 */
export async function replaySignalEngineForUniverse(
  symbols: string[],
  timeframe: Timeframe,
): Promise<SignalReplayUniverseResult> {
  const results: SignalReplayResult[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];

  for (const symbol of symbols) {
    try {
      const { daily } = await fetchSeries(symbol, timeframe);
      if (daily.length === 0) {
        skipped.push({ symbol, reason: "no daily bars returned" });
        continue;
      }
      results.push(replaySignalEngine(symbol, daily));
    } catch (err) {
      skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const aggregateTierCounts: Record<RulesAlignmentTier, number> = {
    watchlistOnly: 0,
    qualified: 0,
    aTier: 0,
    aPlusTier: 0,
  };
  let aggregateTradeableCount = 0;
  let aggregateEventCount = 0;
  for (const r of results) {
    for (const tier of Object.keys(aggregateTierCounts) as RulesAlignmentTier[]) {
      aggregateTierCounts[tier] += r.tierCounts[tier];
    }
    aggregateTradeableCount += r.tradeableCount;
    aggregateEventCount += r.events.length;
  }

  return { results, skipped, aggregateTierCounts, aggregateTradeableCount, aggregateEventCount };
}
