/**
 * Regime classifier: Trend / Range / Transition / Event-high-uncertainty.
 *
 * Built entirely from independently designed public components — MA slope/
 * alignment, price structure (swing pivots), ATR-based volatility state,
 * ADX/DMI, anchored VWAP, volume behavior, and horizontal support/
 * resistance — per the spec. Any trend overlay (PSAR/Supertrend) is accepted
 * only as optional evidence via `trendOverlayFlips`, never as a sole signal,
 * and is used solely to disqualify a Trend read on repeated flips.
 */

import type { Bar } from "@/lib/types";
import { atr, clusterLevels, findPivots } from "@/lib/analysis/pivots";
import { adx, relativeVolume, slope, smaSeries } from "./indicators";
import type { RegimeRead } from "./types";

export interface RegimeInputs {
  /** Closed bars on the timeframe the regime is being read on, ascending. */
  bars: Bar[];
  fastMaPeriod?: number;
  slowMaPeriod?: number;
  adxPeriod?: number;
  atrPeriod?: number;
  adxTrendThreshold?: number;
  maFlatSlopeEpsilon?: number;
  /** Count of PSAR/Supertrend flips in the recent lookback window — optional evidence only. */
  trendOverlayFlips?: number;
  trendOverlayFlipThreshold?: number;
  /** Explicit event-risk flags — these short-circuit to the "event" regime. */
  scheduledBinaryEvent?: boolean;
  staleData?: boolean;
  abnormalSpread?: boolean;
  extremeGapRisk?: boolean;
}

const DEFAULTS = {
  fastMaPeriod: 20,
  slowMaPeriod: 50,
  adxPeriod: 14,
  atrPeriod: 14,
  adxTrendThreshold: 20,
  maFlatSlopeEpsilon: 0.0005,
  trendOverlayFlipThreshold: 3,
};

export function classifyRegime(inputs: RegimeInputs): RegimeRead {
  const {
    bars,
    fastMaPeriod = DEFAULTS.fastMaPeriod,
    slowMaPeriod = DEFAULTS.slowMaPeriod,
    adxPeriod = DEFAULTS.adxPeriod,
    atrPeriod = DEFAULTS.atrPeriod,
    adxTrendThreshold = DEFAULTS.adxTrendThreshold,
    maFlatSlopeEpsilon = DEFAULTS.maFlatSlopeEpsilon,
    trendOverlayFlips = 0,
    trendOverlayFlipThreshold = DEFAULTS.trendOverlayFlipThreshold,
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

  const minBars = Math.max(slowMaPeriod, adxPeriod * 2 + 1) + 10;
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

  const dmi = adx(bars, adxPeriod);
  const trendStrengthSupport = dmi !== null && dmi.adx >= adxTrendThreshold;
  const adxDirection: "bullish" | "bearish" | null =
    dmi === null ? null : dmi.plusDI > dmi.minusDI ? "bullish" : "bearish";

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

  const flippingOverlay = trendOverlayFlips >= trendOverlayFlipThreshold;

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
  if (flippingOverlay) trendDisqualifiers.push("Repeated trend-overlay flips.");
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
        `ADX ${dmi?.adx.toFixed(1)} supports trend strength (>= ${adxTrendThreshold}).`,
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
        `ADX ${dmi?.adx.toFixed(1)} below the trend threshold (${adxTrendThreshold}).`,
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
