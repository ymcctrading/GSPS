/**
 * Gann's Square of Nine read in price (C-LEVELS-15, built 2026-10-21).
 *
 * Sources:
 * - Tier A: Master Course Ch. 2 (1931, PDF 68) lists the numbers on the
 *   square's diagonals (3, 13, 31, 57, 91 … and 7, 21, 43, 73, 111 …, with
 *   8, 23, 46, 77 … and 4, 15, 34, 61 …) as "great resistance points and
 *   measuring out important time factors" (memory-bank read,
 *   `docs/memory-bank/sources/A2_1_master_stock_market_course.md`). Ch. 15A
 *   (PDF 393-395) corrects the printed 75 to 73.
 * - Tier A: the same course ranks the cardinal cross (0/90/180/270) as the
 *   strongest angles and the fixed cross (45/135/225/315) after them
 *   (Ch. 2 PDF 57-58; Ch. 4 PDF 152-153, "Strongest angles: Cardinal and
 *   Fixed crosses").
 *
 * The time half of the same sentence is `squareOfNineTime.ts`; this is the
 * price half. The plate's numbering gives every line in closed form
 * (`numberOnLine`), so a cell number is read as a price in Gann points
 * (`pointScale.ts#pricePoint`, the same unit the Square of 144 and the
 * planetary averages use), and the nearest cross number below price joins
 * the S/R list as support and the nearest above as resistance
 * (`masterLevels.ts`, live scan and replay alike).
 *
 * Kept sparse on purpose, the way `masterLevels.ts` keeps every source:
 * - only the cardinal and fixed crosses; the 22.5° lines are left out (the
 *   course ranks them below both crosses, and they would double the density);
 * - only the nearest number on either side of price, so the source adds at
 *   most two levels;
 * - numbers below 10 are skipped, as in the time reading (on the first ring
 *   every cell is on a line, so it says nothing).
 *
 * Not to be confused with `squareOf9.ts`, the √price ± k/8 spiral from a
 * swing anchor (left unchanged): this reads the plate's fixed numbers.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim in price; Dewey's checklist does not apply.
 * 3. Hermetic: Correspondence, the one square read in price and in time.
 */

import { CARDINAL_CROSS, FIXED_CROSS, lineKind, numberOnLine, type LineKind } from "@/lib/gann/squareOfNineTime";

const CROSS_ANGLES = [...CARDINAL_CROSS, ...FIXED_CROSS];
const MIN_NUMBER = 10;

export interface SquareOfNineCrossNumber {
  number: number;
  angle: number;
  kind: Exclude<LineKind, "sixteenth">;
}

/** Every cross number from 10 up in rings `fromRing`..`toRing`, ascending. */
function crossNumbers(fromRing: number, toRing: number): SquareOfNineCrossNumber[] {
  const out: SquareOfNineCrossNumber[] = [];
  for (let k = Math.max(1, fromRing); k <= toRing; k++) {
    for (const angle of CROSS_ANGLES) {
      const n = numberOnLine(angle, k);
      if (n !== null && n >= MIN_NUMBER) out.push({ number: n, angle, kind: lineKind(angle) as "cardinal" | "fixed" });
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

/** The cross numbers nearest `points` on either side: at or below, and above. */
export function nearestCrossNumbers(points: number): { below: SquareOfNineCrossNumber | null; above: SquareOfNineCrossNumber | null } {
  if (!(points > 0)) return { below: null, above: null };
  // Ring k holds (2k−1)²+1 … (2k+1)²; two rings either side always bracket it.
  const k = Math.max(1, Math.round((Math.sqrt(points) - 1) / 2));
  const nums = crossNumbers(k - 2, k + 2);
  let below: SquareOfNineCrossNumber | null = null;
  let above: SquareOfNineCrossNumber | null = null;
  for (const n of nums) {
    if (n.number <= points) below = n;
    else if (!above) above = n;
  }
  return { below, above };
}

export interface SquareOfNinePriceLevel {
  price: number;
  role: "support" | "resistance";
  label: string;
  number: number;
  angle: number;
  kind: "cardinal" | "fixed";
}

function label(n: SquareOfNineCrossNumber, role: "support" | "resistance"): string {
  return `Nine-square cross number ${n.number} (${n.angle}°, ${n.kind === "cardinal" ? "cardinal" : "fixed"} cross), ${role}`;
}

/**
 * The Square of Nine's cross numbers nearest `price`, read in Gann points of
 * `unit` dollars: the nearest at or below as support, the nearest above as
 * resistance.
 */
export function squareOfNinePriceLevels(price: number, unit: number): SquareOfNinePriceLevel[] {
  if (!(price > 0) || !(unit > 0)) return [];
  const { below, above } = nearestCrossNumbers(price / unit);
  const out: SquareOfNinePriceLevel[] = [];
  if (below) out.push({ price: below.number * unit, role: "support", label: label(below, "support"), number: below.number, angle: below.angle, kind: below.kind });
  if (above) out.push({ price: above.number * unit, role: "resistance", label: label(above, "resistance"), number: above.number, angle: above.angle, kind: above.kind });
  return out;
}
