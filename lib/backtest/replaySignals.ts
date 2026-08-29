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

import type { Bar } from "@/lib/types";
import { classifyRegime } from "@/lib/signals/regime";
import { evaluateTrendPullback } from "@/lib/signals/states/trendPullback";
import type { Regime, RulesAlignmentTier, SignalGates } from "@/lib/signals/types";

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
      vwapAnchorIndex: Math.max(0, window.length - 20),
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
