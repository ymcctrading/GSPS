/**
 * Gann's Square of 144, the "Master Mathematical Price, Time and Trend
 * Calculator" (Tier A: his lesson signed September 29, 1953, Master Course
 * Ch. 13; the Master Formula and Calculators course and brochure, 1953-54).
 * Built 2026-09-30 from the full text, supplied by the project owner. Source
 * note: `docs/memory-bank/sources/A12_master_calculator_1953_and_1954_letter.md`.
 *
 * Gann sold it as a transparent overlay laid on a daily, weekly or monthly
 * chart. It reads a price (in points) and a time (in days, weeks or months)
 * as positions in a square of 144 by 144, and the brochure calls the two
 * calculators the "new discovery" of his 76th year. This module is that
 * overlay done in arithmetic. It replaces nothing: `masterTwelve.ts` is a
 * square-root spiral GSPS built earlier, not this calculator.
 *
 * What the lesson says, as implemented here:
 * - **Position in a square.** A price or a time above 144 is read by taking
 *   off whole squares: 436¾ is 3 × 144 + 4¾, "in the fourth square". When
 *   price passes out of one square into another, a change in trend usually
 *   takes place, and a new square starts every 144 units.
 * - **The strongest points** of the square are ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞ and the
 *   complete square: 36, 48, 54, 72, 90, 96, 108, 126 and 144. The triangle
 *   points, where the green angles cross, are 36, 48, 72, 96, 108 and 144.
 *   The squares inside the square are 36, 45, 54, 63, 72, 90 and 108.
 * - **Placement.** 0 on the chart's bottom, 0 on the low price, the top on
 *   the high price, or the centre (72, the "gravity center") on a half-way
 *   point: half the range, or half the highest price.
 * - **Time.** Most changes in trend come when the time from an important top
 *   or bottom is at ½ of the square, at its end, or at ⅓, ⅔, ¼ and ¾ (72,
 *   144, 48, 96, 36, 108), counted in days, weeks and months.
 * - **Time and price square.** When the price's position and the time's
 *   position in the square are equal (price 36 at time 36), time and price
 *   are square; watch for a change in trend.
 * - **Squaring price with time.** Watch when the time from a pivot equals the
 *   lowest price, the highest price or the range in points. His wheat case:
 *   low 28 squares every 28 months; high 325 needs 325 months; range 281
 *   months, with 288 = 2 × 144 so "watch 281 to 288"; 6½ × 44 = 286, within
 *   two points of 288.
 * - **The Great Cycle** is 144² = 20,736 days, halved down to 81 = 9².
 * - **Hourly.** 24 hours a day makes 6 days to pass 144 hours; a 5-hour
 *   session, 28 days 4 hours.
 *
 * Numbers checked against his arithmetic, with the misprints in the surviving
 * text (all transcribed in the source note): 27 is 3/16 of 144 (printed
 * "3/8"); 1/64 of the Great Cycle is 46 weeks 2 days (printed "41"); 325 −
 * 288 is 37 (printed "17"; his next sentence uses 36). The code computes the
 * values and does not copy the misprints.
 *
 * Engineering choices, labelled as such:
 * - Prices are read in Gann points scaled to the price level
 *   (`pointScale.ts#gannPointForBars`). At his prices a point is a dollar.
 * - "Within two points" (his wheat 286 against 288) is the tolerance for a
 *   hit, in whatever unit is being read.
 * - Months are calendar days ÷ 30.4375, and market days are bars. Leap days
 *   are counted, as he says to, because the dates are real calendar dates.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: the time readings are recurrence claims. Dewey's checklist is
 *    not cleared by any of them (no base rate yet); they are measured
 *    context factors, so the replay's factor table is their first test.
 *    The Great Cycle's longer fractions have too few repetitions in any
 *    equity history to test (M5).
 * 3. Hermetic: Correspondence, the same square read in price and in time, in
 *    days, weeks and months, which is the calculator's whole premise. Rhythm
 *    for the time counts. Not Polarity: the calculator gives levels and
 *    dates, and price decides the direction, as elsewhere in Gann's time work.
 */

export const SQUARE = 144;
export const GREAT_CYCLE = SQUARE * SQUARE; // 20,736

/** "The strongest points are 1/4, 1/3, 2/3, 3/8, 1/2, 5/8, 3/4, 7/8 and the complete square of 144." */
export const STRONGEST_POINTS: { point: number; fraction: string }[] = [
  { point: 36, fraction: "1/4" },
  { point: 48, fraction: "1/3" },
  { point: 54, fraction: "3/8" },
  { point: 72, fraction: "1/2" },
  { point: 90, fraction: "5/8" },
  { point: 96, fraction: "2/3" },
  { point: 108, fraction: "3/4" },
  { point: 126, fraction: "7/8" },
  { point: 144, fraction: "the complete square" },
];

