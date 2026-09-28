/**
 * The pre-registered calendar test from `docs/memory-bank/F4_CYCLES_CALENDAR_RESEARCH.md`
 * Part 3, run by project-owner approval (2026-09-28). Research only: nothing
 * here feeds a verdict.
 *
 * Question: do Gann's dated windows (W1, the eight permanent-cycle windows;
 * W3, the 1940 forecast's windows projected by their place in the year) catch
 * market turning points more often than windows of the same shape placed at
 * random in the year, and does that depend on counting the year from Jan 1
 * (Y1), from the spring equinox (Y2), or as a 364-day 13×28 year (Y3)?
 *
 * Fixed before any data is read (see the research doc; deviations are stated
 * in the run notes, not made here):
 * - Turns are completed pivots of Gann's weekly swing chart on daily bars.
 * - A window catches a turn if a pivot falls inside it extended by ±2 trading
 *   days.
 * - The statistic is the share of window instances that catch at least one
 *   turn.
 * - The base rate is exact: every circular shift (1–364 days) of the whole
 *   window set within the year; p = (shifts scoring ≥ observed + 1) / 365.
 * - Holm–Bonferroni across every (window set × convention × series) test.
 *
 * Three-question basis: Gann (Tier A windows and forecasts); Dewey criteria
 * 3, 6, 7 and 10 and his recurrent-event statistics (C05, C06); Hermetic
 * Rhythm (whether the year's returning points carry the turns).
 */

export interface DatedWindow {
  label: string;
  /** Start and end as month (1-12) and day, in the anchor year. */
  start: [number, number];
  end: [number, number];
}

/** W1: the permanent cycle (Wall Street Stock Selector, 1930). */
export const W1: readonly DatedWindow[] = [
  { label: "Feb 8-10", start: [2, 8], end: [2, 10] },
  { label: "Mar 21-23", start: [3, 21], end: [3, 23] },
  { label: "May 3-7", start: [5, 3], end: [5, 7] },
  { label: "Jun 20-24", start: [6, 20], end: [6, 24] },
  { label: "Aug 3-8", start: [8, 3], end: [8, 8] },
  { label: "Sep 21-24", start: [9, 21], end: [9, 24] },
  { label: "Nov 8-11", start: [11, 8], end: [11, 11] },
  { label: "Dec 20-24", start: [12, 20], end: [12, 24] },
];
export const W1_ANCHOR_YEAR = 1929;

/** W3: the 1940 forecast's dated windows (Face Facts America!, A07), by place in the year. */
export const W3: readonly DatedWindow[] = [
  { label: "May 25", start: [5, 25], end: [5, 25] },
  { label: "Jul 10-Aug 10", start: [7, 10], end: [8, 10] },
  { label: "Sep 1", start: [9, 1], end: [9, 1] },
  { label: "Oct 1-Nov 30", start: [10, 1], end: [11, 30] },
  { label: "Nov 1-11", start: [11, 1], end: [11, 11] },
  { label: "Feb 8-15", start: [2, 8], end: [2, 15] },
  { label: "Mar 1-10", start: [3, 1], end: [3, 10] },
  { label: "May 1-25", start: [5, 1], end: [5, 25] },
];
export const W3_ANCHOR_YEAR = 1940;

export type Convention = "calendar" | "solar" | "364";
export const CONVENTIONS: readonly Convention[] = ["calendar", "solar", "364"];

const DAY_MS = 86_400_000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/**
 * The March equinox (UTC ms), Meeus' mean-equinox polynomial for 1000–3000
 * (Astronomical Algorithms, ch. 27). Within minutes of the true instant, which
 * is far inside the ±2-day tolerance.
 */
export function marchEquinox(year: number): number {
  const Y = (year - 2000) / 1000;
  const jde = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y ** 3 - 0.00057 * Y ** 4;
  return (jde - 2440587.5) * DAY_MS;
}

