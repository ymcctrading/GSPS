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
 * cycle — specific early-month windows he called "a permanent cycle which
 * does not change," independent of any symbol's own pivots. This is
 * genuinely different from the anniversary/wheel-count logic above (which
 * needs a per-symbol anchor pivot): it fires the same calendar dates for
 * every symbol, every year, with no directional bias (Gann's own framing is
 * "watch for trend-change here," not "this favors bullish or bearish"), so it
 * is tracked as its own flag rather than folded into `bullishActive`/
 * `bearishActive`. Live and running (not scoring-gated, since Gann's own
 * rule has no per-direction pass/fail to gate with) — the first day of each
 * named window, ± `windowDays`.
 *
 * **`WHEEL_COUNTS` widened, and two more non-anchored fixed calendars added,
 * 2026-09-16** (Master Stock Market Course, docs/GANN_HISTORICAL_SOURCES.md
 * A2.1 — read in full this session): the original six wheel counts came from
 * one pass through Chapter 7's wheel-count material. A fuller read of
 * Chapters 5, 14, and 17 disclosed several more day-counts Gann states as
 * important that were simply missing from the list — 3-4 days and 7/14/21
 * days ("14 days is the most important... 21 days or three weeks is next in
 * importance," Ch. 14); ~23 days ("1/16 of a year," Ch. 17); 30, 150, 210,
 * 240, 300, 330 days (Ch. 5, a finer-grained monthly wheel distinct from the
 * original set — only 120/360 overlap); and 63/81 days ("63 to 65 days
 * because 7 x 9 is 63... 81 days or the square of 9," Ch. 14 — 65 folded
 * into 63 rather than added separately, the same single-representative-value
 * convention this list already uses for a stated day range). This is a
 * data-completeness fix to an already-live mechanism, not a new one — see
 * AGENTS.md's cross-platform-consistency section.
 *
 * `SEASONAL_DATES` and `HOLIDAY_DATES` below are two further non-anchored
 * fixed calendars, corroborated across multiple chapters, kept as their own
 * flags for the same reason `FIXED_CALENDAR_MONTHS` is: each is a distinct
 * disclosed source with its own rationale, not a variant of the others.
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

const WHEEL_COUNTS = [
  3, 4, 7, 14, 21, 23, 30, 45, 63, 81, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
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
const MAJOR_CYCLE_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60];

/**
 * "Early February/March/May/June/August/September/November/December" per A4
 * — read as the first ten days of each named month, since Gann's text names
 * the month without a specific day.
 */
const FIXED_CALENDAR_MONTHS = [2, 3, 5, 6, 8, 9, 11, 12];
const FIXED_CALENDAR_DAY = 5;

/**
 * Natural Seasonal Time Periods, anchored to the Spring equinox (March 21,
 * treated as a fixed calendar date the way Gann himself does, not computed
 * astronomically) — added 2026-09-16, corroborated across three separate
 * places in the Master Stock Market Course (Chapter 5, "Seasonal Changes On
 * Stocks"; Chapter 14, "Master Calculator For Weekly Time Periods"; Chapter
 * 17, "Time Periods — Seasonal & Yearly"; and Chapter 18, "Time And Price
 * Resistance Levels" ranks the anniversary-of-extreme rule above this one but
 * states the same eighths). The year is divided into eighths and thirds from
 * March 21, not from January 1 — a genuinely different, non-anchored fixed
 * calendar from `FIXED_CALENDAR_MONTHS` above (which comes from a different
 * book, `Wall Street Stock Selector`, A4), so it is tracked as its own flag
 * for the same reason that one is. The exact day-of-month varies by ±1 day
 * across the citing chapters (e.g. Jun 21 vs 22, Sep 23 vs 24) — Gann rounds
 * a fractional year differently in different places; one representative date
 * per mark is used here rather than every cited variant.
 */
const SEASONAL_DATES: { month: number; day: number }[] = [
  { month: 3, day: 21 }, // Spring equinox — 0 / start of the seasonal year
  { month: 5, day: 6 }, // 1/8
  { month: 6, day: 21 }, // 1/4
  { month: 7, day: 24 }, // 1/3
  { month: 8, day: 9 }, // 3/8
  { month: 9, day: 24 }, // 1/2 — Gann's own highest-ranked mark after the full year
  { month: 11, day: 9 }, // 5/8
  { month: 11, day: 23 }, // 2/3
  { month: 2, day: 5 }, // 7/8
];

/**
 * "Changes In Trend Around Holidays" — added 2026-09-16 (Master Stock Market
 * Course, Chapter 10A, "Forecasting By Time Cycles"): a second, distinct
 * non-anchored fixed calendar, keyed to US holidays rather than a month/day
 * grid or a seasonal fraction. Some dates are fixed (Feb 12, Feb 22, May 30,
 * Jul 4, Oct 12, and the Jan 2-7 and Dec 21-27 windows, one representative
 * date used per window); some are floating (Easter, Labor Day, Election Day,
 * Thanksgiving) and computed from the calendar rather than hardcoded.
 */
function easterSunday(year: number): { month: number; day: number } {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** The nth weekday (0=Sun...6=Sat) on or after `fromDay` of `month`, `year`. */
function nthWeekdayOnOrAfter(year: number, month: number, fromDay: number, weekday: number): number {
  const d = new Date(Date.UTC(year, month - 1, fromDay));
  const offset = (weekday - d.getUTCDay() + 7) % 7;
  return fromDay + offset;
}

function holidayWindows(year: number): { month: number; day: number }[] {
  const easter = easterSunday(year);
  const laborDayDay = nthWeekdayOnOrAfter(year, 9, 1, 1); // 1st Monday of September
  const electionMondayDay = nthWeekdayOnOrAfter(year, 11, 1, 1); // 1st Monday of November
  const electionDay = electionMondayDay + 1; // 1st Tuesday after that Monday
  const thanksgivingDay = nthWeekdayOnOrAfter(year, 11, 1, 4) + 21; // 4th Thursday of November
  return [
    { month: 1, day: 3 }, // Jan 2-4 window, midpoint
    { month: 1, day: 7 },
    easter,
    { month: 2, day: 12 }, // Lincoln's Birthday
    { month: 2, day: 22 }, // Washington's Birthday
    { month: 5, day: 30 }, // Memorial Day (traditional fixed date)
    { month: 7, day: 4 },
    { month: 9, day: laborDayDay },
    { month: 10, day: 12 }, // Columbus Day (traditional fixed date)
    { month: 11, day: electionDay },
    { month: 11, day: thanksgivingDay },
    { month: 12, day: 24 }, // Dec 21-27 window, midpoint
  ];
}

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
  /** Upcoming fixed-calendar dates of interest (ISO date strings). */
  fixedCalendarDates: string[];
  /** A Natural Seasonal Time Period window (equinox-anchored) is active. */
  seasonalActive: boolean;
  /** Upcoming seasonal dates of interest (ISO date strings). */
  seasonalDates: string[];
  /** A holiday-anchored window is active. */
  holidayActive: boolean;
  /** Upcoming holiday-anchored dates of interest (ISO date strings). */
  holidayDates: string[];
}

/** Shared by every non-anchored fixed calendar: generate candidate dates for the surrounding 3 years. */
function yearlyWindows(asOf: Date, datesForYear: (year: number) => { month: number; day: number }[]): Date[] {
  const years = [asOf.getFullYear() - 1, asOf.getFullYear(), asOf.getFullYear() + 1];
  const windows: Date[] = [];
  for (const year of years) {
    for (const { month, day } of datesForYear(year)) {
      windows.push(new Date(Date.UTC(year, month - 1, day)));
    }
  }
  return windows;
}

function fixedCalendarWindows(asOf: Date): Date[] {
  return yearlyWindows(asOf, () => FIXED_CALENDAR_MONTHS.map((month) => ({ month, day: FIXED_CALENDAR_DAY })));
}

/** Nearby (within `windowDays`) and upcoming (next 14 days) dates from a candidate list, ISO-stringified. */
function evaluateWindows(
  candidates: Date[],
  asOf: Date,
  windowDays: number,
): { nearby: boolean; upcoming: string[] } {
  const dayMs = 24 * 3600 * 1000;
  const nearby = candidates.some((d) => Math.abs(d.getTime() - asOf.getTime()) <= windowDays * dayMs);
  const upcoming = candidates
    .filter((d) => d.getTime() >= asOf.getTime() && d.getTime() <= asOf.getTime() + 14 * dayMs)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 3)
    .map((d) => d.toISOString().slice(0, 10));
  return { nearby, upcoming };
}

export function timeCycles(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): TimeCycleResult {
  const fixed = evaluateWindows(fixedCalendarWindows(asOf), asOf, windowDays);
  const seasonal = evaluateWindows(yearlyWindows(asOf, () => SEASONAL_DATES), asOf, windowDays);
  const holiday = evaluateWindows(yearlyWindows(asOf, holidayWindows), asOf, windowDays);

  if (dailyBars.length < 30)
    return {
      active: false,
      bullishActive: false,
      bearishActive: false,
      dates: [],
      fixedCalendarActive: fixed.nearby,
      fixedCalendarDates: fixed.upcoming,
      seasonalActive: seasonal.nearby,
      seasonalDates: seasonal.upcoming,
      holidayActive: holiday.nearby,
      holidayDates: holiday.upcoming,
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
    fixedCalendarActive: fixed.nearby,
    fixedCalendarDates: fixed.upcoming,
    seasonalActive: seasonal.nearby,
    seasonalDates: seasonal.upcoming,
    holidayActive: holiday.nearby,
    holidayDates: holiday.upcoming,
  };
}
