/**
 * Gann time cycles: major/minor cycle-year anniversaries of major pivots (see
 * `MAJOR_CYCLE_YEARS`) and fixed wheel counts (45/90/180/360 calendar days)
 * projected forward. A scan date falling within `windowDays` of any projected
 * date marks an active "date of interest".
 *
 * Directional: a low pivot projects turn windows a bullish reversal argues
 * from (the low resuming up); a high pivot projects the mirror for bearish.
 * Mixing the two together — treating "a turn window is active" as agreeing
 * with either direction — is what let this criterion argue for a bullish and
 * a bearish setup identically.
 *
 * **Fixed annual calendar cycle** (added 2026-09-16, per
 * `docs/GANN_PLATFORM_AUDIT.md` Part 4 item 4 / AGENTS.md's "WD Gann
 * precedence" principle): `Wall Street Stock Selector` (1930,
 * `docs/GANN_HISTORICAL_SOURCES.md` A4) discloses a *separate*, non-anchored
 * cycle — eight dated windows he called "a permanent cycle which does not
 * change," independent of any symbol's own pivots. This is
 * genuinely different from the anniversary/wheel-count logic above (which
 * needs a per-symbol anchor pivot): it fires the same calendar dates for
 * every symbol, every year, with no directional bias (Gann's own framing is
 * "watch for trend-change here," not "this favors bullish or bearish"), so it
 * is tracked as its own flag rather than folded into `bullishActive`/
 * `bearishActive`. Live and running (not scoring-gated, since Gann's own
 * rule has no per-direction pass/fail to gate with) — each disclosed window,
 * widened by ± `windowDays` at both ends.
 *
 * **Dates corrected 2026-09-27 (project-owner go-ahead).** Until then this
 * used the 5th of each named month, from a second-hand reading of A4 as
 * "early February/March/…". The primary text (the 1929 Annual Stock
 * Forecast reprinted in the Stock Selector's back matter) gives specific
 * day ranges, and four of the eight are late-month windows, so the old
 * anchor fired 16-19 days early for March, June, September and December.
 * Right rule, wrong anchor: the `harmonicProximity` failure shape. See
 * `docs/memory-bank/sources/A02_A04_truth_of_stock_tape_1923_and_stock_selector_1930.md`
 * (correction C-A4-1).
 *
 * **What these windows are, statistically** (Dewey, "Definitions and Concepts
 * Used in Cycle Study", 1965, `docs/memory-bank/sources/C05`): calendar and anniversary
 * windows are *recurrent events*, not waves with a spectrum. So they are
 * validated by a hit rate against a base rate (roadmap M4), not by a
 * periodogram. Added 2026-09-27 (roadmap item A8 / C4).
 *
 * Three-question basis:
 * 1. Gann: A4 (1930, Tier A), back matter. The same anchors recur in A9's
 *    (1949) seasonal change windows, and two of Face Facts America!'s (A7,
 *    1940) dated windows sit on them.
 * 2. Dewey: an annual, eight-phase periodicity claim. Regularity of timing
 *    and constancy of period hold by construction (it is the solar year).
 *    Dominance, repetition count against a base rate, wave-shape identity
 *    and cross-series clustering are untested anywhere in Gann's text, which
 *    is why this stays display-only and unscored until it is measured.
 * 3. Hermetic: Rhythm. The windows sit on the equinoxes and solstices and
 *    the cross-quarter points between them, i.e. the solar year divided into
 *    eighths. That is our observation, not Gann's wording, and it is a
 *    seasonal fact, not an astrological claim.
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

/**
 * Fractions of the 360-day year counted from a pivot (Master Course Ch. 13-14:
 * the year and the circle divided into eighths and thirds). ⅔ (240) and the
 * odd eighths (135, 225, 315) were added 2026-09-27 (parity roadmap A6, owner
 * direction to implement Gann's method throughout); the earlier list stopped
 * at 45/90/120/180/270/360.
 */
const WHEEL_COUNTS = [45, 90, 120, 135, 180, 225, 240, 270, 315, 360];

/**
 * Gann's day-count bands from any important high or low (*45 Years in Wall
 * Street*, 1949, Rule 8). A band is a range, not a date: the window is open
 * for every day inside it. Added 2026-09-27 (parity roadmap A3).
 */
