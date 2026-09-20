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
   * Gann's own importance ranking of retracement fractions — a sharper
   * hierarchy than treating every eighth as equal weight: 50% (most
   * important) > 100% > 25% > 12.5% > 6.25% (extremes only) > 33⅓%/66⅔%
   * (`docs/GANN_HISTORICAL_SOURCES.md`). Lower number = more important; 1
   * is 50%. `null` for fractions Gann's disclosed ranking doesn't name
   * (3/8, 5/8, 7/8 — "the other eighths") rather than guessing a rank for
   * them.
   */
  importance: number | null;
}

/**
 * Gann's eighths plus the sixteenths/thirds/full-retracement his own
 * importance ranking names (see `RetracementLevel.importance`'s doc
 * comment) — extended from the original eighths-only table so every
 * fraction his ranking cites actually exists here to rank.
 */
const FRACTIONS: { fraction: number; label: string; importance: number | null }[] = [
  { fraction: 1 / 16, label: "1/16", importance: 5 },
  { fraction: 0.125, label: "1/8", importance: 4 },
  { fraction: 0.25, label: "1/4", importance: 3 },
  { fraction: 1 / 3, label: "1/3", importance: 6 },
  { fraction: 0.375, label: "3/8", importance: null },
  { fraction: 0.5, label: "1/2", importance: 1 },
  { fraction: 0.625, label: "5/8", importance: null },
  { fraction: 2 / 3, label: "2/3", importance: 6 },
  { fraction: 0.75, label: "3/4", importance: 3 },
  { fraction: 0.875, label: "7/8", importance: 4 },
  { fraction: 15 / 16, label: "15/16", importance: 5 },
  { fraction: 1, label: "1/1 (full retracement)", importance: 2 },
];

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
    // Break near-ties in distance by Gann's importance ranking (lower
    // number = more important; null — an unranked "other eighth" — sorts
    // last) rather than an arbitrary array-order tiebreak.
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
