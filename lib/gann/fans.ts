/**
 * Gann Fan angles from major swing pivots.
 *
 * The 1x1 line rises one Gann point per daily bar. Since 2026-10-16 (owner,
 * Q27, "default to Gann's method") the unit is the Gann point
 * (`pointScale.ts#pointForBars`), fixed from the chart's own range, and the
 * angles are Gann's full set (`patternAngles.ts#PATTERN_ANGLES`), the unit and
 * set the S/R angles already use. It was one 14-bar ATR per bar on five
 * angles, an engineering scale with no Gann source.
 */

import type { Bar } from "@/lib/types";
import { findPivots, type Pivot } from "@/lib/analysis/pivots";
import { pointForBars } from "@/lib/gann/pointScale";
import { PATTERN_ANGLES } from "@/lib/gann/patternAngles";
import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

export interface FanLine {
  angle: string;
  price: number;
  distancePct: number;
  anchor: { price: number; index: number; kind: "high" | "low" };
  /** Support while price sits above the line, resistance while below it. */
  role: LevelRole;
  /**
   * Gann angles as a *time* projection, not just a price slope — secondary
   * source B10 (Jason Sidney, `docs/GANN_HISTORICAL_SOURCES.md` lines
   * 375-387): each angle ratio maps to a percentage of the swing's own base
   * time interval (1x1 = 100%, 1x2 = 50%, 2x1 = 200%, 1x8 = 12.5% — exactly
   * this module's own `ratio` values expressed as a percentage). The "base
   * time interval" is the calendar duration of the swing that produced this
   * anchor pivot (from the immediately preceding opposite-kind pivot to the
   * anchor); the projected date is that duration, scaled by the angle's
   * ratio, forward from the anchor. Null when there's no preceding
   * opposite-kind pivot to measure a base interval from. Confluence-only —
   * a Tier B source, not Gann's own book/course voice.
   */
  timeProjectionDate: string | null;
  /** The angle's rank (`angleRank`): 1 for the 1x1, then the 2x1s. */
  rank: number;
}

/** Exported for `lib/gann/normalizedSlope.ts`, which classifies an already-realized slope against this same ratio set. */
export const ANGLES: { label: string; ratio: number }[] = PATTERN_ANGLES;

/**
 * C-LEVELS-09: the order Gann ranks his angles in. The 1x1 is "first and
 * always most important" (Master Course Ch.4 PDF 125); "draw the 45° first,
 * then the 2x1s, then 4x1 and 8x1" (PDF 55). Each angle ranks with its
 * mirror. The 3x1 ranks with the 4x1 ("I strongly advise using it at all
 * times", PDF 127-129) and the 16x1 last (1929-type markets, PDF 125-127); placing
 * those two is an engineering reading of the order. Context only: the rank
 * moves no level, score or gate.
 */
export function angleRank(label: string): number {
  switch (label) {
    case "1x1":
      return 1;
    case "2x1":
    case "1x2":
      return 2;
    case "4x1":
    case "1x4":
    case "3x1":
    case "1x3":
      return 3;
    case "8x1":
    case "1x8":
      return 4;
    default:
      return 5;
  }
}

/** One Gann point per bar: the price unit every angle here is drawn in. */
export function angleUnit(bars: Bar[]): number {
  return pointForBars(bars);
}

/**
 * The fans' two anchors (the latest pivot high and low) and each one's base
 * time interval for B10's time-projection rule: the calendar duration of the
 * swing that produced the anchor, measured from the immediately preceding
 * opposite-kind pivot (null without one). Shared with the class C time ratios
 * in `secondaryTime.ts` so both project from the same anchors.
 */
export function fanAnchors(bars: Bar[]): { anchor: Pivot; preceding: Pivot | null; baseIntervalMs: number | null }[] {
  const pivots = findPivots(bars, 4);
  // Anchor from the two most significant recent pivots (one high, one low)
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");
  const out: { anchor: Pivot; preceding: Pivot | null; baseIntervalMs: number | null }[] = [];
  for (const anchor of [lastHigh, lastLow]) {
    if (!anchor) continue;
    const precedingOpposite = [...pivots]
      .reverse()
      .find((p) => p.kind !== anchor.kind && p.index < anchor.index);
    const baseIntervalMs = precedingOpposite
      ? new Date(anchor.bar.t).getTime() - new Date(precedingOpposite.bar.t).getTime()
      : null;
    out.push({ anchor, preceding: precedingOpposite ?? null, baseIntervalMs });
  }
  return out;
}

