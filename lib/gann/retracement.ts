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
}

/** Gann's eighths — the classic percentage-retracement set. */
const FRACTIONS: { fraction: number; label: string }[] = [
  { fraction: 0.125, label: "1/8" },
  { fraction: 0.25, label: "1/4" },
  { fraction: 0.375, label: "3/8" },
  { fraction: 0.5, label: "1/2" },
  { fraction: 0.625, label: "5/8" },
  { fraction: 0.75, label: "3/4" },
  { fraction: 0.875, label: "7/8" },
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

  return FRACTIONS.map(({ fraction, label }) => {
    const price = swingUp ? lastHigh.price - range * fraction : lastLow.price + range * fraction;
    return {
      fraction,
      label,
      price,
      distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
      role: levelRole(currentPrice, price),
    };
  }).sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest retracement level within `proximityPct` of current price, if any. */
export function nearestRetracementLevel(
  levels: RetracementLevel[],
  proximityPct = 1.5,
): RetracementLevel | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}
