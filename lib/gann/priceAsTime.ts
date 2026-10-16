/**
 * Price read as time, and the long time counts from a pivot or a stock's
 * first trade (build order section 6 of the 2026-10-16 UNVERIFIABLE recheck).
 * Context only: nothing here feeds a scored criterion, a gate, a plan, an
 * entry, a stop or a target, and the scored `timePriceSquare` (an
 * ATR-normalized move against a bar count) is left as it is until a replay
 * compares the two. Read through `readDisclosedRules`, so the live scan and
 * the replay read the same thing, and recorded on every replayed trade
 * (`contextFactors.ts`).
 *
 * Sources (long-book notes, W023 = Master Stock Market Course):
 * - M-P9 / C-TIME-04 / C-TIME-22, class A. Ch.4 PDF 148-150: squaring price
 *   with time is "one of the most important and valuable discoveries"; three
 *   ways, the range, the low and the high; the DJIA high of 386 projected
 *   386 calendar days, repeated (Sept 23 1930 … Jan 6 1936). Ch.4 PDF 145: a
 *   price of 60 "comes out on the 60th day, week or month" and meets strong
 *   resistance. Ch.2 PDF 57: U.S. Rubber's 143 high, 143 months.
 * - Ch.18 TP-2, PDF 440: one year = 52 weeks = price 52. Low 50, price 102,
 *   up 52 = one year, "a Time and Price Balance"; high 182, now 130, down 52.
 * - C-TIME-20, class A. Ch.18 TP-2 PDF 440: time "from the low on 1/4 and
 *   3/4 and from the high on 1/3 or 2/3 especially if the price is at 1/2 or
 *   3/4 resistance"; the same page gives the day counts (¼ = 91, ⅓ = 121,
 *   ⅔ = 242, ¾ = 273).
 * - C-TIME-14, class A. Ch.4 PDF 125 (the Pattern Chart is the Square of 90,
 *   angles 3¾ … 90); PDF 144 (newly listed stocks: squares of 22½, 45, 67½,
 *   90, 135 or 90-from-90); Ch.6 PDF 191-197 (U.S. Steel, square of 90 from
 *   Mar 1901, out of it by Aug 1908); Ch.2 PDF 58 (78¾ = ⅞ of 90, "78th to
 *   80th week, month or day").
 * - C-TIME-07, class A* (by example). Ch.16 PDF 428-430: Auburn's chart draws
 *   90° lines at the natural degrees 11¼ … 90 and counts market days (91 on
 *   the 67th day, 60⅜ on the 177th); Ch.4 PDF 123: the daily chart in market
 *   days; Ch.7 PDF 229: the time-angle table of the 1/32 circle, 11¼ … 360.
 *   Of Gann's printed Auburn counts only some sit on a multiple (67 ≈ 67½,
 *   86 and 92 near 90); his 27th and 40th days are price readings.
 * - M-T18, class A (numbers). Ch.15B PDF 422-423: ring completions 7, 19, 37,
 *   61, 91, 127 (10 years 7 months) and 169 (14 years 1 month) as time
 *   points; Ch.6 PDF 197: Oct 1911, the 128th month from Mar 1901 (Steel's
 *   first trading), "put it out of the hexagon movement". Gann counts the
 *   start month as the first, so his 128th month is 127 months elapsed.
 *
 * Engineering choices, labelled as such:
 * - Price is read in points scaled to the stock's price level
 *   (`pointScale.ts#gannPointForBars`), as the Square of 144 readings are;
 *   Gann's 1 point = $1 holds near $42.50.
 * - Pivots are the extreme high and low of the bars read, as the other time
 *   counts from a pivot (`squareOfNineTime.ts`, `hexagonTime.ts`) take them.
 *   The range is counted from the later of the two.
 * - Multiples up to 6, the number of repeats in Gann's 386 example.
 * - Tolerance 1 day, ½ week, ½ month; counts under 7 points are skipped (they
 *   recur too often to say anything).
 * - The Ch.18 balance holds when points and weeks agree within 1, from 7
 *   points (the counts' floor) up.
 * - C-TIME-20: the last major low and high (`findPivots` strength 5,
 *   `majorPivots`), a 2-day window (as the year fractions), and ½ and ¾ of
 *   the range measured up from the low, within one point.
 * - C-TIME-14: steps of 11¼ up to 180 (the square and 90-from-90). Origins:
 *   the stored inception date (migration 0083, Wikidata's founding date,
 *   which may differ from the first trade Gann counts from) and the extreme
 *   low of the bars read. Months need the month, weeks need the day.
 *   Tolerance ½ week and ½ month, or 1 month for a date known to the month.
 * - C-TIME-07: market days are bars; multiples of 11¼ up to 360, within ½ day.
 * - M-T18: the hexagon's lines and named counts from `hexagonTime.ts`, in
 *   months from the stored inception date, ½ month.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A.
 * 2. Cycles: a recurrence claim (turns at a pivot's price counted in time).
 *    No Dewey item is cleared; the replay's factor table is the first
 *    base-rate test, and the rule was fixed before it (the three sources,
 *    three units, the tolerances above).
 * 3. Hermetic: Correspondence, price and time the two sides of one square,
 *    each read in the other's units. Rhythm fits the repeats of the count.
 *    Polarity (no direction in the text), Vibration, Mentalism, Cause and
 *    Effect and Gender were considered and do not shape the design.
 */

