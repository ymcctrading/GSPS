/**
 * Gann's full Pattern-Chart angle set, drawn on the Gann point from the major
 * tops and bottoms, with each angle copied to the preceding opposite pivot
 * (gap G27, built 2026-10-16 under the owner's "every Gann method acts").
 *
 * Sources:
 * - Tier A: Master Course Ch. 2 (January 17, 1931), the Square of 90 Pattern
 *   Chart and its angle table: 16×1, 8×1, 4×1, 3×1, 2×1, 1×1, 1×2, 1×3, 1×4,
 *   1×8 and 1×16. Gann says to keep the 3×1 "at all times" on monthly charts
 *   from any important bottom, and the 8×1 and 16×1 matter after long declines.
 * - Tier A: Ch. 4, GA-4 to GA-11 (November 1935): angles from tops and
 *   bottoms; GA-12 to GA-16: parallel angles from tops and bottoms forming the
 *   campaign's channel. His U.S. Steel example draws a 45° down from a low.
 * - Corroboration: Jensen pp. 112–113 (B16) parallels the same point line
 *   from the preceding top; the B17 article's visible mechanism is the same.
 *   Its undisclosed per-market "key" is not used (source note B17).
 *
 * What it does: from the extreme low and extreme high of the daily bars, and
 * from the last completed top and bottom of Gann's weekly swing chart, every
 * angle in the set runs up from a bottom and down from a top. Each one is
 * also drawn at the same slope from the pivot of the opposite kind that came
 * before it (the parallel). The value of every line at the last bar is a
 * support or resistance point; only the nearest above and the nearest below
 * price join the S/R list (`masterLevels.ts`), on the live scan and the
 * replay alike, so the list isn't flooded.
 *
 * Engineering choices, labelled as such:
 * - Price unit: the Gann point (`pointScale.ts#gannPointForBars`), fixed
 *   before any test, never tuned per market (the Dewey discipline; B17).
 * - Time unit: one daily bar, a space on Gann's daily chart.
 * - "Major pivots": the extremes plus the weekly swing chart's last top and
 *   bottom. Gann says "every important top and bottom" and doesn't count
 *   them; these four are the ones his own examples start from.
 * - `fans.ts` and `normalizedSlope.ts` (the scored angle criterion) still use
 *   an ATR unit and five angles. Their unit is the subject of PR #309's fork
 *   FL4, which measures ATR against Gann's fixed scale, so they are left to
 *   that measurement rather than changed twice.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: a rate of price against time, not a periodicity claim. Dewey's
 *    checklist doesn't apply; the replay's factor table measures the levels.
 * 3. Hermetic: Polarity, each angle and its parallel bracket the move from
 *    the two opposite pivots; Correspondence, the same price and time unit on
 *    both axes (Gann's squaring of price and time).
 */

import type { Bar } from "@/lib/types";
import { swingPivots, WEEKLY_SWING_CHART } from "@/lib/gann/swingChart";

/** Gann's angle set, points per bar. */
export const PATTERN_ANGLES: { label: string; ratio: number }[] = [
  { label: "16x1", ratio: 16 },
  { label: "8x1", ratio: 8 },
  { label: "4x1", ratio: 4 },
  { label: "3x1", ratio: 3 },
  { label: "2x1", ratio: 2 },
  { label: "1x1", ratio: 1 },
  { label: "1x2", ratio: 1 / 2 },
  { label: "1x3", ratio: 1 / 3 },
  { label: "1x4", ratio: 1 / 4 },
  { label: "1x8", ratio: 1 / 8 },
  { label: "1x16", ratio: 1 / 16 },
];

export interface AnglePivot {
  index: number;
  price: number;
  kind: "top" | "bottom";
}

export interface PatternAngleLine {
  angle: string;
  /** The pivot the angle is drawn from. */
  from: AnglePivot;
  /** Set when this is the parallel: the angle of `from`, drawn from this opposite pivot. */
  parallelFrom: AnglePivot | null;
  /** Signed points per bar. */
  slope: number;
  /** The line's price at the last bar. */
  price: number;
}

function pivotKey(p: AnglePivot): string {
  return `${p.kind}:${p.index}`;
}