/** "The triangle points or where the green angles cross." */
export const TRIANGLE_POINTS = [36, 48, 72, 96, 108, 144];

/** "Squares in the square of 144", where the angles cross. */
export const SQUARES_IN_THE_SQUARE = [36, 45, 54, 63, 72, 90, 108, 144];

/** "Most changes in trend occur when the time periods are at one-half of the square, at the end, or at 1/3, 2/3, 1/4 and 3/4." */
export const TIME_CHANGE_POINTS = [72, 144, 48, 96, 36, 108];

/** The Great Cycle halved down to 81 = 9², in days: 20,736 … 81. */
export const GREAT_CYCLE_FRACTIONS_DAYS: { days: number; fraction: string }[] = [1, 2, 4, 8, 16, 32, 64, 128, 256].map((d) => ({
  days: GREAT_CYCLE / d,
  fraction: d === 1 ? "the Great Cycle" : `1/${d}`,
}));

/** "Within two points": Gann's tolerance in the wheat example (286 against 288). */
export const TOLERANCE = 2;

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

/** Days to pass 144 hours at `hoursPerDay` trading hours a day. 24 h gives 6; his 5-hour session, 28.8 (28 days 4 hours). */
export function daysToPassSquareOfHours(hoursPerDay: number): number {
  return hoursPerDay > 0 ? SQUARE / hoursPerDay : Infinity;
}

export interface SquarePosition {
  /** The value read, in the unit supplied (points or time units). */
  value: number;
  /** 1-based: 436¾ is in the fourth square. */
  square: number;
  /** Position inside the square, 0 up to 144. */
  position: number;
  /** The strongest point (or the square's bottom, 0) nearest to `position`. */
  nearest: { point: number; fraction: string; distance: number };
  /** Within `TOLERANCE` of a strongest point or of the square's bottom. */
  onStrongPoint: boolean;
  /** Within `TOLERANCE` of a triangle point. */
  onTrianglePoint: boolean;
}

export function positionInSquare(value: number): SquarePosition {
  const v = Math.max(0, value);
  const whole = Math.floor(v / SQUARE);
  const position = v - whole * SQUARE;
  const candidates = [{ point: 0, fraction: "the bottom of the square" }, ...STRONGEST_POINTS];
  let nearest = { point: 0, fraction: "the bottom of the square", distance: Infinity };
  for (const c of candidates) {
    const d = Math.abs(position - c.point);
    if (d < nearest.distance) nearest = { ...c, distance: d };
  }
  return {
    value,
    square: whole + 1,
    position,
    nearest,
    onStrongPoint: nearest.distance <= TOLERANCE,
    onTrianglePoint: TRIANGLE_POINTS.some((p) => Math.abs(position - p) <= TOLERANCE),
  };
}

/** Where to lay the calculator (Ch. 13, "How to place the Master Chart"). */
export type Placement = "zero" | "low" | "high" | "halfRange" | "halfHigh";

export const PLACEMENT_LABEL: Record<Placement, string> = {
  zero: "0 on the chart's bottom",
  low: "0 on the low price",
  high: "the top on the high price",
  halfRange: "72 on half the range",
  halfHigh: "72 on half the highest price",
};

/**
 * The price's position under each placement, in points of `unit` dollars.
 * "zero" reads the price itself; "low" reads points up from the low; "high"
 * points down from the high; the two half-way placements put the centre, 72,
 * on the half-way point, so the reading is 72 plus the points from it.
 */
export function pricePositions(price: number, low: number, high: number, unit: number): Record<Placement, SquarePosition> {
  const u = unit > 0 ? unit : 1;
  const mid = (low + high) / 2;
  return {
    zero: positionInSquare(price / u),
    low: positionInSquare((price - low) / u),
    high: positionInSquare((high - price) / u),
    halfRange: positionInSquare(72 + (price - mid) / u),
    halfHigh: positionInSquare(72 + (price - high / 2) / u),
  };
}

/**
 * Where price leaves one square for the next, or crosses a square's centre,
 * in dollars: every 72 points from 0, up from the low and down from the high.
 * These are the calculator's price resistance levels that join the scan's
 * support and resistance list (`masterLevels.ts`). Levels outside
 * [price × (1 − band), price × (1 + band)] are dropped.
 */
