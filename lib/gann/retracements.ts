/**
 * Percentage retracement zones.
 *
 * Gann's percentage retracement rule: a swing's most significant retracement
 * levels are eighths and thirds of its range (3/8, 1/2, 5/8 most heavily
 * weighted) — distinct from, and older than, the Square-of-9 and angle work
 * already in this codebase (`lib/gann/squareOf9.ts`, `lib/gann/
 * normalizedSlope.ts`). The one genuine implementation gap named in
 * `docs/PROPOSAL_NEW_GANN_CRITERIA.md` — nothing before this computed a
 * retracement level.
 *
 * Anchored off the most recent significant high AND low, the same "two most
 * recent pivots" rule `lib/gann/fans.ts` and `lib/gann/squareOf9.ts` already
 * use, for consistency across all the structural-coordinate modules rather
 * than because retracement theory classically requires it.
 *
 * Candidate criterion support only (see
 * `docs/PROPOSAL_NEW_GANN_CRITERIA.md`) — not wired into any scored
 * criterion yet.
 */

import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";
import { findPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";

export interface RetracementLevel {
  label: string;
  fraction: number;
  price: number;
  distancePct: number;
  role: LevelRole;
}

/** Eighths and thirds — the fractions Gann's rule weights most heavily. */
const FRACTIONS: { label: string; fraction: number }[] = [
  { label: "1/8", fraction: 1 / 8 },
  { label: "1/4", fraction: 1 / 4 },
  { label: "1/3", fraction: 1 / 3 },
  { label: "3/8", fraction: 3 / 8 },
  { label: "1/2", fraction: 1 / 2 },
  { label: "5/8", fraction: 5 / 8 },
  { label: "2/3", fraction: 2 / 3 },
  { label: "3/4", fraction: 3 / 4 },
  { label: "7/8", fraction: 7 / 8 },
];

/**
 * Retracement levels of the most recent significant high-low swing, sorted
 * by proximity to `currentPrice`. Empty when there's insufficient history or
 * no swing (either pivot missing, or a zero-range high/low pair).
 */
export function retracementLevels(bars: Bar[], currentPrice: number): RetracementLevel[] {
  if (bars.length < 20) return [];

  const pivots = findPivots(bars, 4);
  const reversed = [...pivots].reverse();
  const lastHigh = reversed.find((p) => p.kind === "high");
  const lastLow = reversed.find((p) => p.kind === "low");
  if (!lastHigh || !lastLow) return [];

  const hi = Math.max(lastHigh.price, lastLow.price);
  const lo = Math.min(lastHigh.price, lastLow.price);
  const range = hi - lo;
  if (!(range > 0) || !(currentPrice > 0)) return [];

  return FRACTIONS.map(({ label, fraction }) => {
    const price = hi - range * fraction;
    return {
      label,
      fraction,
      price,
      distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
      role: levelRole(currentPrice, price),
    };
  }).sort((a, b) => a.distancePct - b.distancePct);
}
