/**
 * Strategy Modes tier gating (AGENTS.md's "Strategy Modes" section;
 * docs/STRATEGY_MODES.md; `lib/entitlements/policy.ts#allowedStrategyModes`).
 *
 * Kept separate from `registry.ts` (which only knows how to *evaluate* a
 * mode, not who's allowed to pick it) so a caller that needs both — every
 * route/component that lets a human select a mode — imports each concern
 * from the file that owns it.
 */

import type { EntitlementPolicy } from "@/lib/entitlements/policy";
import type { StrategyModeId } from "./types";

/** `"gann"` (the structural default) is always allowed — this only governs
 * the opt-in, non-default modes. */
export function isStrategyModeAllowedForPolicy(
  policy: Pick<EntitlementPolicy, "allowedStrategyModes">,
  mode: StrategyModeId,
): boolean {
  if (mode === "gann") return true;
  const allowed = policy.allowedStrategyModes;
  if (allowed === "all") return true;
  return allowed.includes(mode);
}
