/**
 * Gann's 36-angle month-counts (PRIVATE-GANN — Chapter 7, "Master Time
 * Factor and Forecasting by Mathematical Rules," `docs/GANN_HISTORICAL_SOURCES.md`
 * A2.1, second extraction pass 2026-09-16). Internal/research use only — see
 * that module-level rule enforced by every export here: **never** import
 * this into `lib/signals/confluence/gann.ts` / `GannConfluenceResult` /
 * `components/scan/confluence-card.tsx` or any `app/api/*` route a logged-in
 * user's scan request reaches.
 *
 * The chapter divides the 360° circle into 1/32 steps (11.25°, 22.5°,
 * 33.75°, 45°, ... 360°) and reads each division as a *month*-count
 * projected forward from a major swing high or low — the same
 * "elapsed-count-from-a-swing-extreme" idea `lib/gann/timeCycles.ts` already
 * implements with fixed day counts, generalized here to Gann's own disclosed
 * angle-derived month grid. (The source's own section heading calls these
 * "36 geometric angles," but its worked list is the 32-way division of
 * 360°; that mismatch is in the transcription itself, not introduced here —
 * see `ALL_DIVISIONS_DEG` below, which reproduces the disclosed numeric list
 * exactly rather than forcing a count of 36.)
 *
 * Twelve of these are separately named "very important": 45, 60, 90, 120,
 * 135, 180, 225, 240, 270, 300, 315, 360. Four of those (60, 120, 240, 300)
 * are *not* on the 11.25°-step grid — they are Gann's own additional named
 * angles (thirds/sixths of the circle), so `STARRED_ANGLES_DEG` is unioned
 * into the division table rather than filtered from it.
 *
 * The chapter's own worked illustration is a real 1896-1935 DJIA case
 * study, month-counted from multiple historical anchors at once — e.g. the
 * November 1907 low read as "135 months from 1896 bottom, 127 months from
 * 1897 low," and September 1929's top read as "240 months from 1909 top."
 * `monthsElapsed` below is the exact calendar-month arithmetic that produces
 * those two round numbers; see `__tests__/angleMonthCounts.test.ts`.
 *
 * Confluence/display only, same treatment as `timeCycles.ts`: no bull/bear
 * polarity is attached (the source states this as a pure elapsed-count
 * timing rule, not a directional one), and it is never independently scored
 * or gated in `lib/scoring/`.
 */

import type { Bar } from "@/lib/types";
import { majorPivots } from "@/lib/analysis/pivots";
import { findPivots } from "@/lib/analysis/pivots";

/** The 1/32 division of 360° in 11.25° steps, exactly as disclosed. */
const GRID_STEP_DEG = 11.25;
const GRID_DIVISIONS = 32;

/** Gann's own "very important" starred angles — not all are on the 11.25° grid. */
export const STARRED_ANGLES_DEG = [45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315, 360];

export interface AngleMonthCount {
  degrees: number;
  months: number; // 1 degree read as 1 month elapsed
  starred: boolean;
}

/** Union of the 32-way grid and the starred extras, sorted, deduped, degrees == months. */
export const ANGLE_MONTH_COUNTS: AngleMonthCount[] = (() => {
  const values = new Set<number>();
  for (let n = 1; n <= GRID_DIVISIONS; n++) values.add(Math.round(n * GRID_STEP_DEG * 100) / 100);
  for (const deg of STARRED_ANGLES_DEG) values.add(deg);

  return Array.from(values)
    .sort((a, b) => a - b)
    .map((degrees) => ({
      degrees,
      // 1 degree read as 1 month directly (the source's own stated convention).
      months: degrees,
      starred: STARRED_ANGLES_DEG.includes(degrees),
    }));
})();

/** Only the "very important" subset — the default projection set (mirrors the source's own emphasis). */
export const STARRED_MONTH_COUNTS = ANGLE_MONTH_COUNTS.filter((a) => a.starred);

/**
 * Calendar-month difference between two dates, ignoring day-of-month — the
 * arithmetic the chapter's own DJIA case study uses (e.g. August 1896 to
 * November 1907 is exactly 135 months).
 */
export function monthsElapsed(anchor: Date, target: Date): number {
  return (
    (target.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (target.getUTCMonth() - anchor.getUTCMonth())
  );
}

export interface AngleMonthCountResult {
  /** Any starred window is active — for display, not scoring. */
  active: boolean;
  dates: string[]; // upcoming dates of interest (ISO date strings)
}

/**
 * Projects the starred month-counts forward from major swing pivots — same
 * "top-quartile prominence, not merely recent" anchor rule
 * `lib/gann/timeCycles.ts` uses via `majorPivots()`. Only the starred subset
 * is projected by default; pass `includeUnstarred` to widen it for research.
 */
export function angleMonthCounts(
  dailyBars: Bar[],
  asOf: Date = new Date(),
  windowDays = 2,
  includeUnstarred = false,
): AngleMonthCountResult {
  if (dailyBars.length < 30) return { active: false, dates: [] };

  const pivots = findPivots(dailyBars, 5);
  const anchors = majorPivots(pivots).slice(-12);
  const table = includeUnstarred ? ANGLE_MONTH_COUNTS : STARRED_MONTH_COUNTS;

  const dates: Date[] = [];
  for (const anchor of anchors) {
    const anchorDate = new Date(anchor.bar.t);
    for (const { months } of table) {
      const projected = new Date(anchorDate);
      projected.setUTCMonth(projected.getUTCMonth() + months);
      dates.push(projected);
    }
  }

  const dayMs = 24 * 3600 * 1000;
  const nearby = dates.filter((d) => Math.abs(d.getTime() - asOf.getTime()) <= windowDays * dayMs);
  const upcoming = dates
    .filter((d) => d.getTime() >= asOf.getTime() && d.getTime() <= asOf.getTime() + 30 * dayMs)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 5)
    .map((d) => d.toISOString().slice(0, 10));

  return { active: nearby.length > 0, dates: upcoming };
}
