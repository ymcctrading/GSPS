/**
 * Gann's "Even Squares for Cotton & Eggs: Time and Price" (C-LEVELS-12;
 * reproduced in W007 p.65, hand-drawn, class C). Research only: no surface
 * reads it, pinned by its test.
 *
 * The construction, recovered from the cells whose digits read clearly (W007
 * visuals re-inspection) and checked against every one of them: a 16 by 16
 * square counting 1, 2, 3 ... outward from the centre, one ring of even side
 * at a time (2, 4, 6 ... 16), each ring closing on its own square (4, 16, 36
 * ... 256) in the row under the centre; each cell's price is its count times
 * 30 points. A ring starts in its right-hand column one row above where it
 * ends and runs up, left, down, right and up again. The small upper counts
 * and the digits lost under the angle lines are not used.
 *
 * Three-question basis:
 * 1. Gann: his chart, as reproduced (class C, a secondary reproduction).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence (time and price on one square, the title's
 *    "Time and Price").
 */

/** The square as rows of prices, row 0 at the top. */
export function evenSquare(side = 16, pointsPerCell = 30): number[][] {
  if (side < 2 || side % 2 !== 0) throw new Error("side must be even");
  const grid = Array.from({ length: side }, () => new Array<number>(side).fill(0));
  const mid = side / 2; // 0-indexed: the centre lies between rows mid-1 and mid
  let count = 0;
  const put = (r: number, c: number) => (grid[r][c] = ++count * pointsPerCell);
  for (let s = 2; s <= side; s += 2) {
    const r0 = mid - s / 2;
    const r1 = mid + s / 2 - 1;
    const c0 = r0;
    const c1 = r1;
    for (let r = mid - 1; r >= r0; r--) put(r, c1); // up the right side
    for (let c = c1 - 1; c >= c0; c--) put(r0, c); // left along the top
    for (let r = r0 + 1; r <= r1; r++) put(r, c0); // down the left side
    for (let c = c0 + 1; c <= c1; c++) put(r1, c); // right along the bottom
    for (let r = r1 - 1; r >= mid; r--) put(r, c1); // up to the ring's end
  }
  return grid;
}
