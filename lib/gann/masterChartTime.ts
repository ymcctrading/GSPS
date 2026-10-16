/**
 * Two divisions of the circle from Gann's Master Chart of 360° that the 1953
 * order in `circleOf360.ts` doesn't carry (gap G28, built 2026-10-16 under the
 * owner's "every Gann method acts").
 *
 * Source, Tier A: Master Course Ch. 15A, "Master Chart of 360°" (91 Wall
 * Street letterhead):
 * - **÷48.** The circle in 48 parts of 7½°, "important in measuring day,
 *   weekly and monthly time periods".
 * - **÷7.** 51³⁄₇, 102⁶⁄₇, 154²⁄₇, 205⁵⁄₇, 257¹⁄₇, 308⁴⁄₇ and 360: why fast
 *   moves so often end on the 49th or the 52nd day, and why the 7th week,
 *   month and year matter. 1½ × 51³⁄₇ = 77⅐, so the 77th day, week or month
 *   is important too.
 * Corroboration: Jensen's harmonics of 120 (7½, 15, 30, 60 …) counted in
 * calendar time from a major high or low (B16).
 *
 * Read like the rest of the circle in time: calendar days, weeks and months
 * from the extreme high and low of the bars, each read as degrees (one unit
 * to a degree, past 360 read within the circle).
 *
 * Engineering choices, labelled as such:
 * - Tolerance: 1 day, ½ week, ½ month, as in `squareOfNineTime.ts`. Tighter
 *   than the circle's 1¼ because a 7½° step leaves little room.
 * - A 48th that is also a multiple of 15° is already on the circle's 1953
 *   order, so only the odd multiples of 7½° (7½, 22½, 37½ …) count as new
 *   48ths here; the reading still reports the multiple of 15° when it lands.
 * - Counts below 7 are skipped.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: a recurrence claim. No Dewey item is cleared; the replay's factor
 *    table is the first base-rate test, with the rule fixed before it.
 * 3. Hermetic: Rhythm, the circle divided in time; Correspondence, the same
 *    seven Gann reads in days, weeks, months and years.
 */

export type MasterChartUnit = "days" | "weeks" | "months";
const TOLERANCE: Record<MasterChartUnit, number> = { days: 1, weeks: 0.5, months: 0.5 };
const MIN_COUNT = 7;

export const FORTY_EIGHTH = 360 / 48; // 7½
export const SEVENTH = 360 / 7; // 51³⁄₇

/** The seventh points 51³⁄₇ … 360. */
export const SEVENTH_POINTS = Array.from({ length: 7 }, (_, i) => (i + 1) * SEVENTH);
/** Gann's named counts for the sevenths, by unit: the 49th and 52nd day, the 7th week and month, the 77th of each. */
export const SEVENTH_NAMED: Record<MasterChartUnit, readonly number[]> = {
  days: [49, 52, 77],
  weeks: [7, 77],
  months: [7, 77],
};

export interface MasterChartHit {
  pivot: "high" | "low";
  pivotDate: string;
  unit: MasterChartUnit;
  count: number;
  /** The count's place in the circle. */
  degree: number;
  /** On an odd multiple of 7½° (a 48th the 1953 order lacks). */
  fortyEighth: number | null;
  /** On a seventh of the circle, or one of Gann's named counts for it. */
  seventh: number | null;
}

function near(value: number, target: number, tol: number): boolean {
  return Math.abs(value - target) <= tol;
}

/** The odd multiple of 7½° within `tol` of `degree`, or null. */
export function oddFortyEighthAt(degree: number, tol: number): number | null {
  const k = Math.round(degree / FORTY_EIGHTH);
  if (k % 2 === 0) return null;
  const target = k * FORTY_EIGHTH;
  return near(degree, target, tol) ? target : null;
}

/** The seventh point (or named count) within `tol`, or null. Named counts are read on the raw count. */
export function seventhAt(unit: MasterChartUnit, count: number, degree: number, tol: number): number | null {
  const named = SEVENTH_NAMED[unit].find((n) => near(count, n, tol));
  if (named !== undefined) return named;
  const point = SEVENTH_POINTS.find((p) => near(degree, p, tol) || (p === 360 && near(degree, 0, tol)));
  return point ?? null;
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

export function readMasterChartTime(bars: { t: string; h: number; l: number }[]): MasterChartHit[] {
  if (bars.length < 2) return [];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const last = Date.parse(bars[bars.length - 1].t);
  const out: MasterChartHit[] = [];
  for (const [pivot, i] of [["high", hi], ["low", lo]] as const) {
    const days = (last - Date.parse(bars[i].t)) / DAY_MS;
    const counts: [MasterChartUnit, number][] = [
      ["days", days],
      ["weeks", days / 7],
      ["months", days / DAYS_PER_MONTH],
    ];
    for (const [unit, count] of counts) {
      if (count < MIN_COUNT - TOLERANCE[unit]) continue;
      const degree = count % 360;
      const fortyEighth = oddFortyEighthAt(degree, TOLERANCE[unit]);
      const seventh = seventhAt(unit, count, degree, TOLERANCE[unit]);
      if (fortyEighth !== null || seventh !== null) {
        out.push({ pivot, pivotDate: bars[i].t.slice(0, 10), unit, count, degree, fortyEighth, seventh });
      }
    }
  }
  return out;
}

function fmt(d: number): string {
  return Number.isInteger(d) ? `${d}` : d.toFixed(2);
}

export function describeMasterChartTime(hits: MasterChartHit[]): string[] {
  return hits.map((h) => {
    const parts: string[] = [];
    if (h.fortyEighth !== null) parts.push(`${fmt(h.fortyEighth)}°, a 48th of the circle`);
    if (h.seventh !== null) {
      parts.push(
        SEVENTH_NAMED[h.unit].includes(h.seventh)
          ? `the ${h.seventh}th ${h.unit.slice(0, -1)}, a count of the circle's sevenths`
          : `${fmt(h.seventh)}°, a seventh of the circle`,
      );
    }
    return `Master Chart of 360°: ${Math.round(h.count)} ${h.unit} from the ${h.pivot} of ${h.pivotDate}, on ${parts.join(" and ")}.`;
  });
}
