/**
 * Gann's macro/historical-anchor time cycle — the disclosed
 * 60/50/30/20/15/10/7/5/3/2/1-year hierarchy `lib/gann/timeCycles.ts`
 * projects from each symbol's own pivots, run one level up: from Gann's own
 * cited historical market turns, independent of any single stock's chart.
 * Calendar-only, so it reads the same for every symbol on a given date — it
 * is market backdrop, not a per-setup discriminator, which is why it is
 * confluence/context only rather than a scored criterion (a date flag that
 * is identical across every candidate cannot rank one against another; the
 * same reasoning `timeCycles.ts` gives for its fixed annual calendar cycle).
 *
 * **Anchors are Gann's own, taken from one passage.**
 * `docs/GANN_HISTORICAL_SOURCES.md` A2.1 Ch. 7 walks the DJIA from 1896 to
 * 1935 naming elapsed counts at each turn: the November 1907 low at "135
 * months from 1896 bottom, 127 months from 1897 low"; September 1929's top at
 * "240 months from 1909 top." Two anchors are stated with a month (August
 * 1896, November 1907), one with a month by name (September 1929), and two by
 * year only — their months are derived from Gann's own counts rather than
 * guessed: November 1907 − 127 months = April 1897; September 1929 − 240
 * months = September 1909. `lib/gann/angleMonthCounts.ts`'s tests read the
 * 1909 top the same way; keep the two modules agreeing. 1932, 1937 and 1949
 * are deliberately absent: 1932 appears in the same chapter only as a Square
 * of 20 reading (a different construction, research-only per
 * `squareOf20.ts`), and 1937/1949 are not cited as turns in this catalog.
 *
 * **Month granularity, not days.** The anchors are known to the month, so a
 * window is the anniversary *month* — also Gann's own "Anniversary Dates"
 * rule (A9: the month of an extreme is watched every subsequent year). A
 * day-level window around a month-level anchor would claim precision the
 * source does not have.
 *
 * **Cycles recur.** A cycle of N years returns every N years — the 60-year
 * Great Cycle ends "at the end of the third 20-year cycle," and Rules 4/5
 * add 10 years to each successive top or bottom. So an anchor's N-year cycle
 * is active in its anniversary month whenever the elapsed years are a
 * multiple of N. Projecting each length only once would stop every macro
 * window at 1989 (1929 + 60).
 *
 * **Major vs. minor** follows the source's own split: 5 years and up are the
 * named major cycles; 3/2/1 are "minor." The 1-year cycle makes every anchor
 * month active every year, so `active` alone is weak; `majorActive` and the
 * list of converging cycle lengths carry the meaning (audit Finding 3,
 * `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`: several cycles landing together
 * matter more than any one).
 *
 * **Three-question design basis** (AGENTS.md's standing mandate):
 *
 * 1. **Gann source**: A2.1 Ch. 7 (private course, same tier as
 *    `timeCycles.ts`); anniversary-month rule also A9. Differs from
 *    `timeCycles.ts` only in what it anchors from, not how it projects.
 * 2. **Dewey's seven-item checklist, run explicitly**: dominance — untested;
 *    regularity of timing — the anchors are irregularly spaced (~0.7, ~10.5,
 *    ~1.8, ~20 years), which a multi-length hierarchy expects but does not
 *    prove; repetition count — five anchors from one worked example, a small
 *    sample; constancy of period and phase-resumption after distortion — not
 *    testable from five points; wave-shape identity and cross-series
 *    clustering — not evaluated (it reads DJIA anchors only). Clears none of
 *    the seven outright, so it is built like `digitalRoot.ts`/`decadeCycle.ts`:
 *    running, labeled a hypothesis, never gating. `majorCycleYears`
 *    convergence is a count, not a validation.
 * 3. **Hermetic principle**: Correspondence (the cycle arithmetic that governs
 *    one stock's pivots is asserted to govern the market from its own turns)
 *    and Rhythm (a cycle completes and returns — which is exactly what the
 *    recurrence rule above encodes, and what the first version of this module
 *    got wrong by projecting each length once).
 */

