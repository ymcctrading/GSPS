/**
 * Trend Pullback — "Confirmed bullish pullback: v1 deterministic specification"
 * from the GSPS Signal and Regime Engine spec (Aug 28, 2026). Primary Novice
 * setup. The spec gives the bullish case in full; the bearish case mirrors it
 * (lower high / lower low structure, resistance-side locations, close below
 * the prior candle low) and is implemented symmetrically here.
 *
 * This is the one scanner state the spec fully deterministically specifies
 * for v1 — see `docs/SIGNAL_REGIME_ENGINE.md` for what the other three
 * states (Trend Breakout, Confirmed Reversal, Range Reversion) still need
 * before they can be implemented to the same standard.
 */

import type { Bar, Direction } from "@/lib/types";
import { atr, clusterLevels, findPivots } from "@/lib/analysis/pivots";
import { relativeVolume } from "../indicators";
import { computeRetracementLevels } from "@/lib/gann/retracement";
import { classifyRegime, type RegimeInputs } from "../regime";
import { computeRulesAlignmentScore } from "../scoring";
import { allSafetyGatesPass, evaluateDisqualifiers } from "../disqualifiers";
import {
  SCANNER_STATE_META,
  type RulesAlignmentBreakdownItem,
  type SignalGates,
  type SignalPlan,
  type SignalVerdict,
} from "../types";

export interface TrendPullbackInputs {
  direction: Exclude<Direction, "none">;
  /** Higher-timeframe bars used to read the trend (e.g. daily), ascending, closed only. */
  htfBars: Bar[];
  /** Operating-timeframe bars used for the pullback/confirmation, ascending, closed only. */
  executionBars: Bar[];
  gates: SignalGates;
  /** Optional evidence only — never a sole signal. */
  /** Configured number of completed operating-timeframe bars before the signal expires unfilled. */
  expiryBars?: number;
  regimeOverrides?: Partial<RegimeInputs>;
  approvedZoneToleranceAtr?: number;
  countertrendExpansionAtrMultiple?: number;
  /**
   * Pass `true` when one or more fields on `gates` that require a specific
   * account (position sizing, correlation/concentration, cooldown, total
   * open risk) are optimistic placeholders rather than a real account read
   * — e.g. a symbol scan with no account in scope. Propagated onto the
   * returned verdict so callers never mistake a market-context reading for
   * an account-authorized one. Defaults to `false` (a full, account-aware
   * evaluation).
   */
  accountContextAssumed?: boolean;
}

const DEFAULT_EXPIRY_BARS = 5;
const DEFAULT_ZONE_TOLERANCE_ATR = 0.25;
const DEFAULT_COUNTERTREND_ATR_MULTIPLE = 1.5;

