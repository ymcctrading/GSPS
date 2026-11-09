/**
 * Resistance points near the same level are one point (M-P4). One function,
 * read by the daily plan's stop, first target and master (`lib/strat/levels.ts`)
 * and by the intraday alerts' first target (`lib/scanner/intraday.ts`
 * `gannFirstTarget`, which the intraday replays call too), so the rule reads
 * the same at every scale (AGENTS.md "Cross-platform consistency"). Moved here
 * from `lib/strat/levels.ts` on 2026-10-22, when the intraday target took it.
 *
 * Three-question basis:
 * 1. Gann: *How to Make Profits in Commodities* (A8,
 *    `docs/GANN_HISTORICAL_SOURCES.md`), "resistance points near same levels":
 *    when two nearby resistance levels cluster, average them into one combined
 *    support or resistance point, rather than treating a clustered S/R level, a
 *    fan line and a Square-of-9 price that sit within a percent of each other
 *    as three competing candidates. Added to the daily plan 2026-09-16
 *    (`docs/GANN_PLATFORM_AUDIT.md` Part 4 item 3). His cents-based "lost
 *    motion" figure from the same passage is deliberately not ported: it is a
 *    1930s commodity number, and porting its magnitude across asset class and
 *    era would be a guess dressed up as a derivation.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Correspondence. The same clustering on the daily and the
 *    intraday plan, as above so below. Law of Creation: level ⊗ level is a
 *    mixture unless they interact; two points inside one band are read as the
 *    one place buyers and sellers meet.
 *
 * Engineering choice, labelled as such: the band is 1% of the cluster's own
 * average (`NEARBY_LEVEL_TOLERANCE_PCT`). Gann gives the rule, not a percent,
 * and the intraday plan carries the daily band unchanged.
 */

/** How close two levels must sit, as a percent of their running average, to count as one point. */
export const NEARBY_LEVEL_TOLERANCE_PCT = 1.0;

/**
 * Average levels within `NEARBY_LEVEL_TOLERANCE_PCT` of each other into one,
 * ascending. Non-finite and non-positive levels are dropped first.
 */
export function combineNearbyLevels(levels: readonly number[]): number[] {
  const sorted = levels.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const current = clusters[clusters.length - 1];
    const mean = current.reduce((s, p) => s + p, 0) / current.length;
    if ((Math.abs(sorted[i] - mean) / mean) * 100 <= NEARBY_LEVEL_TOLERANCE_PCT) current.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map((c) => c.reduce((s, p) => s + p, 0) / c.length);
}
