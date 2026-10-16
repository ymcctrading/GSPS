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
 *   time unit; research-only for now, with no consumer.
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