export const DAY_COUNT_BANDS: readonly [number, number][] = [
  [7, 12],
  [18, 21],
  [28, 31],
  [42, 49],
  [57, 65],
  [85, 92],
  [112, 120],
  [150, 157],
  [175, 185],
];

/**
 * The full disclosed major/minor time-cycle hierarchy, in years, projected
 * forward from each anchor pivot — added 2026-09-16 per a fuller extraction
 * of `docs/GANN_HISTORICAL_SOURCES.md` A2.1's Chapter 7, "Master Time Factor
 * and Forecasting by Mathematical Rules." Replaces the previous 1-3-year-only
 * anniversary loop: Gann's own text names 60 years ("Great Cycle... the
 * greatest and most important cycle of all"), 50, 30, 20 ("most stocks...
 * work closer to this cycle than any other"), 15, 10, 7, and 5-year cycles,
 * plus minor 3- and 2-year cycles and "the smallest cycle... one year." Per
 * AGENTS.md's "WD Gann precedence" principle — this is a literal, disclosed
 * rule, not a reconstruction, so it replaces the narrower 1-3-year window
 * rather than sitting alongside it as a separate hypothesis.
 */
export const MAJOR_CYCLE_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60];

/**
 * Gann's "permanent cycle which does not change" (A4, 1930 back matter):
 * Feb 8-10, Mar 21-23, May 3-7, Jun 20-24, Aug 3-8, Sep 21-24, Nov 8-11,
 * Dec 20-24. Month is 1-based, days inclusive.
 */
export const FIXED_CALENDAR_WINDOWS: readonly { month: number; startDay: number; endDay: number }[] = [
  { month: 2, startDay: 8, endDay: 10 },
  { month: 3, startDay: 21, endDay: 23 },
  { month: 5, startDay: 3, endDay: 7 },
  { month: 6, startDay: 20, endDay: 24 },
  { month: 8, startDay: 3, endDay: 8 },
  { month: 9, startDay: 21, endDay: 24 },
  { month: 11, startDay: 8, endDay: 11 },
  { month: 12, startDay: 20, endDay: 24 },
];

export interface TimeCycleResult {
  /** Any direction's turn window is active — for display, not scoring. */
  active: boolean;
  /** A low-anchored turn window is active: supports a bullish setup. */
  bullishActive: boolean;
  /** A high-anchored turn window is active: supports a bearish setup. */
  bearishActive: boolean;
  dates: string[]; // upcoming/nearby dates of interest (ISO date strings)
  /** A fixed annual calendar window (A4) is active — no per-symbol anchor, no directional bias. */
  fixedCalendarActive: boolean;
  /**
   * Start dates (ISO) of fixed-calendar windows that are in progress or begin
   * within the next 14 days, soonest first, at most three.
   */
  fixedCalendarDates: string[];
}

const DAY_MS = 24 * 3600 * 1000;

/** Whole UTC days since the epoch, so window edges compare by calendar day. */
function utcDay(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

function fixedCalendarWindows(asOf: Date): { start: number; end: number }[] {
  const year = asOf.getUTCFullYear();
  const windows: { start: number; end: number }[] = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const w of FIXED_CALENDAR_WINDOWS) {
      windows.push({
        start: utcDay(new Date(Date.UTC(y, w.month - 1, w.startDay))),
        end: utcDay(new Date(Date.UTC(y, w.month - 1, w.endDay))),
      });
    }
  }
  return windows;
}