import { MAJOR_CYCLE_YEARS } from "./timeCycles";

export interface MacroCycleAnchor {
  /** UTC year and 0-based month; day is not given by the source. */
  year: number;
  month: number;
  kind: "high" | "low";
  label: string;
}

/**
 * Gann's own cited DJIA turns from A2.1 Ch. 7. Extend only from a citable
 * passage in `docs/GANN_HISTORICAL_SOURCES.md`, never from general history.
 */
export const MACRO_CYCLE_ANCHORS: MacroCycleAnchor[] = [
  { year: 1896, month: 7, kind: "low", label: "August 1896 bottom" },
  { year: 1897, month: 3, kind: "low", label: "April 1897 low" },
  { year: 1907, month: 10, kind: "low", label: "November 1907 low" },
  { year: 1909, month: 8, kind: "high", label: "September 1909 top" },
  { year: 1929, month: 8, kind: "high", label: "September 1929 top" },
];

/** The source names 3/2/1-year cycles "minor"; 5 years and up are the major hierarchy. */
export const MIN_MAJOR_CYCLE_YEARS = 5;

export interface MacroCycleWindow {
  anchor: string;
  bullish: boolean;
  /** Anniversary month, "YYYY-MM". */
  month: string;
  yearsElapsed: number;
  /** Every hierarchy length landing in this month (elapsed years a multiple of it), ascending. */
  cycleYears: number[];
  /** The subset of `cycleYears` that are major cycles. */
  majorCycleYears: number[];
}

export interface MacroCycleResult {
  /** Any anchor's cycle, minor included, lands in this month. Display only. */
  active: boolean;
  /** At least one major (5-year-plus) cycle lands in this month. */
  majorActive: boolean;
  /** A low-anchored window is active: bullish backdrop. */
  bullishActive: boolean;
  /** A high-anchored window is active: bearish backdrop. */
  bearishActive: boolean;
  /** Windows active in the as-of month. */
  activeWindows: MacroCycleWindow[];
  /** Next upcoming months where a major cycle lands, soonest first. */
  upcomingMajor: MacroCycleWindow[];
}

function windowFor(anchor: MacroCycleAnchor, year: number): MacroCycleWindow | null {
  const yearsElapsed = year - anchor.year;
  if (yearsElapsed <= 0) return null;
  const cycleYears = MAJOR_CYCLE_YEARS.filter((n) => yearsElapsed % n === 0);
  if (cycleYears.length === 0) return null;
  return {
    anchor: anchor.label,
    bullish: anchor.kind === "low",
    month: `${year}-${String(anchor.month + 1).padStart(2, "0")}`,
    yearsElapsed,
    cycleYears,
    majorCycleYears: cycleYears.filter((n) => n >= MIN_MAJOR_CYCLE_YEARS),
  };
}

export function computeMacroCycle(asOf: Date = new Date(), upcomingCount = 5): MacroCycleResult {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();

  const activeWindows = MACRO_CYCLE_ANCHORS.filter((a) => a.month === month)
    .map((a) => windowFor(a, year))
    .filter((w): w is MacroCycleWindow => w !== null);

  // Strictly after the as-of month; the active month is already reported above.
  // 60 years ahead covers a full Great Cycle for every anchor.
  const upcomingMajor: MacroCycleWindow[] = [];
  for (let y = year; y <= year + 60 && upcomingMajor.length < upcomingCount; y++) {
    const candidates = MACRO_CYCLE_ANCHORS.filter((a) => y > year || a.month > month)
      .sort((a, b) => a.month - b.month)
      .map((a) => windowFor(a, y))
      .filter((w): w is MacroCycleWindow => w !== null && w.majorCycleYears.length > 0);
    upcomingMajor.push(...candidates);
  }

  return {
    active: activeWindows.length > 0,
    majorActive: activeWindows.some((w) => w.majorCycleYears.length > 0),
    bullishActive: activeWindows.some((w) => w.bullish),
    bearishActive: activeWindows.some((w) => !w.bullish),
    activeWindows,
    upcomingMajor: upcomingMajor.slice(0, upcomingCount),
  };
}
