/**
 * Gann's circle of 360° for time and price (Tier A): "Time Periods and Price
 * Resistance", the second part of the Master Calculator lesson signed
 * September 29, 1953 (Master Course Ch. 13), and the par-to-degrees rule on
 * the last page of the geometric angles course, GA-32 (November 1935, Ch. 4).
 * Built 2026-09-30. Source note:
 * `docs/memory-bank/sources/A12_master_calculator_1953_and_1954_letter.md`.
 *
 * What the lesson says, as implemented here:
 * - **Divisions, in Gann's order.** ÷2 (180, most important), ÷3 (120 and
 *   240, the triangle points), ÷4 (90, 180, 270, 360, "the squares and most
 *   important"), ÷8 (the 45s), ÷16 (22½), ÷32 (11¼), ÷64 (5⅝). Then three
 *   more he adds for points the table of 64ths misses: ÷6 (60 and 300), ÷12
 *   (30, 150, 210, 330: "works out accurately for time periods") and ÷24
 *   (15° steps, about 15 days: 15, 75, 105, 165, 195, 255, 285, 345).
 * - **The squares 1 to 361** (1, 4, 9 … 324, 361 = 19²) are "important
 *   degrees in the circle".
 * - **How to read it.** Figure how many points price is up from the extreme
 *   low or a minor low, down from the extreme high or a minor high, and where
 *   the main and minor half-way points ("gravity centers") are. They form
 *   close to the natural degrees. Do the same with time, in weeks and months.
 *   His May soy beans: half-way 251⅞ against 253⅛ (45/64); half of 436¾ is
 *   218⅜ against 219⅜ (39/64); cash low 44, one from 45; the 67 low within ½
 *   of 67½. In time, Dec 28 1932 to Dec 28 1947 is 180 months, half the
 *   circle; the high came 18 days later.
 * - **Price on the degree of its time angle (GA-32).** Figuring par as the
 *   circle, $12½ is 45°, $25 90°, $37½ 135°, $50 180° … $100 360°. "When a
 *   stock sells at 50 on the 180th day, week or month, it is on the degree
 *   of its time angle." U.S. Steel, 168 months old in February 1915, made
 *   its low at $38, about $37½ = 135°: price behind time, the balance price
 *   being 168 × 100/360 = $46⅔. Above par he reads within the current
 *   hundred: $261¾ is about $262½, the 225° of the third hundred.
 *
 * Misprints in the surviving text that the code does not copy (all checked
 * against n × 5⅝, source note): row 3 of the table "16 5/8" (16⅞), row 15
 * "84 5/8" (84⅜), row 34 "101 1/4" (191¼); GA-32's "82½ = 315°" (87½); and
 * the ÷24 list omits 255.
 *
 * Engineering choices, labelled as such:
 * - Price is read in Gann points (`pointScale.ts#gannPointForBars`), one
 *   point to a degree, as his cents are on grains; par is 100 points, which
 *   is $100 at the prices GA-32 was written for.
 * - "Very close" is within 1¼ points or degrees, the loosest of his soy bean
 *   matches that he calls "very close".
 * - A reading is major when its nearest natural degree comes from ÷2, ÷3,
 *   ÷4, ÷6, ÷8 or ÷12 (the multiples of 30° and 45°); the finer divisions
 *   are reported but not counted as major.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: the time readings are recurrence claims (months from a pivot
 *    on a fraction of the circle); untested against a base rate, so context
 *    and measured only. The circle's 2×3 divisions are the lattice Tomes'
 *    harmonics work predicts (master report Part II §3), which is support for
 *    the divisions, not evidence for any one date.
 * 3. Hermetic: Correspondence, one circle for both time and price, which is
 *    GA-32's whole point; and Vibration in Gann's own sense, a number
 *    resonating with the natural degrees of the circle.
 */

export const SIXTY_FOURTH = 360 / 64; // 5⅝

/** Gann's order of the divisions of the circle, then the three he adds. */
export const DIVISION_ORDER = [2, 3, 4, 8, 16, 32, 64] as const;
export const ADDED_DIVISIONS = [6, 12, 24] as const;
const ALL_DIVISIONS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64];
/** The divisions a reading must land on to count as major: the multiples of 30° and 45°. */
export const MAJOR_DIVISIONS = new Set([1, 2, 3, 4, 6, 8, 12]);

