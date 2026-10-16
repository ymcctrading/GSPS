import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUniversePolicy, DEFAULT_UNIVERSE_POLICY_VALUES } from "@/lib/universe/policy";
import { DEFAULT_UNIVERSE_THRESHOLDS } from "@/lib/universe/eligibility";
import { DEFAULT_SMALL_ACCOUNT_THRESHOLDS } from "@/lib/universe/smallAccount";

function makeSupabase(rows: { key: string; value: unknown }[]) {
  const table = {
    select: () => ({
      eq: () => ({
        in: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
  return { from: () => table } as unknown as SupabaseClient;
}

describe("getUniversePolicy", () => {
  it("resolves to the same shape as the module-level defaults when unconfigured", async () => {
    const policy = await getUniversePolicy(makeSupabase([]));
    expect(policy.universe).toEqual(DEFAULT_UNIVERSE_THRESHOLDS);
    expect(policy.smallAccount).toEqual(DEFAULT_SMALL_ACCOUNT_THRESHOLDS);
  });

  it("overlays a market-cap override without disturbing liquidity", async () => {
    const policy = await getUniversePolicy(makeSupabase([{ key: "marketCapFloorUsd", value: 20_000_000_000 }]));
    expect(policy.universe.marketCap.marketCapFloorUsd).toBe(20_000_000_000);
    expect(policy.universe.liquidity).toEqual(DEFAULT_UNIVERSE_THRESHOLDS.liquidity);
  });

  it("overlays the small-account staged-exit floor", async () => {
    const policy = await getUniversePolicy(makeSupabase([{ key: "minWholeUnitsForStagedExit", value: 6 }]));
    expect(policy.smallAccount.minWholeUnitsForStagedExit).toBe(6);
  });

  // Q13: a row may narrow the universe, never widen it.
  it("ignores a row that would widen the universe", async () => {
    const policy = await getUniversePolicy(
      makeSupabase([
        { key: "minWholeUnitsForStagedExit", value: 2 },
        { key: "marketCapFloorUsd", value: 1 },
        { key: "maxSpreadPctOfPrice", value: 99 },
      ]),
    );
    expect(policy.smallAccount).toEqual(DEFAULT_SMALL_ACCOUNT_THRESHOLDS);
    expect(policy.universe).toEqual(DEFAULT_UNIVERSE_THRESHOLDS);
  });

  it("default policy values match the pure-function defaults 1:1", () => {
    expect(DEFAULT_UNIVERSE_POLICY_VALUES.marketCapFloorUsd).toBe(DEFAULT_UNIVERSE_THRESHOLDS.marketCap.marketCapFloorUsd);
    expect(DEFAULT_UNIVERSE_POLICY_VALUES.priceBandMinUsd).toBe(DEFAULT_UNIVERSE_THRESHOLDS.priceBand.priceBandMinUsd);
    expect(DEFAULT_UNIVERSE_POLICY_VALUES.minWholeUnitsForStagedExit).toBe(
      DEFAULT_SMALL_ACCOUNT_THRESHOLDS.minWholeUnitsForStagedExit,
    );
  });
});
