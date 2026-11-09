/**
 * Gann's 36-angle month-counts (PRIVATE-GANN — Chapter 7, "Master Time
 * Factor and Forecasting by Mathematical Rules," `docs/GANN_HISTORICAL_SOURCES.md`
 * A2.1, second extraction pass 2026-09-16).
 *
 * **Wired into the live confluence layer 2026-09-16** (`lib/signals/confluence/gann.ts`'s
 * `GannConfluenceResult.angleMonthCounts`), correcting an earlier "internal/
 * research use only, never wire into the public scan" restriction this
 * header carried. That restriction made sense for `squareOf20.ts`/
 * `hexagonChart.ts`, whose ring/angle output can't be checked against the
 * original hand-drawn charts (lost to this text-only extraction) — a real,
 * documented exception. This module has no such dependency: it is pure
 * calendar-month arithmetic against confirmed swing pivots, the same shape
 * as `timeCycles.ts`'s already-wired 45/90/120/180/270/360-day wheel. Per
 * AGENTS.md's cross-platform-consistency rule, leaving it stranded once
 * built was itself the violation. Confluence/display only, same treatment
 * as `timeCycles.ts`: no bull/bear polarity, never independently scored or
 * gated in `lib/scoring/`.
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
 * exactly rather than forcing a count of 36. Review B, 2026-10-16, M-T16:
 * the gap stands. This builds the 32-way division plus the four starred
 * thirds and sixths, not 36 counts; the 36 are not recoverable from the
 * source as read. Re-recorded 2026-10-17 with the M-T16 build: the source
 * names 36 angles but lists only the 32-way grid. `ANGLE_MONTH_COUNTS` holds
 * 36 values (32 grid steps of 11.25 degrees, plus 60, 120, 240 and 300, which
 * fall off the grid), but that union is GSPS's reconstruction: nothing in the
 * source confirms these are Gann's 36. Only the 32 grid counts are as listed.)
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
 */

import type { Bar } from "@/lib/types";
import { majorPivots } from "@/lib/analysis/pivots";
import { findPivots } from "@/lib/analysis/pivots";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

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

// ---------------------------------------------------------------------------
// Month counts from every prior pivot (A-TIME-05, W006 p.15; A-TIME-21, W046
// p.2). Gann counts the months from each major top and bottom to the month in
// hand: from the 1932 low, the February 1933 low and the 1933 top to 1936
// (42, 37, 36 and 48 months), and from four prior pivots to the 19 March 1954
// coffee high (9, 2, 6 and 5 months). The count is the calendar-month
// difference `monthsElapsed` already takes. Context only: a list of periods to
// watch, shown on the setup and measured, never gating.
//
// Three-question basis. Gann: the two texts above, class A. Cycles: a count is
// a recurrence claim only once it repeats; this lists the counts and makes no
// claim (Dewey's checklist is not run). Hermetic: Rhythm, each pivot setting a
// clock that runs to the present.

/**
 * Gann's month steps to watch from a top or bottom, 18 to 48 months in sixes
 * (How to Make Profits in Commodities p.58, per the item 7 map; W006 p.15's
 * 36, 42 and 48 are among them). Used only to mark a count, not to gate.
 */
export const WATCHED_MONTH_COUNTS: readonly number[] = [18, 24, 30, 36, 42, 48];

export interface PivotMonthCount {
  /** The pivot's month (YYYY-MM). */
  pivotMonth: string;
  kind: "high" | "low";
  price: number;
  /** Calendar months from the pivot's month to the turn's. */
  months: number;
  /** The count is one of `WATCHED_MONTH_COUNTS`. */
  watched: boolean;
}

/** Months from each pivot before the turn's month to the turn, most recent pivot first. */
export function monthCountsToTurn(
  pivots: { t: string; kind: "high" | "low"; price: number }[],
  turn: Date,
): PivotMonthCount[] {
  return pivots
    .map((p) => {
      const months = monthsElapsed(new Date(p.t), turn);
      return { pivotMonth: p.t.slice(0, 7), kind: p.kind, price: p.price, months, watched: WATCHED_MONTH_COUNTS.includes(months) };
    })
    .filter((c) => c.months > 0)
    .sort((a, b) => a.months - b.months);
}

/**
 * The counts from the monthly chart's major pivots (the anchors
 * `secondaryTime`'s month counts use) to `asOf`'s month. Null with under two
 * years of monthly bars.
 */
export function readMonthCounts(monthly: Bar[], asOf: Date, limit = 8): PivotMonthCount[] | null {
  if (monthly.length < 24) return null;
  const anchors = majorPivots(findPivots(monthly, 3)).map((p) => ({ t: p.bar.t, kind: p.kind, price: p.price }));
  return monthCountsToTurn(anchors, asOf).slice(0, limit);
}

/**
 * The counts from the weekly swing chart's tops and bottoms, dated to the day,
 * to `asOf`'s month (A-TIME-21, W046 p.2). The coffee letter counts from
 * swings two months back and from a low and a high a month apart, which the
 * major monthly pivots `readMonthCounts` reads can never show (item 7e review
 * M3). The weekly chart is the engineering choice of which swings to count:
 * the letter dates its pivots to the day but names no chart. Null with under
 * twenty sessions.
 */
export function readSwingMonthCounts(daily: Bar[], asOf: Date, limit = 8): PivotMonthCount[] | null {
  if (daily.length < 20) return null;
  const pivots = walkSwingChart(daily, WEEKLY_SWING_CHART).pivots.map((p) => ({
    t: daily[p.index].t,
    kind: p.kind === "top" ? ("high" as const) : ("low" as const),
    price: p.price,
  }));
  return monthCountsToTurn(pivots, asOf).slice(0, limit);
}