/** "Very close": the loosest match Gann calls very close in his soy bean reading (251⅞ against 253⅛). */
export const CIRCLE_TOLERANCE = 1.25;

/** The squares from 1 to 19², "important degrees in the circle". */
export const SQUARE_DEGREES = Array.from({ length: 19 }, (_, i) => (i + 1) * (i + 1));

/** The table of 64ths: row n is n × 5⅝ degrees. */
export function tableOf64ths(): { n: number; degrees: number }[] {
  return Array.from({ length: 64 }, (_, i) => ({ n: i + 1, degrees: (i + 1) * SIXTY_FOURTH }));
}

const EPS = 1e-9;

/**
 * The coarsest division a degree belongs to: 1 for 0°/360° (the full
 * circle), 2 for 180°, 3 for 120° and 240°, and so on down to 64. Null when
 * the degree is on none of them.
 */
export function divisionOf(degree: number): number | null {
  const d = ((degree % 360) + 360) % 360;
  if (d < EPS || 360 - d < EPS) return 1;
  for (const n of ALL_DIVISIONS) {
    const step = 360 / n;
    const r = d / step;
    if (Math.abs(r - Math.round(r)) < EPS) return n;
  }
  return null;
}

/** Every natural degree in (0, 360]: the 64ths, the 15° steps and the squares. */
export const NATURAL_DEGREES: number[] = (() => {
  const set = new Set<number>();
  for (const { degrees } of tableOf64ths()) set.add(degrees);
  for (let d = 15; d <= 360; d += 15) set.add(d);
  for (const s of SQUARE_DEGREES) set.add(s);
  return [...set].sort((a, b) => a - b);
})();

/** 0, 30, 45, 60, 90 … 360: the degrees on ÷2, ÷3, ÷4, ÷6, ÷8 and ÷12. */
export const MAJOR_DEGREES: number[] = Array.from({ length: 25 }, (_, i) => i * 15).filter((d) => {
  const n = divisionOf(d);
  return n !== null && MAJOR_DIVISIONS.has(n);
});

export interface DegreeReading {
  /** The value read, in points (or time units). */
  value: number;
  /** Its place in the circle, 0 up to 360. */
  degree: number;
  /** Whole circles passed: $200 on a par of 100 is two circles. */
  circles: number;
  /** The nearest natural degree and how far off it is. */
  nearest: { degree: number; division: number | null; square: boolean; distance: number };
  /** Within 1¼ of a natural degree. */
  veryClose: boolean;
  /** Within 1¼ of a degree on ÷2, ÷3, ÷4, ÷6, ÷8 or ÷12. */
  major: boolean;
}

