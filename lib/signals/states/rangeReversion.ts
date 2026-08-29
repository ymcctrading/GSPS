/**
 * Range Reversion — "Buy support / sell resistance in verified rotational
 * conditions" (secondary; no midpoint entries, per the regime table in the
 * GSPS Signal and Regime Engine spec, Aug 28 2026).
 *
 * Like Trend Breakout and Confirmed Reversal, the spec gives this state only
 * its regime-table row (required characteristics: "low/weak trend strength;
 * flat MAs; repeatable horizontal boundaries; rotational price action";
 * disqualifier: "accepted breakout with rising volatility/volume") — not a
 * deterministic entry/stop/target spec. This is an ENGINEERING-AUTHORED v1
 * spec, not spec-pack-sourced, built from the standard, publicly known
 * range-trading technique the purpose line itself names: buy at a verified
 * support boundary, sell at a verified resistance boundary, targeting the
 * opposite side. The exact thresholds below are this codebase's own choice,
 * not doctrine-derived, documented here rather than implied.
 *
 * "No midpoint entries" is enforced structurally: a criterion requires price
 * to sit in the outer band near the boundary being traded, not the range's
 * middle, and nothing here scores or trades a mid-range read.
 */

import type { Bar, Direction } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { adx, relativeVolume, slope, smaSeries } from "../indicators";
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

export interface RangeReversionInputs {
  /** "bullish" = buying support; "bearish" = selling resistance. */
  direction: Exclude<Direction, "none">;
  /** Higher-timeframe bars (e.g. daily) — used for the weak-trend-strength side of "verified rotational conditions". */
  htfBars: Bar[];
  /** Operating-timeframe bars used to find the range boundaries and the rejection bar. */
  executionBars: Bar[];
  gates: SignalGates;
  /** Bars searched for the range's own high/low boundaries. */
  rangeWindowBars?: number;
  /** Configured number of completed operating-timeframe bars before the signal expires unfilled. */
  expiryBars?: number;
  regimeOverrides?: Partial<RegimeInputs>;
  accountContextAssumed?: boolean;
}

const DEFAULT_RANGE_WINDOW_BARS = 20;
const DEFAULT_EXPIRY_BARS = 4;
const MAX_ADX_FOR_RANGE = 20;
// Looser than the regime classifier's own flat-MA epsilon (0.0005): a
// boundary test naturally pulls the short MA a little as price approaches
// it, and this check only has to rule out a MA that's clearly still
// trending, not demand a mathematically dead-flat line.
const MA_FLAT_SLOPE_EPSILON = 0.002;
/** How close to a boundary (in ATR multiples) a bar's extreme must land to count as a "touch". */
const TOUCH_TOLERANCE_ATR = 0.25;
const MIN_BOUNDARY_TOUCHES = 2;
/** How close to the traded boundary price must sit, in ATR multiples, to not be a midpoint entry. */
const ENTRY_ZONE_ATR = 0.5;
/** Recent-bar window checked for an already-accepted breakout that would invalidate the range read. */
const BREAKOUT_CHECK_BARS = 5;
const BREAKOUT_MARGIN_ATR = 0.15;
const BREAKOUT_VOLUME_MULTIPLE = 1.5;

const PENNY = 0.01;