export function timeCycles(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): TimeCycleResult {
  const fixedCalendar = fixedCalendarWindows(asOf);
  const today = utcDay(asOf);
  const nearbyFixed = fixedCalendar.filter(
    (w) => today >= w.start - windowDays && today <= w.end + windowDays,
  );
  const upcomingFixed = fixedCalendar
    .filter((w) => w.end >= today && w.start <= today + 14)
    .sort((a, b) => a.start - b.start)
    .slice(0, 3)
    .map((w) => new Date(w.start * DAY_MS).toISOString().slice(0, 10));

  if (dailyBars.length < 30)
    return {
      active: false,
      bullishActive: false,
      bearishActive: false,
      dates: [],
      fixedCalendarActive: nearbyFixed.length > 0,
      fixedCalendarDates: upcomingFixed,
    };

  const pivots = findPivots(dailyBars, 5);
  // Major pivots only: the top quartile by swing prominence, not merely the
  // most recent by index — a shallow, recent pivot is still noise.
  const anchors = majorPivots(pivots).slice(-12);

  const dayMs = 24 * 3600 * 1000;
  const dates: { date: Date; bullish: boolean }[] = [];

  for (const anchor of anchors) {
    const anchorDate = new Date(anchor.bar.t);
    // A low resuming up argues bullish; a high resuming down argues bearish.
    const bullish = anchor.kind === "low";
    // Fixed wheel counts forward from the pivot
    for (const count of WHEEL_COUNTS) {
      dates.push({ date: new Date(anchorDate.getTime() + count * dayMs), bullish });
    }
    // Major/minor cycle years (see MAJOR_CYCLE_YEARS's own comment)
    for (const y of MAJOR_CYCLE_YEARS) {
      const anniversary = new Date(anchorDate);
      anniversary.setFullYear(anniversary.getFullYear() + y);
      dates.push({ date: anniversary, bullish });
    }
  }

  const nearby = dates.filter(
    (d) => Math.abs(d.date.getTime() - asOf.getTime()) <= windowDays * dayMs,
  );
  // Day-count bands: open for every day inside the band from each anchor.
  for (const anchor of anchors) {
    const elapsed = Math.round((asOf.getTime() - new Date(anchor.bar.t).getTime()) / dayMs);
    if (DAY_COUNT_BANDS.some(([lo, hi]) => elapsed >= lo && elapsed <= hi)) {
      nearby.push({ date: asOf, bullish: anchor.kind === "low" });
    }
  }

  const upcoming = dates
    .filter((d) => d.date.getTime() >= asOf.getTime() && d.date.getTime() <= asOf.getTime() + 14 * dayMs)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map((d) => d.date.toISOString().slice(0, 10));

  return {
    active: nearby.length > 0,
    bullishActive: nearby.some((d) => d.bullish),
    bearishActive: nearby.some((d) => !d.bullish),
    dates: upcoming,
    fixedCalendarActive: nearbyFixed.length > 0,
    fixedCalendarDates: upcomingFixed,
  };
}

export interface YearCycleConvergence {
  /** (anchor, cycle-length) pairs landing on the current month from major lows. */
  bullishHits: number;
  /** The same from major highs. */
  bearishHits: number;
}

/**
 * The yearly half of the Master Time Factor, read on monthly bars — the part
 * `timeCycles()` cannot reach on the one year of daily bars the scans hold,
 * since every daily anchor is under a year old.
 *
 * Counts how many (major pivot, cycle length) pairs from `MAJOR_CYCLE_YEARS`
 * land on the current calendar month: a major low exactly N years back, for
 * N in that list, is one bullish hit. Counting convergence rather than
 * returning a yes/no is the same reading Gann gives the cycles himself — a
 * turn is expected where several cycles run out together (the Ch.7 DJIA case
 * study names every elapsed count against multiple prior anchors at once).
 *
 * Month precision, not day: Gann works yearly cycles off the monthly chart,
 * and a monthly pivot's date is only known to the month. Exact-month match
 * rather than a +/-1 month window, because the window is what makes the
 * signal indiscriminate — with a dozen anchors and six reachable cycle
 * lengths, +/-1 month would mark most symbols active most months.
 *
 * Reach is bounded by the data, not the method: with ~10 years of monthly
 * history (the provider's limit) only the 1/2/3/5/7-year cycles, and 10 at
 * the edge, can land. The 15-60-year cycles need anchors older than any
 * per-symbol history available here.
 */
export function yearCycleConvergence(monthlyBars: Bar[], asOf: Date = new Date()): YearCycleConvergence {
  const result: YearCycleConvergence = { bullishHits: 0, bearishHits: 0 };
  if (monthlyBars.length < 24) return result;

  const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const now = monthIndex(asOf);
  const anchors = majorPivots(findPivots(monthlyBars, 3));

  for (const anchor of anchors) {
    const ageMonths = now - monthIndex(new Date(anchor.bar.t));
    for (const years of MAJOR_CYCLE_YEARS) {
      if (ageMonths !== years * 12) continue;
      if (anchor.kind === "low") result.bullishHits += 1;
      else result.bearishHits += 1;
    }
  }
  return result;
}
