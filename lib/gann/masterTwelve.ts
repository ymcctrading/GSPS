/**
 * Gann's Square of 144 / "Master Twelve" (PRIVATE-GANN — Chapter 13, "The
 * Master Mathematical Price, Time and Trend Calculator,"
 * `docs/GANN_HISTORICAL_SOURCES.md` A2.1).
 *
 * **Wired into the live confluence layer 2026-09-16** (`lib/signals/confluence/gann.ts`'s
 * `GannConfluenceResult.nearestMasterTwelve`) — see `angleMonthCounts.ts`'s
 * header for why this corrects an earlier "internal-research use only"
 * restriction rather than leaving it in place: this module's spiral formula
 * is exactly `squareOf9.ts`'s, generalized to base 12, with no
 * lost-illustration dependency the way `squareOf20.ts`/`hexagonChart.ts`
 * genuinely have. Confluence/ranking only, same non-authoritative role as
 * `nearestSquareOf9`.
 *
 * **Corrected 2026-09-30, after the full Chapter 13 text was read** (source
 * note A12): the spiral below is GSPS's own construction, a base-12 analog of
 * `squareOf9.ts`. Gann's Master Calculator is not a spiral. It reads a price
 * or a time as a position inside a square of 144 (436¾ is 4¾ in the fourth
 * square) and marks its strongest points; that is `masterCalculator.ts`,
 * which supplies the Square of 144 readings and levels now. This module stays
 * as a confluence display until it is replaced or grounded; do not cite it as
 * Gann's calculator.
 *
 * `lib/gann/squareOf9.ts` generalizes the square-root spiral to base 9; this
 * module's spiral is the base-12 analog. The earlier claim here that
 * Chapter 13 describes the spiral as *literally nested* inside the Square of
 * Nine is not in the text; what is in it is the arithmetic below: its "Great
 * Cycle" of 20,736 (144²) halves down through 10,368 / 5,184 / 2,592 / 1,296
 * / 648 / 324 / 162 / 81 — and 81 is exactly 9², the Square of Nine's own
 * total cell count (`__tests__/masterTwelve.test.ts` asserts this chain and
 * the 81/9² identity directly).
 *
 * Note (2026-10-16, item 9): this spiral is GSPS's reconstruction. The Master
 * Course's own "Master 12" chart is a 12×12 grid whose squares end at 144,
 * 288, 432 and 576; it is built below as `masterTwelveCell` (M-T16, review B,
 * 2026-10-16), and the spiral is labelled a GSPS construction wherever it is
 * shown. The Square of 144's readings are `masterCalculator.ts`'s.
 */

import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

/** 20,736 = 144², halved seven times down to 81 = 9² — the Square of Nine's own grid, nested. */
export const GREAT_CYCLE = 20736;
export const HALVING_CHAIN: number[] = [];
(() => {
  let n = GREAT_CYCLE;
  while (n >= 81) {
    HALVING_CHAIN.push(n);
    n = n / 2;
  }
})();

/** The Square of Nine's own 9x9 grid — the value the halving chain's last term must equal. */
export const SQUARE_OF_9_TOTAL_CELLS = 9 * 9;

export interface MasterNumber {
  n: number;
  /** Gann's own stated reasoning for this number, as documented data — not behavior. */
  reasoning: string;
}

/** "The Master Numbers are 3, 5, 7, 9 and 12" — Chapter 13, verbatim, with Gann's own stated reasoning for each. */
export const MASTER_NUMBERS: MasterNumber[] = [
  { n: 3, reasoning: "The first odd number that forms a square greater than itself." },
  { n: 5, reasoning: "The balancing number between 1 and 9." },
  {
    n: 7,
    reasoning:
      'The number mentioned more times in the Bible than any other; its square, 49, "a very important time period."',
  },
  { n: 9, reasoning: "9 digits added together equal 45; the base of the base-9 grid itself." },
  { n: 12, reasoning: "Biblical/zodiacal significance, and the base of the Square of 144 itself." },
];

/**
 * The Chapter 13 wheat worked example, exactly as disclosed: wheat's
 * all-time low (28 cents, March 1852) squared against the May option's own
 * high/low (325 / 44 cents), concluding "you would watch for a change in
 * trend between 281 and 288" months.
 *
 * `281` is exact, reproducible arithmetic from the two option prices Gann
 * himself states (325 - 44 = 281 — the same "1 cent/point == 1 time unit"
 * price-to-time-count convention already catalogued from Gann's own private
 * correspondence, `docs/GANN_HISTORICAL_SOURCES.md` A2.3's disclosed
 * price-to-degree scales). `288` is carried here as Gann's own stated upper
 * bound of the window; the retrieved text extraction does not spell out its
 * derivation in full (a plausible reading is 281 plus the Master Number 7,
 * matching the chapter's repeated use of 7/49 as a tolerance band, but that
 * is this module's inference, not a literal quote — documented as such
 * rather than asserted as fact).
 */
