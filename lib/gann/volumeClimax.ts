/**
 * Volume climax at the anchor pivot.
 *
 * Gann held that a genuine turning point prints on climax volume, not a
 * quiet one — a swing low made on unusually heavy volume argues for real
 * accumulation there, not just an ordinary lull. This reads
 * `lib/signals/indicators.ts`'s `relativeVolume()` off the bars *ending at*
 * the anchor bar, so its "latest bar" is the pivot itself and the trailing
 * lookback it compares against is whatever came before that pivot — not the
 * scan's current bar. Reuses the same `>1.5x` threshold
 * `lib/signals/regime.ts` already validated for "unusual volume" there
 * (`acceptedBreakout`), rather than re-deriving a new ratio and cutoff, per
 * AGENTS.md's cross-platform consistency principle.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and the dual-anchor
 * convention `computeAngleSlopes`/`computeTimePriceSquare` already use (a
 * low anchor for the bullish reading, a high anchor for the bearish one).
 */

import { findPivots } from "@/lib/analysis/pivots";
import { relativeVolume } from "@/lib/signals/indicators";
import type { Bar } from "@/lib/types";

/** Same "unusual volume" cutoff `lib/signals/regime.ts` already validated. */
export const VOLUME_CLIMAX_THRESHOLD = 1.5;

export interface VolumeClimaxReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  relativeVolume: number;
  climax: boolean;
}

export function computeVolumeClimax(bars: Bar[], lookback = 20): VolumeClimaxReading[] {
  const pivots = findPivots(bars, 4);
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");

  const readings: VolumeClimaxReading[] = [];
  for (const anchor of [lastLow, lastHigh]) {
    if (!anchor) continue;
    const rvol = relativeVolume(bars.slice(0, anchor.index + 1), lookback);
    if (rvol === null) continue;
    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      relativeVolume: rvol,
      climax: rvol > VOLUME_CLIMAX_THRESHOLD,
    });
  }
  return readings;
}
