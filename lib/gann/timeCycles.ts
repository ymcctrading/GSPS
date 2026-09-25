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
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

const WHEEL_COUNTS = [45, 90, 120, 180, 270, 360];

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
}

function fixedCalendarWindows(asOf: Date): Date[] {
  const years = [asOf.getFullYear() - 1, asOf.getFullYear(), asOf.getFullYear() + 1];
  const windows: Date[] = [];
  for (const year of years) {
    for (const month of FIXED_CALENDAR_MONTHS) {
      windows.push(new Date(Date.UTC(year, month - 1, FIXED_CALENDAR_DAY)));
    }
  }
  return windows;
}

export function timeCycles(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): TimeCycleResult {
  const fixedCalendar = fixedCalendarWindows(asOf);
  const dayMsForFixed = 24 * 3600 * 1000;
  const nearbyFixed = fixedCalendar.filter(
    (d) => Math.abs(d.getTime() - asOf.getTime()) <= windowDays * dayMsForFixed,
  );
  const upcomingFixed = fixedCalendar
    .filter((d) => d.getTime() >= asOf.getTime() && d.getTime() <= asOf.getTime() + 14 * dayMsForFixed)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 3)
    .map((d) => d.toISOString().slice(0, 10));

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
