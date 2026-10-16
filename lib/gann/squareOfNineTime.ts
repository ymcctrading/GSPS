/**
 * Gann's Square of Nine read in time (built 2026-09-30, owner: "execute";
 * "I always defer to Gann's method").
 *
 * Sources:
 * - Tier A: Master Course Ch. 2 (1931) lists the numbers on the square's
 *   spokes (3, 13, 31, 57, 91, 133 … and 7, 21, 43, 73, 111, 157 …) as
 *   "great resistance points and measuring out important time factors", and
 *   ranks the cardinal cross (0, 90, 180, 270) and the fixed cross (45, 135,
 *   225, 315) as the square's strongest lines.
 * - Tier A: his Square of Nine plate (Collected Writings Vol. 3 p. 34), 1 to
 *   1,089, labelled every 22.5° with a date of the solar year.
 * - The Cycles Research Institute workbook (B12, owner-trusted): its "SQ9 Time"
 *   sheets put a start date at the centre and step one day per cell, so the
 *   dates on the angle lines are the square's time points.
 *
 * The plate's numbering gives every line in closed form. Ring k (k ≥ 1) runs
 * from (2k−1)² + 1 to (2k+1)², and the number on the line at angle a is
 * (2k+1)² − (7 − a/45)·k, with 0° East (2, 11, 28, 53 …), 45° (3, 13, 31,
 * 57 …), 315° the odd squares (9, 25, 49 …) and 337.5° read as −22.5°. The
 * 22.5° lines fall on whole cells only on even rings, which is exactly what
 * the workbook highlights; the tests check the lines against the plate.
 *
 * Time: a count of days, weeks or months from an important top or bottom that
 * equals a number on one of the lines is a time point, the same way the
 * Square of 144 reads time (`masterCalculator.ts`). Gann counts time from the
 * extreme highs and lows first, so the extreme high and low of the bars read
 * are the pivots, as in the calculator.
 *
 * Engineering choices, labelled as such:
 * - Tolerance: 1 day, ½ week, ½ month.
 * - Numbers below 10 (the first ring, where every cell is on a line and so
 *   says nothing) are skipped.
 * - The centre cell is the pivot itself, and a count is read as the number,
 *   the way Gann quotes the spoke numbers as time factors. The workbook's
 *   start-date-at-centre layout would read one less; the 1-day tolerance
 *   covers the difference.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: a recurrence claim (dates on the lines recur at growing
 *    intervals, about one per ring per line). No Dewey item is cleared; the
 *    reading enters as measured context, and the replay's factor table is its
 *    first base-rate test.
 * 3. Hermetic: Correspondence, the one square read in price and in time.
 *    Rhythm is the subject, not the method.
 */

export type LineKind = "cardinal" | "fixed" | "sixteenth";

export const CARDINAL_CROSS = [0, 90, 180, 270];
export const FIXED_CROSS = [45, 135, 225, 315];
export const SIXTEENTH_LINES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

/** The number on the line at `angle` (a multiple of 22.5°) in ring k, or null when that line falls between cells on this ring. */
export function numberOnLine(angle: number, ring: number): number | null {
  if (!(ring >= 1) || !Number.isInteger(ring)) return null;
  const a = ((angle % 360) + 360) % 360;
  const signed = a > 315 ? a - 360 : a; // 337.5° sits before 0° in the ring's order
  const n = (2 * ring + 1) ** 2 - (7 - signed / 45) * ring;
  return Number.isInteger(n) ? n : null;
}

/** Every number on the line at `angle`, from ring 1 up to `max`. */
export function numbersOnLine(angle: number, max: number): number[] {
  const out: number[] = [];
  for (let k = 1; (2 * k - 1) ** 2 + 1 <= max; k++) {
    const n = numberOnLine(angle, k);
    if (n !== null && n <= max) out.push(n);
  }
  return out;
}

export function lineKind(angle: number): LineKind {
  const a = ((angle % 360) + 360) % 360;
  if (CARDINAL_CROSS.includes(a)) return "cardinal";
  if (FIXED_CROSS.includes(a)) return "fixed";
  return "sixteenth";
}

export type TimeUnit = "days" | "weeks" | "months";
const TOLERANCE: Record<TimeUnit, number> = { days: 1, weeks: 0.5, months: 0.5 };
const MIN_NUMBER = 10;

export interface LineHit {
  number: number;
  angle: number;
  kind: LineKind;
}

/** The line numbers within `tolerance` of `count` (numbers from 10 up). Cardinal first, then fixed, then sixteenths. */
export function linesAt(count: number, tolerance: number): LineHit[] {
  if (!(count >= MIN_NUMBER - tolerance)) return [];
  const hits: LineHit[] = [];
  for (const angle of [...CARDINAL_CROSS, ...FIXED_CROSS, ...SIXTEENTH_LINES]) {
    const k = Math.max(1, Math.round((Math.sqrt(Math.max(count, 1)) - 1) / 2));
    for (const ring of [k - 1, k, k + 1]) {
      const n = numberOnLine(angle, ring);
      if (n !== null && n >= MIN_NUMBER && Math.abs(count - n) <= tolerance) {
        hits.push({ number: n, angle, kind: lineKind(angle) });
      }
    }
  }
  return hits;
}

export interface SquareOfNineTimeHit {
  pivot: "high" | "low";
  pivotDate: string;
  unit: TimeUnit;
  count: number;
  line: LineHit;
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * Days, weeks and months from the extreme high and the extreme low of `bars`
 * to the last bar, and the Square of Nine lines they sit on.
 */
export function readSquareOfNineTime(bars: { t: string; h: number; l: number }[]): SquareOfNineTimeHit[] {
  if (bars.length < 2) return [];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const last = Date.parse(bars[bars.length - 1].t);
  const out: SquareOfNineTimeHit[] = [];
  for (const [pivot, i] of [["high", hi], ["low", lo]] as const) {
    const days = (last - Date.parse(bars[i].t)) / DAY_MS;
    const counts: [TimeUnit, number][] = [
      ["days", days],
      ["weeks", days / 7],
      ["months", days / DAYS_PER_MONTH],
    ];
    for (const [unit, count] of counts) {
      const hit = linesAt(count, TOLERANCE[unit])[0];
      if (hit) out.push({ pivot, pivotDate: bars[i].t.slice(0, 10), unit, count, line: hit });
    }
  }
  return out;
}

/** Plain-language lines for the explanation trace. */
export function describeSquareOfNineTime(hits: SquareOfNineTimeHit[]): string[] {
  return hits.map(
    (h) =>
      `${Math.round(h.count)} ${h.unit} from the ${h.pivot} of ${h.pivotDate}: on ${h.line.number}, the ${h.line.angle}° line of the time square (${h.line.kind === "cardinal" ? "cardinal cross" : h.line.kind === "fixed" ? "fixed cross" : "22.5° line"}), a time point.`,
  );
}
