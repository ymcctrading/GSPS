/**
 * GSPS Phase 3 entitlement policy resolver.
 *
 * Server-only. Resolves the scan-quota / result-visibility / monitor-capacity
 * policy for a profile's tier. This is the single source of truth other
 * server code must call through — no route, job, or component should compare
 * `profile.tier` (or `PlatformTier`) against a literal string to decide what a
 * user can do; call `getEntitlementPolicy`/`getUserEntitlementPolicy` instead.
 *
 * Tier naming: the product/spec names for these four tiers are Novice, Pro,
 * Expert, and Wall Street (docs/GSPS_TIER_ENTITLEMENT_SPEC.md). The already-shipped billing
 * enum (`PlatformTier` in lib/tiers.ts, backing Stripe checkout/webhook code
 * from PR #85) uses PRACTICE/STANDARD/INVESTOR_MODE/SYSTEM_MASTERY. Rather
 * than introduce a second tier concept, this module reuses that enum and
 * rank order one-to-one:
 *
 *   Novice      -> PRACTICE
 *   Pro         -> STANDARD
 *   Expert      -> INVESTOR_MODE
 *   Wall Street -> SYSTEM_MASTERY
 *
 * User-facing copy may say "Novice"/"Pro"/"Expert"/"Wall Street"; the enum
 * values and `TIER_META` labels are unchanged so Stripe/checkout/webhook code
 * that already keys off them is untouched by this PR.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserTier, type PlatformTier } from "@/lib/tiers";

export type Limit = number | "unlimited";

export type ProcessingPriority = "standard" | "elevated" | "high" | "highest";

export type EntitlementPolicy = {
  /** 6:00 AM ET Morning Preparation scan — included on every tier. */
  morningPreparationScanEnabled: boolean;
  /** 9:15 AM ET confirmation scan — included on every tier. */
  morningConfirmationScanEnabled: boolean;
  manualDashboardScansPerDay: Limit;
  guidedScansPerDay: Limit;
  maxDashboardSetupsPerScan: 6 | 12 | 20 | 30;
  universeScansEnabled: boolean;
  manualTickerScansEnabled: boolean;
  automationEnabled: boolean;
  intradayScansEnabled: boolean;
  backtestingEnabled: boolean;
  maxActiveWatchMonitors: Limit;
  maxAutomationWorkflows: Limit;
  maxCustomAlertRules: Limit;
  maxSavedWatchlists: Limit;
  maxSymbolsPerWatchlist: Limit;
  scanHistoryRetentionDays: Limit;
  processingPriority: ProcessingPriority;
};

/**
 * Plan values transcribed from docs/GSPS_TIER_ENTITLEMENT_SPEC.md ("Plan
 * entitlements" and "Operational capacities" tables). Keep this object as
 * the only place these numbers are declared — do not hardcode a tier's
 * quota/cap/capacity anywhere else.
 *
 * Exception: automationEnabled/maxAutomationWorkflows deliberately did NOT
 * originally match that doc's first draft, which said "Automation: Pro+".
 * The already-shipped `/automation` page (PR #23) gates on
 * `autonomous_portfolio_manager` in lib/tiers.ts, which is Wall Street
 * (SYSTEM_MASTERY) only -- confirmed as the intended behavior (2026-08-26)
 * rather than widened to match that draft. automationEnabled here is
 * `true` only for SYSTEM_MASTERY, and docs/GSPS_TIER_ENTITLEMENT_SPEC.md
 * has been corrected to match.
 */
const ENTITLEMENT_POLICY: Record<PlatformTier, EntitlementPolicy> = {
  PRACTICE: {
    morningPreparationScanEnabled: true,
    morningConfirmationScanEnabled: true,
    manualDashboardScansPerDay: 1,
    guidedScansPerDay: 1,
    maxDashboardSetupsPerScan: 6,
    universeScansEnabled: true,
    manualTickerScansEnabled: true,
    automationEnabled: false,
    intradayScansEnabled: false,
    backtestingEnabled: false,
    maxActiveWatchMonitors: 15,
    maxAutomationWorkflows: 0,
    maxCustomAlertRules: 10,
    maxSavedWatchlists: 3,
    maxSymbolsPerWatchlist: 25,
    scanHistoryRetentionDays: 30,
    processingPriority: "standard",
  },
  STANDARD: {
    morningPreparationScanEnabled: true,
    morningConfirmationScanEnabled: true,
    manualDashboardScansPerDay: 3,
    guidedScansPerDay: 2,
    maxDashboardSetupsPerScan: 12,
    universeScansEnabled: true,
    manualTickerScansEnabled: true,
    automationEnabled: false,
    intradayScansEnabled: false,
    backtestingEnabled: false,
    maxActiveWatchMonitors: 50,
    maxAutomationWorkflows: 0,
    maxCustomAlertRules: 50,
    maxSavedWatchlists: 10,
    maxSymbolsPerWatchlist: 100,
    scanHistoryRetentionDays: 90,
    processingPriority: "elevated",
  },
  INVESTOR_MODE: {
    morningPreparationScanEnabled: true,
    morningConfirmationScanEnabled: true,
    manualDashboardScansPerDay: 6,
    guidedScansPerDay: 6,
    maxDashboardSetupsPerScan: 20,
    universeScansEnabled: true,
    manualTickerScansEnabled: true,
    automationEnabled: false,
    intradayScansEnabled: true,
    backtestingEnabled: false,
    maxActiveWatchMonitors: 150,
    maxAutomationWorkflows: 0,
    maxCustomAlertRules: 200,
    maxSavedWatchlists: 25,
    maxSymbolsPerWatchlist: 250,
    scanHistoryRetentionDays: 365,
    processingPriority: "high",
  },
  SYSTEM_MASTERY: {
    morningPreparationScanEnabled: true,
    morningConfirmationScanEnabled: true,
    manualDashboardScansPerDay: "unlimited",
    guidedScansPerDay: "unlimited",
    maxDashboardSetupsPerScan: 30,
    universeScansEnabled: true,
    manualTickerScansEnabled: true,
    automationEnabled: true,
    intradayScansEnabled: true,
    backtestingEnabled: true,
    maxActiveWatchMonitors: "unlimited",
    maxAutomationWorkflows: "unlimited",
    maxCustomAlertRules: "unlimited",
    maxSavedWatchlists: "unlimited",
    maxSymbolsPerWatchlist: "unlimited",
    scanHistoryRetentionDays: "unlimited",
    processingPriority: "highest",
  },
};

/** Server-only, pure. Never trust a client-supplied tier — resolve it first. */
export function getEntitlementPolicy(tier: PlatformTier): EntitlementPolicy {
  return ENTITLEMENT_POLICY[tier];
}

/**
 * Resolves a profile's entitlement policy from the authoritative
 * `profiles.tier` column — never from client-supplied plan/tier data.
 * Defaults to PRACTICE (via `getUserTier`) for a missing/unrecognized tier,
 * consistent with fail-closed: an unresolvable tier gets the least
 * permissive policy, never a more permissive one.
 */
export async function getUserEntitlementPolicy(
  supabase: SupabaseClient,
  userId: string,
): Promise<EntitlementPolicy> {
  const tier = await getUserTier(supabase, userId);
  return getEntitlementPolicy(tier);
}
