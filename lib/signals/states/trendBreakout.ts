/**
 * Trend Breakout — "Enter accepted expansion from a validated base/
 * compression" (secondary; only after validation, per the regime table in
 * the GSPS Signal and Regime Engine spec, Aug 28 2026).
 *
 * Unlike Trend Pullback, the spec does not give this state a deterministic
 * v1 specification — only its purpose and Novice-availability row. This is
 * therefore an ENGINEERING-AUTHORED v1 spec, not a spec-pack-sourced one: it
 * applies standard, publicly known breakout methodology (volatility
 * contraction, a validated horizontal base, a decisive close beyond it on
 * expanded volume, a measured-move target) in the same style and rigor as
 * Trend Pullback's spec, but the exact thresholds below are this codebase's
 * own choice, not lifted from doctrine. Documented here rather than implied,
 * per `docs/SIGNAL_REGIME_ENGINE.md`'s own warning against fabricating
 * undocumented rules and presenting them as validated methodology.
 *
 * v1 picks the simpler of the two acceptance rules the docs left open
 * (close-through vs. retest-and-hold): a decisive close beyond the base on
 * its first attempt, confirmed by volume. A retest-and-hold variant is a
 * reasonable v2 addition, not implemented here.
 */

import type { Bar, Direction } from "@/lib/types";
import { atr, clusterLevels, findPivots } from "@/lib/analysis/pivots";
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

export interface TrendBreakoutInputs {
  direction: Exclude<Direction, "none">;
  /** Higher-timeframe bars (e.g. daily) — used only to check the breakout isn't fighting an established opposite trend. */
  htfBars: Bar[];
  /** Operating-timeframe bars used to find the base and the breakout bar, ascending, closed only. */
  executionBars: Bar[];
  gates: SignalGates;
  /** Bars making up the base/compression window, immediately before the latest (breakout) bar. */
  baseWindowBars?: number;
  /** Configured number of completed operating-timeframe bars before the signal expires unfilled. Shorter than Trend Pullback's default — a breakout not taken quickly is usually a breakout missed. */
  expiryBars?: number;
  regimeOverrides?: Partial<RegimeInputs>;
  accountContextAssumed?: boolean;
}

const DEFAULT_BASE_WINDOW_BARS = 15;
const DEFAULT_EXPIRY_BARS = 3;
/** Recent ATR must contract to at most this fraction of the pre-base baseline ATR to count as compression. */
const CONTRACTION_ATR_RATIO = 0.75;
/** The base's own range, in multiples of its ATR, above which it's too wide to call a "tight" base. */
const MAX_BASE_RANGE_ATR_MULTIPLE = 4;
/** How far beyond the base boundary a close must land, in ATR multiples, to count as decisive rather than noise. */
const BREAKOUT_MARGIN_ATR = 0.15;
/** Breakout-bar volume vs. the base's own trailing average, required to call the expansion "accepted". */
const BREAKOUT_VOLUME_MULTIPLE = 1.5;
/** Boundary touches required within the base window before it counts as "validated" rather than a single spike. */
const MIN_BOUNDARY_TOUCHES = 2;

const PENNY = 0.01;