export function readDegree(value: number): DegreeReading {
  const v = Math.max(0, value);
  const circles = Math.floor(v / 360);
  const degree = v - circles * 360;
  let best = { degree: 360, distance: Math.min(degree, 360 - degree) };
  for (const n of NATURAL_DEGREES) {
    const dist = Math.abs(degree - n);
    if (dist < best.distance) best = { degree: n, distance: dist };
  }
  const division = divisionOf(best.degree);
  const square = SQUARE_DEGREES.includes(best.degree);
  return {
    value,
    degree,
    circles,
    nearest: { degree: best.degree, division, square, distance: best.distance },
    veryClose: best.distance <= CIRCLE_TOLERANCE,
    // Measured against the nearest major degree itself: a fine 64th can sit
    // closer to the value than the major degree it is next to.
    major: MAJOR_DEGREES.some((d) => Math.abs(degree - d) <= CIRCLE_TOLERANCE),
  };
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

export interface CircleReading {
  unit: number;
  /** Price itself, in points, as degrees. */
  price: DegreeReading;
  /** Points up from the extreme low. */
  upFromLow: DegreeReading;
  /** Points down from the extreme high. */
  downFromHigh: DegreeReading;
  /** The main half-way point (gravity center) of the extreme range. */
  halfway: DegreeReading;
  /** Half the highest price. */
  halfHigh: DegreeReading;
  /** Weeks and months from the extreme high and low, as degrees. */
  time: { pivot: "high" | "low"; pivotDate: string; unit: "weeks" | "months"; reading: DegreeReading }[];
}

/** Gann's circle reading on one symbol. `unit` is the Gann point in dollars. */
export function readCircle(bars: { t: string; h: number; l: number }[], price: number, unit: number): CircleReading | null {
  if (bars.length < 2 || !(price > 0) || !(unit > 0)) return null;
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const low = bars[lo].l;
  const high = bars[hi].h;
  if (!(low > 0) || !(high > low)) return null;
  const last = Date.parse(bars[bars.length - 1].t);
  const time: CircleReading["time"] = [];
  for (const [pivot, i] of [["high", hi], ["low", lo]] as const) {
    const days = (last - Date.parse(bars[i].t)) / DAY_MS;
    if (days < 7) continue;
    time.push({ pivot, pivotDate: bars[i].t.slice(0, 10), unit: "weeks", reading: readDegree(days / 7) });
    time.push({ pivot, pivotDate: bars[i].t.slice(0, 10), unit: "months", reading: readDegree(days / DAYS_PER_MONTH) });
  }
  return {
    unit,
    price: readDegree(price / unit),
    upFromLow: readDegree((price - low) / unit),
    downFromHigh: readDegree((high - price) / unit),
    halfway: readDegree((low + high) / 2 / unit),
    halfHigh: readDegree(high / 2 / unit),
    time,
  };
}

export interface TimeAngleReading {
  /** Months from the inception date: the time angle, one month to a degree. */
  months: number;
  timeDegree: number;
  /** The price's degree within its current hundred (par = 360°). */
  priceDegree: number;
  /** The price that would sit on the degree of its time angle, in the current hundred. */
  balancePrice: number;
  /** Price minus the balance price: negative is behind time, positive ahead of it. */
  difference: number;
  state: "ahead" | "behind" | "balanced";
}

/**
 * GA-32: is price on the degree of its time angle? Par (100 points) is the
 * circle; time is months from the company's inception, a month to a degree.
 * Needs the inception date to the month at least.
 */
export function readTimeAngle(price: number, unit: number, inceptionDate: string, asOf: Date): TimeAngleReading | null {
  const start = Date.parse(inceptionDate);
  if (!(price > 0) || !(unit > 0) || !Number.isFinite(start)) return null;
  const months = (asOf.getTime() - start) / DAY_MS / DAYS_PER_MONTH;
  if (!(months > 0)) return null;
  const timeDegree = months % 360;
  const points = price / unit;
  const hundreds = Math.floor(points / 100);
  const priceDegree = (points - hundreds * 100) * 3.6;
  const balancePrice = (hundreds * 100 + timeDegree / 3.6) * unit;
  const difference = price - balancePrice;
  const state = Math.abs(difference / unit) <= CIRCLE_TOLERANCE ? "balanced" : difference < 0 ? "behind" : "ahead";
  return { months, timeDegree, priceDegree, balancePrice, difference, state };
}

function describeDegree(label: string, r: DegreeReading): string {
  const n = r.nearest;
  return `${label}: ${r.value.toFixed(2)} points = ${r.degree.toFixed(2)}° of the circle${r.circles > 0 ? ` (circle ${r.circles + 1})` : ""}, ${n.distance.toFixed(2)} from ${n.degree}°${n.division ? ` (÷${n.division})` : n.square ? " (a square)" : ""}.`;
}

/** Plain-language lines for the explanation trace: only the readings that land very close to a natural degree. */
export function describeCircle(c: CircleReading): string[] {
  const lines: string[] = [];
  const rows: [string, DegreeReading][] = [
    ["Circle of 360°, price", c.price],
    ["Circle of 360°, up from the low", c.upFromLow],
    ["Circle of 360°, down from the high", c.downFromHigh],
    ["Circle of 360°, half-way point", c.halfway],
    ["Circle of 360°, half the high", c.halfHigh],
  ];
  for (const [label, r] of rows) if (r.veryClose) lines.push(describeDegree(label, r));
  for (const t of c.time) {
    if (t.reading.major) {
      lines.push(
        `Circle of 360° in time: ${t.reading.value.toFixed(1)} ${t.unit} from the ${t.pivot} of ${t.pivotDate}, on ${t.reading.nearest.degree}°.`,
      );
    }
  }
  return lines;
}

export function describeTimeAngle(t: TimeAngleReading): string {
  const where =
    t.state === "balanced"
      ? "on the degree of its time angle"
      : `${t.state} time by ${Math.abs(t.difference).toFixed(2)}`;
  return `Time angle: ${Math.round(t.months)} months from inception (${t.timeDegree.toFixed(1)}°); price at ${t.priceDegree.toFixed(1)}° of its hundred, ${where} (balance ${t.balancePrice.toFixed(2)}).`;
}
