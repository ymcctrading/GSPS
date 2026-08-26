import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlementPolicy, getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { TIER_ORDER, type PlatformTier } from "@/lib/tiers";

/** Fakes the one query getUserTier makes: profiles.select("tier").eq("id", userId).single() */
function fakeClientForTier(tier: string | null): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single() {
                  return Promise.resolve({ data: tier ? { tier } : null, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("getEntitlementPolicy", () => {
  it("matches the spec's manual/guided quotas and dashboard result caps per tier", () => {
    const expected: Record<PlatformTier, { manual: number | "unlimited"; guided: number | "unlimited"; cap: number }> = {
      PRACTICE: { manual: 1, guided: 1, cap: 6 },
      STANDARD: { manual: 3, guided: 2, cap: 12 },
      INVESTOR_MODE: { manual: 6, guided: 6, cap: 20 },
      SYSTEM_MASTERY: { manual: "unlimited", guided: "unlimited", cap: 30 },
    };

    for (const tier of TIER_ORDER) {
      const policy = getEntitlementPolicy(tier);
      expect(policy.manualDashboardScansPerDay).toBe(expected[tier].manual);
      expect(policy.guidedScansPerDay).toBe(expected[tier].guided);
      expect(policy.maxDashboardSetupsPerScan).toBe(expected[tier].cap);
    }
  });

  it("gates automation at Wall Street (SYSTEM_MASTERY) only, matching the already-shipped /automation gate", () => {
    expect(getEntitlementPolicy("PRACTICE").automationEnabled).toBe(false);
    expect(getEntitlementPolicy("STANDARD").automationEnabled).toBe(false);
    expect(getEntitlementPolicy("INVESTOR_MODE").automationEnabled).toBe(false);
    expect(getEntitlementPolicy("SYSTEM_MASTERY").automationEnabled).toBe(true);
  });

  it("gates intraday scans at Expert (INVESTOR_MODE) and above only", () => {
    expect(getEntitlementPolicy("PRACTICE").intradayScansEnabled).toBe(false);
    expect(getEntitlementPolicy("STANDARD").intradayScansEnabled).toBe(false);
    expect(getEntitlementPolicy("INVESTOR_MODE").intradayScansEnabled).toBe(true);
    expect(getEntitlementPolicy("SYSTEM_MASTERY").intradayScansEnabled).toBe(true);
  });

  it("gates backtesting at Wall Street (SYSTEM_MASTERY) only", () => {
    expect(getEntitlementPolicy("PRACTICE").backtestingEnabled).toBe(false);
    expect(getEntitlementPolicy("STANDARD").backtestingEnabled).toBe(false);
    expect(getEntitlementPolicy("INVESTOR_MODE").backtestingEnabled).toBe(false);
    expect(getEntitlementPolicy("SYSTEM_MASTERY").backtestingEnabled).toBe(true);
  });

  it("includes the 6:00 AM and 9:15 AM scheduled scans on every tier", () => {
    for (const tier of TIER_ORDER) {
      const policy = getEntitlementPolicy(tier);
      expect(policy.morningPreparationScanEnabled).toBe(true);
      expect(policy.morningConfirmationScanEnabled).toBe(true);
    }
  });

  it("gives Wall Street unlimited monitor/automation/watchlist capacity", () => {
    const policy = getEntitlementPolicy("SYSTEM_MASTERY");
    expect(policy.maxActiveWatchMonitors).toBe("unlimited");
    expect(policy.maxAutomationWorkflows).toBe("unlimited");
    expect(policy.maxCustomAlertRules).toBe("unlimited");
    expect(policy.maxSavedWatchlists).toBe("unlimited");
    expect(policy.maxSymbolsPerWatchlist).toBe("unlimited");
    expect(policy.scanHistoryRetentionDays).toBe("unlimited");
  });

  it("gives Novice (PRACTICE) zero automation workflows despite scan access", () => {
    const policy = getEntitlementPolicy("PRACTICE");
    expect(policy.maxAutomationWorkflows).toBe(0);
    expect(policy.automationEnabled).toBe(false);
  });
});

describe("getUserEntitlementPolicy", () => {
  it("resolves the policy matching the profile's authoritative tier", async () => {
    const policy = await getUserEntitlementPolicy(fakeClientForTier("INVESTOR_MODE"), "user-1");
    expect(policy).toEqual(getEntitlementPolicy("INVESTOR_MODE"));
  });

  it("fails closed to the least-permissive (PRACTICE) policy when the profile has no tier", async () => {
    const policy = await getUserEntitlementPolicy(fakeClientForTier(null), "user-1");
    expect(policy).toEqual(getEntitlementPolicy("PRACTICE"));
  });

  it("fails closed to PRACTICE for an unrecognized tier value rather than granting access", async () => {
    const policy = await getUserEntitlementPolicy(fakeClientForTier("not_a_real_tier"), "user-1");
    expect(policy).toEqual(getEntitlementPolicy("PRACTICE"));
  });
});
