/**
 * GSPS Mean-Reversion Waterfall Filter
 * -----------------------------------------------------------------------------
 * The multi-tiered "quality gate" the user specified (twice) for the 15 bullish
 * and 15 bearish reversion slots:
 *
 *   1. HARD GATE   - must pass the Strat sniper/snapper barrier, else discard.
 *   2. TIER 1      - pristine setups scoring 8 or 9.
 *   3. TIER 2      - only if fewer than 15, open to score EXACTLY 7, but only
 *                    with massive velocity (RVOL >= 2.0 OR active ATR expansion).
 *   4. RANK & SLICE- sort by score desc, tie-break by RVOL desc, top 15.
 *
 * Runs independently for the bullish and bearish pipelines.
 */

import type {
  Direction,
  RankedSetup,
  ReversionPayload,
  ScannedAsset,
  SetupTier,
} from "./types";

export const MAX_SETUPS = 15;
export const TIER1_MIN_SCORE = 8;
export const TIER2_SCORE = 7;
export const HIGH_RVOL_THRESHOLD = 2.0;

/** "Massive momentum or volatility" per the spec. */
export function hasMassiveVelocity(asset: ScannedAsset): boolean {
  return asset.relativeVolume >= HIGH_RVOL_THRESHOLD || asset.atrExpansion;
}

function setupTierFor(score: number): SetupTier {
  return score >= TIER1_MIN_SCORE ? "PRISTINE" : "VELOCITY";
}

/**
 * Filter + rank a single direction's candidates into at most 15 setups.
 * Exported for direct unit testing.
 */
export function filterDirection(candidates: ScannedAsset[]): RankedSetup[] {
  // 1. Hard gate: drop anything that misses the Strat sniper/snapper barrier.
  const stratQualified = candidates.filter((a) => a.passesStratBarrier);

  // 2. Tier 1: pristine 8/9 setups.
  let selected = stratQualified.filter((a) => a.score >= TIER1_MIN_SCORE);

  // 3. Tier 2 fallback: only when we don't yet have a full board, open to
  //    exactly-7 setups that show massive velocity.
  if (selected.length < MAX_SETUPS) {
    const velocityTier2 = stratQualified.filter(
      (a) => a.score === TIER2_SCORE && hasMassiveVelocity(a),
    );
    selected = [...selected, ...velocityTier2];
  }

  // 4. Rank: score desc, then RVOL desc as the tie-breaker; slice to top 15.
  return selected
    .slice()
    .sort((a, b) => b.score - a.score || b.relativeVolume - a.relativeVolume)
    .slice(0, MAX_SETUPS)
    .map((a, i) => ({
      ...a,
      rank: i + 1,
      setupTier: setupTierFor(a.score),
    }));
}

/**
 * Process the full scanned universe into the dashboard's bullish/bearish
 * reversion payloads. Assets are split by their own `direction` field, then each
 * side runs the identical waterfall.
 */
export function processProtocolReversions(
  universe: ScannedAsset[],
): ReversionPayload {
  const byDirection = (d: Direction) =>
    filterDirection(universe.filter((a) => a.direction === d));

  return {
    bullishReversions: byDirection("bullish"),
    bearishReversions: byDirection("bearish"),
  };
}
