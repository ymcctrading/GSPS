/**
 * Gann Fan angles from major swing pivots.
 *
 * The 1x1 line rises one Gann point per daily bar. Since 2026-10-16 (owner,
 * Q27, "default to Gann's method") the unit is the Gann point
 * (`pointScale.ts#gannPointForBars`), fixed from the chart's own range, and the
 * angles are Gann's full set (`patternAngles.ts#PATTERN_ANGLES`), the unit and
 * set the S/R angles already use. It was one 14-bar ATR per bar on five
 * angles, an engineering scale with no Gann source.
 */

import type { Bar } from "@/lib/types";
import { findPivots, type Pivot } from "@/lib/analysis/pivots";
import { gannPointForBars } from "@/lib/gann/pointScale";
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
}

/** Exported for `lib/gann/normalizedSlope.ts`, which classifies an already-realized slope against this same ratio set. */
export const ANGLES: { label: string; ratio: number }[] = PATTERN_ANGLES;

/** One Gann point per bar: the price unit every angle here is drawn in. */
export function angleUnit(bars: Bar[]): number {
  return gannPointForBars(bars);
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
