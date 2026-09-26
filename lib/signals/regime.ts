/**
 * Regime classifier: Trend / Range / Transition / Event-high-uncertainty.
 *
 * Built from price structure (swing pivots), Gann's 3-day/9-day swing charts
 * (`lib/gann/trendStrength.ts`), ATR-based volatility state, volume behavior,
 * and horizontal support/resistance.
 *
 * **Moving averages removed 2026-09-26** (alignment audit F2.5,
 * project-owner delegation). A fast/slow SMA 20/50 alignment-and-slope test
 * used to sit beside the swing-chart read as a second opinion on "is this
 * trending, and which way". It was the last non-Gann input to the regime
 * labels, and it answered a question the swing charts already answer. Gann
 * reads trend from tops and bottoms, not from averaged closes. The trend read
 * is now the 9-day chart confirmed by stepping 3-day swings, plus the HH/HL
 * structure. The range read is the exact negation of that trend read, plus
 * repeatable boundaries. The prior-trend direction a transition breaks
 * against is the 9-day chart's.
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
import { relativeVolume } from "./indicators";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { SWING_CHART_DAYS } from "@/lib/gann/swingChart";
import type { RegimeRead } from "./types";

export interface RegimeInputs {
  /** Closed bars on the timeframe the regime is being read on, ascending. */
  bars: Bar[];
  atrPeriod?: number;
  /** Explicit event-risk flags — these short-circuit to the "event" regime. */
  scheduledBinaryEvent?: boolean;
  staleData?: boolean;
  abnormalSpread?: boolean;
  extremeGapRisk?: boolean;
}

const DEFAULTS = {
  atrPeriod: 14,
};

/**
 * Fewest bars the classifier reads. It was set by the 50-bar slow SMA plus a
 * margin. That MA is gone, but the figure is kept at 60 so that removing it
 * doesn't also widen what counts as classifiable. The 9-day chart needs only
 * `days + 2`, well inside this.
 */
const MIN_REGIME_BARS = 60;

export function classifyRegime(inputs: RegimeInputs): RegimeRead {
  const {
    bars,
    atrPeriod = DEFAULTS.atrPeriod,
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
  const minBars = Math.max(MIN_REGIME_BARS, SWING_CHART_DAYS.nineDay + 2 + 10);
  if (bars.length < minBars) {
    return {
      regime: "event",
      direction: "sideways",
      reasons: [`Fewer than ${minBars} bars of history — insufficient to classify.`],
      disqualifiers: [],
    };
  }

  // Trend strength and direction come from Gann's own 3-day/9-day swing
  // charts, not Wilder's ADX/DMI (replaced 2026-09-17 — see
  // `lib/gann/trendStrength.ts` for the rule and its sourcing). The 9-day
  // chart gives the direction; it is confirmed only when the 3-day chart's
  // swings are stepping the same way.
  const gannTrend = readGannTrend(bars);
  const trendStrengthSupport = gannTrend.confirmed;
  const gannDirection: "bullish" | "bearish" | null = gannTrend.direction;

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
  // The prevailing trend a transition breaks against is the 9-day chart's
  // (the same chart `readGannTrend` takes direction from). With no 9-day
  // direction yet there is no prior trend to reverse.
  const priorTrendDirection = gannTrend.nineDay;
  const recentBreak =
    priorTrendDirection !== null &&
    (priorTrendDirection === "bullish"
      ? bars[bars.length - 1].c < lows[lows.length - 2 >= 0 ? lows.length - 2 : 0]
      : bars[bars.length - 1].c > highs[highs.length - 2 >= 0 ? highs.length - 2 : 0]);
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

  // --- Trend: clear HH/HL or LH/LL, confirmed by Gann's swing charts in the same direction. ---
  const trendDisqualifiers: string[] = [];
  if (!higherHighsLows && !lowerHighsLows) trendDisqualifiers.push("No directional swing structure.");

  const bullishTrend = higherHighsLows && trendStrengthSupport && gannDirection === "bullish";
  const bearishTrend = lowerHighsLows && trendStrengthSupport && gannDirection === "bearish";

  if ((bullishTrend || bearishTrend) && trendDisqualifiers.length === 0) {
    return {
      regime: "trend",
      direction: bullishTrend ? "bullish" : "bearish",
      reasons: [
        bullishTrend ? "Higher highs and higher lows." : "Lower highs and lower lows.",
        `9-day swing chart ${gannTrend.direction}, with 3-day swings stepping the same way — trend confirmed.`,
      ],
      disqualifiers: [],
    };
  }

  // --- Range: no confirmed Gann trend, repeatable horizontal boundaries. ---
  const rangeDisqualifiers: string[] = [];
  const acceptedBreakout =
    atrValue > 0 &&
    Math.abs(closes[closes.length - 1] - closes[closes.length - 2]) / atrValue > 1 &&
    rvol !== null && rvol > 1.5;
  if (acceptedBreakout) rangeDisqualifiers.push("Accepted breakout with rising volatility/volume.");

  const rangeConditions = !trendStrengthSupport && repeatableBoundaries;
  if (rangeConditions && rangeDisqualifiers.length === 0) {
    return {
      regime: "range",
      direction: "sideways",
      reasons: [
        `3-day and 9-day swing charts do not agree (${gannTrend.threeDay ?? "unset"} vs ${gannTrend.nineDay ?? "unset"}) — no confirmed trend.`,
        "Repeatable horizontal boundaries above and below price.",
      ],
      disqualifiers: [],
    };
  }

  // No regime's required characteristics cleanly matched — report the closest
  // read (trend when the swing charts confirm one but the HH/HL structure
  // didn't, else range) rather than silently defaulting, so callers can see
  // why.
  const fallbackRegime = trendStrengthSupport ? "trend" : "range";
  return {
    regime: fallbackRegime,
    direction: fallbackRegime === "trend" && gannDirection !== null ? gannDirection : "sideways",
    reasons: ["No regime's required characteristics were unambiguously met — closest read reported."],
    disqualifiers: [...trendDisqualifiers, ...rangeDisqualifiers],
  };
}
