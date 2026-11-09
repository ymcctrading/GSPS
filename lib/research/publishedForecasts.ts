/**
 * The method's own published, dated stock forecasts, as issued, kept so each
 * can be scored against the Dow record the same author tabled later
 * (`dowSwingRecord.json`). Research only: nothing on the verdict path imports
 * this module, and nothing here is shown to a member (AGENTS.md "Confidential
 * sources", "Forward-looking claims").
 *
 * Sources (the readings in literature-reading-output):
 * - W036, *Annual Forecasts 1919-1922* (class A): the 1919, 1920, 1921 and
 *   1922 stock forecasts, each mailed in advance with its issue date.
 * - W005, *Wall Street Stock Selector* appendix pp.11-39 (class A): the 1929
 *   forecast, signed 23 Nov 1928 (p.11 says it was sent 3 Nov 1928).
 * - W001, *Economic Forecaster* p.4-5 (class A, the author's own booklet):
 *   the 1932 forecast, issued 21 Oct 1931, as quoted there in 1954. The
 *   quote is the author's own selection, so it may leave out calls that missed.
 *
 * Only Dow industrial calls with a stated day or month are carried. Rail
 * calls (no rail record), world-event calls and undated phrases ("December
 * weak early") are left out, and so are the weekly "dates to watch" lists,
 * which the reading did not transcribe in full. Nothing is added from
 * hindsight; where a call names one day or says "about", the window is that
 * day three calendar days either side (`about`), an engineering choice made
 * before scoring, the same for every call.
 *
 * Mid-year supplements (W036 p.17: the 1922 bottom moved from Sep 15 to Sep
 * 30; a late-November supplement called December up) are not scored: their
 * issue dates are not printed, so a revision could not be shown to precede
 * the window it changed (`forecastRecord.ts#reviseForecast`).
 */
import type { ForecastWindow } from "@/lib/research/forecastRecord";

export interface PublishedForecast {
  id: string;
  /** Issue date as printed. */
  issued: string;
  /** Book and page the calls are read from. */
  source: string;
  windows: ForecastWindow[];
}

const DAY = 86_400_000;
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** A single day or an "about" call: the day(s) widened by three calendar days each side. */
const about = (label: string, from: string, to: string, expect: ForecastWindow["expect"]): ForecastWindow => ({
  label,
  from: shift(from, -3),
  to: shift(to, 3),
  expect,
});
const span = (label: string, from: string, to: string, expect: ForecastWindow["expect"]): ForecastWindow => ({ label, from, to, expect });

