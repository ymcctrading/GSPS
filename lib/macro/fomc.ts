/**
 * The Federal Reserve's scheduled policy (FOMC) meetings, for the macro
 * calendar (Q3 plan item 6).
 *
 * Source: the Federal Reserve Board's published calendar,
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (a US
 * government page, public domain), read 2026-11-12; the page said "Last
 * Update: October 28, 2026". An asterisk there marks a meeting with a Summary
 * of Economic Projections. Re-read it with `node scripts/fetch-fomc-calendar.mjs`
 * when the Fed posts a new year or moves a date. Unscheduled meetings and
 * notation votes are not on the schedule in advance and are not listed.
 *
 * Kept as data, not fetched per request: eight dates a year change rarely,
 * and a page a member opens shouldn't depend on another site being up.
 *
 * Display only. A meeting date never feeds a score, a gate, a level or a
 * verdict: the method reads the market's response to news, not the news
 * itself (ref: SRC-007 p. 8, as `lib/gann/badNews.ts` reads it), so the
 * calendar says when, never what to expect.
 *
 * Three-question basis:
 * 1. Method: as above. The date is context for reading the response.
 * 2. Cycles: eight meetings a year is a published schedule, not a found
 *    periodicity; no cycle is claimed and the checklist does not apply.
 * 3. Hermetic: Cause and Effect (a scheduled cause whose effect the trader
 *    reads afterwards on the chart, rather than guessing in advance).
 */

export const FOMC_SOURCE_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
/** When the schedule below was read from the source (ET date). */
export const FOMC_READ_ON = "2026-11-12";

export interface FomcMeeting {
  /** First and last day, ET dates (YYYY-MM-DD). */
  start: string;
  end: string;
  /** The Fed publishes a Summary of Economic Projections with this meeting. */
  projections: boolean;
}

function m(start: string, end: string, projections = false): FomcMeeting {
  return { start, end, projections };
}

/** Scheduled meetings, in order. */
export const FOMC_MEETINGS: readonly FomcMeeting[] = [
  m("2026-01-27", "2026-01-28"),
  m("2026-03-17", "2026-03-18", true),
  m("2026-04-28", "2026-04-29"),
  m("2026-06-16", "2026-06-17", true),
  m("2026-07-28", "2026-07-29"),
  m("2026-09-15", "2026-09-16", true),
  m("2026-10-27", "2026-10-28"),
  m("2026-12-08", "2026-12-09", true),
  m("2027-01-26", "2027-01-27"),
  m("2027-03-16", "2027-03-17", true),
  m("2027-04-27", "2027-04-28"),
  m("2027-06-08", "2027-06-09", true),
  m("2027-07-27", "2027-07-28"),
  m("2027-09-14", "2027-09-15", true),
  m("2027-10-26", "2027-10-27"),
  m("2027-12-07", "2027-12-08", true),
];

/** Today's date in New York (YYYY-MM-DD). */
export function etToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Meetings that haven't ended by `today` (an ET date), soonest first. */
export function upcomingFomc(today: string, count = 4, meetings: readonly FomcMeeting[] = FOMC_MEETINGS): FomcMeeting[] {
  return meetings.filter((x) => x.end >= today).slice(0, count);
}

/** Whole calendar days from `from` to `to` (both ET dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** The meeting under way or starting within `days` of `today`, if any. */
export function fomcNear(today: string, days = 7, meetings: readonly FomcMeeting[] = FOMC_MEETINGS): FomcMeeting | null {
  const next = upcomingFomc(today, 1, meetings)[0];
  if (!next) return null;
  return daysBetween(today, next.start) <= days ? next : null;
}

/** True once every listed meeting has passed: the list needs a fresh read. */
export function fomcScheduleExhausted(today: string, meetings: readonly FomcMeeting[] = FOMC_MEETINGS): boolean {
  return upcomingFomc(today, 1, meetings).length === 0;
}

/** "Dec 8–9" or "Apr 30 – May 1". */
export function fomcLabel(x: FomcMeeting): string {
  const fmt = (d: string, withMonth: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      ...(withMonth ? { month: "short" } : {}),
      day: "numeric",
    });
  const sameMonth = x.start.slice(0, 7) === x.end.slice(0, 7);
  return sameMonth ? `${fmt(x.start, true)}–${fmt(x.end, false)}` : `${fmt(x.start, true)} – ${fmt(x.end, true)}`;
}
