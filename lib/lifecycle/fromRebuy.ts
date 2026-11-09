/**
 * Builds a `NewTradePlan` for Gann's re-buy after a stop (A-PYRAMID-07,
 * *Tunnel Thru the Air* W022 p.198; `lib/gann/rebuy.ts`) once a plan
 * automation placed has been stopped on a trailing stop while the trend still
 * runs its way. lib/automation/stop-out.ts is the only caller. Until
 * 2026-10-22 the exit managers only offered this in a note, even for
 * automation's own trades, while the replay walked it (`rebuyAfterStop`).
 *
 * The geometry is `gannRebuy`'s: the same side as the stopped trade, resting
 * 12 Gann points back from its best price, the stop half the reaction beyond.
 * The plan is an `oldLevel` entry, an order that rests at its level with
 * nothing to cross (placement buys at the market once a closed bar trades
 * into the zone, rule 9), and two things the replay's `walkRebuy` reads are
 * carried so placement reads them the same way:
 *  - Only bars after the stop count (`generatedAt` is the stop's time).
 *  - A new extreme past the stopped trade's best price before the reaction
 *    calls it off (`evidence.dataTimestamps.rebuyExtreme`).
 *
 * No target is fixed (Q14): TP1/TP2 are levels to watch, one and two of the
 * re-entry's risk out, as on a reversal plan (`fromPivot.ts`); nothing exits
 * there. Expiry is the close of the 10th session counting the stop's own,
 * near the replay's window (`maxBarsHeld`, 10 sessions of candles after the
 * stop, so up to most of a session longer); an engineering figure, not Gann's.
 * Live only, as for every resting entry, the portfolio manager's round-number
 * hold applies to it (lib/gann/evenFigures.ts); the replay reads none.
 *
 * Three-question basis: (1) Gann, *Tunnel* p.198, Tier A, as in `rebuy.ts`.
 * (2) No periodicity claim; Dewey's checklist does not apply. (3) Rhythm: the
 * stop ends the lot, not the campaign, and the re-entry rides the in-breath
 * after the reaction. Law of Creation: the stopped trade ⊗ the trend still
 * running makes the re-entry, which neither holds alone.
 */

import type { RulesAlignmentScore } from "@/lib/signals/types";
import type { GannRebuy } from "@/lib/gann/rebuy";
import type { TradePlan } from "./types";
import type { NewTradePlan } from "./store";
import { freshEntryConfirmation } from "./entryConfirmation";
import { sessionCloseDeadline } from "./expiry";

/** Every re-buy plan this module builds carries a `signalId` with this prefix. */
export const REBUY_SIGNAL_PREFIX = "rebuy:";

/** Sessions a re-buy waits for its reaction: the replay's `maxBarsHeld` window. */
export const REBUY_SESSIONS = 10;

export function isRebuySignal(signalId: string | null | undefined): boolean {
  return typeof signalId === "string" && signalId.startsWith(REBUY_SIGNAL_PREFIX);
}

/**
 * The best price a re-buy plan is called off beyond, or null when the plan is
 * not a re-buy or carries none.
 */
export function rebuyExtremeOf(plan: Pick<TradePlan, "signalId" | "evidence">): number | null {
  if (!isRebuySignal(plan.signalId)) return null;
  const v = Number(plan.evidence?.dataTimestamps?.rebuyExtreme);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const WATCHLIST_TIER_SCORE: RulesAlignmentScore = {
  score: 0,
  tier: "watchlistOnly",
  blueprintScoreBand: "NO_TRADE",
  breakdown: [],
};

/** The close of the `sessions`-th session from `at` (the stop's own session first). */
export function sessionsDeadline(at: string, market: string, sessions: number): string {
  let t = sessionCloseDeadline(at, market);
  for (let i = 1; i < sessions; i++) t = sessionCloseDeadline(t, market);
  return t;
}

export function buildRebuyTradePlanFromStoppedPlan(
  stopped: TradePlan,
  opts: { generatedAt: string; rebuy: GannRebuy },
): NewTradePlan | null {
  const { rebuy } = opts;
  const direction = rebuy.side === "long" ? "bullish" : "bearish";
  if (direction !== stopped.direction) return null;
  const dir = direction === "bullish" ? 1 : -1;
  const risk = Math.abs(rebuy.entry - rebuy.stop);
  if (!(risk > 0) || dir * (rebuy.entry - rebuy.stop) <= 0) return null;
  const takeProfit1 = rebuy.entry + dir * risk;
  const takeProfit2 = rebuy.entry + dir * 2 * risk;
  if (takeProfit1 <= 0 || takeProfit2 <= 0) return null;

  return {
    strategyVersion: stopped.strategyVersion,
    signalId: `${REBUY_SIGNAL_PREFIX}${stopped.planId}`,
    instrument: stopped.instrument,
    market: stopped.market,
    timeframe: stopped.timeframe,
    generatedAt: opts.generatedAt,
    expiresAt: sessionsDeadline(opts.generatedAt, stopped.market, REBUY_SESSIONS),
    direction,
    // One re-buy per stop-out, as the reversal's key.
    signalFingerprint: `rebuy:${stopped.planId}:${opts.generatedAt}`,
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger: rebuy.entry,
      entryLimitTolerance: stopped.coordinates.entryLimitTolerance,
      invalidation: rebuy.stop,
      stopType: stopped.coordinates.stopType,
      takeProfit1,
      takeProfit2,
      masterProfit: takeProfit2,
      runnerRule: { enabled: false, description: "Trail without lowering the Master Profit floor." },
      entryKind: "oldLevel",
    },
    risk: {
      approvedQuantity: 0,
      fractionalCapability: false,
      plannedDollarRisk: 0,
      allocationPct: 0,
      totalOpenRiskSnapshot: 0,
    },
    evidence: {
      regime: { regime: "trend", direction, reasons: [], disqualifiers: [] },
      alignment: WATCHLIST_TIER_SCORE,
      dataTimestamps: {
        stoppedPlanId: stopped.planId,
        stoppedAt: opts.generatedAt,
        rebuyExtreme: String(rebuy.extreme),
      },
      eventLiquidityStatus: "unknown",
    },
  };
}
