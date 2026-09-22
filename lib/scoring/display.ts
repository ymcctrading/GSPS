/**
 * Tier-aware score display formatting.
 *
 * The scored value itself (`decision.score`) is always exact and is never
 * rounded for storage, gating, or the criteria math — see
 * `lib/scoring/weights.ts`. This module only controls what a *user* sees:
 * Novice and Pro get the score rounded to the nearest half point (a raw
 * `6.06` reads as noise, not signal, to a trader still learning what the
 * number means); Expert and Wall Street, who are expected to reason about
 * the exact weighted figure, see it to two decimal places. See
 * `lib/entitlements/policy.ts`'s `exactScoreDisplayEnabled` for which tier
 * is which (2026-09-16, project owner direction).
 *
 * Every score-rendering surface should format through here rather than
 * rounding ad hoc — see AGENTS.md's cross-platform-consistency principle.
 */

import { TOTAL_POINTS } from "./weights";

export const SCORE_MAX = TOTAL_POINTS;

function trimTrailingZeros(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** The score value itself, rounded to the tier's display precision. */
export function displayScoreValue(score: number, exactScoreDisplayEnabled: boolean): number {
  return exactScoreDisplayEnabled ? Math.round(score * 100) / 100 : Math.round(score * 2) / 2;
}

/** `"6.5"`, `"7"`, or (Expert/Wall Street) `"6.67"` — never a bare `6.06` for Novice/Pro. */
export function formatScore(score: number, exactScoreDisplayEnabled: boolean): string {
  const rounded = displayScoreValue(score, exactScoreDisplayEnabled);
  return trimTrailingZeros(rounded, exactScoreDisplayEnabled ? 2 : 1);
}

/** `"6.5/10"` — the label most call sites actually want. */
export function formatScoreOutOfMax(score: number, exactScoreDisplayEnabled: boolean): string {
  return `${formatScore(score, exactScoreDisplayEnabled)}/${SCORE_MAX}`;
}