export function evaluateRangeReversion(inputs: RangeReversionInputs): SignalVerdict {
  const state = "rangeReversion" as const;
  const {
    direction,
    htfBars,
    executionBars,
    gates,
    rangeWindowBars = DEFAULT_RANGE_WINDOW_BARS,
    expiryBars = DEFAULT_EXPIRY_BARS,
    regimeOverrides,
    accountContextAssumed = false,
  } = inputs;

  const disqualifiers = evaluateDisqualifiers(gates);
  if (disqualifiers.length > 0) {
    return { status: "disqualified", state, disqualifiers };
  }

  const regime = classifyRegime({ bars: htfBars, ...regimeOverrides });

  if (executionBars.length < rangeWindowBars + 1 + BREAKOUT_CHECK_BARS) {
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

  const lastBar = executionBars[executionBars.length - 1];
  // The window that defines the boundaries excludes the latest bar — a
  // boundary defined by the very bar being tested against it would make the
  // rejection check trivially true.
  const rangeWindow = executionBars.slice(-(rangeWindowBars + 1), -1);
  const rangeHigh = Math.max(...rangeWindow.map((b) => b.h));
  const rangeLow = Math.min(...rangeWindow.map((b) => b.l));
  const midpoint = (rangeHigh + rangeLow) / 2;
  const boundary = direction === "bullish" ? rangeLow : rangeHigh;

  const atrValue = atr(rangeWindow, Math.min(14, rangeWindow.length));

  // --- Verified range: weak trend strength, flat MAs, both boundaries touched repeatedly. ---
  const dmi = adx(htfBars, regimeOverrides?.adxPeriod ?? 14);
  const weakTrendStrength = dmi === null || dmi.adx < MAX_ADX_FOR_RANGE;
  const fastMa = smaSeries(htfBars, regimeOverrides?.fastMaPeriod ?? 20);
  const slowMa = smaSeries(htfBars, regimeOverrides?.slowMaPeriod ?? 50);
  const flatMas =
    Math.abs(slope(fastMa, 5)) < MA_FLAT_SLOPE_EPSILON && Math.abs(slope(slowMa, 5)) < MA_FLAT_SLOPE_EPSILON;

  const touchTolerance = atrValue * TOUCH_TOLERANCE_ATR;
  const highTouches = rangeWindow.filter((b) => rangeHigh - b.h <= touchTolerance).length;
  const lowTouches = rangeWindow.filter((b) => b.l - rangeLow <= touchTolerance).length;
  const bothBoundariesValidated = highTouches >= MIN_BOUNDARY_TOUCHES && lowTouches >= MIN_BOUNDARY_TOUCHES;

  const verifiedRange = weakTrendStrength && flatMas && bothBoundariesValidated;

  // --- No midpoint entries: price has to sit in the outer band near the traded boundary. ---
  const distanceFromBoundary = Math.abs(lastBar.c - boundary);
  const distanceFromMidpoint = Math.abs(lastBar.c - midpoint);
  const atBoundaryNotMidpoint =
    atrValue > 0 && distanceFromBoundary <= atrValue * ENTRY_ZONE_ATR && distanceFromBoundary < distanceFromMidpoint;

  // --- Structural integrity: no already-accepted breakout in the recent window (the spec's own disqualifier). ---
  const recentBars = executionBars.slice(-BREAKOUT_CHECK_BARS);
  const margin = atrValue * BREAKOUT_MARGIN_ATR;
  const recentRvol = relativeVolume(executionBars, rangeWindowBars);
  const acceptedBreakout = recentBars.some((b, i) => {
    const brokeHigh = b.c > rangeHigh + margin;
    const brokeLow = b.c < rangeLow - margin;
    if (!brokeHigh && !brokeLow) return false;
    // Only the most recent bars have a reliable relative-volume read (it's
    // computed against the full series' tail), so treat an old break with an
    // unknown-volume context as structural rather than assuming it was quiet.
    const isLastBar = i === recentBars.length - 1;
    return isLastBar ? recentRvol !== null && recentRvol >= BREAKOUT_VOLUME_MULTIPLE : true;
  });
  const structuralIntegrity = !acceptedBreakout;

  // --- Rejection confirmation: the bar tested the boundary, then closed back inside the range. ---
  const testedBoundary =
    direction === "bullish" ? lastBar.l <= rangeLow + touchTolerance : lastBar.h >= rangeHigh - touchTolerance;
  const closedBackInside = direction === "bullish" ? lastBar.c > rangeLow : lastBar.c < rangeHigh;
  const rejectionConfirmation = testedBoundary && closedBackInside;

  // --- Volume: the disqualifier is a breakout on rising volume, so a quiet
  // boundary test is what supports a range read, not a busy one. ---
  const volumeDataAvailable = recentRvol !== null;
  const noBreakoutVolumeSpike = volumeDataAvailable && (recentRvol as number) < BREAKOUT_VOLUME_MULTIPLE;

  const safetyGatesOk = allSafetyGatesPass(gates);
  const targetStopFeasible = gates.targetRoomAvailable && gates.stopWithinNovicePolicy;

  const breakdown: RulesAlignmentBreakdownItem[] = [
    {
      key: "verifiedRange",
      label: "Verified range/rotational conditions",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: verifiedRange,
      note: verifiedRange
        ? `Weak trend strength, flat MAs, ${highTouches} high / ${lowTouches} low boundary touches.`
        : "Range isn't verified — trend strength too high, MAs not flat, or a boundary lacks repeated touches.",
    },
    {
      key: "atBoundaryNotMidpoint",
      label: "At the boundary, not the midpoint",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: atBoundaryNotMidpoint,
      note: atBoundaryNotMidpoint
        ? `Price at ${lastBar.c.toFixed(2)} sits in the outer band near ${boundary.toFixed(2)}, not the ${midpoint.toFixed(2)} midpoint.`
        : "Price is too far from the traded boundary, or closer to the midpoint than the boundary — no midpoint entries.",
    },
    {
      key: "structuralIntegrity",
      label: "No accepted breakout",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: structuralIntegrity,
      note: structuralIntegrity
        ? "No decisive, volume-backed close beyond either boundary in the recent window."
        : "A boundary was already broken on expanding volume — this isn't a rotational range anymore.",
    },
    {
      key: "rejectionConfirmation",
      label: "Boundary rejection confirmed",
      points: 15,
      maxPoints: 15,
      applicable: true,
      passed: rejectionConfirmation,
      note: rejectionConfirmation
        ? `Price tested ${boundary.toFixed(2)} and closed back inside the range.`
        : `Price hasn't both tested ${boundary.toFixed(2)} and closed back inside yet.`,
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
      key: "noBreakoutVolumeSpike",
      label: "No breakout-volume spike at the boundary",
      points: 10,
      maxPoints: 10,
      applicable: volumeDataAvailable,
      passed: noBreakoutVolumeSpike,
      note: volumeDataAvailable
        ? noBreakoutVolumeSpike
          ? `Relative volume ${recentRvol!.toFixed(2)}x stays below the ${BREAKOUT_VOLUME_MULTIPLE}x breakout floor.`
          : `Relative volume ${recentRvol!.toFixed(2)}x is breakout-sized — rotational conditions aren't confirmed.`
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
    verifiedRange &&
    atBoundaryNotMidpoint &&
    structuralIntegrity &&
    rejectionConfirmation;

  const plan: SignalPlan | null = tradeable
    ? buildPlan(direction, lastBar, rangeHigh, rangeLow)
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
 * Entry: break of the rejection bar's own extreme by a penny — the same
 * trigger convention the other implemented states use. Stop: a penny beyond
 * the traded boundary — a close through it is this state's own definition
 * of the range thesis failing. Target: the opposite boundary, the classic
 * range-trade objective — always available once `verifiedRange` is true, so
 * unlike the other states there's no structural-zone/measured-move fallback
 * to reach for.
 */
function buildPlan(
  direction: Exclude<Direction, "none">,
  lastBar: Bar,
  rangeHigh: number,
  rangeLow: number,
): SignalPlan | null {
  const boundary = direction === "bullish" ? rangeLow : rangeHigh;
  const target = direction === "bullish" ? rangeHigh : rangeLow;

  const entryTrigger = direction === "bullish" ? lastBar.h + PENNY : lastBar.l - PENNY;
  const stop = direction === "bullish" ? boundary - PENNY : boundary + PENNY;
  const risk = Math.abs(entryTrigger - stop);
  if (risk <= 0) return null;

  return {
    direction,
    entryTrigger,
    entryDescription: `Break of the rejection bar's own extreme by ${PENNY.toFixed(2)}.`,
    stop,
    target,
    targetDescription: `Opposite range boundary at ${target.toFixed(2)}.`,
  };
}

export const RANGE_REVERSION_META = SCANNER_STATE_META.rangeReversion;