export const WHEAT_SQUARE_EXAMPLE = {
  allTimeLowCents: 28,
  allTimeLowDate: "1852-03",
  mayOptionHighCents: 325,
  mayOptionLowCents: 44,
  changeWindowMonths: [281, 288] as [number, number],
};

/** Gann's disclosed price-to-month-count arithmetic: high minus low, in cents, read directly as elapsed months. */
export function squareMonthsFromPriceRange(lowCents: number, highCents: number): number {
  return highCents - lowCents;
}

// ---------------------------------------------------------------------------
// Gann's Master 12 chart: the 12x12 grid (M-T16)
//
// Master Course Ch. 13 (pp. 62-64) and Ch. 15A ("Master Charts"), Tier A;
// source note `docs/memory-bank/sources/A2_1_master_stock_market_course.md`.
// 12 x 12 = 144, and the squares end at 144, 288, 432 and 576. The numbers
// run up columns of 12: the bottom of each column is 1, 13, 25 ... 133, the
// top 12, 24 ... 144 ("very important to measure time"). The chart is read
// for time, space, price or volume. Its named points, as he lists them:
// the major centre 66, 67, 78 and 79 (the strongest resistance); the minor
// centres; the two 45-degree diagonals; the horizontal half line (rows 6
// and 7). Sections are the columns: 3 over is the square of its own place,
// 6 the half-way point, 9 the three-quarter point, the 8th and 9th the
// "death zone", and the 12th the strongest. Unlike the spiral below, this
// is Gann's chart; the spiral is GSPS's own construction.
// ---------------------------------------------------------------------------

export const MASTER_TWELVE_SIDE = 12;
export const MASTER_TWELVE_SQUARE = MASTER_TWELVE_SIDE * MASTER_TWELVE_SIDE;
/** "Squares end at 144, 288, 432, 576." */
export const MASTER_TWELVE_SQUARE_ENDS = [1, 2, 3, 4].map((k) => k * MASTER_TWELVE_SQUARE);
/** The major centre, the strongest resistance. */
export const MASTER_TWELVE_MAJOR_CENTRE = [66, 67, 78, 79] as const;
/** The minor centres, minor tops and bottoms. */
export const MASTER_TWELVE_MINOR_CENTRES = [14, 17, 20, 23, 50, 53, 56, 59, 86, 89, 92, 95, 122, 125, 128, 131] as const;

export interface MasterTwelveCell {
  /** Which square of 144 the value is in, the first being 1. */
  square: number;
  /** Its place in that square, 1 to 144. */
  place: number;
  /** The column (section), 1 to 12. */
  section: number;
  /** The row up the column, 1 to 12. */
  row: number;
  /** The place ends a square (144, 288, 432, 576 ...). */
  squareEnd: boolean;
  majorCentre: boolean;
  minorCentre: boolean;
  /** On either 45-degree diagonal (1, 14 ... 144 or 12, 23 ... 133). */
  diagonal: boolean;
  /** On the horizontal half line, rows 6 and 7. */
  halfLine: boolean;
  /** In the 8th or 9th section, the "death zone". */
  deathZone: boolean;
}

/** Where a whole value (points, days, weeks or months) sits on the Master 12 chart. */
export function masterTwelveCell(value: number): MasterTwelveCell | null {
  const v = Math.round(value);
  if (!(v >= 1)) return null;
  const square = Math.ceil(v / MASTER_TWELVE_SQUARE);
  const place = v - (square - 1) * MASTER_TWELVE_SQUARE;
  const section = Math.ceil(place / MASTER_TWELVE_SIDE);
  const row = place - (section - 1) * MASTER_TWELVE_SIDE;
  return {
    square,
    place,
    section,
    row,
    squareEnd: place === MASTER_TWELVE_SQUARE,
    majorCentre: (MASTER_TWELVE_MAJOR_CENTRE as readonly number[]).includes(place),
    minorCentre: (MASTER_TWELVE_MINOR_CENTRES as readonly number[]).includes(place),
    diagonal: row === section || row === MASTER_TWELVE_SIDE + 1 - section,
    halfLine: row === 6 || row === 7,
    deathZone: section === 8 || section === 9,
  };
}

