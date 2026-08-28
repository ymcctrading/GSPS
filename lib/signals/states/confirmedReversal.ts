/**
 * Confirmed Reversal — "Enter only after exhaustion at a meaningful location
 * becomes a structural shift" (high threshold / limited Novice use, per the
 * regime table in the GSPS Signal and Regime Engine spec, Aug 28 2026).
 *
 * Like Trend Breakout, the spec gives this state only its regime-table row
 * (purpose, required characteristics: "exhaustion at a meaningful level plus
 * structural break/reclaim"; disqualifier: "divergence or indicator flip
 * without price confirmation") — not a deterministic entry/stop/target spec.
 * This is therefore an ENGINEERING-AUTHORED v1 spec, not spec-pack-sourced,
 * built from a standard, publicly known price-action technique: a failure-
 * swing reversal (price makes a fresh extreme, then breaks back through the
 * most recent opposing swing point and holds beyond it for a second closed
 * bar) — the same "structural break/reclaim" language the regime table
 * itself uses. The exact thresholds below are this codebase's own choice,
 * not doctrine-derived, documented here rather than implied.
 *
 * The spec's own disqualifier — "divergence or indicator flip without price
 * confirmation" — is honored structurally: nothing here scores or trades
 * off an oscillator reading alone. Every criterion is a price/volume fact
 * (a fresh extreme, a broken level, a held close, expanded volume), and the
 * two-bar hold requirement exists specifically so a break that immediately
 * fails back through the level — an "indicator flip" in price-only terms —
 * can't be scored as confirmed.
 */

import type { Bar, Direction } from "@/lib/types";
import { atr, clusterLevels, findPivots, sma } from "@/lib/analysis/pivots";
import { relativeVolume } from "../indicators";
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

export interface ConfirmedReversalInputs {
  /** The direction of the reversal being evaluated (bullish = reversing off a low). */
  direction: Exclude<Direction, "none">;
  /** Higher-timeframe bars (e.g. daily) — used for the structural-level side of "meaningful location". */
  htfBars: Bar[];
  /** Operating-timeframe bars used to find the exhaustion extreme, the break, and the confirmation hold. */
  executionBars: Bar[];
  gates: SignalGates;
  /** Bars searched for the exhaustion extreme and its preceding opposing swing point. */
  exhaustionWindowBars?: number;
  /** Configured number of completed operating-timeframe bars before the signal expires unfilled. */
  expiryBars?: number;
  regimeOverrides?: Partial<RegimeInputs>;
  accountContextAssumed?: boolean;
}

const DEFAULT_EXHAUSTION_WINDOW_BARS = 20;
const DEFAULT_EXPIRY_BARS = 4;
/** How far beyond the broken swing point a close must land, in ATR multiples, to count as decisive. */
const BREAK_MARGIN_ATR = 0.15;
/** Minimum extension of the exhaustion extreme beyond its own SMA, in ATR multiples — the "meaningful" bar. */
const MIN_EXTENSION_ATR = 2.0;
/** Reversal-thrust volume vs. the exhaustion window's own average, required to call it confirmed. */
const REVERSAL_VOLUME_MULTIPLE = 1.3;

const PENNY = 0.01;

