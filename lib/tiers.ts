/**
 * GSPS 4-tier entitlements. Mirrors the platform_tier enum on profiles.tier.
 * Transaction-based model: live execution + the manual order suite are free;
 * subscriptions pay for premium intelligence and automation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformTier =
  | "PRACTICE"
  | "STANDARD"
  | "INVESTOR_MODE"
  | "SYSTEM_MASTERY";

export type Feature =
  | "live_execution"
  | "extended_trading_hours"
  | "drawing_tools"
  | "oscillators"
  | "mean_reversion_scanner"
  | "autonomous_portfolio_manager";

export const TIER_ORDER: PlatformTier[] = [
  "PRACTICE",
  "STANDARD",
  "INVESTOR_MODE",
  "SYSTEM_MASTERY",
];

export const TIER_META: Record<
  PlatformTier,
  { label: string; monthlyUsd: number; yearlyUsd?: number }
> = {
  PRACTICE: { label: "Practice", monthlyUsd: 0 },
  STANDARD: { label: "Standard", monthlyUsd: 0 },
  INVESTOR_MODE: { label: "Investor Mode", monthlyUsd: 99, yearlyUsd: 990 },
  SYSTEM_MASTERY: { label: "System Mastery", monthlyUsd: 299 },
};

// Minimum tier that unlocks each feature.
const FEATURE_MIN_TIER: Record<Feature, PlatformTier> = {
  live_execution: "STANDARD",
  extended_trading_hours: "STANDARD",
  drawing_tools: "INVESTOR_MODE",
  oscillators: "INVESTOR_MODE",
  mean_reversion_scanner: "INVESTOR_MODE",
  autonomous_portfolio_manager: "SYSTEM_MASTERY",
};

export function tierRank(tier: PlatformTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function hasFeature(tier: PlatformTier, feature: Feature): boolean {
  return tierRank(tier) >= tierRank(FEATURE_MIN_TIER[feature]);
}

export function minimumTierFor(feature: Feature): PlatformTier {
  return FEATURE_MIN_TIER[feature];
}

/** Read the signed-in user's tier from profiles; defaults to PRACTICE. */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlatformTier> {
  const { data } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .single();
  const tier = data?.tier as PlatformTier | undefined;
  return tier && TIER_ORDER.includes(tier) ? tier : "PRACTICE";
}
