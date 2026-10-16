/**
 * Normalized Gann-angle slope — "GSPS Implementation Blueprint" §8.5.
 *
 * `lib/gann/fans.ts` projects candidate price *levels* forward from an
 * anchor along fixed ratios (1x1, 2x1, …). This is the complementary,
 * diagnostic direction: given where price actually is, how many Gann points
 * per bar has it realized since the anchor, and which of those same fixed
 * ratios is that realized slope closest to. Never computed from chart-pixel
 * geometry — the blueprint is explicit that a "1x1" needs a declared unit,
 * and the Gann point per bar is that unit here (`fans.ts#angleUnit`; owner,
 * Q27, 2026-10-16; it was one ATR per bar).
 */

import { findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";
import { ANGLES, angleUnit } from "./fans";

/**
 * `normalized_slope = (price_t - anchor_price) / (unit * bars_since_anchor)`.
 * `atrUnit` is the price unit the caller measures in: the Gann point
 * (`fans.ts#angleUnit`) for `computeAngleSlopes` below and the confluence
 * card alike.
 * Null when the inputs can't support a meaningful slope — no unit, or the
 * anchor bar is the current bar — rather than dividing by zero.
 */
export function normalizedSlope(
  currentPrice: number,
  anchorPrice: number,
  atrUnit: number,
  barsSinceAnchor: number,
): number | null {
  if (!(atrUnit > 0) || !(barsSinceAnchor > 0) || !Number.isFinite(currentPrice) || !Number.isFinite(anchorPrice)) {
    return null;
  }
  return (currentPrice - anchorPrice) / (atrUnit * barsSinceAnchor);
}

export interface NearestGannAngle {
  label: string;
  ratio: number;
  direction: "up" | "down";
}

/** Which of Gann's angle ratios (1x16 … 16x1) the realized `slope` sits closest to, and which way it's moving. */
export function nearestGannAngle(slope: number): NearestGannAngle | null {
  if (!Number.isFinite(slope)) return null;
  const direction: "up" | "down" = slope >= 0 ? "up" : "down";
  const magnitude = Math.abs(slope);

  let best: (typeof ANGLES)[number] | null = null;
  let bestDistance = Infinity;
  for (const angle of ANGLES) {
    const distance = Math.abs(magnitude - angle.ratio);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = angle;
    }
  }
  return best ? { label: best.label, ratio: best.ratio, direction } : null;
}

export interface AngleSlopeReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  barsSinceAnchor: number;
  slope: number;
  nearestAngle: NearestGannAngle | null;
  /**
   * Gann's own speed, "a movement in price during a unit of time" (A-PRICE-02;
   * W001 p.11): points moved since the anchor per calendar day, in raw price
   * units. Context only; `slope` is the reading in Gann points per bar.
   */
  pointsPerDay: number;
}

/**
 * Realized Gann-angle slope since the most recent significant low (the
 * bullish reading, a rising 1x1 under the trade) and since the most recent
 * significant high (the bearish reading, a falling 1x1 above it) — the same
 * dual-anchor convention `computeFanLines` uses, so each reading is judged
 * against the angle that actually bears on its own direction.
 */
export function computeAngleSlopes(bars: Bar[], currentPrice: number): AngleSlopeReading[] {
  if (bars.length < 20) return [];
  const unit = angleUnit(bars);
  if (unit <= 0) return [];

  const pivots = findPivots(bars, 4);
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");
  const lastIndex = bars.length - 1;

  const readings: AngleSlopeReading[] = [];
  for (const anchor of [lastLow, lastHigh]) {
    if (!anchor) continue;
    const elapsed = lastIndex - anchor.index;
    if (elapsed <= 0) continue;
    const slope = normalizedSlope(currentPrice, anchor.price, unit, elapsed);
    if (slope === null) continue;
    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      barsSinceAnchor: elapsed,
      slope,
      nearestAngle: nearestGannAngle(slope),
      pointsPerDay: (currentPrice - anchor.price) / Math.max(1, (Date.parse(bars[lastIndex].t) - Date.parse(anchor.bar.t)) / 86_400_000),
    });
  }
  return readings;
}