/** Day-level instances [startMs, endMs] of a window set in one year, under a convention. */
export function windowInstances(
  set: readonly DatedWindow[],
  anchorYear: number,
  year: number,
  convention: Convention,
  shiftDays = 0,
): [number, number][] {
  return set.map((w) => {
    const len = (utc(anchorYear, w.end[0], w.end[1]) - utc(anchorYear, w.start[0], w.start[1])) / DAY_MS;
    let startMs: number;
    if (convention === "calendar") {
      startMs = utc(year, w.start[0], w.start[1]);
    } else if (convention === "solar") {
      const offset = utc(anchorYear, w.start[0], w.start[1]) - Math.floor(marchEquinox(anchorYear) / DAY_MS) * DAY_MS;
      startMs = Math.floor(marchEquinox(year) / DAY_MS) * DAY_MS + offset;
    } else {
      startMs = utc(anchorYear, w.start[0], w.start[1]) + (year - anchorYear) * 364 * DAY_MS;
      // Keep the instance inside the target year's span by whole 364-day steps
      // back or forward, so every year contributes the same number of windows.
      while (startMs < utc(year, 1, 1)) startMs += 364 * DAY_MS;
      while (startMs >= utc(year + 1, 1, 1)) startMs -= 364 * DAY_MS;
    }
    startMs += shiftDays * DAY_MS;
    return [startMs, startMs + len * DAY_MS];
  });
}

/**
 * Whether a window [start, end] catches a pivot: some pivot's session index
 * lies within the window's session span extended by `tol` sessions.
 */
export function catches(sessions: number[], pivotSessionIdx: Set<number>, window: [number, number], tol = 2): boolean {
  // First session on/after start, last session on/before end.
  let lo = sessions.findIndex((t) => t >= window[0]);
  if (lo === -1) return false;
  let hi = lo;
  while (hi + 1 < sessions.length && sessions[hi + 1] <= window[1]) hi++;
  if (sessions[lo] > window[1]) hi = lo - 1; // window falls between sessions
  const from = Math.max(0, Math.min(lo, hi + 1) - tol);
  const to = Math.min(sessions.length - 1, Math.max(hi, lo - 1) + tol);
  for (let i = from; i <= to; i++) if (pivotSessionIdx.has(i)) return true;
  return false;
}

export interface SeriesInput {
  /** Session dates as UTC-midnight ms, ascending. */
  sessions: number[];
  /** Indices into `sessions` of completed weekly-swing-chart pivots. */
  pivots: number[];
}

export interface CellResult {
  set: "W1" | "W3";
  convention: Convention;
  series: string;
  years: [number, number];
  instances: number;
  hits: number;
  hitRate: number;
  baseMean: number;
  p: number;
  holmSignificant?: boolean;
}

export function scoreCell(
  series: string,
  input: SeriesInput,
  setName: "W1" | "W3",
  convention: Convention,
): CellResult {
  const set = setName === "W1" ? W1 : W3;
  const anchor = setName === "W1" ? W1_ANCHOR_YEAR : W3_ANCHOR_YEAR;
  const firstYear = new Date(input.sessions[0]).getUTCFullYear() + 1; // whole years only
  const lastYear = new Date(input.sessions[input.sessions.length - 1]).getUTCFullYear() - 1;
  const pivotSet = new Set(input.pivots);
  const rateAt = (shift: number) => {
    let n = 0;
    let h = 0;
    for (let y = firstYear; y <= lastYear; y++) {
      for (const w of windowInstances(set, anchor, y, convention, shift)) {
        n++;
        if (catches(input.sessions, pivotSet, w)) h++;
      }
    }
    return { n, h };
  };
  const obs = rateAt(0);
  const observed = obs.n > 0 ? obs.h / obs.n : 0;
  let atLeast = 0;
  let sum = 0;
  for (let s = 1; s <= 364; s++) {
    const r = rateAt(s);
    const rate = r.n > 0 ? r.h / r.n : 0;
    sum += rate;
    if (rate >= observed) atLeast++;
  }
  return {
    set: setName,
    convention,
    series,
    years: [firstYear, lastYear],
    instances: obs.n,
    hits: obs.h,
    hitRate: observed,
    baseMean: sum / 364,
    p: (atLeast + 1) / 365,
  };
}

/** Holm–Bonferroni at family-wise alpha. Mutates and returns the results. */
export function holm(results: CellResult[], alpha = 0.05): CellResult[] {
  const order = [...results].sort((a, b) => a.p - b.p);
  let stop = false;
  order.forEach((r, i) => {
    if (stop) {
      r.holmSignificant = false;
      return;
    }
    const ok = r.p <= alpha / (order.length - i);
    r.holmSignificant = ok;
    if (!ok) stop = true;
  });
  return results;
}
