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
 * TEMPORARY OVERRIDE (since 2026-09-14) — see AGENTS.md's "Temporary
 * overrides" section, `SQUARE_TOLERANCE_BARS` entry. Widened from 2 to 4 as
 * part of the Execute-collapse stopgap, when this criterion still compared
 * elapsed bars against the raw, un-normalized dollar move: on the committed
 * 2026-09-11 unconditioned run this passed only 118/1061 (11%) and read
 * Δ−0.221R, one of several contributors to the Execute bucket collapsing to
 * 0 trades. That widening was a patch on a scale-dependent measurement, not
 * a fix to the scale problem itself — a 4-bar tolerance means something very
 * different for a $900 stock than a $150 one when the move it's compared
 * against is a raw dollar amount. This has since been replaced with the
 * ATR-normalized comparison below (2026-09-14, direct request) — every
 * other proximity-style criterion in this codebase already made this exact
 * move (see `lib/scoring/proximity.ts`'s header), and this one is a
 * genuinely different construction only in *what* it compares, not in
 * whether the comparison should be scale-relative. `4` is carried forward
 * unchanged rather than re-guessed, but it now bounds a different quantity
 * (elapsed bars vs. ATR-units of price move) than the reading that produced
 * it — needs a fresh committed run before this evidence describes the code
 * as shipped. See `lib/validation/criteria-registry.ts`'s `timePriceSquare`
 * entry.
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
