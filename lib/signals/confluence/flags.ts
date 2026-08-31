/**
 * Feature flags for the Gann/Sara confluence modules — "disabled/feature-
 * flagged without breaking GSPS core functionality" per the addendum.
 *
 * Deliberately separate from `lib/tiers.ts`'s paid-feature gating: both
 * modules are confluence/education, not a paid capability, so eligibility is
 * per-market rather than per-tier. An env var lets ops kill a module
 * platform-wide without touching core scanning code or a redeploy of
 * anything else.
 */

import type { SupportedMarket } from "./marketAdapters";

export type ConfluenceModuleId = "gann_confluence_layer" | "sara_sniper_confluence_layer";

const DEFAULT_ENABLED_MARKETS: Record<ConfluenceModuleId, ReadonlySet<SupportedMarket>> = {
  gann_confluence_layer: new Set(["equities", "crypto"]),
  sara_sniper_confluence_layer: new Set(["equities", "crypto"]),
};

const ENV_DISABLE_FLAG: Record<ConfluenceModuleId, string> = {
  gann_confluence_layer: "GSPS_DISABLE_GANN_CONFLUENCE",
  sara_sniper_confluence_layer: "GSPS_DISABLE_SARA_CONFLUENCE",
};

/** Whether a confluence module should run at all for the given market. Disabling core scanning is never a side effect of either answer. */
export function isConfluenceModuleEnabled(
  moduleId: ConfluenceModuleId,
  market: SupportedMarket,
): boolean {
  if (process.env[ENV_DISABLE_FLAG[moduleId]] === "1") return false;
  return DEFAULT_ENABLED_MARKETS[moduleId].has(market);
}