export function squareBoundaryLevels(
  price: number,
  low: number,
  high: number,
  unit: number,
  band = 0.5,
): { price: number; label: string }[] {
  if (!(unit > 0) || !(price > 0)) return [];
  const lo = price * (1 - band);
  const hi = price * (1 + band);
  const out: { price: number; label: string }[] = [];
  const name = (j: number) => (j % 2 === 0 ? `end of square ${j / 2}` : `centre of square ${(j + 1) / 2}`);
  for (let j = 1; j * 72 * unit <= hi; j++) {
    const p = j * 72 * unit;
    if (p >= lo) out.push({ price: p, label: `Square of 144 from 0: ${name(j)}` });
  }
  for (let j = 1; low + j * 72 * unit <= hi; j++) {
    const p = low + j * 72 * unit;
    if (p >= lo) out.push({ price: p, label: `Square of 144 from the low: ${name(j)}` });
  }
  for (let j = 1; high - j * 72 * unit >= lo && high - j * 72 * unit > 0; j++) {
    const p = high - j * 72 * unit;
    if (p <= hi) out.push({ price: p, label: `Square of 144 down from the high: ${name(j)}` });
  }
  return out.sort((a, b) => a.price - b.price);
}

export type TimeUnit = "days" | "marketDays" | "weeks" | "months";

export interface TimeCount {
  unit: TimeUnit;
  count: number;
}

/** Calendar days, market days (bars), weeks and months from bar `fromIndex` to the last bar. */
export function timeCountsFrom(bars: { t: string }[], fromIndex: number): TimeCount[] {
  const last = bars[bars.length - 1];
  const from = bars[fromIndex];
  if (!last || !from) return [];
  const days = (Date.parse(last.t) - Date.parse(from.t)) / DAY_MS;
  return [
    { unit: "days", count: days },
    { unit: "marketDays", count: bars.length - 1 - fromIndex },
    { unit: "weeks", count: days / 7 },
    { unit: "months", count: days / DAYS_PER_MONTH },
  ];
}

export interface PivotTimeReading {
  pivot: "high" | "low";
  pivotDate: string;
  pivotPrice: number;
  /** Time counts sitting on ½, the end, ⅓, ⅔, ¼ or ¾ of a square (within two units). */
  onChangePoint: { unit: TimeUnit; count: number; point: number; square: number }[];
  /** Time counts equal (within two units) to the pivot's price, the low, or the range, in points: Gann's squaring of price with time. */
  squaringPrice: { unit: TimeUnit; count: number; of: "low price" | "high price" | "range"; value: number; multiple: number }[];
  /** Price position and time position in the same square are equal (within two): "time and price square". */
  timePriceSquare: { unit: TimeUnit; timePosition: number; pricePosition: number }[];
  /** Calendar days from the pivot on a fraction of the Great Cycle (20,736 days halved down to 81). */
  greatCycleFraction: { days: number; fraction: string } | null;
}

export interface MasterCalculatorReading {
  unit: number;
  low: number;
  high: number;
  /** The price's position under each placement of the calculator. */
  price: Record<Placement, SquarePosition>;
  /** The placements where price sits on a strongest point. */
  strongPlacements: Placement[];
  /** Time readings from the extreme high and the extreme low of the bars supplied. */
  fromHigh: PivotTimeReading | null;
  fromLow: PivotTimeReading | null;
}

function onPoint(count: number, points: number[]): { point: number; square: number } | null {
  if (count < 36 - TOLERANCE) return null;
  const whole = Math.floor(count / SQUARE);
  const position = count - whole * SQUARE;
  for (const p of points) {
    if (Math.abs(position - p) <= TOLERANCE) return { point: p, square: whole + 1 };
    // A count just past a square's end is still on that end.
    if (p === SQUARE && position <= TOLERANCE && whole >= 1) return { point: p, square: whole };
  }
  return null;
}