/** The major pivots, each with the opposite pivot that preceded it (null without one). */
export function majorAnglePivots(bars: Bar[]): { pivot: AnglePivot; preceding: AnglePivot | null }[] {
  if (bars.length < 2) return [];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const swings: AnglePivot[] = swingPivots(bars, WEEKLY_SWING_CHART).map((p) => ({ ...p }));
  const candidates: AnglePivot[] = [
    { index: lo, price: bars[lo].l, kind: "bottom" },
    { index: hi, price: bars[hi].h, kind: "top" },
  ];
  const lastTop = [...swings].reverse().find((p) => p.kind === "top");
  const lastBottom = [...swings].reverse().find((p) => p.kind === "bottom");
  if (lastBottom) candidates.push(lastBottom);
  if (lastTop) candidates.push(lastTop);

  // The opposite pivot before each one: the swing chart's, or the opposite
  // extreme when that came first and no swing pivot sits between.
  const pool: AnglePivot[] = [...swings, candidates[0], candidates[1]];
  const seen = new Set<string>();
  const out: { pivot: AnglePivot; preceding: AnglePivot | null }[] = [];
  for (const pivot of candidates) {
    const key = pivotKey(pivot);
    if (seen.has(key)) continue;
    seen.add(key);
    let preceding: AnglePivot | null = null;
    for (const q of pool) {
      if (q.kind === pivot.kind || q.index >= pivot.index) continue;
      if (!preceding || q.index > preceding.index) preceding = q;
    }
    out.push({ pivot, preceding });
  }
  return out;
}

/** Every angle from the major pivots and its parallel, valued at the last bar. `unit` is the Gann point in dollars. */
export function patternAngleLines(bars: Bar[], unit: number): PatternAngleLine[] {
  if (bars.length < 2 || !(unit > 0)) return [];
  const last = bars.length - 1;
  const lines: PatternAngleLine[] = [];
  for (const { pivot, preceding } of majorAnglePivots(bars)) {
    if (pivot.index >= last) continue;
    const sign = pivot.kind === "bottom" ? 1 : -1;
    for (const { label, ratio } of PATTERN_ANGLES) {
      const slope = sign * ratio;
      const price = pivot.price + slope * unit * (last - pivot.index);
      if (price > 0) lines.push({ angle: label, from: pivot, parallelFrom: null, slope, price });
      if (preceding) {
        const copy = preceding.price + slope * unit * (last - preceding.index);
        if (copy > 0) lines.push({ angle: label, from: pivot, parallelFrom: preceding, slope, price: copy });
      }
    }
  }
  return lines;
}

function lineLabel(l: PatternAngleLine, bars: Bar[]): string {
  const date = (p: AnglePivot) => bars[p.index]?.t.slice(0, 10) ?? "";
  const dir = l.slope > 0 ? "up" : "down";
  const base = `${l.angle} ${dir} from the ${l.from.kind} of ${date(l.from)}`;
  return l.parallelFrom ? `parallel of the ${base}, drawn from the ${l.parallelFrom.kind} of ${date(l.parallelFrom)}` : base;
}

/** The nearest angle point above price and the nearest below, for the S/R list. */
export function patternAngleLevels(bars: Bar[], price: number, unit: number): { price: number; label: string }[] {
  if (!(price > 0)) return [];
  let above: PatternAngleLine | null = null;
  let below: PatternAngleLine | null = null;
  for (const l of patternAngleLines(bars, unit)) {
    if (l.price <= price && (!below || l.price > below.price)) below = l;
    if (l.price > price && (!above || l.price < above.price)) above = l;
  }
  const out: { price: number; label: string }[] = [];
  if (below) out.push({ price: below.price, label: `Angle: ${lineLabel(below, bars)}` });
  if (above) out.push({ price: above.price, label: `Angle: ${lineLabel(above, bars)}` });
  return out;
}

export interface PatternAngleReading {
  /** The line price is on, within one Gann point, nearest first. */
  on: (PatternAngleLine & { label: string }) | null;
  /** True when that line is a parallel (copied from the opposite pivot). */
  onParallel: boolean;
  /** True when it is the 3×1 or steeper from a bottom (Gann's "at all times" angle and the ones after long declines). */
  onSteepFromBottom: boolean;
}

/** Is price on one of the angles today? Context and measured factor. */
export function readPatternAngles(bars: Bar[], price: number, unit: number): PatternAngleReading | null {
  if (!(price > 0) || !(unit > 0)) return null;
  let best: PatternAngleLine | null = null;
  for (const l of patternAngleLines(bars, unit)) {
    const d = Math.abs(l.price - price);
    if (d <= unit && (!best || d < Math.abs(best.price - price))) best = l;
  }
  if (!best) return { on: null, onParallel: false, onSteepFromBottom: false };
  return {
    on: { ...best, label: lineLabel(best, bars) },
    onParallel: best.parallelFrom !== null,
    onSteepFromBottom: best.from.kind === "bottom" && best.slope >= 3,
  };
}

export function describePatternAngles(r: PatternAngleReading | null): string[] {
  if (!r?.on) return [];
  return [`Price is on an angle: the ${r.on.label} (${r.on.price.toFixed(2)}).`];
}
