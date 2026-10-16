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
 * Gann's reversal geometry (A-EXIT-02, W006 p.48 Rule 6; owner's Q15,
 * 2026-10-16), computed by `lib/gann/reverse.ts`:
 *  - Entry is the level whose break ended the trade: the stop that was hit, or
 *    the close a change-of-trend exit was read on (`brokenLevel`). Without one,
 *    the old plan's own stop.
 *  - The reversal's stop sits 3 of Gann's points beyond the old trade's
 *    extreme, over the top a long reached (`extreme`, the exit manager's high
 *    water). Without one, the old entry stands in for it. Until 2026-10-16 the
 *    stop was the old entry itself, with no allowance beyond it.
 *  - No target is fixed (Q14): the reversal leaves on Gann's exit rules like
 *    any trade. The plan's TP1/TP2 fields are levels to watch, one and two of
 *    the reversal's own risk out; the plan schema needs them and the fill check
 *    reads TP1 as the far edge of the bracket. They are not Gann levels, and
 *    nothing exits there.
 *
 * The resulting plan starts at WATCHLIST like any other and is walked
 * through QUALIFIED -> AWAITING_ENTRY_CONFIRMATION by the caller, same as
 * lib/entitlements/scan-fanout.ts's `createTradePlanForTransition` — it must
 * still clear its own break/retest/confirmation-move sequence
 * (lib/lifecycle/entryConfirmation.ts) before it can arm. A stop-out alone
 * never fires a trade.
 */

import type { RulesAlignmentScore } from "@/lib/signals/types";
import type { TradePlan } from "./types";
import type { NewTradePlan } from "./store";
import { freshEntryConfirmation } from "./entryConfirmation";
import { sessionCloseDeadline } from "./expiry";
import { gannReversal } from "@/lib/gann/reverse";

/** Every reversal plan this module builds carries a `signalId` with this prefix. */
export const PIVOT_SIGNAL_PREFIX = "pivot:";

/**
 * Whether a plan is a stop-and-reverse plan from this module rather than a
 * Gann reaction plan from a scan. A reversal's entry is the old stop and its
 * stop the old entry, so its entry and stop are not the reaction pair
 * `gannBreakLine` reads the crossing from (PLAN.md item 4); it keeps the
 * retest-and-hold confirmation.
 */
export function isPivotSignal(signalId: string | null | undefined): boolean {
  return typeof signalId === "string" && signalId.startsWith(PIVOT_SIGNAL_PREFIX);
}


const WATCHLIST_TIER_SCORE: RulesAlignmentScore = {
  score: 0,
  tier: "watchlistOnly",
  blueprintScoreBand: "NO_TRADE",
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
  opts: { generatedAt: string; brokenLevel?: number | null; extreme?: number | null },
): NewTradePlan | null {
  const originalRisk = Math.abs(stopped.coordinates.entryTrigger - stopped.coordinates.invalidation);
  if (!Number.isFinite(originalRisk) || originalRisk <= 0) return null;

  const reversal = gannReversal({
    side: stopped.direction === "bullish" ? "long" : "short",
    brokenLevel: opts.brokenLevel ?? stopped.coordinates.invalidation,
    extreme: opts.extreme ?? stopped.coordinates.entryTrigger,
  });
  if (!reversal) return null;
  const direction = reversal.side === "long" ? "bullish" : "bearish";
  const dir = direction === "bullish" ? 1 : -1;
  const entryTrigger = reversal.entry;
  const invalidation = reversal.stop;
  const risk = Math.abs(entryTrigger - invalidation);
  const takeProfit1 = entryTrigger + dir * risk;
  const takeProfit2 = entryTrigger + dir * (2 * risk);
  if (dir * (takeProfit1 - entryTrigger) <= 0 || takeProfit1 <= 0 || takeProfit2 <= 0) return null;

  return {
    strategyVersion: stopped.strategyVersion,
    signalId: `${PIVOT_SIGNAL_PREFIX}${stopped.planId}`,
    instrument: stopped.instrument,
    market: stopped.market,
    timeframe: stopped.timeframe,
    generatedAt: opts.generatedAt,
    expiresAt: sessionCloseDeadline(opts.generatedAt, stopped.market),
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
