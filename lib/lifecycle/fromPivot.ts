/**
 * Builds a `NewTradePlan` for the opposite-direction Pivot Plan scenario
 * (lib/strat/levels.ts, lib/scanner/intraday.ts) once a plan the Automated
 * Portfolio Manager placed has actually been stopped out — see
 * lib/automation/stop-out.ts, the only caller. Distinct from
 * lib/lifecycle/fromScanResult.ts's `buildNewTradePlanFromScanResult`: that
 * one starts from a fresh `ScanResult` with its own regime/alignment read;
 * this one has no fresh scan to draw on, only the plan that just failed, so
 * every level here is derived from that plan's own already-computed
 * coordinates rather than new structural analysis.
 *
 * Deliberately conservative, matching Pivot Plan's existing "harder to
 * satisfy than continuation" philosophy (lib/scanner/intraday.ts's own
 * `pivotPlan`), and mirroring that function's own geometry directly (see its
 * doc comment): the pivot's own stop sits at the extreme of the *original*
 * direction, its target sits further beyond the entry in the *new*
 * direction.
 *  - Entry is the level whose breach ended the original thesis — the same
 *    level Pivot Plan's `confirmation` text already names as what a reversal
 *    would need to close back through.
 *  - The reversal's own stop sits at the original entry price — the most
 *    extreme real print this narrow function has access to in the original
 *    direction, standing in for intraday's session high/low (there is no
 *    session/swing-high data at this timeframe to derive a tighter one
 *    from).
 *  - Targets extend past the new entry by the same per-share risk the failed
 *    setup carried, one and two multiples out — a plain, symmetric default
 *    in the absence of a fresh pattern/ATR read for this instrument, not a
 *    claim that this is the best possible target.
 *
 * The resulting plan starts at WATCHLIST like any other and is walked
 * through QUALIFIED -> AWAITING_ENTRY_CONFIRMATION by the caller, same as
 * lib/entitlements/scan-fanout.ts's `createTradePlanForTransition` — it must
 * still clear its own break/retest/confirmation-move sequence
 * (lib/lifecycle/entryConfirmation.ts) before it can arm. A stop-out alone
 * never fires a trade.
 */

import { TF_INTERVAL_MS, isTimeframe } from "@/lib/timeframe";
import type { RulesAlignmentScore } from "@/lib/signals/types";
import type { TradePlan } from "./types";
import type { NewTradePlan } from "./store";
import { freshEntryConfirmation } from "./entryConfirmation";

/** Same fallback used when no fresh scan verdict exists to carry a real expiry from — see fromScanResult.ts. */
const DEFAULT_EXPIRES_AFTER_BARS = 20;
const FALLBACK_TIMEFRAME = "15Min" as const;

const WATCHLIST_TIER_SCORE: RulesAlignmentScore = {
  score: 0,
  tier: "watchlistOnly",
  breakdown: [],
};

/**
 * Null when the stopped plan doesn't carry enough real per-share risk to
 * size a reversal against (a degenerate or already-malformed plan) — same
 * "no complete lifecycle fields, no plan" rule `buildNewTradePlanFromScanResult`
 * follows.
 */
export function buildPivotTradePlanFromStoppedPlan(
  stopped: TradePlan,
  opts: { generatedAt: string },
): NewTradePlan | null {
  const direction = stopped.direction === "bullish" ? "bearish" : "bullish";
  const dir = direction === "bullish" ? 1 : -1;

  const originalRisk = Math.abs(stopped.coordinates.entryTrigger - stopped.coordinates.invalidation);
  if (!Number.isFinite(originalRisk) || originalRisk <= 0) return null;

  // The level whose breach ended the original thesis is the reversal's entry.
  const entryTrigger = stopped.coordinates.invalidation;
  // The original entry price is the extreme in the *original* direction —
  // this timeframe's stand-in for intraday's session high/low.
  const invalidation = stopped.coordinates.entryTrigger;
  const takeProfit1 = entryTrigger + dir * originalRisk;
  const takeProfit2 = entryTrigger + dir * (2 * originalRisk);

  // Guard against a degenerate/corrupt original plan producing a target that
  // isn't actually beyond the new entry in the reversal's own direction.
  if (dir * (takeProfit1 - entryTrigger) <= 0 || dir * (takeProfit2 - takeProfit1) <= 0) return null;

  const timeframe = isTimeframe(stopped.timeframe) ? stopped.timeframe : FALLBACK_TIMEFRAME;

  return {
    strategyVersion: stopped.strategyVersion,
    signalId: `pivot:${stopped.planId}`,
    instrument: stopped.instrument,
    market: stopped.market,
    timeframe: stopped.timeframe,
    generatedAt: opts.generatedAt,
    expiresAt: new Date(
      new Date(opts.generatedAt).getTime() + DEFAULT_EXPIRES_AFTER_BARS * TF_INTERVAL_MS[timeframe],
    ).toISOString(),
    direction,
    // Idempotency key: one pivot plan per stop-out. A retried/duplicated
    // stop-out handling call for the same event lands on the same row
    // instead of creating a second pivot plan for the symbol.
    signalFingerprint: `pivot:${stopped.planId}:${opts.generatedAt}`,
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger,
      entryLimitTolerance: stopped.coordinates.entryLimitTolerance,
      invalidation,
      stopType: stopped.coordinates.stopType,
      takeProfit1,
      takeProfit2,
      masterProfit: takeProfit2,
      runnerRule: {
        enabled: false,
        description: "Trail without lowering the Master Profit floor.",
      },
    },
    risk: {
      approvedQuantity: 0,
      fractionalCapability: false,
      plannedDollarRisk: 0,
      allocationPct: 0,
      totalOpenRiskSnapshot: 0,
    },
    evidence: {
      // No fresh scan produced this plan — there is no new regime/alignment
      // read to carry, only the failed plan's own. Marked at watchlist tier
      // rather than borrowing the original plan's (now-invalidated) score.
      regime: { regime: "trend", direction, reasons: [], disqualifiers: [] },
      alignment: WATCHLIST_TIER_SCORE,
      dataTimestamps: { stoppedPlanId: stopped.planId, stoppedAt: opts.generatedAt },
      eventLiquidityStatus: "unknown",
    },
  };
}
