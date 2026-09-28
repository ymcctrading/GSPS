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