/**
 * The spiral levels below: **a GSPS construction** (a base-12 analog of the
 * Square of Nine's square-root spiral), not Gann's Master 12 chart, which is
 * `masterTwelveCell` above. Shown on the confluence card under that label.
 */
export interface MasterTwelveLevel {
  degree: number;
  price: number;
  distancePct: number;
  rotation: number;
  role: LevelRole;
}

const DEGREES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]; // 12-fold division, base-12 analog of squareOf9's 8-fold

/**
 * Base-12 analog of `lib/gann/squareOf9.ts`'s spiral coordinate system: one
 * full 360° rotation adds 12/6 = 2 to sqrt(price), same as base 9 (the
 * rotation constant is fixed by the square-root relationship, not the base);
 * what changes is the angular resolution, 12-fold here instead of 8-fold.
 */
export function masterTwelveLevels(
  anchorPrice: number,
  currentPrice: number,
  rotations = 8,
): MasterTwelveLevel[] {
  if (anchorPrice <= 0 || currentPrice <= 0) return [];
  const root = Math.sqrt(anchorPrice);
  const levels: MasterTwelveLevel[] = [];

  for (let rot = 0; rot <= rotations; rot++) {
    for (const degree of DEGREES) {
      const totalDeg = rot * 360 + degree;
      for (const sign of [1, -1]) {
        const r = root + (sign * totalDeg) / 180;
        if (r <= 0) continue;
        const price = r * r;
        levels.push({
          degree,
          price,
          distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
          rotation: sign * rot,
          role: levelRole(currentPrice, price),
        });
      }
    }
  }

  const seen = new Set<string>();
  return levels
    .filter((l) => {
      const key = l.price.toFixed(4);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest Master Twelve level within `proximityPct` of current price, if any. */
export function nearestMasterTwelveLevel(
  levels: MasterTwelveLevel[],
  proximityPct = 1.0,
): MasterTwelveLevel | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}

/**
 * C-TIME-17 (class A; Master Course Ch.13 PDF 375, 379): the halving chain
 * read as calendar days from a pivot. Gann gives 20,736 as "the great cycle"
 * in days, "fractions to 81 days", and the same count in weeks (2,962 weeks
 * 2 days), months (681 months 23 days) and years (56 years 9 months 23 days,
 * in 365-day years); ½ = 28 y 5 m 8 d, ¼ = 14 y 2 m 19 d, ⅛ = 7 y 1 m 10 d
 * (PDF 379). PDF 375 prints the ½ as "28 years, 9 months and 23 days", which
 * does not agree with PDF 379; the day counts are exact either way, so the
 * code counts days and does not choose. Context only.
 *
 * Engineering choices, labelled as such: pivots are the extreme high and low
 * of the bars read (as `hexagonTime.ts`); tolerance 1 day.
 */
export interface HalvingChainHit {
  pivot: "high" | "low";
  pivotDate: string;
  days: number;
}

export interface HalvingChainReading {
  /** Pivots whose elapsed calendar days sit on a term of the chain. */
  hits: HalvingChainHit[];
  /** The next term ahead from each pivot, with its date. */
  next: (HalvingChainHit & { date: string })[];
}

const HALVING_TOLERANCE_DAYS = 1;
const CHAIN_DAY_MS = 86_400_000;

export function halvingChainTime(
  low: { date: string; price: number },
  high: { date: string; price: number },
  lastDate: string,
): HalvingChainReading {
  const at = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const ascending = [...HALVING_CHAIN].sort((a, b) => a - b);
  const out: HalvingChainReading = { hits: [], next: [] };
  for (const [pivot, p] of [["high", high], ["low", low]] as const) {
    const elapsed = (at(lastDate) - at(p.date)) / CHAIN_DAY_MS;
    if (!(elapsed > 0)) continue;
    const pivotDate = p.date.slice(0, 10);
    const on = ascending.find((n) => Math.abs(elapsed - n) <= HALVING_TOLERANCE_DAYS);
    if (on !== undefined) out.hits.push({ pivot, pivotDate, days: on });
    const ahead = ascending.find((n) => n > elapsed + HALVING_TOLERANCE_DAYS);
    if (ahead !== undefined) {
      out.next.push({ pivot, pivotDate, days: ahead, date: new Date(at(p.date) + ahead * CHAIN_DAY_MS).toISOString().slice(0, 10) });
    }
  }
  return out;
}