export function evaluateConfirmedReversal(inputs: ConfirmedReversalInputs): SignalVerdict {
  const state = "confirmedReversal" as const;
  const {
    direction,
    htfBars,
    executionBars,
    gates,
    exhaustionWindowBars = DEFAULT_EXHAUSTION_WINDOW_BARS,
    expiryBars = DEFAULT_EXPIRY_BARS,
    regimeOverrides,
    accountContextAssumed = false,
  } = inputs;

  const disqualifiers = evaluateDisqualifiers(gates);
  if (disqualifiers.length > 0) {
    return { status: "disqualified", state, disqualifiers };
  }

  const regime = classifyRegime({ bars: htfBars, ...regimeOverrides });

  // Needs: the exhaustion window itself, one bar for the break, one more to
  // confirm the hold — the break and confirm bars are excluded from the
  // window below.
  if (executionBars.length < exhaustionWindowBars + 2) {
    return {
      status: "evaluated",
      state,
      regime,
      alignment: computeRulesAlignmentScore([]),
      tradeable: false,
      plan: null,
      expiresAfterBars: expiryBars,
      accountContextAssumed,
    };
  }

  // The window ends two bars back: [..., extreme window ..., breakBar, confirmBar].
  const confirmBar = executionBars[executionBars.length - 1];
  const breakBar = executionBars[executionBars.length - 2];
  const window = executionBars.slice(-(exhaustionWindowBars + 2), -2);

  const extremeBar =
    direction === "bullish"
      ? window.reduce((min, b) => (b.l < min.l ? b : min))
      : window.reduce((max, b) => (b.h > max.h ? b : max));
  const extremeIndex = window.indexOf(extremeBar);
  const extremePrice = direction === "bullish" ? extremeBar.l : extremeBar.h;

  // The opposing swing point before the extreme — what a reversal has to
  // break and reclaim. Falls back to the window's own opposite extreme when
  // no formal pivot exists yet (a short or still-forming window).
  const priorPivots = findPivots(window.slice(0, Math.max(extremeIndex, 1)), 2).filter(
    (p) => p.kind === (direction === "bullish" ? "high" : "low"),
  );
  const swingPoint = priorPivots.length
    ? priorPivots[priorPivots.length - 1].price
    : direction === "bullish"
      ? Math.max(...window.slice(0, Math.max(extremeIndex, 1)).map((b) => b.h))
      : Math.min(...window.slice(0, Math.max(extremeIndex, 1)).map((b) => b.l));

  const atrValue = atr(window, Math.min(14, window.length));
  const maValue = sma(window.map((b) => b.c), Math.min(20, window.length));
  const extensionAtr = atrValue > 0 ? Math.abs(extremePrice - maValue) / atrValue : 0;

  const nearestClusterDistanceAtr = (() => {
    const pivots = findPivots(htfBars, 3).map((p) => p.price);
    const clusters = clusterLevels(pivots, 1.0);
    if (clusters.length === 0 || atrValue === 0) return Infinity;
    return Math.min(...clusters.map((c) => Math.abs(c - extremePrice))) / atrValue;
  })();

  // "Meaningful location" per the regime table: either a genuine overextension
  // (a stretched move, the classic exhaustion read) or a clustered structural
  // level — either is a location worth reversing from, not just any swing point.
  const meaningfulLocation = extensionAtr >= MIN_EXTENSION_ATR || nearestClusterDistanceAtr <= 0.5;

  const margin = atrValue * BREAK_MARGIN_ATR;
  const structuralBreak =
    atrValue > 0 &&
    (direction === "bullish" ? breakBar.c > swingPoint + margin : breakBar.c < swingPoint - margin);

  // The hold: a second closed bar past the break bar that hasn't fallen back
  // through the broken level. This is what makes it "Confirmed" rather than
  // a single-bar break that could be the "indicator flip without price
  // confirmation" the spec disqualifies.
  const confirmationHold =
    direction === "bullish" ? confirmBar.c > swingPoint : confirmBar.c < swingPoint;

  // Structural integrity: the exhaustion extreme has to stay the extreme —
  // a fresh low/high made by the break or confirm bar means the "reversal"
  // never actually reversed anything.
  const structuralIntegrity =
    direction === "bullish"
      ? breakBar.l >= extremePrice && confirmBar.l >= extremePrice
      : breakBar.h <= extremePrice && confirmBar.h <= extremePrice;

  // Measured on the break bar itself (the reversal thrust), not the
  // confirmation bar that follows it — `relativeVolume` reads its last bar,
  // so the confirm bar is excluded here.
  const rvol = relativeVolume(executionBars.slice(0, -1), exhaustionWindowBars);
  const volumeDataAvailable = rvol !== null;
  // Required, not optional — a "confirmed" reversal without participation
  // behind the break/hold is this state's own definition of unconfirmed.
  const volumeConfirmed = volumeDataAvailable && (rvol as number) >= REVERSAL_VOLUME_MULTIPLE;

  const safetyGatesOk = allSafetyGatesPass(gates);
  const targetStopFeasible = gates.targetRoomAvailable && gates.stopWithinNovicePolicy;

  const breakdown: RulesAlignmentBreakdownItem[] = [
    {
      key: "exhaustionAtMeaningfulLevel",
      label: "Exhaustion at a meaningful location",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: meaningfulLocation,
      note: meaningfulLocation
        ? `Extreme sits ${extensionAtr.toFixed(1)}x ATR from its SMA or within a clustered structural level.`
        : "Extreme isn't stretched enough from its own moving average, and isn't at a clustered structural level.",
    },
    {
      key: "structuralBreak",
      label: "Structural break/reclaim",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: structuralBreak,
      note: structuralBreak
        ? `Decisive close through the opposing swing point at ${swingPoint.toFixed(2)}.`
        : `No decisive close through the opposing swing point at ${swingPoint.toFixed(2)} yet.`,
    },
    {
      key: "structuralIntegrity",
      label: "Exhaustion extreme holds",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: structuralIntegrity,
      note: structuralIntegrity
        ? "Neither the break nor the confirmation bar made a fresh extreme — the reversal point holds."
        : "A fresh extreme was made after the supposed reversal point — this hasn't reversed anything yet.",
    },
    {
      key: "confirmationHold",
      label: "Confirmation hold (second closed bar)",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: confirmationHold,
      note: confirmationHold
        ? "A second closed bar still holds beyond the broken level — not a one-bar flip."
        : "Price fell back through the broken level on the very next bar — not yet confirmed.",
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
      key: "volumeConfirmation",
      label: "Volume confirmation",
      points: 10,
      maxPoints: 10,
      applicable: true,
      passed: volumeConfirmed,
      note: volumeDataAvailable
        ? volumeConfirmed
          ? `Relative volume ${rvol!.toFixed(2)}x confirms real participation behind the reversal.`
          : `Relative volume ${rvol!.toFixed(2)}x is below the ${REVERSAL_VOLUME_MULTIPLE}x floor — not yet confirmed.`
        : "No reliable volume data — a reversal without volume confirmation is not scored as confirmed.",
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
  // High-threshold state: every core price/volume confirmation is required
  // outright, not just scored — a partial pass here is exactly the
  // "indicator flip without price confirmation" the spec disqualifies.
  const tradeable =
    alignment.tier !== "watchlistOnly" &&
    safetyGatesOk &&
    meaningfulLocation &&
    structuralBreak &&
    structuralIntegrity &&
    confirmationHold &&
    volumeConfirmed;

  const plan: SignalPlan | null = tradeable
    ? buildPlan(direction, executionBars, extremePrice, htfBars)
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

/**
 * Entry: break of the confirmation bar's own extreme by a penny — the same
 * trigger convention the other implemented states use. Stop: a penny beyond
 * the exhaustion extreme itself — a new extreme there is this state's own
 * definition of the reversal thesis failing (see `structuralIntegrity`
 * above). Target: the nearest opposing structural zone beyond entry, or a
 * plain 2R projection when none is in range — a reversal has no natural
 * "measured move" input the way a base/breakout does.
 */
function buildPlan(
  direction: Exclude<Direction, "none">,
  executionBars: Bar[],
  extremePrice: number,
  htfBars: Bar[],
): SignalPlan | null {
  const lastBar = executionBars[executionBars.length - 1];

  const entryTrigger = direction === "bullish" ? lastBar.h + PENNY : lastBar.l - PENNY;
  const stop = direction === "bullish" ? extremePrice - PENNY : extremePrice + PENNY;
  const risk = Math.abs(entryTrigger - stop);
  if (risk <= 0) return null;

  const pivots = findPivots(htfBars, 3)
    .filter((p) => p.kind === (direction === "bullish" ? "high" : "low"))
    .map((p) => p.price);
  const zones = clusterLevels(pivots, 1.0);
  const beyondEntry = zones.filter((z) => (direction === "bullish" ? z > entryTrigger : z < entryTrigger));
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
    entryDescription: `Break of the confirmation bar's own extreme by ${PENNY.toFixed(2)}.`,
    stop,
    target,
    targetDescription: structuralTarget
      ? `Nearest opposing structural zone at ${structuralTarget.toFixed(2)}.`
      : `Projected 2R target (no structural zone in range).`,
  };
}

export const CONFIRMED_REVERSAL_META = SCANNER_STATE_META.confirmedReversal;
