/**
 * Where a scan result stands in the daily lists' order and in a member's
 * capped list. Kept apart from `marketScan.ts` so the scan routes read it
 * without the scan itself.
 */

import { isRestingScanResult, tierOfDecision } from "@/lib/setups/resting";
import type { ScanResult } from "@/lib/types";

const VERDICT_TIER: Record<string, number> = { Execute: 3, Resting: 2, Watch: 1, Reject: 0 };

/**
 * The verdict's place in the lists' order. A resting Execute (its entry more
 * than a day's range from price, `lib/setups/resting.ts`) is not a trade to
 * take today, so it ranks with Watch, behind every Execute price is near, as
 * the Novice home's "Today's plan" already ranks it (`bestPlan.ts`). The
 * verdict itself is unchanged (owner, 2026-10-23: SE's sell, 32% from its $100
 * reaction entry, was rank 1 on the sell list).
 */
export function listTier(r: ScanResult): number {
  const tier = tierOfDecision(r.decision);
  const side = r.direction === "bullish" ? "buy" : "sell";
  // An Execute resting at its level (a result cached before the scan held it
  // at Watch, 2026-10-27) reads as the Resting tier too.
  if (tier === "Execute" && isRestingScanResult(r, side)) return VERDICT_TIER.Resting;
  // Since 2026-10-28 Resting is its own tier (`setupTier`): behind Execute,
  // ahead of Watch, as Today's plan ranks it (`bestPlan.ts`).
  return VERDICT_TIER[tier] ?? 0;
}

/**
 * The rank a member's capped list keeps setups by (`selectVisibleResults`):
 * the lists' tier first, then the score, so a resting plan never takes a
 * near-entry plan's slot.
 */
export function visibilityRank(r: ScanResult): number {
  return listTier(r) * 100 + r.decision.score;
}
