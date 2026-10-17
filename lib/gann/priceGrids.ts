/**
 * Price grids from the 1935 and 1953 lessons, as support and resistance
 * candidates. **Context only**: nothing here feeds a score, a gate, a plan,
 * an entry, a stop or a target. Each reading is on the card and in the factor
 * table, so the replay can measure it before anything is promoted.
 *
 * Rules and sources (all Tier A, Master Course; long-book notes W023):
 * - **Squares of odd and even numbers** (C-NUMEROLOGY-01, Ch. 6 PDF 209-210,
 *   1935): "odd-number lows work to odd squares and even lows to even
 *   squares", and the half-way points between successive squares (6½, 12½,
 *   20½ … 132½) are levels too.
 * - **Levels of 9 and 12 and their halves** (C-TIME-15, Ch. 6 PDF 186): 9 to
 *   144 with halves (4½, 22½ …), and 12 ("9 with 1/3 of 9 added"); "tops and
 *   bottoms of most stocks come out remarkably close to a basis of 12".
 * - **Ranges near a multiple of 144** (C-TIME-16, C-NUMEROLOGY-03; Ch. 13
 *   PDF 375 and 378, Ch. 2 PDF 66): the square of 144 is the "GREAT SQUARE",
 *   divided into 9s; squares end at 144, 288, 432 and 576; the wheat range of
 *   281 means "watch near 288 (2x144)".
 *
 * Engineering choices, labelled as such:
 * - Prices are read in Gann points (`pointScale.ts#gannPointForBars`), the
 *   unit the Square of 144 Master Calculator and the circle of 360° already
 *   use. At $42.50 a point is $1, Gann's literal unit; elsewhere it scales
 *   with price. Ch. 13 gives separate scales for grains, stocks and cotton
 *   whose values the notes don't carry, so this is the stock scale GSPS uses,
 *   not Gann's overlay scale.
 * - Gann lists the 9 and 12 levels up to 144; past 144 the grid continues in
 *   the same steps.
 * - The low and high are the lowest low and highest high of the bars
 *   supplied (about a year in the scan), as the percentage-of-price levels
 *   use. Gann ranks the all-time extremes first. The low's parity is that of
 *   its nearest whole point.
 * - A range is "approaching" the next multiple of 144 when it is within one
 *   9-point division of it (the square "divided into 9s"; Gann's 281 is 7
 *   short of 288).
 *
 * Three-question basis:
 * 1. Gann: as cited above.
 * 2. Cycles: no periodicity claim; these are price levels, so Dewey's
 *    checklist does not apply. Gann also reads 144 as time; that reading is
 *    `timeConvergence.ts`'s and `masterCalculator.ts`'s.
 * 3. Hermetic: Vibration (price moving to the squares of its own number) and
 *    Correspondence (the same 144 square in price that the time counts use).
 */

import type { Bar } from "@/lib/types";

export interface ParitySquares {
  /** The low in points, rounded to the whole point whose parity is read. */
  lowPoints: number;
  parity: "odd" | "even";
  /** The square of the low's parity at or under the price, and the next over it, in points. */
  squareBelow: number | null;
  squareAbove: number;
  /** The half-way point between successive squares at or under the price, and the next over it, in points. */
  halfwayBelow: number | null;
  halfwayAbove: number;
}

/** Odd and even squares by the low's parity, and the half-way points, around `price` (both in points). */
export function paritySquares(low: number, price: number): ParitySquares {
  const lowPoints = Math.round(low);
  const parity = Math.abs(lowPoints) % 2 === 1 ? "odd" : "even";
  const first = parity === "odd" ? 1 : 2;
  let n = first;
  while ((n + 2) * (n + 2) <= price) n += 2;
  const squareBelow = n * n <= price ? n * n : null;
  const squareAbove = squareBelow === null ? n * n : (n + 2) * (n + 2);
  // Half-way points (k² + (k+1)²) / 2 for k = 1, 2, … (2½, 6½, 12½ …).
  const half = (k: number) => (k * k + (k + 1) * (k + 1)) / 2;
  let k = 1;
  while (half(k + 1) <= price) k++;
  const halfwayBelow = half(k) <= price ? half(k) : null;
  const halfwayAbove = halfwayBelow === null ? half(k) : half(k + 1);
  return { lowPoints, parity, squareBelow, squareAbove, halfwayBelow, halfwayAbove };
}