export function evaluateTrendPullback(inputs: TrendPullbackInputs): SignalVerdict {
  const state = "trendPullback" as const;
  const {
    direction,
    htfBars,
    executionBars,
    gates,
    expiryBars = DEFAULT_EXPIRY_BARS,
    regimeOverrides,
    approvedZoneToleranceAtr = DEFAULT_ZONE_TOLERANCE_ATR,
    countertrendExpansionAtrMultiple = DEFAULT_COUNTERTREND_ATR_MULTIPLE,
    accountContextAssumed = false,
  } = inputs;

  const disqualifiers = evaluateDisqualifiers(gates);
  if (disqualifiers.length > 0) {
    return { status: "disqualified", state, disqualifiers };
  }

  const regime = classifyRegime({ bars: htfBars, ...regimeOverrides });
  const higherTimeframeBullish =
    regime.regime === "trend" && regime.direction === direction && regime.disqualifiers.length === 0;

  const structuralHigherLow = lastStructuralPivot(htfBars, direction === "bullish" ? "low" : "high");
  const priceAboveHigherLow =
    structuralHigherLow !== null &&
    (direction === "bullish"
      ? htfBars[htfBars.length - 1].c > structuralHigherLow
      : htfBars[htfBars.length - 1].c < structuralHigherLow);

  // Direction comes from the regime read, which is Gann's confirmed swing
  // trend (`lib/gann/trendStrength.ts`). A fast/slow SMA alignment test used
  // to be required alongside it; that was removed 2026-09-26 (alignment audit
  // F2.5) as a second, non-Gann opinion on the same question.
  const higherTimeframeDirectionPassed = higherTimeframeBullish && priceAboveHigherLow;

  const lastBar = executionBars[executionBars.length - 1];
  const atrValue = atr(executionBars, 14);

  const supportPivots = findPivots(executionBars, 3)
    .filter((p) => p.kind === (direction === "bullish" ? "low" : "high"))
    .map((p) => p.price);
  const definedZones = clusterLevels(supportPivots, 1.0);

  // Where a pullback may be bought (or a rally sold). These were the 20/50
  // SMAs and an anchored VWAP until 2026-09-26 (alignment audit F2.5). They
  // are now Gann's own retracement levels of the latest execution swing, the
  // ones his importance ranking puts first: 1/2, the full retracement, 1/4
  // and 3/4 (`RetracementLevel.importance` <= 3,
  // docs/GANN_HISTORICAL_SOURCES.md). The support/resistance zones are kept
  // as before.
  const gannRetracements = computeRetracementLevels(executionBars, lastBar.c)
    .filter((l) => l.importance !== null && l.importance <= 3)
    .map((l) => l.price);
  const approvedLocations = [...gannRetracements, ...definedZones].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );

  const withinTolerance = (target: number) =>
    atrValue > 0 && Math.abs(lastBar.c - target) <= atrValue * approvedZoneToleranceAtr;
  const matchedLocation = approvedLocations.find(withinTolerance) ?? null;
  const pullbackAtApprovedLocation = matchedLocation !== null;

  const pullbackWindow = executionBars.slice(-10);
  const structuralClose =
    structuralHigherLow === null
      ? true
      : direction === "bullish"
        ? !pullbackWindow.some((b) => b.c < structuralHigherLow)
        : !pullbackWindow.some((b) => b.c > structuralHigherLow);
  const countertrendExpansion =
    atrValue > 0 &&
    pullbackWindow.some((b) => {
      const adverse = direction === "bullish" ? b.o - b.c : b.c - b.o;
      return adverse > atrValue * countertrendExpansionAtrMultiple;
    });
  const pullbackOrderly = structuralClose && !countertrendExpansion;

  const priorBar = executionBars[executionBars.length - 2];
  const swingHighInWindow = Math.max(...pullbackWindow.slice(0, -1).map((b) => b.h));
  const swingLowInWindow = Math.min(...pullbackWindow.slice(0, -1).map((b) => b.l));
  const closeAbovePriorExtreme = direction === "bullish" ? lastBar.c > priorBar.h : lastBar.c < priorBar.l;
  const reclaimApprovedLevel =
    matchedLocation !== null &&
    (direction === "bullish" ? lastBar.c > matchedLocation : lastBar.c < matchedLocation);
  const breakMicroTrendline =
    direction === "bullish" ? lastBar.c > swingHighInWindow : lastBar.c < swingLowInWindow;
  const confirmationClose = closeAbovePriorExtreme || reclaimApprovedLevel || breakMicroTrendline;

  const rvol = relativeVolume(executionBars, 20);
  const volumeDataAvailable = rvol !== null;
  const volumeResumptionEvidence = volumeDataAvailable && (rvol as number) >= 1.2;

  const safetyGatesOk = allSafetyGatesPass(gates);
  const targetStopFeasible = gates.targetRoomAvailable && gates.stopWithinNovicePolicy;

  const breakdown: RulesAlignmentBreakdownItem[] = [
    {
      key: "higherTimeframeDirection",
      label: "Higher-timeframe direction",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: higherTimeframeDirectionPassed,
      note: higherTimeframeDirectionPassed
        ? `Higher-timeframe trend reads ${direction}: swing trend confirmed and price holding the structural ${direction === "bullish" ? "higher low" : "lower high"}.`
        : "Higher-timeframe trend does not confirm the setup direction.",
    },
    {
      key: "approvedPullbackLocation",
      label: "Approved pullback location",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: pullbackAtApprovedLocation,
      note: pullbackAtApprovedLocation
        ? `Price at ${lastBar.c.toFixed(2)} touches/reclaims an approved zone near ${matchedLocation!.toFixed(2)}.`
        : "Price has not reached an approved pullback location (a key retracement level of the last swing, or a support/resistance zone).",
    },
    {
      key: "structuralIntegrity",
      label: "Structural integrity",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: pullbackOrderly,
      note: pullbackOrderly
        ? "Pullback stayed orderly — no decisive close through the structural level, no abnormal countertrend expansion."
        : "Pullback broke structural integrity (closed through the structural level, or abnormal countertrend expansion).",
    },
    {
      key: "confirmationClose",
      label: "Confirmation close",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: confirmationClose,
      note: confirmationClose
        ? "Confirmed on a closed bar (prior-extreme break, approved-level reclaim, or micro trendline break)."
        : "No confirmation close yet — nothing is scored as confirmed intrabar.",
    },
    {
      key: "liquiditySpread",
      label: "Liquidity/spread pass",
      points: 10,
      maxPoints: 10,
      applicable: true,
      passed: gates.liquiditySpreadPass,
      note: gates.liquiditySpreadPass ? "Execution cost acceptable." : "Blocked — execution cost is excessive.",
    },
    {
      key: "benchmarkSector",
      label: "Benchmark/sector alignment",
      points: 10,
      maxPoints: 10,
      applicable: true,
      passed: gates.benchmarkSectorAlignment,
      note: gates.benchmarkSectorAlignment
        ? "Correlation/market context aligned."
        : "Benchmark/sector context does not align.",
    },
    {
      key: "volumeResumption",
      label: "Volume/resumption evidence",
      points: 10,
      maxPoints: 10,
      applicable: volumeDataAvailable,
      passed: volumeResumptionEvidence,
      note: volumeDataAvailable
        ? volumeResumptionEvidence
          ? `Relative volume ${rvol!.toFixed(2)}x supports resumption.`
          : `Relative volume ${rvol!.toFixed(2)}x does not support resumption.`
        : "No reliable volume data — excluded from scoring.",
    },
    {
      key: "noBinaryEventConflict",
      label: "No binary event conflict",
      points: 5,
      maxPoints: 5,
      applicable: true,
      passed: gates.binaryEventInHoldPeriod === false,
      note:
        gates.binaryEventInHoldPeriod === false
          ? "No binary event inside the hold period."
          : "Binary event unknown or present inside the hold period.",
    },
    {
      key: "targetStopFeasibility",
      label: "Target and stop feasibility",
      points: 5,
      maxPoints: 5,
      applicable: true,
      passed: targetStopFeasible,
      note: targetStopFeasible
        ? "Target and stop satisfy tier-specific rules."
        : "Target or stop fails tier-specific feasibility rules.",
    },
  ];

  const alignment = computeRulesAlignmentScore(breakdown);
  const tradeable =
    alignment.tier !== "watchlistOnly" &&
    safetyGatesOk &&
    higherTimeframeDirectionPassed &&
    confirmationClose;

  const plan: SignalPlan | null = tradeable
    ? buildPlan(direction, executionBars, structuralHigherLow, definedZones)
    : null;

  return {
    status: "evaluated",
    state,
    regime,
    alignment,
    tradeable,
    plan,
    expiresAfterBars: expiryBars,
    accountContextAssumed,
  };
}

