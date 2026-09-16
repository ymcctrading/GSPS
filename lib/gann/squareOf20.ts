/**
 * Gann's Square of 20 / New York Stock Exchange Permanent Chart
 * (PRIVATE-GANN — Chapter 7, `docs/GANN_HISTORICAL_SOURCES.md` A2.1, second
 * extraction pass 2026-09-16). Internal/research use only — **never** wire
 * this into `lib/signals/confluence/gann.ts` / `GannConfluenceResult` /
 * `components/scan/confluence-card.tsx` or any `app/api/*` route a
 * logged-in user's scan request reaches. Unlike `masterTwelve.ts`/
 * `squareOf52.ts`/`angleMonthCounts.ts` (wired into the live confluence
 * layer 2026-09-16 once their own headers no longer had a real justification
 * to stay stranded), this module keeps its exception for a genuine,
 * technical reason stated below: `ringAndAngleOf()`'s ring/angle placement
 * cannot be checked against Gann's original hand-drawn wheel, which is lost
 * to this text-only extraction.
 *
 * A third Master construction distinct from the Square of Nine (9²=81) and
 * the Square of 144/Master Twelve (12²=144): a 20×20=400 grid, applied to
 * real calendar dates rather than price, spiraling outward from an anchor
 * date the same way the other two squares spiral from an anchor price.
 * Gann names two candidate anchors: the NYSE's own founding (May 17, 1792)
 * and, separately, Columbus's October 12, 1492 landing.
 *
 * **What this module reproduces exactly, and what it does not.** The two
 * citable numeric facts the source gives — "1929 was on the 137th number"
 * and "1932 on 140" — resolve cleanly and exactly as *elapsed years from the
 * 1792 NYSE founding*: 1792 + 137 = 1929, and 1792 + 140 = 1932. Both are
 * asserted directly in `__tests__/squareOf20.test.ts`.
 *
 * The source also describes 1929's cell as "hitting an angle of 45°" and
 * 1932's as "the top of the 7th zone." Reproducing those two claims would
 * require the original hand-drawn Square-of-20 wheel's own numbering
 * orientation (which direction the spiral turns, which cell is due east) —
 * and `docs/GANN_HISTORICAL_SOURCES.md`'s own extraction notes state this
 * plainly: "the illustrations for every chapter (genuinely lost — this was
 * a text extraction, not a re-scan...)". This module implements a
 * mathematically standard, internally-consistent integer square-spiral
 * ring/angle model (the same family of construction
 * `lib/gann/squareOf9.ts`/`lib/gann/masterTwelve.ts` use, generalized here
 * to an explicit integer grid rather than a continuous sqrt formula, since
 * Gann's own text describes the Square of 20 as a literal 400-cell grid) —
 * but does **not** assert that this convention's angle/zone output for cell
 * 137 or 140 matches the lost original drawing. `ringAndAngleOf()` is
 * exposed for research/diagnostic use with that caveat attached; only the
 * elapsed-year arithmetic is treated as a verified fact.
 */

const GRID_SIZE = 20;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 400

export const NYSE_FOUNDING = new Date(Date.UTC(1792, 4, 17)); // May 17, 1792
export const COLUMBUS_LANDING = new Date(Date.UTC(1492, 9, 12)); // Oct 12, 1492

/** Elapsed whole calendar years from `anchor` to `target` — the arithmetic behind "1929 was the 137th number." */
export function yearsElapsed(anchor: Date, target: Date): number {
  return target.getUTCFullYear() - anchor.getUTCFullYear();
}

/** Gann's own two disclosed worked cells, both anchored on the 1792 NYSE founding. */
export const WORKED_EXAMPLES = {
  nineteenTwentyNine: { year: 1929, cellNumber: 137, describedAngleDeg: 45, anchor: "NYSE_FOUNDING" as const },
  nineteenThirtyTwo: { year: 1932, cellNumber: 140, describedZone: 7, anchor: "NYSE_FOUNDING" as const },
};

export interface SquareOf20Position {
  ring: number; // 1-indexed ring outward from the center cell (1)
  /** Angle in degrees [0, 360) under this module's own documented spiral convention (see header caveat). */
  angleDeg: number;
}

/**
 * Standard counterclockwise integer square spiral, center = 1, first step
 * east: the same construction family as the classic "Square of Nine wheel"
 * drawing, generalized to an explicit grid. Closed-form (no precomputed
 * table needed): ring `r` spans cells `(2r-1)^2 + 1` through `(2r+1)^2`.
 */
export function ringAndAngleOf(cellNumber: number): SquareOf20Position {
  if (cellNumber < 1 || !Number.isInteger(cellNumber)) {
    throw new RangeError("cellNumber must be a positive integer");
  }
  if (cellNumber === 1) return { ring: 0, angleDeg: 0 };

  let ring = 1;
  while (cellNumber > (2 * ring + 1) ** 2) ring++;

  // Walk the spiral to (x, y) for this cell. Cheap for cellNumber <= 400.
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  let x = 0;
  let y = 0;
  let n = 1;
  let dirIdx = 0;
  let stepLen = 1;
  let legs = 0;
  while (n < cellNumber) {
    for (let s = 0; s < stepLen && n < cellNumber; s++) {
      x += dirs[dirIdx][0];
      y += dirs[dirIdx][1];
      n++;
    }
    legs++;
    dirIdx = (dirIdx + 1) % 4;
    if (legs % 2 === 0) stepLen++;
  }

  let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  return { ring, angleDeg };
}

/** Day-count cell number from an anchor date — wraps at the 400-cell grid, per Gann's own stated grid size. */
export function dateToGridCell(anchor: Date, target: Date, unit: "day" | "year" = "year"): number {
  if (unit === "year") {
    const years = yearsElapsed(anchor, target);
    return ((years % TOTAL_CELLS) + TOTAL_CELLS) % TOTAL_CELLS || TOTAL_CELLS;
  }
  const days = Math.round((target.getTime() - anchor.getTime()) / (24 * 3600 * 1000));
  return ((days % TOTAL_CELLS) + TOTAL_CELLS) % TOTAL_CELLS || TOTAL_CELLS;
}
