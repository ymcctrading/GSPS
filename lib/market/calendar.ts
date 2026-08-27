/**
 * US equity market holiday calendar (NYSE/Nasdaq full-day closures),
 * computed rather than a hand-maintained date list — every rule below is a
 * fixed calendar formula, so this stays correct for any year without
 * needing an annual update. `lib/market/session.ts` deliberately does not
 * model holidays (see its header comment); this module is what closes that
 * gap for callers that need to skip them, starting with the Phase 3D
 * scheduled scan jobs.
 *
 * Deliberately narrow: full-day closures only. NYSE early-close days (e.g.
 * the day after Thanksgiving) are still open regular-session days for this
 * module's purposes -- nothing here schedules around a shortened session.
 */

import { etDateKey } from "@/lib/market/session";

/** `weekday`: 0=Sunday..6=Saturday, in the Gregorian proleptic calendar (UTC-safe: dates are constructed at UTC noon). */
function utcNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
  const first = utcNoon(year, monthIndex, 1);
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return utcNoon(year, monthIndex, day);
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): Date {
  // Month length via day 0 of the following month.
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const last = utcNoon(year, monthIndex, daysInMonth);
  const lastWeekday = last.getUTCDay();
  const back = (lastWeekday - weekday + 7) % 7;
  return utcNoon(year, monthIndex, daysInMonth - back);
}

/**
 * A fixed-date holiday observed on the nearest weekday: Saturday shifts to
 * the preceding Friday, Sunday shifts to the following Monday. Standard
 * federal/market observance rule (applies to New Year's Day, Juneteenth,
 * Independence Day, and Christmas below).
 */
function observedFixedDate(year: number, monthIndex: number, day: number): Date {
  const date = utcNoon(year, monthIndex, day);
  const weekday = date.getUTCDay();
  if (weekday === 6) return utcNoon(year, monthIndex, day - 1); // Sat -> Fri
  if (weekday === 0) return utcNoon(year, monthIndex, day + 1); // Sun -> Mon
  return date;
}

/**
 * Easter Sunday (Gregorian), via the Anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher) -- a standard, deterministic computus formula, not
 * a per-year lookup.
 */
function easterSunday(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcNoon(year, month - 1, day);
}

function goodFriday(year: number): Date {
  const easter = easterSunday(year);
  const good = new Date(easter);
  good.setUTCDate(good.getUTCDate() - 2);
  return good;
}

/** All NYSE/Nasdaq full-day market holidays for a given (Gregorian) year. */
export function marketHolidays(year: number): Date[] {
  const holidays = [
    observedFixedDate(year, 0, 1), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Day: 3rd Monday of January
    nthWeekdayOfMonth(year, 1, 1, 3), // Washington's Birthday: 3rd Monday of February
    goodFriday(year),
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day: last Monday of May
    observedFixedDate(year, 5, 19), // Juneteenth (observed as a market holiday since 2022)
    observedFixedDate(year, 6, 4), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day: 1st Monday of September
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving: 4th Thursday of November
    observedFixedDate(year, 11, 25), // Christmas
  ];
  return holidays.sort((a, b) => a.getTime() - b.getTime());
}

/** `true` if `dateKey` (an America/New_York "YYYY-MM-DD") is a full-day market holiday. */
export function isMarketHoliday(dateKey: string): boolean {
  const year = Number(dateKey.slice(0, 4));
  // A holiday can only ever fall in the queried year or, for New Year's
  // Day shifted from a Dec 31/Jan 2 in the adjacent year, the year on
  // either side -- checking year-1..year+1 covers every observed shift.
  for (const y of [year - 1, year, year + 1]) {
    if (marketHolidays(y).some((h) => etDateKey(h) === dateKey)) return true;
  }
  return false;
}

/** `true` for a Saturday or Sunday, in America/New_York terms. */
export function isWeekend(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" })
    .format(date);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * `true` if US equity markets hold a regular session on this America/New_York
 * calendar day -- not a weekend, not a full-day holiday. Early-close days
 * (day after Thanksgiving, Christmas/Independence Day Eve when they fall on
 * a weekday) still return `true`: the session is shortened, not closed.
 */
export function isTradingDay(date: Date = new Date()): boolean {
  if (isWeekend(date)) return false;
  return !isMarketHoliday(etDateKey(date));
}
