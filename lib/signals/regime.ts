/**
 * Regime classifier: Trend / Range / Transition / Event-high-uncertainty.
 *
 * Built entirely from independently designed public components — MA slope/
 * alignment, price structure (swing pivots), ATR-based volatility state,
 * ADX/DMI, anchored VWAP, volume behavior, and horizontal support/
 * resistance — per the spec.
 *
 * **The PSAR/Supertrend hook was removed 2026-09-17.** This module used to
 * accept a `trendOverlayFlips` count and disqualify a Trend read on repeated
 * flips. Nothing in this repository ever computed PSAR or Supertrend, no
 * caller ever supplied the value, and it defaulted to 0 — so the branch it
 * guarded could never fire. AGENTS.md's "Gann-grounded platform" principle
 * gave the choice as "either close the hook or ground it"; with no overlay to
 * ground it against, closing it is the honest option. Removing it changes no
 * behaviour, which is exactly what made it worth removing: a dormant
 * extension point for a non-Gann indicator reads to a future session as a
 * design intention this platform does not hold.
 */

import type { Bar } from "@/lib/types";
import { atr, clusterLevels, findPivots } from "@/lib/analysis/pivots";
import { relativeVolume, slope, smaSeries } from "./indicators";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { SWING_CHART_DAYS } from "@/lib/gann/swingChart";
import type { RegimeRead } from "./types";

export interface RegimeInputs {
  /** Closed bars on the timeframe the regime is being read on, ascending. */
  bars: Bar[];
  fastMaPeriod?: number;
  slowMaPeriod?: number;
  atrPeriod?: number;
  maFlatSlopeEpsilon?: number;
  /** Explicit event-risk flags — these short-circuit to the "event" regime. */
  scheduledBinaryEvent?: boolean;
  staleData?: boolean;
  abnormalSpread?: boolean;
  extremeGapRisk?: boolean;
}

const DEFAULTS = {
  fastMaPeriod: 20,
  slowMaPeriod: 50,
  atrPeriod: 14,
  maFlatSlopeEpsilon: 0.0005,
};

