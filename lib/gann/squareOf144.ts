/**
 * The Square of 144's fraction and convergence rules (*Master Stock Market
 * Course* Ch. 13, "The Master Mathematical Price, Time and Trend Calculator",
 * pp. 370-379, signed 1953; Tier A). Built 2026-10-16 at the project owner's
 * request. `timeConvergence.ts` already reads one part of the chapter (days,
 * weeks and months from the year's extreme on a multiple of 12); this module
 * reads the rest of what the chapter makes operational:
 *
 * 1. **The strongest points of the square** are ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞ and
 *    the full square: 36, 48, 54, 72, 90, 96, 108, 126 and 144, "for
 *    resistance in PRICE and TIME". Read in time (days, weeks and months from
 *    the extreme high and low) and in price.
 * 2. **Squaring the price in time.** "Watch the square in time of the highest
 *    price, the lowest price, the range": the wheat example squares a 28¢ low
 *    every 28 months. Read as elapsed time from the low (high) landing on a
 *    multiple of the low (high) price, and from the later extreme on a
 *    multiple of the range.
 * 3. **Convergence.** "Convergence of several independent squarings into one
 *    narrow window is the signal" (the wheat example: 2 × 144 = 288 and
 *    6½ × 44 = 286 both inside 281-288). Read as how many of the above land
 *    today, and the next day within `HORIZON_DAYS` where two or more do.
 * 4. **Passing out of one square into another.** "When prices pass out of one
 *    square into another, a change of trend usually takes place." Read as
 *    price crossing a multiple of 144 within the last `RECENT_BARS` bars.
 *
 * Context only, live scan and replay alike (`disclosedRules.ts`), measured
 * through `contextFactors.ts`. Gann's own reasons for 144 are partly
 * scriptural; the arithmetic is what is used here, and it is a periodicity
 * claim that has cleared no Dewey item, so it may not gate anything.
 *
 * Engineering choices, labelled as such:
 * - Prices are read in dollars, Gann's points on stocks. A price reading
 *   (rules 1 and 4) is skipped where one of his points is wider than the
 *   square's finest step (9, a sixteenth), because it could not tell one
 *   level from the next. Rule 2 is skipped for an anchor price under
 *   `MIN_SQUARE_PRICE` units, which would land on some multiple nearly every
 *   period.
 * - Tolerances: ±1 day, ±½ week, ±½ month, the same as `timeConvergence.ts`.
 * - Anchors: the highest high and lowest low of the bars supplied (about a
 *   year in the scan). Gann ranks the all-time extremes first.
 *
 * Three-question basis:
 * 1. Gann: as cited, his own course.
 * 2. Cycles: a claim about recurrence. Dewey's checklist is not cleared on
 *    any item (no base rate, no out-of-sample test); the replay's factor table
 *    is that base-rate test.
 * 3. Hermetic: Correspondence (one square for price and time; "TIME and
 *    PRICE is SQUARE") and Vibration (independent counts landing together).
 */

import type { Bar } from "@/lib/types";
import { gannPoint } from "@/lib/gann/overnightChart";

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.4375;

/** The strongest points of the 144 square: ¼ ⅓ ⅜ ½ ⅝ ⅔ ¾ ⅞ and the whole. */
export const STRONG_POINTS = [36, 48, 54, 72, 90, 96, 108, 126, 144] as const;
export const FRACTION_LABELS: Record<number, string> = {
  36: "¼", 48: "⅓", 54: "⅜", 72: "½", 90: "⅝", 96: "⅔", 108: "¾", 126: "⅞", 144: "full square",
};
export const FINEST_STEP = 9;
export const MIN_SQUARE_PRICE = 10;
export const HORIZON_DAYS = 60;
export const RECENT_BARS = 5;

type Unit = "days" | "weeks" | "months";
const UNITS: { unit: Unit; per: number; tol: number }[] = [
  { unit: "days", per: 1, tol: 1 },
  { unit: "weeks", per: 7, tol: 0.5 },
  { unit: "months", per: MONTH_DAYS, tol: 0.5 },
];

export interface SquareHit {
  /** What was counted from, e.g. "high" or "low". */
  anchor: "high" | "low" | "range";
  unit: Unit;
  /** The count that landed, in that unit. */
  count: number;
  /** "½ of 144", or "3 × the low price". */
  label: string;
}

export interface Square144Reading {
  high: { price: number; date: string };
  low: { price: number; date: string };
  /** Counts landing today. */
  hits: SquareHit[];
  /** The next date within the horizon where two or more counts land together. */
  nextConvergence: { date: string; hits: SquareHit[] } | null;
  /** The strongest price points nearest above and below, or null where a point is too wide to read them. */
  price: { above: number; below: number; nearest: { level: number; label: string; distance: number } } | null;
  /** Price crossed a multiple of 144 in the last few bars, and which way. */
  passedSquare: { level: number; direction: "up" | "down" } | null;
}

function near(x: number, target: number, tol: number): boolean {
  return Math.abs(x - target) <= tol;
}

/** The strong point of the 144 square a count sits on, if any. */
function onStrongPoint(count: number, tol: number): number | null {
  if (count < STRONG_POINTS[0] - tol) return null;
  const pos = count % 144;
  for (const p of STRONG_POINTS) {
    if (near(pos, p % 144, tol) || (p === 144 && near(pos, 144, tol))) return p;
  }
  return null;
}

