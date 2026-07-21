/**
 * 4-tier feature-flag / entitlement layer (Suggestion S-3 in the review log).
 * Declarative gating keyed off the user's tier, so the UI and API check
 * `can(tier, "feature")` instead of scattering tier logic everywhere.
 *
 * Tier model is the finalized 4-tier structure from Docs 2 & 4:
 *   PRACTICE       $0            paper/sandbox only
 *   STANDARD       $0 + per-trade live routing, manual order suite
 *   INVESTOR_MODE  $99/mo        drawings, oscillators, tactical layers, 15 setups
 *   SYSTEM_MASTERY $299/mo       autonomous portfolio manager
 */

export enum Tier {
  PRACTICE = "PRACTICE",
  STANDARD = "STANDARD",
  INVESTOR_MODE = "INVESTOR_MODE",
  SYSTEM_MASTERY = "SYSTEM_MASTERY",
}

/** Ordered low -> high for "at least this tier" comparisons. */
const TIER_RANK: Record<Tier, number> = {
  [Tier.PRACTICE]: 0,
  [Tier.STANDARD]: 1,
  [Tier.INVESTOR_MODE]: 2,
  [Tier.SYSTEM_MASTERY]: 3,
};

export type Feature =
  // Core (all tiers)
  | "core_charts"
  | "manual_scan"
  | "standard_lookbacks"
  | "extended_hours_toggle"
  // Standard+
  | "live_order_routing"
  | "realtime_streaming"
  // Investor Mode+
  | "drawing_tools"
  | "oscillators_macd_rsi"
  | "tactical_data_layers"
  | "mean_reversion_setups"
  // System Mastery only
  | "automated_execution"
  | "tick_streams"
  | "webhook_alerts";

/** Minimum tier required for each feature. */
const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  core_charts: Tier.PRACTICE,
  manual_scan: Tier.PRACTICE,
  standard_lookbacks: Tier.PRACTICE,
  extended_hours_toggle: Tier.PRACTICE, // free toggle by default (see Q-2)
  live_order_routing: Tier.STANDARD,
  realtime_streaming: Tier.STANDARD,
  drawing_tools: Tier.INVESTOR_MODE,
  oscillators_macd_rsi: Tier.INVESTOR_MODE,
  tactical_data_layers: Tier.INVESTOR_MODE,
  mean_reversion_setups: Tier.INVESTOR_MODE,
  automated_execution: Tier.SYSTEM_MASTERY,
  tick_streams: Tier.SYSTEM_MASTERY,
  webhook_alerts: Tier.SYSTEM_MASTERY,
};

export interface TierInfo {
  tier: Tier;
  label: string;
  priceMonthly: number;
  priceYearly: number | null;
  perTradeFee: boolean;
  blurb: string;
}

export const TIERS: Record<Tier, TierInfo> = {
  [Tier.PRACTICE]: {
    tier: Tier.PRACTICE,
    label: "Practice",
    priceMonthly: 0,
    priceYearly: 0,
    perTradeFee: false,
    blurb: "Paper/sandbox trading. Core charts, manual scans, standard lookbacks.",
  },
  [Tier.STANDARD]: {
    tier: Tier.STANDARD,
    label: "Standard",
    priceMonthly: 0,
    priceYearly: 0,
    perTradeFee: true,
    blurb: "Live routing + full manual order suite. Real-time data. ETH toggle.",
  },
  [Tier.INVESTOR_MODE]: {
    tier: Tier.INVESTOR_MODE,
    label: "Investor Mode",
    priceMonthly: 99,
    priceYearly: 990,
    perTradeFee: true,
    blurb: "Drawings, MACD/RSI, tactical layers, and the 15 daily setups.",
  },
  [Tier.SYSTEM_MASTERY]: {
    tier: Tier.SYSTEM_MASTERY,
    label: "System Mastery",
    priceMonthly: 299,
    priceYearly: null,
    perTradeFee: true,
    blurb: "Autonomous portfolio manager: tick streams, alerts, automated execution.",
  },
};

/** Does `tier` unlock `feature`? */
export function can(tier: Tier, feature: Feature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

/** Every feature a tier unlocks (handy for building the UI paywall matrix). */
export function featuresFor(tier: Tier): Feature[] {
  return (Object.keys(FEATURE_MIN_TIER) as Feature[]).filter((f) => can(tier, f));
}
