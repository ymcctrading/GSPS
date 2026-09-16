/**
 * Gann time cycles: anniversary dates of major pivots and fixed wheel counts
 * (45/90/180/360 calendar days) projected forward. A scan date falling within
 * `windowDays` of any projected date marks an active "date of interest".
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
    // Anniversary dates (1–3 years out)
    for (let y = 1; y <= 3; y++) {
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
