/**
 * Gann percentage retracement zones.
 *
 * Gann's own retracement method divides a swing into eighths (1/8 … 7/8) —
 * distinct from Fibonacci's golden-ratio levels, which this codebase does
 * not otherwise use anywhere. The zone is measured off the two most recent
 * significant pivots (the same "anchor from the two most recent pivots"
 * convention `computeFanLines`/`recentSquareOf9Levels` already use): a
 * low-then-high swing retraces down from the high, a high-then-low swing
 * retraces up from the low.
 */

import type { Bar } from "@/lib/types";
import { findPivots } from "@/lib/analysis/pivots";
import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

export interface RetracementLevel {
  fraction: number;
  label: string;
  price: number;
  distancePct: number;
  role: LevelRole;
  /**
   * The rank of the division, lower is more important (M-P1; owner
   * 2026-10-16: Ch. 6 tiers). Master Course Ch. 6, "Natural Resistance
   * Levels" (PDF 185): on a basis of 100, first ¼, ½ and ¾; then ⅓ and ⅔;
   * then the ⅛ and 1/16 points. Every source flags 50% as the most
   * important, so ½ alone is 1; ¼, ¾ and the full range (the basis itself,
   * the range's own top or bottom) are 2; ⅓ and ⅔ are 3; the eighths and
   * sixteenths are 4. Until 2026-10-16 it ranked ½, full, ¼, ⅛, 1/16, then
   * thirds (Ch. 9/COM), and left 3/8 and 5/8 unranked; Ch. 6 counts every
   * eighth point, so they now take rank 4. Typed as possibly null for
   * readers of older stored readings; every current level has a rank.
   */
  importance: number | null;
}

/** The most important division, 50%. */
export const HALF_RANK = 1;
/** Ch. 6's first tier: ¼, ½, ¾ and the full range. */
export const FIRST_TIER_RANK = 2;
/** Ch. 6's second tier: ⅓ and ⅔. */
export const SECOND_TIER_RANK = 3;
/** Ch. 6's third tier: the ⅛ and 1/16 points. */
export const THIRD_TIER_RANK = 4;
/** The highest rank `importance` takes, for "rank N of 4" copy. */
export const LOWEST_RANK = THIRD_TIER_RANK;

/**
 * Gann's divisions of a range (owner 2026-10-16: Ch. 6 tiers; see
 * `RetracementLevel.importance`): the eighths, the thirds, the two outer
 * sixteenths and the full range.
 */
const FRACTIONS: { fraction: number; label: string; importance: number }[] = [
  { fraction: 1 / 16, label: "1/16", importance: THIRD_TIER_RANK },
  { fraction: 0.125, label: "1/8", importance: THIRD_TIER_RANK },
  { fraction: 0.25, label: "1/4", importance: FIRST_TIER_RANK },
  { fraction: 1 / 3, label: "1/3", importance: SECOND_TIER_RANK },
  { fraction: 0.375, label: "3/8", importance: THIRD_TIER_RANK },
  { fraction: 0.5, label: "1/2", importance: HALF_RANK },
  { fraction: 0.625, label: "5/8", importance: THIRD_TIER_RANK },
  { fraction: 2 / 3, label: "2/3", importance: SECOND_TIER_RANK },
  { fraction: 0.75, label: "3/4", importance: FIRST_TIER_RANK },
  { fraction: 0.875, label: "7/8", importance: THIRD_TIER_RANK },
  { fraction: 15 / 16, label: "15/16", importance: THIRD_TIER_RANK },
  { fraction: 1, label: "1/1 (full retracement)", importance: FIRST_TIER_RANK },
];

/** Ch. 6's first tier (½, ¼, ¾ and the full range): the levels a pullback is approved at. */
export function isFirstTierRetracement(level: Pick<RetracementLevel, "importance">): boolean {
  return level.importance !== null && level.importance <= FIRST_TIER_RANK;
}

export function computeRetracementLevels(bars: Bar[], currentPrice: number): RetracementLevel[] {
  if (bars.length < 20) return [];

  const pivots = findPivots(bars, 4);
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");
  if (!lastHigh || !lastLow) return [];

  // Low printed before the high: an up-swing, retracing down off the high.
  // High printed before the low: a down-swing, retracing up off the low.
  const swingUp = lastLow.index < lastHigh.index;
  const range = Math.abs(lastHigh.price - lastLow.price);
  if (range <= 0) return [];

  return FRACTIONS.map(({ fraction, label, importance }) => {
    const price = swingUp ? lastHigh.price - range * fraction : lastLow.price + range * fraction;
    return {
      fraction,
      label,
      price,
      distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
      role: levelRole(currentPrice, price),
      importance,
    };
  }).sort((a, b) => {
    // Break near-ties in distance by Ch. 6's ranking (lower number = more
    // important) rather than an arbitrary array-order tiebreak.
    const distDiff = a.distancePct - b.distancePct;
    if (Math.abs(distDiff) > 1e-9) return distDiff;
    const aRank = a.importance ?? Infinity;
    const bRank = b.importance ?? Infinity;
    return aRank - bRank;
  });
}

/** Nearest retracement level within `proximityPct` of current price, if any. */
export function nearestRetracementLevel(
  levels: RetracementLevel[],
  proximityPct = 1.5,
): RetracementLevel | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}

/**
 * The halfway point of a range: midway between its highest high and lowest
 * low. Gann ranks 50% first among the divisions of a range (Master Course
 * Ch. 6 and every other source; see `RetracementLevel.importance`), and
 * the halfway point of a range's extremes is the balance point his method
 * reads a market against.
 *
 * It replaced the 20- and 50-bar closing-price means in `lib/marketScan.ts`'s
 * coarse gates on 2026-09-26. Those were simple moving averages under another
 * name (alignment audit F2.5, extended). "How far price has stretched from its
 * balance point" is the same question, measured from Gann's balance point
 * instead of an average.
 *
 * Returns null for an empty or zero range, rather than a number that would
 * divide into a meaningless percentage.
 */
export function rangeMidpoint(bars: Bar[]): number | null {
  if (bars.length === 0) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
  }
  if (!(high > low)) return null;
  return (high + low) / 2;
}
