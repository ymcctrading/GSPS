/**
 * "Every stopping price is a mathematical point" (C-LEVELS-13), a research
 * base-rate test. Research only: nothing on the verdict path imports it.
 *
 * Source (class C / UNVERIFIABLE, Awodele, *Divination by Mathematics*, W007
 * p. 67, quoting the method without naming the source; its probable origin,
 * the Master Stock Market Course, is unread): every stopping price is a
 * mathematical point, from divisions of 360°, the square of 12, the square of
 * 20, or the square or halfway point of another number.
 *
 * The claim is universal, so the test is whether swing extremes sit near
 * such points more often than prices placed at random near them. GSPS's own
 * levels (`squareOf9.ts`, `masterTwelve.ts`, `retracement.ts`) never claim
 * to hold every stopping price and are not changed.
 *
 * Engineering choices, labelled as such (fixed before any data is read):
 * - The points, read in price units: multiples of 45 and 120 (360 divided by
 *   8 and by 3), multiples of 144 (12²) and 400 (20²), every integer square,
 *   and the halfway point between consecutive squares.
 * - "Near" is within `TOLERANCE_PCT` of the extreme's price.
 * - The base rate moves each extreme to a uniform random price within ±10%
 *   of itself, `draws` times (seeded); p = (draws scoring ≥ observed + 1) /
 *   (draws + 1).
 *
 * Three-question basis:
 * 1. Source: as above, unverified against the primary text.
 * 2. Cycles: Dewey's base-rate rule (CYC-24) applied to price instead of
 *    time: a level family "works" only if it beats placement at random.
 * 3. Hermetic: Vibration and Correspondence (price resting on number), put
 *    to a test rather than assumed.
 */
import { seeded } from "@/lib/research/preregisteredTimeTests";

export const TOLERANCE_PCT = 0.25;
export const RANDOM_SPREAD = 0.1;

/** The mathematical points in [lo, hi], ascending and unique. */
export function mathematicalPointLevels(lo: number, hi: number): number[] {
  const out = new Set<number>();
  for (const step of [45, 120, 144, 400]) for (let k = Math.ceil(lo / step); k * step <= hi; k++) if (k > 0) out.add(k * step);
  for (let n = Math.max(1, Math.floor(Math.sqrt(Math.max(0, lo))) - 1); n * n <= hi + 2 * n + 1; n++) {
    const sq = n * n;
    const half = (sq + (n + 1) * (n + 1)) / 2;
    if (sq >= lo && sq <= hi) out.add(sq);
    if (half >= lo && half <= hi) out.add(half);
  }
  return [...out].sort((a, b) => a - b);
}

/** Whether a price lies within `tol` (price units) of a mathematical point. */
export function isMathematicalPoint(price: number, tol: number): boolean {
  return mathematicalPointLevels(price - tol, price + tol).length > 0;
}

const share = (prices: number[], tolPct: number) =>
  prices.length > 0 ? prices.filter((p) => isMathematicalPoint(p, (p * tolPct) / 100)).length / prices.length : 0;

export interface MathematicalPointsResult {
  extremes: number;
  observed: number;
  baseMean: number;
  p: number;
}

export function mathematicalPointsBaseRate(
  extremes: number[],
  { tolPct = TOLERANCE_PCT, draws = 999, seed = 13 }: { tolPct?: number; draws?: number; seed?: number } = {},
): MathematicalPointsResult {
  const observed = share(extremes, tolPct);
  const rand = seeded(seed);
  let atLeast = 0;
  let sum = 0;
  for (let d = 0; d < draws; d++) {
    const moved = extremes.map((p) => p * (1 - RANDOM_SPREAD + 2 * RANDOM_SPREAD * rand()));
    const s = share(moved, tolPct);
    sum += s;
    if (s >= observed) atLeast++;
  }
  return { extremes: extremes.length, observed, baseMean: draws > 0 ? sum / draws : 0, p: (atLeast + 1) / (draws + 1) };
}
