/**
 * Gann Square of 9.
 *
 * Prices map onto a square-root spiral: one full 360° rotation multiplies
 * sqrt(price) by 2. From an anchor price (major low or high), levels at the
 * cardinal (0/90/180/270°) and ordinal (45/135/225/315°) angles are:
 *
 *   level(deg) = (sqrt(anchor) + deg/180)²
 *
 * These are the classic "natural support/resistance" coordinates where the
 * protocol expects liquidity to rest.
 */

import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";
import { findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";

export interface S9Level {
  degree: number;
  price: number;
  distancePct: number;
  rotation: number;
  /** Support while price sits above the level, resistance while below it. */
  role: LevelRole;
}

const DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

export function squareOf9Levels(
  anchorPrice: number,
  currentPrice: number,
  rotations = 8,
): S9Level[] {
  if (anchorPrice <= 0 || currentPrice <= 0) return [];
  const root = Math.sqrt(anchorPrice);
  const levels: S9Level[] = [];

  for (let rot = 0; rot <= rotations; rot++) {
    for (const degree of DEGREES) {
      const totalDeg = rot * 360 + degree;
      for (const sign of [1, -1]) {
        const r = root + (sign * totalDeg) / 180;
        if (r <= 0) continue;
        const price = r * r;
        levels.push({
          degree,
          price,
          distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
          rotation: sign * rot,
          role: levelRole(currentPrice, price),
        });
      }
    }
  }

  // Dedupe (degree 0 rotation 0 appears twice) and sort by proximity
  const seen = new Set<string>();
  return levels
    .filter((l) => {
      const key = l.price.toFixed(4);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest Square-of-9 level within `proximityPct` of current price, if any. */
export function nearestS9Level(levels: S9Level[], proximityPct = 1.0): S9Level | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}

/**
 * Square-of-9 levels anchored on the most recent significant high AND the
 * most recent significant low, merged and sorted by proximity — the same
 * "anchor from the two most recent pivots" rule `computeFanLines` already
 * uses, applied here instead of the previous single all-window low.
 *
 * That previous anchor (`Math.min` of the whole daily window) spirals from
 * whichever bar printed the lowest low over the lookback, no matter how long
 * ago or how irrelevant to the move actually in progress — a stale anchor
 * unrelated to current structure, not a role-blindness bug. Anchoring from
 * both recent extremes instead means a bearish setup gets a spiral seeded
 * from a recent high, not one built to describe an old low.
 */
export function recentSquareOf9Levels(
  bars: Bar[],
  currentPrice: number,
  rotations = 8,
): S9Level[] {
  if (bars.length < 20) return [];

  const pivots = findPivots(bars, 4);
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");

  const seen = new Set<string>();
  const levels: S9Level[] = [];
  for (const anchor of [lastLow, lastHigh]) {
    if (!anchor) continue;
    for (const level of squareOf9Levels(anchor.price, currentPrice, rotations)) {
      const key = level.price.toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);
      levels.push(level);
    }
  }

  return levels.sort((a, b) => a.distancePct - b.distancePct);
}
