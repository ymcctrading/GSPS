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
 *
 * **Second anchor, added 2026-10-16 (M-T10): where the run began.** Gann
 * counts the 6-7 weeks from the start of the move, not from a volume climax:
 * "rapid moves culminate in the 6th or 7th week" (*Wall Street Stock
 * Selector* Ch. IV, pp. 41-59, the weekly time rule); "the final fast
 * advance lasts 6-7 weeks, sometimes 10" (Ch. V); "most moves run out in 6-7
 * weeks" (Master Course Ch. 2 PDF 52, 1931); and "the last weeks of a run are
 * 6-7 weeks of a big advance" (*Commodities* p. 61). `computeRunBoilingPoint`
 * counts from the weekly swing chart's last swing bottom (for a run up) or
 * top (for a run down), Gann's own chart construction (`swingChart.ts`); the
 * climax anchor above is kept beside it, unchanged. Which pivot counts as
 * "where the run began" is our reading, labelled as such. Context only: it
 * reaches the replay and the live scan through `readDisclosedRules`
 * (`timeCounts.ts`), and feeds no score, gate, plan or order.
 */

import type { Bar } from "@/lib/types";
import type { VolumeClimaxReading } from "./volumeClimax";
import { WEEKLY_SWING_CHART, walkSwingChart } from "./swingChart";

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
export interface RunBoilingPointReading {
  /** The run's direction from its starting pivot. */
  run: "up" | "down";
  /** The pivot the run started from: a low for a run up, a high for a run down. */
  anchorKind: "high" | "low";
  /** YYYY-MM-DD of the starting pivot. */
  startDate: string;
  weeksSinceStart: number;
  phase: BoilingPointPhase;
}

/**
 * Weeks since the current run began (M-T10): from the weekly swing chart's
 * last swing extreme to the last bar. Null before the chart has a swing.
 */
export function computeRunBoilingPoint(bars: Bar[]): RunBoilingPointReading | null {
  if (bars.length === 0) return null;
  const pivots = walkSwingChart(bars, WEEKLY_SWING_CHART).pivots;
  const start = pivots[pivots.length - 1];
  if (!start) return null;
  const weeks = Math.max(0, (new Date(bars[bars.length - 1].t).getTime() - new Date(bars[start.index].t).getTime()) / WEEK_MS);
  return {
    run: start.kind === "bottom" ? "up" : "down",
    anchorKind: start.kind === "bottom" ? "low" : "high",
    startDate: bars[start.index].t.slice(0, 10),
    weeksSinceStart: Math.round(weeks * 10) / 10,
    phase: classify(weeks),
  };
}

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
