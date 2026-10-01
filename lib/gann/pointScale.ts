/**
 * Gann's "points", price-scaled (fixed 2026-09-28 after the 766-symbol
 * 15-minute diagnosis run, `docs/replay-runs/2026-09-27-766sym-NOTES.md` run 16).
 *
 * Gann states his exit allowances in points: a crossed top "should not react
 * back 3 points under it" (*New Stock Trend Detector* p. 20), stops "3 points
 * beyond old tops or bottoms" (*Wall Street Stock Selector*), trail "1, 2, 3
 * or 5 points under each week's bottom" (NSTD Rule 2). He scales them with
 * the price himself: 3 points for stocks at $25–60, 5–10 for $100–300
 * (*Truth of the Stock Tape* / *Stock Selector*, the chart box sizes), 4–5
 * points of profit before break-even "in high-priced stocks", stops of 1, 2
 * or 3 points on cheap ones, 10 points "at very high levels" (NSTD Rule 2).
 * Sources: `docs/memory-bank/sources/A02_A04_...md`, `A05_...md`.
 *
 * The exit rules used to read this as `LOST_MOTION_BUFFER_PCT` (0.3%). That
 * is the entry's crossing margin, a different rule, and about a tenth of
 * Gann's 3 points at the prices he wrote for. The hold test then ended 224 of
 * 384 trades at −0.23R each on that run. Presumed a translation defect, per
 * AGENTS.md "Gann-derived AND measured", and corrected here.
 *
 * Engineering choices, labelled as such: a step table on Gann's bands jumps
 * at every edge (a $10 stock would get 20%, a $9 one 11%), so the allowance is
 * a smooth power curve through the middle of his two stated bands: 3 points at
 * $42.50 (the middle of $25–60, 7.06%) and 7.5 points at $200 (the middle of
 * 5–10 points on $100–300, 3.75%). It gives about 5% at $100 and 2.6% at $500.
 * It is clamped to 1–12%: 12% is Gann's 3 points on a $25 stock, his cheapest
 * stated band, and the floor keeps very high-priced stocks off a sliver.
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. No periodicity claim;
 * Dewey's checklist does not apply. 3. Correspondence: the same rule at every
 * price level, expressed in each level's own units, as Gann scaled it.
 */

const ANCHOR_PRICE = 42.5;
const ANCHOR_PCT = 3 / 42.5;
const HIGH_PRICE = 200;
const HIGH_PCT = 7.5 / 200;
const EXPONENT = Math.log(HIGH_PCT / ANCHOR_PCT) / Math.log(HIGH_PRICE / ANCHOR_PRICE);
export const MIN_ALLOWANCE_PCT = 1;
export const MAX_ALLOWANCE_PCT = 12;

/** Gann's 3-point allowance at this price, as a percentage of the price. */
export function gannThreePointsPct(price: number): number {
  if (!(price > 0)) return 0;
  const pct = ANCHOR_PCT * Math.pow(price / ANCHOR_PRICE, EXPONENT) * 100;
  return Math.min(MAX_ALLOWANCE_PCT, Math.max(MIN_ALLOWANCE_PCT, pct));
}

/** Gann's 3-point allowance at this price, in dollars. */
export function gannThreePoints(price: number): number {
  return (price * gannThreePointsPct(price)) / 100;
}

/**
 * One of Gann's points at this price, in dollars: his 3-point allowance ÷ 3.
 * At $42.50, the middle of the band he wrote most of his stock rules for, it
 * is exactly $1, his literal point.
 *
 * Added 2026-09-30 as the one price unit shared by the Square of 144 Master
 * Calculator (`masterCalculator.ts`), the circle of 360° (`circleOf360.ts`)
 * and the planetary averages (`planetaryAverages.ts`). Gann reads prices
 * directly as positions in the square and as degrees in the circle ("9
 * points on stocks", cents as degrees on grains), always on a chart scaled to
 * the market's price level (the calculator's commodity scales; ½ point per
 * space below $50, 1 point above $100). Porting the rule means reading price
 * in points; porting the number means scaling the point, and this is the
 * scaling the exit rules already use. Engineering choice, labelled as such.
 */
export function gannPoint(price: number): number {
  return gannThreePoints(price) / 3;
}

/**
 * The Gann point for a symbol, fixed from its bars rather than the current
 * price so that levels computed in points stay put as price moves towards
 * them. The reference is the gravity center of the bars' extremes, half-way
 * between the lowest low and the highest high (Gann: "the gravity center",
 * Master Calculator, 1953). Engineering choice, labelled as such.
 */
export function gannPointForBars(bars: { h: number; l: number }[]): number {
  if (bars.length === 0) return 0;
  let low = Infinity;
  let high = -Infinity;
  for (const b of bars) {
    if (b.l < low) low = b.l;
    if (b.h > high) high = b.h;
  }
  if (!(low > 0) || !(high >= low)) return 0;
  return gannPoint((low + high) / 2);
}
