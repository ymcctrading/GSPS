/**
 * Do the time counts taught in the owner's eight further videos time turns?
 * Research only: nothing on the verdict path imports this module, and nothing
 * here reaches a member.
 *
 * The question (owner, 2026-10-30, eight links sent as "more vids" after the
 * nine aspect videos tested in `aspectTiming.ts`). All eight are from one
 * channel. Despite the astrology framing, none of them uses a planet: each
 * teaches a count of days from an important top or bottom. Three transcripts
 * were read in full (yihAnZ0rFd4, woXR0_nhu_g, pbrP1dnye7c); YouTube's bot
 * check refused the other five after the first three, so for them only the
 * title is known, and their descriptions are course advertisements.
 *
 * Fixed from the videos before any year was scored:
 * - squareRoot (yihAnZ0rFd4, "Gann Square Outs"): the square root of the
 *   pivot's price, rounded, as a count of calendar days, added again and
 *   again ("19 plus 137 ... again add 137") while the total stays within a
 *   year of the pivot. His tolerance, "plus minus one day".
 * - count144 (wgV4N9rp-0A, "The 144 Days Cycle", title only): 144 and 288
 *   calendar days from the pivot, ±2 days.
 * - fibonacciBars (woXR0_nhu_g, DLF): 21, 34, 55, 89, 144, 233 and 377
 *   trading days from the pivot. His 377 from the 24 Mar 2020 low lands on
 *   28 Sep 2021, which is trading days, not calendar days. Sessions are
 *   counted with today's NYSE holiday rules (`lib/market/calendar.ts`), and
 *   before 1952 Saturdays count as sessions too, as the exchange then
 *   traded them. An engineering choice: the old record's own holidays and
 *   the 1945-1952 summer Saturday closures are not modelled, so a long count
 *   in the Dow years can sit a few days off. ±2 days.
 * - anniversary (woXR0_nhu_g): the pivot's date one year later ("the one
 *   year cycle"), ±2 days.
 * - emblem (pbrP1dnye7c, Tata Steel): the wheel set at the pivot's date and
 *   read at 90, 120, 180, 240, 270 and 360 degrees, a degree being a day of
 *   the year (365.25 / 360), and the same again one year on (his 14 Jan 2020
 *   top read on 15 Jul 2020 at 180 and on 14 Sep 2021 at 360 + 240). ±2 days.
 * - timeExtension (pbrP1dnye7c): the time from a swing to the next projected
 *   forward from the second ("drag it from his top to a bottom"), ±2 days.
 *
 * Not scored: U9plPZ1gIcs ("Using Time Cycles to Identify Turning Points"),
 * hk6dvVbcC-I ("Trend Reversal Technique"), ecnls5o40io ("Price Time Square
 * in Bank Nifty") and -k3jYh6IE6Q ("Gann Time Cycle for Intraday Trading"):
 * a title gives no rule that could be fixed before scoring, and guessing one
 * would be choosing the rule after the fact.
 *
 * Anchors, as in `forecastRebuild.ts`: the pivots dated before the issue date
 * and nothing after it. For the Dow, the 9-point swings (`DOW_SWINGS.nine`);
 * for SPY and DIA, the major turns (`modernTurns.json`). Scoring a calendar
 * year's turns, the issue date is 1 January, so only earlier pivots project
 * into the year. A pivot is only known once the market has moved away from
 * it (a major turn needs 21 sessions after it), so a pivot counts only when
 * dated `CONFIRM_LAG_DAYS` or more before the issue date (an engineering
 * choice, added at review on 2026-10-30 to close that look-ahead; 21
 * sessions span about 30 calendar days). The counts read from the last
 * `RECENT_ANCHORS` pivots; anniversary reads from every pivot.
 *
 * Outcomes, null and scoring exactly as in `aspectTiming.ts` and
 * `modernTiming.ts`: his 52 published calls, every Dow 9-point and 3-day
 * turn 1913-1948, and SPY's and DIA's 3-day and major turns 2016-2025, each
 * against the same days shifted round the year. 6 rules on 7 outcome sets:
 * 42 tests, so a result needs p below 0.05 / 42 ≈ 0.0012.
 *
 * Three-question basis:
 * 1. Source: the books carry anniversaries and wheel counts from tops and
 *    bottoms (`timeCycles.ts`, class A), already measured in
 *    `forecastRebuild.ts`; the square root of price as days and the
 *    Fibonacci counts are the videos' claims, in no book in the collection,
 *    tested as stated.
 * 2. Cycles: Dewey's base-rate rule on rules fixed first, with a correction
 *    for the 42 tests and the modern years as the out-of-sample check.
 * 3. Hermetic: Correspondence, price and time as one measure (the "square
 *    out"), held as the claim under test, never as evidence.
 */
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { DOW_SWINGS, type Turn, type TurnSet } from "@/lib/research/forecastTrackRecord";
import { NINE_POINT_YEARS, THREE_DAY_YEARS } from "@/lib/research/aspectTiming";
import { MODERN_YEARS } from "@/lib/research/modernTiming";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";
import turnsJson from "@/lib/research/modernTurns.json";
import { isMarketHoliday } from "@/lib/market/calendar";

export const VIDEO_RULES = ["squareRoot", "count144", "fibonacciBars", "anniversary", "emblem", "timeExtension"] as const;
export type VideoRule = (typeof VIDEO_RULES)[number];

export const VIDEO_OUTCOMES = ["calls", "dowNine", "dowThree", "spyThree", "spyMajor", "diaThree", "diaMajor"] as const;
export type VideoOutcome = (typeof VIDEO_OUTCOMES)[number];
export const VIDEO_TESTS = VIDEO_RULES.length * VIDEO_OUTCOMES.length;