export const PUBLISHED_FORECASTS: PublishedForecast[] = [
  {
    id: "1919",
    issued: "1918-12-16",
    source: "W036 pp.2-3",
    windows: [
      span("bullish to Jan 4-10", "1919-01-04", "1919-01-10", "high"),
      span("depressing Jan 20-25", "1919-01-20", "1919-01-25", "low"),
      span("accumulation Jan 20 to Feb 14", "1919-01-20", "1919-02-14", "low"),
      about("bull to about May 10", "1919-05-10", "1919-05-10", "high"),
      span("depressing Jun 22 to Jul 10", "1919-06-22", "1919-07-10", "low"),
      span("August top 12-15", "1919-08-12", "1919-08-15", "high"),
      about("decline to about Aug 23", "1919-08-23", "1919-08-23", "low"),
      span("September depressing 2-8", "1919-09-02", "1919-09-08", "low"),
      about("advance to about Sep 23", "1919-09-23", "1919-09-23", "high"),
      span("strong to Oct 6-7", "1919-10-06", "1919-10-07", "high"),
      about("bottom about Oct 24", "1919-10-24", "1919-10-24", "low"),
      // "November decline 10-20": a decline running to the 20th, so the low is called about the 20th.
      about("November decline 10-20", "1919-11-20", "1919-11-20", "low"),
    ],
  },
  {
    id: "1920",
    issued: "1919-12-10",
    source: "W036 pp.4-6",
    windows: [
      about("minor top Mar 9", "1920-03-09", "1920-03-09", "high"),
      span("spring top Apr 22-24", "1920-04-22", "1920-04-24", "high"),
      span("June bottom 10-16", "1920-06-10", "1920-06-16", "low"),
      span("second bull from Jul 15-20", "1920-07-15", "1920-07-20", "low"),
      span("August top of the bull cycle", "1920-08-01", "1920-08-31", "high"),
      about("temporary bottom Dec 19", "1920-12-19", "1920-12-19", "low"),
    ],
  },
  {
    id: "1921",
    issued: "1920-12-14",
    source: "W036 pp.7-10",
    windows: [
      span("low Feb 5-10", "1921-02-05", "1921-02-10", "low"),
      span("spring top Apr 28 to May 3", "1921-04-28", "1921-05-03", "high"),
      span("bottom in August", "1921-08-01", "1921-08-31", "low"),
      span("advance to early September", "1921-09-01", "1921-09-10", "high"),
      about("decline to Sep 25", "1921-09-25", "1921-09-25", "low"),
      span("advance into early October", "1921-10-01", "1921-10-10", "high"),
      span("low around Oct 15-16", "1921-10-15", "1921-10-16", "low"),
      span("December boom", "1921-12-01", "1921-12-31", "high"),
    ],
  },
  {
    id: "1922",
    issued: "1921-11-30",
    source: "W036 pp.11-17",
    windows: [
      span("high Jan 2-3", "1922-01-02", "1922-01-03", "high"),
      about("decline to about Jan 19", "1922-01-19", "1922-01-19", "low"),
      span("rally Jan 26-28", "1922-01-26", "1922-01-28", "high"),
      about("second bottom about Feb 23", "1922-02-23", "1922-02-23", "low"),
      about("first top about Apr 10", "1922-04-10", "1922-04-10", "high"),
      span("second top Apr 18-26", "1922-04-18", "1922-04-26", "high"),
      span("low May 31 to Jun 5", "1922-05-31", "1922-06-05", "low"),
      span("low Jun 19-23", "1922-06-19", "1922-06-23", "low"),
      about("summer top Jul 26", "1922-07-26", "1922-07-26", "high"),
      span("summer top Aug 14-19", "1922-08-14", "1922-08-19", "high"),
      span("bottom Sep 11-15", "1922-09-11", "1922-09-15", "low"),
      span("final top Oct 8-15", "1922-10-08", "1922-10-15", "high"),
      span("final top Oct 18-24", "1922-10-18", "1922-10-24", "high"),
      span("bottom Dec 11-15", "1922-12-11", "1922-12-15", "low"),
    ],
  },
  {
    id: "1929",
    issued: "1928-11-23",
    source: "W005 WSSS appendix pp.11-39",
    windows: [
      about("high about Jan 12", "1929-01-12", "1929-01-12", "high"),
      span("some stocks low Mar 14-15", "1929-03-14", "1929-03-15", "low"),
      span("low Mar 28-29", "1929-03-28", "1929-03-29", "low"),
      span("first bottom Sep 27-28", "1929-09-27", "1929-09-28", "low"),
      span("October lows 8-9", "1929-10-08", "1929-10-09", "low"),
      span("October top 18-19", "1929-10-18", "1929-10-19", "high"),
      span("October lows 26-28", "1929-10-26", "1929-10-28", "low"),
      span("rally into early November", "1929-11-01", "1929-11-10", "high"),
      span("low Dec 23-24", "1929-12-23", "1929-12-24", "low"),
    ],
  },
  {
    id: "1932",
    issued: "1931-10-21",
    source: "W001 pp.4-5",
    windows: [
      about("March 8 last top before a big decline", "1932-03-08", "1932-03-08", "high"),
      about("high around Sep 20-21", "1932-09-20", "1932-09-21", "high"),
      about("decline to about Oct 4-5", "1932-10-04", "1932-10-05", "low"),
    ],
  },
];

/**
 * The 1929 forecast's "Important dates for change in the major trend ...
 * based upon a permanent cycle which does not change" (W005 WSSS appendix).
 * Month and day, read every year as turn windows (either kind).
 */
export const PERMANENT_CHANGE_DATES: { label: string; from: [number, number]; to: [number, number] }[] = [
  { label: "Feb 8-10", from: [2, 8], to: [2, 10] },
  { label: "Mar 21-23", from: [3, 21], to: [3, 23] },
  { label: "May 3-7", from: [5, 3], to: [5, 7] },
  { label: "Jun 20-24", from: [6, 20], to: [6, 24] },
  { label: "Aug 3-8", from: [8, 3], to: [8, 8] },
  { label: "Sep 21-24", from: [9, 21], to: [9, 24] },
  { label: "Nov 8-11", from: [11, 8], to: [11, 11] },
  { label: "Dec 20-24", from: [12, 20], to: [12, 24] },
];

/**
 * The author's own after-the-fact scoring notes, beside the date his later
 * table gives for the same turn. Kept so the self-assessment can be checked.
 */
export const SELF_SCORED_CLAIMS: { claim: string; source: string; claimedDate: string; kind: "high" | "low" }[] = [
  { claim: "1919: bottom Feb 10, advance began Feb 14", source: "W036 p.3", claimedDate: "1919-02-10", kind: "low" },
  { claim: "1920: low prices made Dec 22, 1920", source: "W036 p.6", claimedDate: "1920-12-22", kind: "low" },
  { claim: "1921: the exact high on the averages was made on May 3", source: "W036 p.10", claimedDate: "1921-05-03", kind: "high" },
  { claim: "1922: the extreme high came Oct 14", source: "W036 pp.16-17", claimedDate: "1922-10-14", kind: "high" },
  { claim: "1929: September 3 as the last day stocks should be top", source: "W005 WSSS appendix p.11", claimedDate: "1929-09-03", kind: "high" },
];