export function evaluateTrendBreakout(inputs: TrendBreakoutInputs): SignalVerdict {
  const state = "trendBreakout" as const;
  const {
    direction,
    htfBars,
    executionBars,
    gates,
    baseWindowBars = DEFAULT_BASE_WINDOW_BARS,
    expiryBars = DEFAULT_EXPIRY_BARS,
    regimeOverrides,
    accountContextAssumed = false,
  } = inputs;

  const disqualifiers = evaluateDisqualifiers(gates);
  if (disqualifiers.length > 0) {
    return { status: "disqualified", state, disqualifiers };
  }

  const regime = classifyRegime({ bars: htfBars, ...regimeOverrides });

  if (executionBars.length < baseWindowBars + 2) {
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

  const breakoutBar = executionBars[executionBars.length - 1];
  const priorBar = executionBars[executionBars.length - 2];
  const baseWindow = executionBars.slice(-(baseWindowBars + 1), -1);
  const baseHigh = Math.max(...baseWindow.map((b) => b.h));
  const baseLow = Math.min(...baseWindow.map((b) => b.l));
  const baseRange = baseHigh - baseLow;

  const recentAtr = atr(baseWindow, Math.min(14, baseWindow.length));
  const priorHistory = executionBars.slice(0, -(baseWindowBars + 1));
  const baselineAtr = atr(priorHistory.slice(-baseWindowBars * 3), Math.min(14, priorHistory.length));

  const volatilityContracted = baselineAtr > 0 && recentAtr <= baselineAtr * CONTRACTION_ATR_RATIO;
  const baseIsTight = recentAtr > 0 && baseRange <= recentAtr * MAX_BASE_RANGE_ATR_MULTIPLE;

  const boundaryTolerance = recentAtr * 0.2;
  const boundaryTouches =
    direction === "bullish"
      ? baseWindow.filter((b) => baseHigh - b.h <= boundaryTolerance).length
      : baseWindow.filter((b) => b.l - baseLow <= boundaryTolerance).length;
  const boundaryValidated = boundaryTouches >= MIN_BOUNDARY_TOUCHES;

  const validatedBase = volatilityContracted && baseIsTight && boundaryValidated;

  const opposite = direction === "bullish" ? "bearish" : "bullish";
  const higherTimeframeNotOpposed = !(
    regime.regime === "trend" &&
    regime.direction === opposite &&
    regime.disqualifiers.length === 0
  );

  const margin = recentAtr * BREAKOUT_MARGIN_ATR;
  const decisiveClose =
    recentAtr > 0 &&
    (direction === "bullish" ? breakoutBar.c > baseHigh + margin : breakoutBar.c < baseLow - margin);

  // The base window already excludes the breakout bar itself, so any bar
  // inside it clearing the boundary means this isn't the base's first break.
  const noPriorBreak = !baseWindow.some((b) =>
    direction === "bullish" ? b.c > baseHigh + margin : b.c < baseLow - margin,
  );
  // Guards against a base window that starts mid-breakout (the bar right
  // before the evaluated one was already outside the range).
  const priorBarWasInsideBase =
    direction === "bullish" ? priorBar.c <= baseHigh + margin : priorBar.c >= baseLow - margin;

  const confirmationClose = decisiveClose && noPriorBreak && priorBarWasInsideBase;

  const rvol = relativeVolume(executionBars, baseWindowBars);
  const volumeDataAvailable = rvol !== null;
  // Volume/expansion confirmation is not "optional evidence" for a breakout
  // the way it is for a pullback — it's the difference between an "accepted"
  // expansion (the state's own purpose) and a false break, so no data means
  // no confirmation rather than an excluded, un-penalized component.
  const volumeExpansionConfirmed = volumeDataAvailable && (rvol as number) >= BREAKOUT_VOLUME_MULTIPLE;

  const safetyGatesOk = allSafetyGatesPass(gates);
  const targetStopFeasible = gates.targetRoomAvailable && gates.stopWithinNovicePolicy;

  const breakdown: RulesAlignmentBreakdownItem[] = [
    {
      key: "priorTrendContext",
      label: "Not fighting an established opposite trend",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: higherTimeframeNotOpposed,
      note: higherTimeframeNotOpposed
        ? "Higher-timeframe context does not oppose this breakout direction."
        : `Higher-timeframe trend reads an established ${opposite} move — this breakout would fight it.`,
    },
    {
      key: "validatedBase",
      label: "Validated base/compression",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: validatedBase,
      note: validatedBase
        ? `Base held ${baseWindowBars} bars, range $${baseRange.toFixed(2)}, ${boundaryTouches} boundary touches, volatility contracted.`
        : "Base is not validated — too wide, too few boundary touches, or volatility hasn't contracted.",
    },
    {
      key: "structuralIntegrity",
      label: "Base held until this breakout",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: noPriorBreak && priorBarWasInsideBase,
      note:
        noPriorBreak && priorBarWasInsideBase
          ? "No earlier bar in the base window already broke out — this is the first attempt."
          : "The base was already broken earlier in the window — this isn't a fresh breakout.",
    },
    {
      key: "confirmationClose",
      label: "Confirmation close",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: confirmationClose,
      note: confirmationClose
        ? `Decisive close beyond the base ${direction === "bullish" ? "high" : "low"}, on the first attempt.`
        : "No decisive close beyond the base boundary yet.",
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
      key: "volumeExpansion",
      label: "Volume/expansion confirmation",
      points: 10,
      maxPoints: 10,
      applicable: true,
      passed: volumeExpansionConfirmed,
      note: volumeDataAvailable
        ? volumeExpansionConfirmed
          ? `Relative volume ${rvol!.toFixed(2)}x confirms an accepted expansion.`
          : `Relative volume ${rvol!.toFixed(2)}x is below the ${BREAKOUT_VOLUME_MULTIPLE}x floor — not yet accepted.`
        : "No reliable volume data — a breakout without volume confirmation is not scored as accepted.",
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
  // Volume/expansion confirmation is checked explicitly, not just scored —
  // see this file's header: an "accepted" expansion without volume behind
  // it is this state's own definition of a false break, not a partial pass.
  const tradeable =
    alignment.tier !== "watchlistOnly" &&
    safetyGatesOk &&
    validatedBase &&
    confirmationClose &&
    volumeExpansionConfirmed;

  const plan: SignalPlan | null = tradeable
    ? buildPlan(direction, executionBars, baseHigh, baseLow, baseRange)
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
 * Entry: break of the breakout bar's own extreme by a penny — the same
 * trigger convention `lib/strat/patterns.ts` and Trend Pullback use. Stop:
 * a penny back inside the just-broken boundary — a close back through it
 * is the standard definition of a failed breakout. Target: the nearest
 * structural zone beyond entry, or the classic measured-move projection
 * (entry +/- the base's own range) when none is in range.
 */
function buildPlan(
  direction: Exclude<Direction, "none">,
  executionBars: Bar[],
  baseHigh: number,
  baseLow: number,
  baseRange: number,
): SignalPlan | null {
  const lastBar = executionBars[executionBars.length - 1];

  const entryTrigger = direction === "bullish" ? lastBar.h + PENNY : lastBar.l - PENNY;
  const stop = direction === "bullish" ? baseHigh - PENNY : baseLow + PENNY;
  const risk = Math.abs(entryTrigger - stop);
  if (risk <= 0) return null;

  const pivots = findPivots(executionBars, 3)
    .filter((p) => p.kind === (direction === "bullish" ? "high" : "low"))
    .map((p) => p.price);
  const zones = clusterLevels(pivots, 1.0);
  const beyondEntry = zones.filter((z) => (direction === "bullish" ? z > entryTrigger : z < entryTrigger));
  const structuralTarget = beyondEntry.length
    ? direction === "bullish"
      ? Math.min(...beyondEntry)
      : Math.max(...beyondEntry)
    : null;
  const measuredMoveTarget = direction === "bullish" ? entryTrigger + baseRange : entryTrigger - baseRange;
  const target = structuralTarget ?? measuredMoveTarget;

  return {
    direction,
    entryTrigger,
    entryDescription: `Break of the breakout bar's own extreme by ${PENNY.toFixed(2)}.`,
    stop,
    target,
    targetDescription: structuralTarget
      ? `Nearest structural zone at ${structuralTarget.toFixed(2)}.`
      : `Measured-move projection (base range $${baseRange.toFixed(2)}) — no structural zone in range.`,
  };
}

export const TREND_BREAKOUT_META = SCANNER_STATE_META.trendBreakout;
