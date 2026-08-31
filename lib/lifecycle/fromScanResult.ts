/**
 * Builds a `NewTradePlan` from a scan result, for the one place in the scan
 * pipeline that already decides "this is worth alerting a person about":
 * `lib/entitlements/scan-fanout.ts`'s WATCH -> EXECUTE confirmation
 * (`notifyWorthy` in `evaluateMonitorsAndNotify`). A trade plan created here
 * starts at WATCHLIST and is immediately advanced to QUALIFIED (the Rules
 * Alignment gates that produced this alert already passed) and then
 * AWAITING_ENTRY_CONFIRMATION — the setup's entry trigger is priced, but per
 * the mandatory entry-confirmation rule (`lib/lifecycle/entryConfirmation.ts`)
 * it cannot become ARMED until a full break/retest/confirmation-move
 * sequence is observed on later bars. See `lib/lifecycle/transitions.ts`.
 *
 * Sizing (`risk.approvedQuantity`, `risk.plannedDollarRisk`, etc.) is left at
 * zero here: this fan-out has no account/position-sizing context, only a
 * ranked setup. It's filled in by whatever sizes the ticket at entry time
 * (a future `edit` event before the `enter` event) — a plan with zero risk
 * fields is still a complete, auditable record of "this was alert-worthy",
 * just not yet an approved position.
 */

import { TF_INTERVAL_MS } from "@/lib/timeframe";
import type { RulesAlignmentScore, SignalVerdict } from "@/lib/signals/types";
import type { ScanResult } from "@/lib/types";
import type { NewTradePlan } from "./store";
import { freshEntryConfirmation } from "./entryConfirmation";

/** The execution timeframe every scan (`lib/scanTicker.ts`'s `EXECUTION_TIMEFRAME`) prices its plan against. */
const PLAN_TIMEFRAME = "15Min" as const;

/** Used when no `SignalVerdict` on the result carries its own `expiresAfterBars`. */
const DEFAULT_EXPIRES_AFTER_BARS = 20;

const WATCHLIST_TIER_SCORE: RulesAlignmentScore = {
  score: 0,
  tier: "watchlistOnly",
  breakdown: [],
};

/**
 * Null when the scan result has no complete, priced plan to build from
 * (`levels` missing/incomplete) — "a signal without complete lifecycle
 * fields is not tradeable," so no plan is created rather than one with
 * placeholder prices.
 */
export function buildNewTradePlanFromScanResult(
  result: ScanResult,
  opts: {
    strategyVersion: string;
    signalId: string;
    generatedAt: string;
    /**
     * Idempotency key for `createOrGetIdempotentTradePlan` — defaults to
     * `signalId` (already one-shot per monitor transition) when omitted, so
     * a retried job that re-derives the same transition can't duplicate the
     * plan it already created.
     */
    signalFingerprint?: string;
  },
): NewTradePlan | null {
  const l = result.levels;
  if (
    !l ||
    result.direction === "none" ||
    !Number.isFinite(l.entry) ||
    !Number.isFinite(l.stopLoss) ||
    !Number.isFinite(l.takeProfit1) ||
    !Number.isFinite(l.takeProfit2)
  ) {
    return null;
  }

  const verdict = firstEvaluatedVerdict(result);
  const alignment = verdict?.status === "evaluated" ? verdict.alignment : WATCHLIST_TIER_SCORE;
  const regime = result.signals?.regime ?? {
    regime: "trend",
    direction: result.direction,
    reasons: [],
    disqualifiers: [],
  };
  const expiresAfterBars =
    verdict?.status === "evaluated" ? verdict.expiresAfterBars : DEFAULT_EXPIRES_AFTER_BARS;

  return {
    strategyVersion: opts.strategyVersion,
    signalId: opts.signalId,
    instrument: result.symbol,
    market: result.assetClass,
    timeframe: PLAN_TIMEFRAME,
    generatedAt: opts.generatedAt,
    expiresAt: new Date(
      new Date(opts.generatedAt).getTime() + expiresAfterBars * TF_INTERVAL_MS[PLAN_TIMEFRAME],
    ).toISOString(),
    direction: result.direction,
    signalFingerprint: opts.signalFingerprint ?? opts.signalId,
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger: l.entry,
      // One tick over the structural stop's own tolerance isn't known here;
      // the trigger price itself is the only tolerance this pipeline has
      // priced, so entries are held to it exactly until a ticket-time
      // override widens it.
      entryLimitTolerance: 0,
      invalidation: l.stopLoss,
      stopType: "stop_market",
      takeProfit1: l.takeProfit1,
      takeProfit2: l.takeProfit2,
      masterProfit: l.masterProfit ?? null,
      runnerRule: {
        enabled: l.masterProfit != null,
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
      regime,
      alignment,
      dataTimestamps: { scannedAt: result.scannedAt },
      eventLiquidityStatus: result.liquidity ? "clear" : "unknown",
    },
  };
}

function firstEvaluatedVerdict(result: ScanResult): SignalVerdict | null {
  const s = result.signals;
  if (!s) return null;
  const candidates = [s.trendPullback, s.trendBreakout, s.confirmedReversal, s.rangeReversion];
  return candidates.find((v): v is SignalVerdict => v != null && v.status === "evaluated") ?? null;
}