export function classifyRegime(inputs: RegimeInputs): RegimeRead {
  const {
    bars,
    fastMaPeriod = DEFAULTS.fastMaPeriod,
    slowMaPeriod = DEFAULTS.slowMaPeriod,
    atrPeriod = DEFAULTS.atrPeriod,
    maFlatSlopeEpsilon = DEFAULTS.maFlatSlopeEpsilon,
    scheduledBinaryEvent = false,
    staleData = false,
    abnormalSpread = false,
    extremeGapRisk = false,
  } = inputs;

  // Event/high uncertainty takes priority over every other read: none of the
  // other regimes' entry logic is trustworthy against stale or abnormal data.
  const eventReasons: string[] = [];
  if (scheduledBinaryEvent) eventReasons.push("Scheduled binary event.");
  if (staleData) eventReasons.push("Stale market data.");
  if (abnormalSpread) eventReasons.push("Abnormal spread.");
  if (extremeGapRisk) eventReasons.push("Extreme gap risk.");
  if (eventReasons.length > 0) {
    return { regime: "event", direction: "sideways", reasons: eventReasons, disqualifiers: [] };
  }

  // Was `adxPeriod * 2 + 1` for Wilder's smoothing seed. The 9-day swing
  // chart that replaced it needs `days + 2` bars to establish a direction
  // (see `swingChartDirection`), and a confirmed read needs a completed swing
  // on top of that, so this keeps a comfortable margin over both.
  const minBars = Math.max(slowMaPeriod, SWING_CHART_DAYS.nineDay + 2) + 10;
  if (bars.length < minBars) {
    return {
      regime: "event",
      direction: "sideways",
      reasons: [`Fewer than ${minBars} bars of history — insufficient to classify.`],
      disqualifiers: [],
    };
  }

  const fastMa = smaSeries(bars, fastMaPeriod);
  const slowMa = smaSeries(bars, slowMaPeriod);
  const fastSlope = slope(fastMa, 5);
  const slowSlope = slope(slowMa, 5);
  const fastAboveSlow = fastMa[fastMa.length - 1] > slowMa[slowMa.length - 1];
  const flatMas = Math.abs(fastSlope) < maFlatSlopeEpsilon && Math.abs(slowSlope) < maFlatSlopeEpsilon;

  // Trend strength and direction come from Gann's own 3-day/9-day swing
  // charts, not Wilder's ADX/DMI (replaced 2026-09-17 — see
  // `lib/gann/trendStrength.ts` for the rule and its sourcing). The 9-day
  // chart gives the direction; it is confirmed only when the 3-day chart's
  // swings are stepping the same way.
  const gannTrend = readGannTrend(bars);
  const trendStrengthSupport = gannTrend.confirmed;
  const adxDirection: "bullish" | "bearish" | null = gannTrend.direction;

  const pivots = findPivots(bars, 3);
  const highs = pivots.filter((p) => p.kind === "high").slice(-4).map((p) => p.price);
  const lows = pivots.filter((p) => p.kind === "low").slice(-4).map((p) => p.price);
  const higherHighsLows = highs.length >= 2 && lows.length >= 2 &&
    highs[highs.length - 1] > highs[0] && lows[lows.length - 1] > lows[0];
  const lowerHighsLows = highs.length >= 2 && lows.length >= 2 &&
    highs[highs.length - 1] < highs[0] && lows[lows.length - 1] < lows[0];

  const atrValue = atr(bars, atrPeriod);
  const rvol = relativeVolume(bars, 20);
  const closes = bars.map((b) => b.c);
  const clusters = clusterLevels([...highs, ...lows], 1.0);
  const price = bars[bars.length - 1].c;
  const boundaryAbove = clusters.filter((c) => c > price).length > 0;
  const boundaryBelow = clusters.filter((c) => c < price).length > 0;
  const repeatableBoundaries = clusters.length >= 2 && boundaryAbove && boundaryBelow;

  // --- Transition: exhaustion at a meaningful level plus a structural break/reclaim. ---
  const nearestClusterDistance = clusters.length
    ? Math.min(...clusters.map((c) => Math.abs(c - price))) / price
    : Infinity;
  const atMeaningfulLevel = atrValue > 0 && nearestClusterDistance * price <= atrValue * 0.5;
  const priorTrendDirection = fastAboveSlow ? "bullish" : "bearish";
  const recentBreak =
    priorTrendDirection === "bullish"
      ? bars[bars.length - 1].c < lows[lows.length - 2 >= 0 ? lows.length - 2 : 0]
      : bars[bars.length - 1].c > highs[highs.length - 2 >= 0 ? highs.length - 2 : 0];
  if (atMeaningfulLevel && recentBreak) {
    return {
      regime: "transition",
      direction: priorTrendDirection === "bullish" ? "bearish" : "bullish",
      reasons: [
        "Exhaustion at a clustered structural level.",
        "Structural break/reclaim against the prior trend direction.",
      ],
      disqualifiers: [],
    };
  }

  // --- Trend: clear HH/HL or LH/LL, MA slope/alignment agreement, ADX support. ---
  const trendDisqualifiers: string[] = [];
  if (flatMas) trendDisqualifiers.push("Flat/crossing moving averages.");
  if (!higherHighsLows && !lowerHighsLows) trendDisqualifiers.push("No directional swing structure.");

  const bullishTrend =
    higherHighsLows && fastAboveSlow && fastSlope > 0 && slowSlope > 0 &&
    trendStrengthSupport && (adxDirection === null || adxDirection === "bullish");
  const bearishTrend =
    lowerHighsLows && !fastAboveSlow && fastSlope < 0 && slowSlope < 0 &&
    trendStrengthSupport && (adxDirection === null || adxDirection === "bearish");

  if ((bullishTrend || bearishTrend) && trendDisqualifiers.length === 0) {
    return {
      regime: "trend",
      direction: bullishTrend ? "bullish" : "bearish",
      reasons: [
        bullishTrend ? "Higher highs and higher lows." : "Lower highs and lower lows.",
        "Fast/slow MA aligned and sloping with the trend.",
        `9-day swing chart ${gannTrend.direction}, with 3-day swings stepping the same way — trend confirmed.`,
      ],
      disqualifiers: [],
    };
  }

  // --- Range: weak trend strength, flat MAs, repeatable horizontal boundaries. ---
  const rangeDisqualifiers: string[] = [];
  const acceptedBreakout =
    atrValue > 0 &&
    Math.abs(closes[closes.length - 1] - closes[closes.length - 2]) / atrValue > 1 &&
    rvol !== null && rvol > 1.5;
  if (acceptedBreakout) rangeDisqualifiers.push("Accepted breakout with rising volatility/volume.");

  const rangeConditions = !trendStrengthSupport && flatMas && repeatableBoundaries;
  if (rangeConditions && rangeDisqualifiers.length === 0) {
    return {
      regime: "range",
      direction: "sideways",
      reasons: [
        `3-day and 9-day swing charts do not agree (${gannTrend.threeDay ?? "unset"} vs ${gannTrend.nineDay ?? "unset"}) — no confirmed trend.`,
        "Flat moving averages.",
        "Repeatable horizontal boundaries above and below price.",
      ],
      disqualifiers: [],
    };
  }

  // No regime's required characteristics cleanly matched — report the closest
  // read (trend if disqualified only by the overlay/flat-MA checks, else
  // range) rather than silently defaulting, so callers can see why.
  const fallbackRegime = trendStrengthSupport ? "trend" : "range";
  return {
    regime: fallbackRegime,
    direction: fallbackRegime === "trend" ? (fastAboveSlow ? "bullish" : "bearish") : "sideways",
    reasons: ["No regime's required characteristics were unambiguously met — closest read reported."],
    disqualifiers: [...trendDisqualifiers, ...rangeDisqualifiers],
  };
}
