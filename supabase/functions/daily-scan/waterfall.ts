/**
 * Deno-compatible copy of the mean-reversion waterfall for the edge runtime.
 * Canonical implementation + full test coverage live in
 * `engine/scanner/waterfall.ts`; keep the two in sync when the rules change.
 * (Kept local to this function so the edge bundle is self-contained.)
 */

export type Direction = "bullish" | "bearish";
export type SetupTier = "PRISTINE" | "VELOCITY";

export interface ScannedAsset {
  symbol: string;
  score: number;
  passesStratBarrier: boolean;
  direction: Direction;
  relativeVolume: number;
  atrExpansion: boolean;
  entry?: number;
  stopLoss?: number;
  takeProfit1?: number;
  masterProfit?: number;
}

export interface RankedSetup extends ScannedAsset {
  rank: number;
  setupTier: SetupTier;
}

export const MAX_SETUPS = 15;
export const TIER1_MIN_SCORE = 8;
export const TIER2_SCORE = 7;
export const HIGH_RVOL_THRESHOLD = 2.0;

export function hasMassiveVelocity(a: ScannedAsset): boolean {
  return a.relativeVolume >= HIGH_RVOL_THRESHOLD || a.atrExpansion;
}

export function filterDirection(candidates: ScannedAsset[]): RankedSetup[] {
  const stratQualified = candidates.filter((a) => a.passesStratBarrier);
  let selected = stratQualified.filter((a) => a.score >= TIER1_MIN_SCORE);
  if (selected.length < MAX_SETUPS) {
    selected = [
      ...selected,
      ...stratQualified.filter(
        (a) => a.score === TIER2_SCORE && hasMassiveVelocity(a),
      ),
    ];
  }
  return selected
    .slice()
    .sort((a, b) => b.score - a.score || b.relativeVolume - a.relativeVolume)
    .slice(0, MAX_SETUPS)
    .map((a, i) => ({
      ...a,
      rank: i + 1,
      setupTier: a.score >= TIER1_MIN_SCORE ? "PRISTINE" : "VELOCITY",
    }));
}

export function processProtocolReversions(universe: ScannedAsset[]): {
  bullishReversions: RankedSetup[];
  bearishReversions: RankedSetup[];
} {
  return {
    bullishReversions: filterDirection(
      universe.filter((a) => a.direction === "bullish"),
    ),
    bearishReversions: filterDirection(
      universe.filter((a) => a.direction === "bearish"),
    ),
  };
}