function readFromPivot(
  bars: { t: string; h: number; l: number }[],
  index: number,
  pivot: "high" | "low",
  price: number,
  low: number,
  high: number,
  unit: number,
): PivotTimeReading {
  const counts = timeCountsFrom(bars, index);
  const pivotPrice = pivot === "high" ? bars[index].h : bars[index].l;
  const onChangePoint: PivotTimeReading["onChangePoint"] = [];
  for (const c of counts) {
    const hit = onPoint(c.count, TIME_CHANGE_POINTS);
    if (hit) onChangePoint.push({ unit: c.unit, count: c.count, ...hit });
  }
  const u = unit > 0 ? unit : 1;
  const priceTargets: { of: "low price" | "high price" | "range"; value: number; multiples: boolean }[] = [
    // "Every 28 months would square the lowest price", and in halves: his
    // 6½ × 44 = 286 in the same example.
    { of: "low price", value: low / u, multiples: true },
    { of: "high price", value: high / u, multiples: false },
    { of: "range", value: (high - low) / u, multiples: false },
  ];
  const squaringPrice: PivotTimeReading["squaringPrice"] = [];
  for (const c of counts) {
    if (c.unit === "marketDays") continue; // his squaring counts run in calendar days, weeks and months
    for (const t of priceTargets) {
      if (!(t.value >= 1)) continue;
      const k = t.multiples ? Math.max(1, Math.round((2 * c.count) / t.value) / 2) : 1;
      if (Math.abs(c.count - k * t.value) <= TOLERANCE) {
        squaringPrice.push({ unit: c.unit, count: c.count, of: t.of, value: t.value, multiple: k });
      }
    }
  }
  // Time and price square: the price's points from this pivot, and the time from it, at the same place in the square.
  const pricePoints = pivot === "low" ? (price - pivotPrice) / u : (pivotPrice - price) / u;
  const pricePosition = positionInSquare(Math.max(0, pricePoints)).position;
  const timePriceSquare: PivotTimeReading["timePriceSquare"] = [];
  if (pricePoints >= TOLERANCE) {
    for (const c of counts) {
      const timePosition = positionInSquare(c.count).position;
      if (c.count >= TOLERANCE && Math.abs(timePosition - pricePosition) <= TOLERANCE) {
        timePriceSquare.push({ unit: c.unit, timePosition, pricePosition });
      }
    }
  }
  const days = counts.find((c) => c.unit === "days")?.count ?? 0;
  const gc = GREAT_CYCLE_FRACTIONS_DAYS.find((f) => Math.abs(days - f.days) <= TOLERANCE) ?? null;
  return {
    pivot,
    pivotDate: bars[index].t.slice(0, 10),
    pivotPrice,
    onChangePoint,
    squaringPrice,
    timePriceSquare,
    greatCycleFraction: gc,
  };
}

/**
 * The calculator read on one symbol: the price under every placement, and
 * the time from the extreme high and low of `bars`. `unit` is the Gann point
 * in dollars (`gannPointForBars`).
 */
export function readMasterCalculator(
  bars: { t: string; h: number; l: number }[],
  price: number,
  unit: number,
): MasterCalculatorReading | null {
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
  const positions = pricePositions(price, low, high, unit);
  return {
    unit,
    low,
    high,
    price: positions,
    strongPlacements: (Object.keys(positions) as Placement[]).filter((p) => positions[p].onStrongPoint),
    fromHigh: readFromPivot(bars, hi, "high", price, low, high, unit),
    fromLow: readFromPivot(bars, lo, "low", price, low, high, unit),
  };
}

const UNIT_LABEL: Record<TimeUnit, string> = { days: "days", marketDays: "market days", weeks: "weeks", months: "months" };

/** Plain-language lines for the explanation trace. */
export function describeMasterCalculator(r: MasterCalculatorReading): string[] {
  const lines: string[] = [];
  const z = r.price.zero;
  lines.push(
    `Square of 144: price is ${z.value.toFixed(1)} points (1 point = ${r.unit.toFixed(2)}), position ${z.position.toFixed(1)} in square ${z.square}.`,
  );
  for (const p of r.strongPlacements) {
    const s = r.price[p];
    lines.push(`Square of 144 with ${PLACEMENT_LABEL[p]}: price on ${s.nearest.fraction} (${s.nearest.point}) of the square.`);
  }
  for (const t of [r.fromHigh, r.fromLow]) {
    if (!t) continue;
    for (const h of t.onChangePoint) {
      lines.push(`${Math.round(h.count)} ${UNIT_LABEL[h.unit]} from the ${t.pivot} of ${t.pivotDate}: on ${h.point} of square ${h.square}, a point where trend changes come.`);
    }
    for (const s of t.squaringPrice) {
      lines.push(
        `${Math.round(s.count)} ${UNIT_LABEL[s.unit]} from the ${t.pivot} of ${t.pivotDate} squares the ${s.of} (${s.value.toFixed(1)} points${s.multiple > 1 ? ` × ${s.multiple}` : ""}).`,
      );
    }
    for (const s of t.timePriceSquare) {
      lines.push(`Time and price square from the ${t.pivot} of ${t.pivotDate}: time at ${s.timePosition.toFixed(1)} in ${UNIT_LABEL[s.unit]}, price at ${s.pricePosition.toFixed(1)}.`);
    }
    if (t.greatCycleFraction) {
      lines.push(`${t.greatCycleFraction.days} days from the ${t.pivot} of ${t.pivotDate}: ${t.greatCycleFraction.fraction} of the Great Cycle of 20,736 days.`);
    }
  }
  return lines;
}
