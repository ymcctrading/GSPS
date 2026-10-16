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
 * - The Ch.18 balance holds when points and weeks agree within 1.
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
    return { pivotDate: p.date.slice(0, 10), points: pts, weeks, balanced: unit > 0 && pts > 0 && weeks > 0 && Math.abs(pts - weeks) <= BALANCE_TOLERANCE };
  };
  return { fromLow: side(low, price - low.price), fromHigh: side(high, high.price - price) };
}