export function computeFanLines(bars: Bar[], currentPrice: number): FanLine[] {
  if (bars.length < 20) return [];

  const unit = angleUnit(bars); // price per bar for the 1x1
  if (unit <= 0) return [];

  const lines: FanLine[] = [];
  const lastIndex = bars.length - 1;

  for (const { anchor, baseIntervalMs } of fanAnchors(bars)) {
    const elapsed = lastIndex - anchor.index;
    if (elapsed <= 0) continue;
    const anchorMs = new Date(anchor.bar.t).getTime();

    for (const { label, ratio } of ANGLES) {
      // Fans from a low rise; fans from a high descend.
      const sign = anchor.kind === "low" ? 1 : -1;
      const price = anchor.price + sign * ratio * unit * elapsed;
      if (price <= 0) continue;
      const timeProjectionDate =
        baseIntervalMs != null && baseIntervalMs > 0
          ? new Date(anchorMs + ratio * baseIntervalMs).toISOString().slice(0, 10)
          : null;
      lines.push({
        angle: `${label} (${anchor.kind})`,
        price,
        distancePct: Math.abs(currentPrice - price) / currentPrice * 100,
        anchor: { price: anchor.price, index: anchor.index, kind: anchor.kind },
        role: levelRole(currentPrice, price),
        timeProjectionDate,
        rank: angleRank(label),
      });
    }
  }

  return lines.sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest fan line within `proximityPct` of the current price, if any. */
export function nearestFanLine(lines: FanLine[], proximityPct = 1.5): FanLine | null {
  const nearest = lines[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}

/**
 * C-STOP-02 (class C, *Additional Cycle Findings*, anonymous compiler, p. 20):
 * breaking the 1x1 means weakness down to the next angle. After a close
 * through the 1x1 from a fan anchor, the next angle beyond it, the 1x2 from
 * the same anchor (half the 1x1's slope in this module's points-per-bar
 * labels; the feature row's "2x1 up" is the same line under the other naming
 * convention), is reported as the next level. Class C, so it is shown and
 * measured and is never a stop, a target or a gate.
 *
 * Engineering choices, labelled: a break needs a close after the anchor that
 * held the 1x1 first (a swing that never kept pace with the 1x1 has nothing
 * to break), and the reading stands while the last close sits between the
 * 1x1 and the 1x2; past the 1x2 it is spent.
 *
 * Three-question basis. Source: class C, as above. Cycles: no periodicity
 * claim. Hermetic: Polarity, the line that was support from a low becomes the
 * edge price has fallen through, mirrored from a high.
 */
export interface OneByOneBreak {
  anchor: { price: number; index: number; kind: "high" | "low" };
  /** The 1x1's price at the last bar. */
  oneByOne: number;
  /** The next angle beyond it, where the break points. */
  next: { angle: "1x2"; price: number };
  /** Down after a break under the 1x1 from a low; up after a break over it from a high. */
  direction: "down" | "up";
}

export function readOneByOneBreak(bars: Bar[]): OneByOneBreak[] {
  if (bars.length < 20) return [];
  const unit = angleUnit(bars);
  if (unit <= 0) return [];
  const last = bars.length - 1;
  const close = bars[last].c;
  const out: OneByOneBreak[] = [];
  for (const { anchor } of fanAnchors(bars)) {
    if (anchor.index >= last) continue;
    const sign = anchor.kind === "low" ? 1 : -1;
    const at = (ratio: number, i: number) => anchor.price + sign * ratio * unit * (i - anchor.index);
    const oneByOne = at(1, last);
    const next = at(1 / 2, last);
    const beyond = sign * (close - oneByOne) < 0;
    const short = sign * (close - next) > 0;
    let held = false;
    for (let i = anchor.index + 1; i < last && !held; i++) held = sign * (bars[i].c - at(1, i)) >= 0;
    if (!beyond || !short || !held || next <= 0) continue;
    out.push({
      anchor: { price: anchor.price, index: anchor.index, kind: anchor.kind },
      oneByOne,
      next: { angle: "1x2", price: next },
      direction: anchor.kind === "low" ? "down" : "up",
    });
  }
  return out;
}

export function describeOneByOneBreak(b: OneByOneBreak): string {
  const from = b.anchor.kind === "low" ? "bottom" : "top";
  return `Price closed ${b.direction === "down" ? "under" : "over"} the 1x1 from the ${b.anchor.price.toFixed(2)} ${from} (${b.oneByOne.toFixed(2)}): the next angle, the 1x2, stands at ${b.next.price.toFixed(2)}. Shown as the next level to watch; it is not a stop or a target.`;
}