import { hexLinesAt, HEX_NAMED_MONTHS, type HexLineHit } from "@/lib/gann/hexagonTime";
import type { Inception } from "@/lib/gann/incorporationCycle";
import { halvingChainTime, type HalvingChainReading } from "@/lib/gann/masterTwelve";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";

export type CountUnit = "days" | "weeks" | "months";

export interface DatedPrice {
  /** YYYY-MM-DD (a longer ISO string is cut to the date). */
  date: string;
  price: number;
}

const DAY_MS = 86_400_000;
const DAYS_PER: Record<CountUnit, number> = { days: 1, weeks: 7, months: 365.25 / 12 };
const TOLERANCE: Record<CountUnit, number> = { days: 1, weeks: 0.5, months: 0.5 };
const MAX_MULTIPLE = 6;
const MIN_POINTS = 7;
const BALANCE_TOLERANCE = 1;

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const elapsedDays = (from: string, to: string) => (day(to) - day(from)) / DAY_MS;

/** The calendar dates `points` days, weeks or months after `from`, repeated `multiples` times. */
export function priceAsTimeDates(points: number, from: string, unit: CountUnit, multiples = MAX_MULTIPLE): string[] {
  if (!(points > 0)) return [];
  const out: string[] = [];
  for (let k = 1; k <= multiples; k++) {
    out.push(new Date(day(from) + Math.round(k * points * DAYS_PER[unit]) * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

export interface PriceAsTimeHit {
  source: "low" | "high" | "range";
  pivotDate: string;
  /** The price (or range) in points, read as the count. */
  points: number;
  unit: CountUnit;
  /** 1 = the count itself, 2 = twice it … */
  multiple: number;
  elapsed: number;
}

/** The low, the high and the range read as days, weeks and months, on `lastDate`. */
export function priceAsTimeHits(low: DatedPrice, high: DatedPrice, lastDate: string, unit: number): PriceAsTimeHit[] {
  if (!(unit > 0)) return [];
  const later = day(low.date) >= day(high.date) ? low : high;
  const sources: [PriceAsTimeHit["source"], string, number][] = [
    ["low", low.date, low.price / unit],
    ["high", high.date, high.price / unit],
    ["range", later.date, Math.abs(high.price - low.price) / unit],
  ];
  const out: PriceAsTimeHit[] = [];
  for (const [source, from, points] of sources) {
    if (!(points >= MIN_POINTS)) continue;
    const days = elapsedDays(from, lastDate);
    if (!(days > 0)) continue;
    for (const u of ["days", "weeks", "months"] as const) {
      const elapsed = days / DAYS_PER[u];
      const k = Math.round(elapsed / points);
      if (k >= 1 && k <= MAX_MULTIPLE && Math.abs(elapsed - k * points) <= TOLERANCE[u]) {
        out.push({ source, pivotDate: from.slice(0, 10), points: Math.round(points * 100) / 100, unit: u, multiple: k, elapsed });
      }
    }
  }
  return out;
}

export interface BalanceSide {
  pivotDate: string;
  /** Points up from the low, or down from the high. */
  points: number;
  weeks: number;
  balanced: boolean;
}

/** Ch.18 TP-2: points moved from the low (or the high) against weeks since it. */
export function timePriceBalance(
  low: DatedPrice,
  high: DatedPrice,
  lastDate: string,
  price: number,
  unit: number,
): { fromLow: BalanceSide; fromHigh: BalanceSide } {
  const side = (p: DatedPrice, points: number): BalanceSide => {
    const weeks = elapsedDays(p.date, lastDate) / 7;
    const pts = unit > 0 ? Math.round((points / unit) * 100) / 100 : 0;
    return { pivotDate: p.date.slice(0, 10), points: pts, weeks, balanced: unit > 0 && pts >= MIN_POINTS && Math.abs(pts - weeks) <= BALANCE_TOLERANCE };
  };
  return { fromLow: side(low, price - low.price), fromHigh: side(high, high.price - price) };
}

// ---------------------------------------------------------------------------
// C-TIME-20: fractions of the year from two pivots

const LOW_FRACTIONS = [
  { label: "1/4", days: 91 },
  { label: "3/4", days: 273 },
] as const;
const HIGH_FRACTIONS = [
  { label: "1/3", days: 121 },
  { label: "2/3", days: 242 },
] as const;
const FRACTION_WINDOW_DAYS = 2;

export interface TwoPivotFractionReading {
  lowDate: string;
  highDate: string;
  fromLow: (typeof LOW_FRACTIONS)[number]["label"];
  fromHigh: (typeof HIGH_FRACTIONS)[number]["label"];
  /** Price within one point of ½ or ¾ of the range up from the low. */
  priceAtHalfOrThreeQuarter: boolean;
}

/** The date where ¼ or ¾ of a year from the low meets ⅓ or ⅔ from the high, or null. */
export function twoPivotFraction(
  low: DatedPrice,
  high: DatedPrice,
  lastDate: string,
  price: number,
  unit: number,
): TwoPivotFractionReading | null {
  const fromLowDays = elapsedDays(low.date, lastDate);
  const fromHighDays = elapsedDays(high.date, lastDate);
  const l = LOW_FRACTIONS.find((f) => Math.abs(fromLowDays - f.days) <= FRACTION_WINDOW_DAYS);
  const h = HIGH_FRACTIONS.find((f) => Math.abs(fromHighDays - f.days) <= FRACTION_WINDOW_DAYS);
  if (!l || !h) return null;
  const range = high.price - low.price;
  const at = range > 0 && unit > 0 && [0.5, 0.75].some((f) => Math.abs(price - (low.price + f * range)) <= unit);
  return { lowDate: low.date.slice(0, 10), highDate: high.date.slice(0, 10), fromLow: l.label, fromHigh: h.label, priceAtHalfOrThreeQuarter: at };
}

// ---------------------------------------------------------------------------
// C-TIME-14: the square of 90 in months and weeks

const SQUARE_STEP = 11.25;
const SQUARE_MAX = 180;

export interface SquareOf90Hit {
  origin: "inception" | "low";
  originDate: string;
  unit: "months" | "weeks";
  count: number;
  step: number;
  /** A quarter of the square (22½, 45, 67½, 90 …), the steps Gann names for new listings. */
  quarter: boolean;
}

/** Whole calendar months from `from` to `to` (both YYYY-MM-…), ignoring the day. */
function wholeMonths(from: string, to: Date): number {
  return (to.getUTCFullYear() - Number(from.slice(0, 4))) * 12 + (to.getUTCMonth() + 1 - Number(from.slice(5, 7)));
}

function monthsSince(origin: Inception, asOf: Date): { count: number; tolerance: number } | null {
  if (origin.precision === "year") return null;
  if (origin.precision === "month") return { count: wholeMonths(origin.date, asOf), tolerance: 1 };
  return { count: (asOf.getTime() - day(origin.date)) / DAY_MS / DAYS_PER.months, tolerance: TOLERANCE.months };
}

export function squareOf90Counts(origin: Inception, label: SquareOf90Hit["origin"], asOf: Date): SquareOf90Hit[] {
  const counts: { unit: SquareOf90Hit["unit"]; count: number; tolerance: number }[] = [];
  const m = monthsSince(origin, asOf);
  if (m) counts.push({ unit: "months", ...m });
  if (origin.precision === "day") counts.push({ unit: "weeks", count: (asOf.getTime() - day(origin.date)) / DAY_MS / 7, tolerance: TOLERANCE.weeks });
  const out: SquareOf90Hit[] = [];
  for (const c of counts) {
    const k = Math.round(c.count / SQUARE_STEP);
    const step = k * SQUARE_STEP;
    if (k >= 1 && step <= SQUARE_MAX && Math.abs(c.count - step) <= c.tolerance) {
      out.push({ origin: label, originDate: origin.date.slice(0, 10), unit: c.unit, count: c.count, step, quarter: k % 2 === 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// C-TIME-07: market days at multiples of 11¼

const MARKET_DAY_MAX = 360;
const MARKET_DAY_TOLERANCE = 0.5;

export interface MarketDayHit {
  pivot: "high" | "low";
  pivotDate: string;
  marketDays: number;
  /** marketDays ≈ multiple × 11¼. */
  multiple: number;
}

/** Bars (market days) from the extreme high and low of `bars` to the last bar, on a multiple of 11¼. */
export function marketDayElevenths(bars: { t: string; h: number; l: number }[]): MarketDayHit[] {
  if (bars.length < 2) return [];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const out: MarketDayHit[] = [];
  for (const [pivot, i] of [["high", hi], ["low", lo]] as const) {
    const n = bars.length - 1 - i;
    const k = Math.round(n / SQUARE_STEP);
    if (k >= 1 && k * SQUARE_STEP <= MARKET_DAY_MAX && Math.abs(n - k * SQUARE_STEP) <= MARKET_DAY_TOLERANCE) {
      out.push({ pivot, pivotDate: bars[i].t.slice(0, 10), marketDays: n, multiple: k });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// M-T18: months from the first trade on the hexagon

export interface HexagonInceptionHit {
  inception: string;
  months: number;
  line: HexLineHit | null;
  named: number | null;
}

export function hexagonMonthsFromInception(inception: Inception | null | undefined, asOf: Date): HexagonInceptionHit | null {
  if (!inception || inception.precision === "year") return null;
  const m = inception.precision === "month" ? wholeMonths(inception.date, asOf) : (asOf.getTime() - day(inception.date)) / DAY_MS / DAYS_PER.months;
  if (!(m > 0)) return null;
  const line = hexLinesAt(m, TOLERANCE.months)[0] ?? null;
  const named = HEX_NAMED_MONTHS.find((n) => Math.abs(m - n) <= TOLERANCE.months) ?? null;
  return line || named ? { inception: inception.date.slice(0, 10), months: m, line, named } : null;
}

// ---------------------------------------------------------------------------
// The whole reading, for `readDisclosedRules`

export interface PriceAsTimeReading {
  unit: number;
  /** The stored inception date was usable (known to the month or the day). */
  inceptionRead: boolean;
  hits: PriceAsTimeHit[];
  /** The next date the low, high or range comes out on, in days, weeks or months. */
  upcoming: { source: PriceAsTimeHit["source"]; unit: CountUnit; points: number; date: string } | null;
  balance: ReturnType<typeof timePriceBalance>;
  halving: HalvingChainReading;
  twoPivot: TwoPivotFractionReading | null;
  squareOf90: SquareOf90Hit[];
  marketDays: MarketDayHit[];
  hexagonInception: HexagonInceptionHit | null;
}

export function readPriceAsTime(
  bars: Bar[],
  price: number,
  unit: number,
  inception: Inception | null | undefined,
  asOf: Date,
): PriceAsTimeReading | null {
  if (bars.length < 2 || !(unit > 0)) return null;
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const low = { date: bars[lo].t.slice(0, 10), price: bars[lo].l };
  const high = { date: bars[hi].t.slice(0, 10), price: bars[hi].h };
  const lastDate = bars[bars.length - 1].t.slice(0, 10);

  let upcoming: PriceAsTimeReading["upcoming"] = null;
  const later = day(low.date) >= day(high.date) ? low : high;
  for (const [source, from, points] of [
    ["low", low.date, low.price / unit],
    ["high", high.date, high.price / unit],
    ["range", later.date, (high.price - low.price) / unit],
  ] as const) {
    if (!(points >= MIN_POINTS)) continue;
    for (const u of ["days", "weeks", "months"] as const) {
      const date = priceAsTimeDates(points, from, u).find((d) => d > lastDate);
      if (date && (!upcoming || date < upcoming.date)) upcoming = { source, unit: u, points: Math.round(points * 100) / 100, date };
    }
  }

  const majors = majorPivots(findPivots(bars, 5));
  const lastLow = [...majors].reverse().find((p) => p.kind === "low");
  const lastHigh = [...majors].reverse().find((p) => p.kind === "high");
  const twoPivot =
    lastLow && lastHigh
      ? twoPivotFraction({ date: lastLow.bar.t, price: lastLow.price }, { date: lastHigh.bar.t, price: lastHigh.price }, lastDate, price, unit)
      : null;

  const inceptionRead = !!inception && inception.precision !== "year";
  const lastAt = new Date(day(lastDate));
  return {
    unit,
    inceptionRead,
    hits: priceAsTimeHits(low, high, lastDate, unit),
    upcoming,
    balance: timePriceBalance(low, high, lastDate, price, unit),
    halving: halvingChainTime(low, high, lastDate),
    twoPivot,
    squareOf90: [
      ...(inception ? squareOf90Counts(inception, "inception", asOf) : []),
      ...squareOf90Counts({ date: low.date, precision: "day" }, "low", lastAt),
    ],
    marketDays: marketDayElevenths(bars),
    hexagonInception: hexagonMonthsFromInception(inception, asOf),
  };
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""));

/** Plain-language lines for the explanation trace. */
export function describePriceAsTime(r: PriceAsTimeReading): string[] {
  const lines: string[] = [];
  for (const h of r.hits) {
    const what = h.source === "range" ? "the range" : `the ${h.source}`;
    lines.push(
      `${what[0].toUpperCase()}${what.slice(1)} (${fmt(h.points)} points) comes out in time: ${Math.round(h.elapsed)} ${h.unit} from ${h.pivotDate}${h.multiple > 1 ? `, ${h.multiple} times the count` : ""}. Price and time square.`,
    );
  }
  if (r.upcoming) lines.push(`Next price-as-time date: ${r.upcoming.date}, the ${r.upcoming.source} (${fmt(r.upcoming.points)} points) counted in ${r.upcoming.unit}.`);
  for (const [name, b] of [["up from the low", r.balance.fromLow], ["down from the high", r.balance.fromHigh]] as const) {
    if (b.balanced) lines.push(`${fmt(b.points)} points ${name} in ${Math.round(b.weeks)} weeks: time and price balance.`);
  }
  for (const h of r.halving.hits) lines.push(`${h.days} days from the ${h.pivot} of ${h.pivotDate}: a term of the 20,736-day halving chain.`);
  if (r.twoPivot) {
    lines.push(
      `${r.twoPivot.fromLow} year from the ${r.twoPivot.lowDate} low meets ${r.twoPivot.fromHigh} year from the ${r.twoPivot.highDate} high${r.twoPivot.priceAtHalfOrThreeQuarter ? ", with price at the 1/2 or 3/4 point of the range" : ""}.`,
    );
  }
  for (const s of r.squareOf90) {
    lines.push(`${fmt(Math.round(s.count * 10) / 10)} ${s.unit} from the ${s.origin === "inception" ? "company's inception" : "low"} (${s.originDate}): on ${fmt(s.step)} of the square of 90${s.quarter ? ", a quarter" : ""}.`);
  }
  for (const m of r.marketDays) lines.push(`${m.marketDays} market days from the ${m.pivot} of ${m.pivotDate}: ${m.multiple} x 11 1/4.`);
  const hx = r.hexagonInception;
  if (hx) {
    lines.push(
      `${fmt(Math.round(hx.months * 10) / 10)} months from the company's inception (${hx.inception})${hx.line ? `: on ${hx.line.number} of the Hexagon Chart (${hx.line.kind === "completion" ? "a ring completion" : hx.line.kind === "corner" ? "a corner" : "a mid-side"})` : ""}${hx.named !== null ? `; the ${hx.named}th month is a named count` : ""}.`,
    );
  }
  return lines;
}
