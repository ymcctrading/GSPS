/** Day arithmetic for the edge engine: calendar day numbers and bar indices. RESEARCH ONLY. */

export const DAY_MS = 86_400_000;

/** Calendar day number (days since 1970-01-01, UTC) of an ISO date or timestamp. */
export function dayNum(t: string): number {
  return Math.floor(Date.parse(t.length === 10 ? `${t}T00:00:00Z` : t) / DAY_MS);
}

export function isoDay(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** True for Monday to Friday. Day 0 (1970-01-01) was a Thursday, as `new Date(0).getUTCDay()` (4) says. */
export function isWeekday(n: number): boolean {
  const wd = (((n + 4) % 7) + 7) % 7;
  return wd !== 0 && wd !== 6;
}

/**
 * Weekdays from day `from` to day `to`, both counted; 0 when `to < from`. Whole weeks count five each, so a
 * projection years past the data costs a few steps, not one per day (the edge engine's hot path, 2026-11-11).
 */
export function weekdaysBetween(from: number, to: number): number {
  if (to < from) return 0;
  const weeks = Math.floor((to - from + 1) / 7);
  let c = 5 * weeks;
  for (let x = from + 7 * weeks; x <= to; x++) if (isWeekday(x)) c++;
  return c;
}

/** Days per month used for month counts (365.25 / 12). */
export const MONTH_DAYS = 30.4375;

/**
 * Maps calendar days to bar indices. Inside the data a day maps to the first
 * bar on or after it; past the data, weekdays are counted on (no holiday
 * calendar: an engineering choice, at most one bar off around a holiday).
 * Only bar dates are read, never prices, so a projection uses no future price.
 */
export class BarClock {
  readonly days: number[];
  constructor(dates: string[]) {
    this.days = dates.map(dayNum);
  }
  get length(): number {
    return this.days.length;
  }
  /** Index of the first bar on or after day `d` (may be >= length past the data). */
  indexOnOrAfter(d: number): number {
    const a = this.days;
    if (a.length === 0) return 0;
    if (d <= a[0]) return 0;
    const last = a[a.length - 1];
    if (d > last) {
      const i = a.length - 1 + weekdaysBetween(last + 1, d);
      // d itself on a weekend rolls to the next weekday's index, which the loop already counted only on weekdays
      const wd = new Date(d * DAY_MS).getUTCDay();
      return wd === 0 || wd === 6 ? i + 1 : i;
    }
    let lo = 0;
    let hi = a.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  /** Calendar day of bar `i`, extrapolating weekdays past the data. */
  dayOf(i: number): number {
    const a = this.days;
    if (i < a.length) return a[Math.max(0, i)];
    // The day of the k-th weekday after the last bar: whole weeks of five weekdays at a time, then day by day
    // (at most a week), the same day the one-day-at-a-time walk lands on.
    const k = i - (a.length - 1);
    const weeks = Math.floor((k - 1) / 5);
    let d = a[a.length - 1] + 7 * weeks;
    let left = k - 5 * weeks;
    while (left > 0) {
      d++;
      if (isWeekday(d)) left--;
    }
    return d;
  }
}