export interface NineTwelveGrid {
  /** Multiples of 4½ (9 and its halves) at or under the price and over it, in points. */
  nineBelow: number;
  nineAbove: number;
  /** Multiples of 6 (12 and its halves), the same way. */
  twelveBelow: number;
  twelveAbove: number;
}

export function nineTwelveGrid(price: number): NineTwelveGrid {
  const below = (step: number) => Math.floor(price / step) * step;
  return {
    nineBelow: below(4.5),
    nineAbove: below(4.5) + 4.5,
    twelveBelow: below(6),
    twelveAbove: below(6) + 6,
  };
}

/** The square of 144 is divided into 9s (Ch. 13 PDF 375). */
export const GREAT_SQUARE = 144;
export const GREAT_SQUARE_DIVISION = 9;

export interface Range144 {
  /** High less low, in points. */
  rangePoints: number;
  /** The multiple of 144 the range is working to: the next one at or over it. */
  nextMultiple: number;
  /** The low plus that multiple of 144, in points: where the range would complete it. */
  price: number;
  /** Within one 9-point division of that multiple. */
  approaching: boolean;
}

export function range144(low: number, high: number): Range144 {
  const rangePoints = high - low;
  const nextMultiple = Math.max(1, Math.ceil(rangePoints / GREAT_SQUARE));
  const target = nextMultiple * GREAT_SQUARE;
  return {
    rangePoints,
    nextMultiple,
    price: low + target,
    approaching: target - rangePoints <= GREAT_SQUARE_DIVISION,
  };
}

export interface PriceGridReading {
  /** Dollars per point used for every level below. */
  unit: number;
  /** In dollars. */
  paritySquares: ParitySquares;
  /** In dollars. */
  nineTwelve: NineTwelveGrid;
  /** `price` in dollars; `rangePoints` stays in points. */
  range144: Range144;
}

export function readPriceGrids(bars: Bar[], currentPrice: number, unit: number): PriceGridReading | null {
  if (bars.length === 0 || !(unit > 0) || !(currentPrice > 0)) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const b of bars) {
    if (b.l < low) low = b.l;
    if (b.h > high) high = b.h;
  }
  if (!(low > 0)) return null;
  const p = currentPrice / unit;
  const sq = paritySquares(low / unit, p);
  const grid = nineTwelveGrid(p);
  const r = range144(low / unit, high / unit);
  const $ = (x: number) => x * unit;
  return {
    unit,
    paritySquares: {
      ...sq,
      squareBelow: sq.squareBelow === null ? null : $(sq.squareBelow),
      squareAbove: $(sq.squareAbove),
      halfwayBelow: sq.halfwayBelow === null ? null : $(sq.halfwayBelow),
      halfwayAbove: $(sq.halfwayAbove),
    },
    nineTwelve: {
      nineBelow: $(grid.nineBelow),
      nineAbove: $(grid.nineAbove),
      twelveBelow: $(grid.twelveBelow),
      twelveAbove: $(grid.twelveAbove),
    },
    range144: { ...r, price: $(r.price) },
  };
}

export function describePriceGrids(g: PriceGridReading): string[] {
  const f = (x: number | null) => (x === null ? "none" : x.toFixed(2));
  const s = g.paritySquares;
  const n = g.nineTwelve;
  const lines = [
    `The low is ${s.parity} in points, so it works to ${s.parity} squares: ${f(s.squareBelow)} under the price, ${f(s.squareAbove)} over it; half-way points between squares at ${f(s.halfwayBelow)} and ${f(s.halfwayAbove)}.`,
    `Levels of 9 and their halves at ${f(n.nineBelow)} and ${f(n.nineAbove)}; of 12 at ${f(n.twelveBelow)} and ${f(n.twelveAbove)}.`,
  ];
  if (g.range144.approaching) {
    lines.push(
      `The range (${g.range144.rangePoints.toFixed(0)} points) is near ${g.range144.nextMultiple * GREAT_SQUARE}, ${g.range144.nextMultiple}x144: watch ${g.range144.price.toFixed(2)}.`,
    );
  }
  return lines;
}
