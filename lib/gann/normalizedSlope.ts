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
import { pointForBars } from "./pointScale";

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

/**
 * The fixed chart scale (C-LEVELS-20; Jensen, *Astro-Cycles and Speculative
 * Markets*, printed pp.~124-125, Plate 2): every calendar day is shown, the
 * non-trading days left blank, and one day's width equals one price unit's
 * height ($1 a point in stocks, 1¢ in grain). On that chart a 1x1 moves one
 * unit per calendar day, so it rises 7 units over a week of 5 sessions.
 *
 * Context only, by AGENTS.md's class C rule: the source is Jensen (Lambert-
 * Gann, 1978), a parallel to Gann's method, not Gann's own text, and the
 * owner's Q27 decision keeps the scored angles, the fans and the price-time
 * square on the Gann point per trading bar. Nothing here moves a score, a gate
 * or a level.
 *
 * Three-question basis: 1. Jensen, Tier B (source note B16), not Gann. 2. No periodicity is
 * claimed; Dewey's checklist does not apply. 3. Correspondence: time and
 * space read on one equal scale.
 */
export function calendarDayOneByOne(
  anchorPrice: number,
  anchorTime: string,
  atTime: string,
  unitPerDay: number,
  direction: "up" | "down",
): number {
  const days = (Date.parse(atTime) - Date.parse(anchorTime)) / 86_400_000;
  return anchorPrice + (direction === "up" ? 1 : -1) * unitPerDay * days;
}

export interface CalendarDayAngle {
  anchorPrice: number;
  anchorDate: string;
  calendarDays: number;
  /** The 1x1's price at the last bar. */
  price: number;
  priceAbove: boolean;
}

export interface CalendarDayAngleReading {
  /** The price unit per calendar day: Jensen's $1 a point, scaled to the price as Gann's points are (`pricePoint`). */
  unit: number;
  fromLow: CalendarDayAngle | null;
  fromHigh: CalendarDayAngle | null;
}

/**
 * The rising 1x1 from the last significant low and the falling one from the
 * last significant high (the anchors `computeAngleSlopes` reads), on the
 * calendar-day scale. Engineering choice, labelled as such: Jensen's $1 per
 * day is ported as one price-scaled point per day (`pointScale.ts#pricePoint`,
 * exactly $1 at $42.50), the unit every other point rule here uses.
 */
export function readCalendarDayAngles(bars: Bar[], currentPrice: number): CalendarDayAngleReading | null {
  if (bars.length < 20) return null;
  const unit = pointForBars(bars);
  if (!(unit > 0)) return null;
  const pivots = findPivots(bars, 4);
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const at = bars[bars.length - 1].t;
  const line = (p: typeof lastLow, dir: "up" | "down"): CalendarDayAngle | null => {
    if (!p) return null;
    const price = calendarDayOneByOne(p.price, p.bar.t, at, unit, dir);
    return {
      anchorPrice: p.price,
      anchorDate: p.bar.t.slice(0, 10),
      calendarDays: (Date.parse(at) - Date.parse(p.bar.t)) / 86_400_000,
      price,
      priceAbove: currentPrice > price,
    };
  };
  return { unit, fromLow: line(lastLow, "up"), fromHigh: line(lastHigh, "down") };
}
