/**
 * Two class C angle readings, context only (PLAN.md item 9, step 3e). Neither
 * feeds `gannTargets`, the support and resistance pool or a scored criterion.
 *
 * - C-LEVELS-10 (W003 p.20): angles from the 50% mark. The range is the fans'
 *   own two anchors (`fanAnchors`: the latest pivot high and low), its 50%
 *   point the origin in price. Gann gives no origin in time for these angles,
 *   so the bar where the close last crossed the 50% point is the engineering
 *   choice, labelled. The price unit is the fans' ATR per bar, so the two fans
 *   read alike until fork FL4's replay compares the ATR unit with Gann's fixed
 *   scale.
 * - C-LEVELS-08 (W003 p.20; Master Course: a 100-point fall needs about 100
 *   months): a 1x1 from a high reaches zero after as many units of time as the
 *   high has points. `squareFromHigh` is that line at a fixed rate, on any
 *   time unit, and `squareFromLow` its mirror up from a low. The card reads
 *   both on the monthly chart at the Master Course's 1 point a month
 *   (`readMonthlySquares`): down from the latest monthly top, and up from the
 *   latest campaign bottom (the same line as A-PRICE-05's 45-degree line).
 *   The point the square closes is a date ahead, so it is not shown (no dated
 *   window reaches members until measured); the line's price today is.
 *
 * Three-question basis:
 * 1. Gann: class C (W003), with the Master Course's monthly square as his own
 *    corroboration for C-LEVELS-08.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Polarity (the 50% point is the balance between the high and
 *    the low, and the angles run both ways from it) and Correspondence (price
 *    and time squared, the same units on both axes).
 */
import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { ANGLES, fanAnchors } from "@/lib/gann/fans";
import { findPivots } from "@/lib/analysis/pivots";
import { etDateKey } from "@/lib/market/session";
import { OLDER_LEVELS_YEARS } from "@/lib/gann/entryTrigger";

export interface MidpointFanLine {
  angle: string;
  direction: "up" | "down";
  price: number;
}

export interface MidpointFan {
  /** The 50% point of the latest pivot high and low. */
  midpoint: number;
  /** The bar where the close last crossed it (the engineering origin in time). */
  originIndex: number;
  lines: MidpointFanLine[];
}

export function computeMidpointFan(bars: Bar[]): MidpointFan | null {
  if (bars.length < 20) return null;
  const unit = atr(bars, 14);
  if (!(unit > 0)) return null;
  const anchors = fanAnchors(bars).map((a) => a.anchor);
  const high = anchors.find((a) => a.kind === "high");
  const low = anchors.find((a) => a.kind === "low");
  if (!high || !low) return null;
  const midpoint = (high.price + low.price) / 2;
  let originIndex = -1;
  for (let i = bars.length - 1; i >= 1; i--) {
    if (bars[i - 1].c > midpoint !== bars[i].c > midpoint) {
      originIndex = i;
      break;
    }
  }
  if (originIndex < 0) return null;
  const elapsed = bars.length - 1 - originIndex;
  const lines: MidpointFanLine[] = [];
  for (const { label, ratio } of ANGLES) {
    lines.push({ angle: label, direction: "up", price: midpoint + ratio * unit * elapsed });
    const down = midpoint - ratio * unit * elapsed;
    if (down > 0) lines.push({ angle: label, direction: "down", price: down });
  }
  return { midpoint, originIndex, lines };
}

/** A 1x1 from `high` falling `pointsPerUnit` a unit of time, after `units` (C-LEVELS-08). */
export function squareFromHigh(high: number, pointsPerUnit: number, units: number): number {
  return high - pointsPerUnit * units;
}

/** The mirror: a 1x1 from `low` rising `pointsPerUnit` a unit of time, after `units` (C-LEVELS-08). */
export function squareFromLow(low: number, pointsPerUnit: number, units: number): number {
  return low + pointsPerUnit * units;
}

const monthsApart = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

export interface MonthlySquareReading {
  /** The latest monthly pivot top, "YYYY-MM", and its price. */
  fromMonth: string;
  from: number;
  /** The 1x1 down from it, read this month. */
  price: number;
}

/**
 * The square down from the latest monthly top (C-LEVELS-08), at
 * `pointsPerMonth`, on closed months over `OLDER_LEVELS_YEARS` (the window the
 * campaign bottoms are read on). Null below zero: the square has closed.
 */
export function readMonthlySquareFromHigh(monthly: Bar[] | null | undefined, asOf: Date, pointsPerMonth: number): MonthlySquareReading | null {
  if (!monthly || monthly.length < 24) return null;
  const thisMonth = etDateKey(asOf).slice(0, 7);
  const first = `${Number(thisMonth.slice(0, 4)) - OLDER_LEVELS_YEARS}-01`;
  const months = monthly.filter((b) => b.t.slice(0, 7) >= first && b.t.slice(0, 7) < thisMonth);
  const top = findPivots(months, 3).filter((p) => p.kind === "high").at(-1);
  if (!top) return null;
  const fromMonth = top.bar.t.slice(0, 7);
  const price = squareFromHigh(top.price, pointsPerMonth, monthsApart(fromMonth, thisMonth));
  return price > 0 ? { fromMonth, from: top.price, price } : null;
}
