/**
 * Rules Alignment Score: 0–100, tallied from a per-state breakdown of
 * weighted components. Never a probability of profit — the spec is explicit
 * about that, and nothing here computes or displays one.
 *
 * A component with `applicable: false` (e.g. volume/resumption evidence
 * where reliable volume data doesn't exist) is excluded from both the
 * earned and possible totals rather than scored as failed — the spec marks
 * that component "optional only where reliable data exists", and failing it
 * outright would penalize instruments this engine has no real read on.
 */

import type { RulesAlignmentBreakdownItem, RulesAlignmentScore, RulesAlignmentTier } from "./types";

export function computeRulesAlignmentScore(
  breakdown: RulesAlignmentBreakdownItem[],
): RulesAlignmentScore {
  const applicable = breakdown.filter((b) => b.applicable);
  const possible = applicable.reduce((s, b) => s + b.maxPoints, 0);
  const earned = applicable.reduce((s, b) => s + (b.passed ? b.points : 0), 0);
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 10000) / 100;

  let tier: RulesAlignmentTier;
  if (score >= 92) tier = "aPlusTier";
  else if (score >= 85) tier = "aTier";
  else if (score >= 75) tier = "qualified";
  else tier = "watchlistOnly";

  return { score, tier, breakdown };
}

/** "Qualified" and above require every safety gate to pass, not just the score band. */
export function tierQualifies(alignment: RulesAlignmentScore, allSafetyGatesPass: boolean): boolean {
  if (alignment.tier === "watchlistOnly") return false;
  if (alignment.tier === "qualified") return allSafetyGatesPass;
  return allSafetyGatesPass;
}