function lastStructuralPivot(bars: Bar[], kind: "high" | "low"): number | null {
  const pivots = findPivots(bars, 3).filter((p) => p.kind === kind);
  return pivots.length ? pivots[pivots.length - 1].price : null;
}

const PENNY = 0.01;

/**
 * Entry: break of the confirmation trigger by one penny (the same trigger
 * convention `lib/strat/patterns.ts` uses). Stop: one penny beyond the
 * structural higher low/high. Target: the nearest structural zone beyond
 * entry in the trade's favor, or a plain 2R projection when none is in
 * range — the spec's "target and stop feasibility" only requires the target
 * satisfy tier-specific rules, not that this module re-price a full trade
 * plan the way `lib/strat/levels.ts` does for the existing engine.
 */
function buildPlan(
  direction: Exclude<Direction, "none">,
  executionBars: Bar[],
  structuralLevel: number | null,
  definedZones: number[],
): SignalPlan | null {
  const lastBar = executionBars[executionBars.length - 1];
  if (structuralLevel === null) return null;

  const entryTrigger = direction === "bullish" ? lastBar.h + PENNY : lastBar.l - PENNY;
  const stop = direction === "bullish" ? structuralLevel - PENNY : structuralLevel + PENNY;
  const risk = Math.abs(entryTrigger - stop);
  if (risk <= 0) return null;

  const beyondEntry = definedZones.filter((z) =>
    direction === "bullish" ? z > entryTrigger : z < entryTrigger,
  );
  const structuralTarget = beyondEntry.length
    ? direction === "bullish"
      ? Math.min(...beyondEntry)
      : Math.max(...beyondEntry)
    : null;
  const projectedTarget = direction === "bullish" ? entryTrigger + risk * 2 : entryTrigger - risk * 2;
  const target = structuralTarget ?? projectedTarget;

  return {
    direction,
    entryTrigger,
    entryDescription: `Break of confirmation trigger by ${PENNY.toFixed(2)}.`,
    stop,
    target,
    targetDescription: structuralTarget
      ? `Nearest structural zone at ${structuralTarget.toFixed(2)}.`
      : `Projected 2R target (no structural zone in range).`,
  };
}

export const TREND_PULLBACK_META = SCANNER_STATE_META.trendPullback;
