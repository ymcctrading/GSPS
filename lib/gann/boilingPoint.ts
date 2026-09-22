/**
 * "Boiling point" blow-off duration heuristic.
 *
 * *Wall Street Stock Selector* (1930), Tier A public book
 * (`docs/GANN_HISTORICAL_SOURCES.md` A4): a final blow-off advance or
 * decline in an active stock typically exhausts in 6-7 weeks, and rarely
 * runs past 10 — distinct from the multi-year "time square" bands already
 * implemented elsewhere in this codebase. Confirmed absent before this (a
 * full repo audit found no `boilingPoint`/`blowOff` logic anywhere).
 *
 * Measures elapsed calendar time from a detected volume-climax anchor
 * (`lib/gann/volumeClimax.ts`) rather than introducing a new anchor —
 * `VolumeClimaxReading.anchorIndex` already names the climax pivot this
 * duration is measured from.
 *
 * Confluence/context only, same evidence-gating discipline as this
 * session's other additions: never independently scored or gated in
 * `lib/scoring/score.ts`.
 */

import type { Bar } from "@/lib/types";
import type { VolumeClimaxReading } from "./volumeClimax";

/** The classic disclosed exhaustion window, in weeks. */
export const CLASSIC_MIN_WEEKS = 6;
export const CLASSIC_MAX_WEEKS = 7;
/** Beyond this, Gann's own text calls the move rare/unusual, not just "late." */
export const OVERRUN_WEEKS = 10;

export type BoilingPointPhase = "developing" | "classic" | "extended" | "overrun";

export interface BoilingPointReading {
  anchorKind: "high" | "low";
  weeksSinceClimax: number;
  /**
   * `"developing"` (under 6wk — too early to call), `"classic"` (6-7wk —
   * the disclosed exhaustion window), `"extended"` (7-10wk — later than
   * typical but not yet unusual), `"overrun"` (10wk+ — rare per the
   * disclosed pattern).
   */
  phase: BoilingPointPhase;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

function classify(weeks: number): BoilingPointPhase {
  if (weeks < CLASSIC_MIN_WEEKS) return "developing";
  if (weeks <= CLASSIC_MAX_WEEKS) return "classic";
  if (weeks <= OVERRUN_WEEKS) return "extended";
  return "overrun";
}

/**
 * One reading per climax anchor in `climaxReadings` that actually printed a
 * climax (`climax: true`) — non-climax anchors have nothing to measure a
 * blow-off duration from.
 */
export function computeBoilingPoint(bars: Bar[], climaxReadings: VolumeClimaxReading[]): BoilingPointReading[] {
  if (bars.length === 0) return [];
  const asOfMs = new Date(bars[bars.length - 1].t).getTime();

  const readings: BoilingPointReading[] = [];
  for (const reading of climaxReadings) {
    if (!reading.climax) continue;
    const anchorBar = bars[reading.anchorIndex];
    if (!anchorBar) continue;

    const anchorMs = new Date(anchorBar.t).getTime();
    const weeksSinceClimax = Math.max(0, (asOfMs - anchorMs) / WEEK_MS);
    readings.push({
      anchorKind: reading.anchorKind,
      weeksSinceClimax: Math.round(weeksSinceClimax * 10) / 10,
      phase: classify(weeksSinceClimax),
    });
  }
  return readings;
}
