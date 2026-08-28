/**
 * Earnings calendar generation.
 * -----------------------------------------------------------------------------
 * There is no earnings-calendar feed wired into the provider seam yet (see
 * `docs/THIRD_PARTY_LIMITS.md` before adding one — it would need its own rate
 * limit entry). Until then, dates are generated deterministically from each
 * mega-cap's known reporting cadence (`lib/macro/universe.ts`): most large-caps
 * report in the same 1-2 week window every quarter, so `fiscalOffsetWeeks` after
 * each calendar quarter-end reproduces the real pattern closely enough to
 * populate a monthly calendar. The date is stable for a given company + quarter
 * (seeded, not random) so it doesn't jitter between renders.
 *
 * Swap this module's `generateEarningsForMonth` for a real feed by keeping the
 * same `EarningsEvent` shape — nothing downstream should need to change.
 */

import { MEGA_CAPS, type MegaCap } from "./universe";

const MEGA_CAP_SYMBOLS = new Set(MEGA_CAPS.map((c) => c.symbol));

export type EarningsTiming = "BMO" | "AMC"; // before market open / after close

export interface EarningsEvent {
  symbol: string;
  name: string;
  sector: string;
  date: string; // YYYY-MM-DD
  timing: EarningsTiming;
}

/** Deterministic 0..1 float from a string — stable placement within a week. */
function seededFraction(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** The calendar quarter-end (UTC) on or before `date`. */
function quarterEnd(date: Date): Date {
  const q = Math.floor(date.getUTCMonth() / 3); // 0..3
  const endMonth = q * 3 + 2; // last month of the quarter (0-indexed)
  return new Date(Date.UTC(date.getUTCFullYear(), endMonth + 1, 0)); // last day of endMonth
}

/** Report date for one company in the quarter that ended before `asOf`. */
function reportDateForQuarter(company: MegaCap, qEnd: Date): Date {
  const base = new Date(qEnd);
  base.setUTCDate(base.getUTCDate() + company.fiscalOffsetWeeks * 7);
  // Spread within a ±4 day window around the base date so a whole sector
  // doesn't all land on the same day, then pull onto a weekday.
  const jitterDays = Math.floor(seededFraction(`${company.symbol}|${qEnd.toISOString()}`) * 9) - 4;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + jitterDays);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function timingFor(company: MegaCap): EarningsTiming {
  return seededFraction(`${company.symbol}|timing`) < 0.5 ? "BMO" : "AMC";
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * All mega-cap earnings events whose report date falls within the calendar
 * month containing `monthAnchor` (any date in the target month).
 */
export function generateEarningsForMonth(monthAnchor: Date): EarningsEvent[] {
  const year = monthAnchor.getUTCFullYear();
  const month = monthAnchor.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));

  const events: EarningsEvent[] = [];
  for (const company of MEGA_CAPS) {
    // A quarter-end 2-10 weeks before the month could produce a report date
    // that lands inside it, so check the two most recent quarter-ends.
    for (const probe of [monthEnd, new Date(monthEnd.getTime() - 45 * 24 * 3600 * 1000)]) {
      const qEnd = quarterEnd(probe);
      const reportDate = reportDateForQuarter(company, qEnd);
      if (reportDate >= monthStart && reportDate <= monthEnd) {
        events.push({
          symbol: company.symbol,
          name: company.name,
          sector: company.sector,
          date: toDateInput(reportDate),
          timing: timingFor(company),
        });
      }
    }
  }

  // De-dupe (the two-probe scan can hit the same event twice near a boundary).
  const seen = new Set<string>();
  return events
    .filter((e) => (seen.has(`${e.symbol}|${e.date}`) ? false : (seen.add(`${e.symbol}|${e.date}`), true)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

/**
 * Whether `symbol` has a known binary event (earnings) inside the next
 * `holdPeriodDays` calendar days from `asOf`. Returns `null` — unknown,
 * never a silent pass — for any symbol outside the mega-cap earnings
 * universe this calendar covers, since there's no live earnings feed wired
 * in yet (see this file's header comment) and "no event found" for an
 * uncovered symbol is not the same claim as "no event exists".
 */
export function isBinaryEventInHoldPeriod(
  symbol: string,
  asOf: Date,
  holdPeriodDays: number,
): boolean | null {
  if (!MEGA_CAP_SYMBOLS.has(symbol)) return null;

  const windowEnd = new Date(asOf.getTime() + holdPeriodDays * 24 * 3600 * 1000);
  const months = new Set([toDateInput(asOf).slice(0, 7), toDateInput(windowEnd).slice(0, 7)]);
  const events = [...months].flatMap((ym) => generateEarningsForMonth(new Date(`${ym}-01T00:00:00Z`)));

  const asOfStr = toDateInput(asOf);
  const windowEndStr = toDateInput(windowEnd);
  return events.some(
    (e) => e.symbol === symbol && e.date >= asOfStr && e.date <= windowEndStr,
  );
}
