/**
 * Gann's squaring of price and time — "GSPS Implementation Blueprint" §8.6.
 *
 * Gann held that a swing is at (or near) a turning point when the number of
 * bars elapsed since its pivot matches the raw price move since that pivot,
 * counted the same unit for unit ("one point, one day"). That is a different
 * question from `lib/gann/normalizedSlope.ts`'s 1x1 angle, which asks
 * whether the *ATR-normalized* rate of change sits on a fixed grid of angle
 * ratios — this checks a literal count-for-count match between elapsed time
 * and the raw dollar move, with no ATR normalization at all.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and the dual-anchor
 * convention `computeAngleSlopes` already uses (a low anchor for the bullish
 * reading, a high anchor for the bearish one), so a bullish setup is judged
 * against the swing that actually bears on it.
 */

import { findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";

/** How close the bar count and the price move have to land to call the square holding. */
export const SQUARE_TOLERANCE_BARS = 2;

export interface TimePriceSquareReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  barsSinceAnchor: number;
  priceMove: number;
  /** Whether elapsed bars and the raw price move land within `SQUARE_TOLERANCE_BARS` of each other. */
  squared: boolean;
}

export function computeTimePriceSquare(bars: Bar[], currentPrice: number): TimePriceSquareReading[] {
  if (bars.length < 20) return [];

  const pivots = findPivots(bars, 4);
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");
  const lastIndex = bars.length - 1;

  const readings: TimePriceSquareReading[] = [];
  for (const anchor of [lastLow, lastHigh]) {
    if (!anchor) continue;
    const elapsed = lastIndex - anchor.index;
    if (elapsed <= 0) continue;
    const priceMove = Math.abs(currentPrice - anchor.price);
    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      barsSinceAnchor: elapsed,
      priceMove,
      squared: Math.abs(elapsed - priceMove) <= SQUARE_TOLERANCE_BARS,
    });
  }
  return readings;
}