export const RECENT_ANCHORS = 12;
export const CONFIRM_LAG_DAYS = 31;
export const FIBONACCI_BARS = [21, 34, 55, 89, 144, 233, 377] as const;
export const EMBLEM_DEGREES = [90, 120, 180, 240, 270, 360] as const;
export const COUNT_144 = [144, 288] as const;
const TOLERANCE = 2;
const SQUARE_ROOT_TOLERANCE = 1;

const DAY = 86_400_000;
const dayOf = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayUTC = (y: number, m0: number, d: number) => Math.floor(Date.UTC(y, m0, d) / DAY);

type ModernSymbol = "SPY" | "DIA";
const MODERN = (turnsJson as unknown as { symbols: Record<ModernSymbol, Record<"three" | "major", Turn[]>> }).symbols;

/** The NYSE's last Saturday session year: Saturdays traded until 1952. */
export const SATURDAY_SESSIONS_UNTIL = 1951;

/** True when day number `x` (days since 1970-01-01, a Thursday) is a session, by the rules above. */
function isSession(x: number): boolean {
  const date = new Date(x * DAY);
  const wd = date.getUTCDay();
  if (wd === 0) return false;
  if (wd === 6 && date.getUTCFullYear() > SATURDAY_SESSIONS_UNTIL) return false;
  return !isMarketHoliday(date.toISOString().slice(0, 10));
}

/** The day number `n` sessions after day number `d`. */
export function addSessions(d: number, n: number): number {
  let x = d;
  let left = n;
  while (left > 0) {
    x++;
    if (isSession(x)) left--;
  }
  return x;
}

/** The days a rule marks in `year`, as offsets from 1 January, from pivots dated before `issued`. */
export function videoDays(rule: VideoRule, pivots: Turn[], issued: string, year: number): number[] {
  const start = dayUTC(year, 0, 1);
  const len = dayUTC(year + 1, 0, 1) - start;
  const out = new Set<number>();
  const mark = (day: number, tol = TOLERANCE) => {
    for (let d = day - tol; d <= day + tol; d++) if (d >= start && d < start + len) out.add(d - start);
  };
  const known = dayOf(issued) - CONFIRM_LAG_DAYS;
  const anchors = pivots.filter((x) => dayOf(x.date) <= known);
  const recent = anchors.slice(-RECENT_ANCHORS);

  switch (rule) {
    case "squareRoot":
      for (const a of recent) {
        const n = Math.round(Math.sqrt(a.price));
        if (n < 1) continue;
        for (let k = n; k <= 366; k += n) mark(dayOf(a.date) + k, SQUARE_ROOT_TOLERANCE);
      }
      break;
    case "count144":
      for (const a of recent) for (const n of COUNT_144) mark(dayOf(a.date) + n);
      break;
    case "fibonacciBars":
      for (const a of recent) for (const n of FIBONACCI_BARS) mark(addSessions(dayOf(a.date), n));
      break;
    case "anniversary":
      for (const a of anchors) {
        const [y, m, d] = a.date.split("-").map(Number);
        mark(dayUTC(y + 1, m - 1, d));
      }
      break;
    case "emblem":
      for (const a of recent)
        for (const turn of [0, 360])
          for (const deg of EMBLEM_DEGREES) mark(dayOf(a.date) + Math.round(((turn + deg) * 365.25) / 360));
      break;
    case "timeExtension":
      for (let i = 1; i < recent.length; i++) {
        const b = dayOf(recent[i].date);
        mark(b + (b - dayOf(recent[i - 1].date)));
      }
      break;
  }
  return [...out].sort((x, y) => x - y);
}

export interface VideoResult {
  rule: VideoRule;
  outcome: VideoOutcome;
  /** Mean share of each year's days the rule marks. */
  coverage: number;
  score: PooledDayScore["turns"];
}

const meanCoverage = (s: PooledDayScore) => s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length;

function turnsScore(rule: VideoRule, pivots: Turn[], turns: Turn[], years: number[], seed: number): PooledDayScore {
  return scoreYearDays(
    years.map((y) => ({ id: String(y), days: videoDays(rule, pivots, `${y}-01-01`, y), targets: yearTargets(y, [], turns) })),
    seed,
  );
}

export function videoScore(rule: VideoRule, outcome: VideoOutcome, seed = 20261030): VideoResult {
  let s: PooledDayScore;
  let score: PooledDayScore["turns"];
  if (outcome === "calls") {
    s = scoreYearDays(
      PUBLISHED_FORECASTS.map((f) => ({
        id: f.id,
        days: videoDays(rule, DOW_SWINGS.nine, f.issued, Number(f.id)),
        targets: yearTargets(Number(f.id), f.windows, DOW_SWINGS.nine),
      })),
      seed,
    );
    score = s.calls;
  } else if (outcome === "dowNine" || outcome === "dowThree") {
    const set: TurnSet = outcome === "dowNine" ? "nine" : "three";
    s = turnsScore(rule, DOW_SWINGS.nine, DOW_SWINGS[set], set === "nine" ? NINE_POINT_YEARS : THREE_DAY_YEARS, seed);
    score = s.turns;
  } else {
    const symbol: ModernSymbol = outcome.startsWith("spy") ? "SPY" : "DIA";
    const set = outcome.endsWith("Major") ? "major" : "three";
    s = turnsScore(rule, MODERN[symbol].major, MODERN[symbol][set], MODERN_YEARS, seed);
    score = s.turns;
  }
  return { rule, outcome, coverage: meanCoverage(s), score };
}

export function videoAll(): VideoResult[] {
  const out: VideoResult[] = [];
  for (const rule of VIDEO_RULES) for (const outcome of VIDEO_OUTCOMES) out.push(videoScore(rule, outcome));
  return out;
}
