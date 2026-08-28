/**
 * The publishable half of a Signal and Regime Engine verdict — same rule as
 * `lib/scoring/public-summary.ts`: the full breakdown (which named criterion
 * passed on which condition) stays server-side. What crosses an API/UI
 * boundary is a rollup: which regime, which direction, which readiness tier.
 * A reader learns the setup's regime and how it's rated; nothing about which
 * MA/VWAP/structural conditions decided it.
 */

import type { Regime, RulesAlignmentTier, ScannerStateName, SignalVerdict } from "./types";
import type { Direction } from "@/lib/types";

export interface PublicSignalSummary {
  state: ScannerStateName;
  regime: Regime;
  direction: Exclude<Direction, "none"> | "sideways";
  tier: RulesAlignmentTier;
  tradeable: boolean;
  /** See `SignalVerdict`'s `accountContextAssumed` — false means this reading has real account gates behind it. */
  accountContextAssumed: boolean;
}

export function toPublicSignalSummary(verdict: SignalVerdict | null | undefined): PublicSignalSummary | null {
  if (!verdict || verdict.status !== "evaluated") return null;
  return {
    state: verdict.state,
    regime: verdict.regime.regime,
    direction: verdict.regime.direction,
    tier: verdict.alignment.tier,
    tradeable: verdict.tradeable,
    accountContextAssumed: verdict.accountContextAssumed,
  };
}