/** Every count landing on a date, from the two extremes. */
function hitsOn(dayMs: number, high: { price: number; t: number }, low: { price: number; t: number }): SquareHit[] {
  const hits: SquareHit[] = [];
  const range = high.price - low.price;
  const later = Math.max(high.t, low.t);
  for (const { unit, per, tol } of UNITS) {
    for (const [anchor, a] of [["high", high], ["low", low]] as const) {
      const n = (dayMs - a.t) / DAY_MS / per;
      if (n <= 0) continue;
      const p = onStrongPoint(n, tol);
      if (p !== null) hits.push({ anchor, unit, count: Math.round(n), label: `${FRACTION_LABELS[p]} of 144` });
      // Squaring the price in time: elapsed time a multiple of the price.
      if (a.price >= MIN_SQUARE_PRICE && n >= a.price - tol) {
        const k = Math.round(n / a.price);
        if (k >= 1 && near(n, k * a.price, tol)) hits.push({ anchor, unit, count: Math.round(n), label: `${k} × the ${anchor} price` });
      }
    }
    const nr = (dayMs - later) / DAY_MS / per;
    if (range >= MIN_SQUARE_PRICE && nr >= range - tol) {
      const k = Math.round(nr / range);
      if (k >= 1 && near(nr, k * range, tol)) hits.push({ anchor: "range", unit, count: Math.round(nr), label: `${k} × the range` });
    }
  }
  return hits;
}

export function readSquareOf144(bars: Bar[]): Square144Reading | null {
  if (bars.length < 20) return null;
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h >= bars[hi].h) hi = i;
    if (bars[i].l <= bars[lo].l) lo = i;
  }
  const high = { price: bars[hi].h, t: Date.parse(bars[hi].t) };
  const low = { price: bars[lo].l, t: Date.parse(bars[lo].t) };
  const last = bars[bars.length - 1];
  const today = Date.parse(last.t);

  let nextConvergence: Square144Reading["nextConvergence"] = null;
  for (let d = 1; d <= HORIZON_DAYS && !nextConvergence; d++) {
    const t = today + d * DAY_MS;
    const h = hitsOn(t, high, low);
    if (h.length >= 2) nextConvergence = { date: new Date(t).toISOString().slice(0, 10), hits: h };
  }

  const price = last.c;
  const readable = gannPoint(price) <= FINEST_STEP;
  let priceReading: Square144Reading["price"] = null;
  let passedSquare: Square144Reading["passedSquare"] = null;
  if (readable && price > 0) {
    const base = Math.floor(price / 144) * 144;
    const levels = [base - 144, base, base + 144]
      .flatMap((b) => STRONG_POINTS.map((p) => ({ level: b + p, label: `${FRACTION_LABELS[p]} of the ${Math.floor(b / 144) + 1}${ordinal(Math.floor(b / 144) + 1)} square` })))
      .filter((l) => l.level > 0);
    const above = levels.filter((l) => l.level >= price).sort((a, b) => a.level - b.level)[0];
    const below = levels.filter((l) => l.level < price).sort((a, b) => b.level - a.level)[0];
    if (above && below) {
      const nearest = above.level - price <= price - below.level ? above : below;
      priceReading = { above: above.level, below: below.level, nearest: { ...nearest, distance: Math.abs(nearest.level - price) } };
    }
    const window = bars.slice(-(RECENT_BARS + 1));
    for (let k = window.length - 1; k >= 1 && !passedSquare; k--) {
      const a = window[k - 1].c;
      const b = window[k].c;
      const m = Math.floor(Math.max(a, b) / 144) * 144;
      if (m > 0 && Math.min(a, b) < m && Math.max(a, b) >= m) passedSquare = { level: m, direction: b > a ? "up" : "down" };
    }
  }

  return {
    high: { price: high.price, date: bars[hi].t.slice(0, 10) },
    low: { price: low.price, date: bars[lo].t.slice(0, 10) },
    hits: hitsOn(today, high, low),
    nextConvergence,
    price: priceReading,
    passedSquare,
  };
}

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return "th";
  return n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
}

export function describeSquareOf144(r: Square144Reading): string[] {
  const lines: string[] = [];
  const fmt = (h: SquareHit) => `${h.count} ${h.unit} from the ${h.anchor === "range" ? "later extreme" : h.anchor} (${h.label})`;
  if (r.hits.length > 0) lines.push(`Square of 144 today: ${r.hits.map(fmt).join("; ")}${r.hits.length >= 2 ? ". Counts converge: watch for a change in trend" : ""}.`);
  if (r.nextConvergence) lines.push(`Next Square of 144 convergence: ${r.nextConvergence.date} (${r.nextConvergence.hits.map(fmt).join("; ")}).`);
  if (r.price && r.price.nearest.distance <= gannPoint(r.price.nearest.level)) {
    lines.push(`Price is at ${r.price.nearest.level.toFixed(0)}, the ${r.price.nearest.label}: a strong point for resistance.`);
  }
  if (r.passedSquare) lines.push(`Price passed ${r.passedSquare.direction === "up" ? "up into" : "down out of"} the square at ${r.passedSquare.level}: a change of trend usually follows.`);
  return lines;
}
