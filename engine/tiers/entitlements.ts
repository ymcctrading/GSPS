/**
 * GSPS 4-Tier Entitlement Matrix
 * -----------------------------------------------------------------------------
 * Single source of truth for what each subscription tier unlocks. The monetization
 * model is transaction-based: live execution + the full manual order suite are FREE
 * (monetized by a per-trade micro-fee). Subscriptions pay for premium intelligence
 * and automation, never for the ability to trade.
 *
 * Mirrors the `platform_tier` enum in Supabase (profiles.tier).
 */

export type PlatformTier =
  | "PRACTICE"
  | "STANDARD"
  | "INVESTOR_MODE"
  | "SYSTEM_MASTERY";

export type Feature =
  // Execution
  | "paper_trading"
  | "live_execution"
  | "manual_order_suite" // market, limit, stop-limit, buy/sell limits
  | "real_time_streaming"
  | "extended_trading_hours" // coded everywhere; toggle in settings
  // Charting / analytics (Investor Mode)
  | "drawing_tools" // trendlines, Bollinger, Fibonacci
  | "oscillators" // MACD, RSI
  | "automated_signals"
  | "tactical_levels" // target entry, master profit, tiered take-profits
  | "mean_reversion_scanner" // the 15 bull/bear waterfall lists
  // Automation (System Mastery)
  | "high_frequency_tick_streams"
  | "custom_webhook_alerts"
  | "autonomous_portfolio_manager" // trailing stops, auto routing, hard stops
  | "multi_device_layouts";

export interface TierDefinition {
  tier: PlatformTier;
  label: string;
  /** Monthly price in USD; 0 means no platform fee (still per-trade micro-fee where live). */
  monthlyPriceUsd: number;
  yearlyPriceUsd?: number;
  features: ReadonlySet<Feature>;
}

const F = (...features: Feature[]) => new Set<Feature>(features);

// Feature access is cumulative up the ladder.
const PRACTICE_FEATURES = F("paper_trading", "manual_order_suite");

const STANDARD_FEATURES = new Set<Feature>([
  ...PRACTICE_FEATURES,
  "live_execution",
  "real_time_streaming",
  "extended_trading_hours",
]);

const INVESTOR_FEATURES = new Set<Feature>([
  ...STANDARD_FEATURES,
  "drawing_tools",
  "oscillators",
  "automated_signals",
  "tactical_levels",
  "mean_reversion_scanner",
]);

const SYSTEM_MASTERY_FEATURES = new Set<Feature>([
  ...INVESTOR_FEATURES,
  "high_frequency_tick_streams",
  "custom_webhook_alerts",
  "autonomous_portfolio_manager",
  "multi_device_layouts",
]);

export const TIERS: Record<PlatformTier, TierDefinition> = {
  PRACTICE: {
    tier: "PRACTICE",
    label: "Practice",
    monthlyPriceUsd: 0,
    features: PRACTICE_FEATURES,
  },
  STANDARD: {
    tier: "STANDARD",
    label: "Standard",
    monthlyPriceUsd: 0, // per-trade micro-fee only
    features: STANDARD_FEATURES,
  },
  INVESTOR_MODE: {
    tier: "INVESTOR_MODE",
    label: "Investor Mode",
    monthlyPriceUsd: 99,
    yearlyPriceUsd: 990,
    features: INVESTOR_FEATURES,
  },
  SYSTEM_MASTERY: {
    tier: "SYSTEM_MASTERY",
    label: "System Mastery",
    monthlyPriceUsd: 299,
    features: SYSTEM_MASTERY_FEATURES,
  },
};

/** Ranked ladder used to compute "minimum tier that unlocks X". */
export const TIER_ORDER: PlatformTier[] = [
  "PRACTICE",
  "STANDARD",
  "INVESTOR_MODE",
  "SYSTEM_MASTERY",
];

export function hasFeature(tier: PlatformTier, feature: Feature): boolean {
  return TIERS[tier].features.has(feature);
}

/** The lowest tier that grants a feature — used to drive paywall CTAs. */
export function minimumTierFor(feature: Feature): PlatformTier | null {
  for (const tier of TIER_ORDER) {
    if (hasFeature(tier, feature)) return tier;
  }
  return null;
}

export class FeatureGateError extends Error {
  constructor(
    public readonly feature: Feature,
    public readonly currentTier: PlatformTier,
    public readonly requiredTier: PlatformTier | null,
  ) {
    super(
      `Feature "${feature}" requires ${requiredTier ?? "a higher"} tier; ` +
        `current tier is ${currentTier}.`,
    );
    this.name = "FeatureGateError";
  }
}

/** Throw unless `tier` unlocks `feature`. Use at the top of premium routes. */
export function assertFeature(tier: PlatformTier, feature: Feature): void {
  if (!hasFeature(tier, feature)) {
    throw new FeatureGateError(feature, tier, minimumTierFor(feature));
  }
}
