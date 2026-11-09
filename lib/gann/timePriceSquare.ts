/**
 * Gann's squaring of price and time — "GSPS Implementation Blueprint" §8.6.
 *
 * Gann held that a swing is at (or near) a turning point when the number of
 * bars elapsed since its pivot matches the price move since that pivot,
 * counted the same unit for unit ("one point, one day"). That is a different
 * question from `lib/gann/normalizedSlope.ts`'s 1x1 angle, which asks
 * whether the rate of change in Gann points sits on a fixed grid of angle
 * ratios — this checks a literal count-for-count match between elapsed time
 * and the price move.
 *
 * "One point" is one Gann point (`fans.ts#angleUnit`, the price-scaled point
 * of `pointScale.ts`), the unit the angles use (owner, Q27, 2026-10-16). It was
 * one ATR from 2026-09-14, and one raw dollar before that; see
 * `SQUARE_TOLERANCE_BARS` below.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and returns one reading
 * from the last swing low and one from the last swing high. The score reads
 * the one against the trade (the high for a long, the low for a short;
 * `lib/scoring/score.ts`, 2026-10-21).
 *
 * Each reading is signed the way Gann measures it: "up from lows" and "down
 * from highs" (Master Course Ch. 18, PDF p.440: low 50, price 102, up 52 =
 * 1 year, "a Time and Price Balance"; high 182, now 130, down 52 = 1 year;
 * "when Time and Space balance, the stock makes top or bottom", PDF p.202).
 * A price above the last high has not come down from it, and a price below
 * the last low has not come up from it, so neither squares (review of #389).
 */

import { findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";
import { angleUnit } from "@/lib/gann/fans";

/**
 * How close the bar count and the price move in Gann points have to land to
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
 * `lib/validation/criteria-registry.ts`'s `timePriceSquare` entry. Since
 * 2026-10-16 (Q27) the move is counted in Gann points, so those readings
 * describe the ATR unit; `4` is carried forward and needs a fresh run.
 */
export const SQUARE_TOLERANCE_BARS = 4;

export interface TimePriceSquareReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  barsSinceAnchor: number;
  /** Raw price move since the anchor, in price units — kept for display/debugging. */
  priceMove: number;
  /** `priceMove` in Gann points — the quantity actually compared against `barsSinceAnchor`. */
  priceMovePoints: number;
  /**
   * Whether price has moved away from the anchor the way Gann measures it (up
   * from a low, down from a high) and elapsed bars and that move in points
   * land within `SQUARE_TOLERANCE_BARS` of each other.
   */
  squared: boolean;
}

export function computeTimePriceSquare(bars: Bar[], currentPrice: number): TimePriceSquareReading[] {
  if (bars.length < 20) return [];

  const unit = angleUnit(bars);
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
    const priceMovePoints = priceMove / unit;
    // Up from the low, down from the high: a move beyond the anchor the other
    // way is not the swing this pivot measures.
    const awayFromAnchor = anchor.kind === "low" ? currentPrice >= anchor.price : currentPrice <= anchor.price;
    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      barsSinceAnchor: elapsed,
      priceMove,
      priceMovePoints,
      squared: awayFromAnchor && Math.abs(elapsed - priceMovePoints) <= SQUARE_TOLERANCE_BARS,
    });
  }
  return readings;
}
