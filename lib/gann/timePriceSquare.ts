/**
 * Gann's squaring of price and time — "GSPS Implementation Blueprint" §8.6.
 *
 * Gann held that a swing is at (or near) a turning point when the number of
 * bars elapsed since its pivot matches the price move since that pivot,
 * counted the same unit for unit ("one point, one day"). That is a different
 * question from `lib/gann/normalizedSlope.ts`'s 1x1 angle, which asks
 * whether the ATR-normalized rate of change sits on a fixed grid of angle
 * ratios — this checks a literal count-for-count match between elapsed time
 * and the price move.
 *
 * "One point" is now one ATR, not one raw dollar, matching
 * `normalizedSlope.ts`'s own unit ("ATR-per-bar... matching `fans.ts`'s own
 * `unit`") — see `SQUARE_TOLERANCE_BARS` below for why this changed and what
 * it fixes.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and the dual-anchor
 * convention `computeAngleSlopes` already uses (a low anchor for the bullish
 * reading, a high anchor for the bearish one), so a bullish setup is judged
 * against the swing that actually bears on it.
 */

import { atr, findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";

/**
 * How close the bar count and the ATR-normalized price move have to land to
 * call the square holding.
 *
 * `4` bars, widened from 2 as part of the since-closed Execute-collapse
 * stopgap — but superseded rather than reverted: this criterion was
 * comparing elapsed bars against the raw, un-normalized dollar move at the
 * time, so the 4-bar tolerance meant something very different for a $900
 * stock than a $150 one. Replaced with the ATR-normalized comparison below
 * (2026-09-14), matching every other proximity-style criterion in this
 * codebase (`lib/scoring/proximity.ts`). `4` carried forward unchanged but
 * now bounds a different quantity (elapsed bars vs. ATR-units of price
 * move). Confirmed on the 2026-09-23 fresh run (12-symbol universe, 615
 * unconditioned trades, `docs/replay-runs/2026-09-23-15Min-2R-within-all-
 * 12sym.json`): 130/615 (21.1%) passing, Δ+0.111R — positive and informative
 * for the first time since this criterion existed, where the pre-ATR-fix
 * version had read Δ−0.221R. See
 * `lib/validation/criteria-registry.ts`'s `timePriceSquare` entry.
 */
export const SQUARE_TOLERANCE_BARS = 4;

export interface TimePriceSquareReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  barsSinceAnchor: number;
  /** Raw price move since the anchor, in price units — kept for display/debugging. */
  priceMove: number;
  /** `priceMove` expressed in ATR units — the quantity actually compared against `barsSinceAnchor`. */
  priceMoveAtrUnits: number;
  /** Whether elapsed bars and the ATR-normalized price move land within `SQUARE_TOLERANCE_BARS` of each other. */
  squared: boolean;
}

export function computeTimePriceSquare(bars: Bar[], currentPrice: number): TimePriceSquareReading[] {
  if (bars.length < 20) return [];

  const unit = atr(bars, 14);
  if (unit <= 0) return [];

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
    const priceMoveAtrUnits = priceMove / unit;
    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      barsSinceAnchor: elapsed,
      priceMove,
      priceMoveAtrUnits,
      squared: Math.abs(elapsed - priceMoveAtrUnits) <= SQUARE_TOLERANCE_BARS,
    });
  }
  return readings;
}
