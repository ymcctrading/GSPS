import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRiskPolicy, DEFAULT_RISK_POLICY_VALUES } from "@/lib/risk/policy";
import { DEFAULT_CIRCUIT_THRESHOLDS } from "@/lib/risk/circuit-breaker";
import { DEFAULT_RISK_BAND_THRESHOLDS } from "@/lib/risk/dynamic-risk";

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

describe("getRiskPolicy", () => {
  it("resolves to the same shape as the module-level circuit-breaker/dynamic-risk defaults when unconfigured", async () => {
    const policy = await getRiskPolicy(makeSupabase([]));
    expect(policy.circuit).toEqual(DEFAULT_CIRCUIT_THRESHOLDS);
    expect(policy.band).toEqual(DEFAULT_RISK_BAND_THRESHOLDS);
  });

  it("overlays a circuit-domain override", async () => {
    const policy = await getRiskPolicy(makeSupabase([{ key: "hardCooldown48hLossPct", value: 4 }]));
    expect(policy.circuit.hardCooldown48hLossPct).toBe(4);
    expect(policy.circuit.softCooldown48hLossPct).toBe(DEFAULT_CIRCUIT_THRESHOLDS.softCooldown48hLossPct);
  });

  it("overlays a band-rate override for a single band without disturbing the others", async () => {
    const policy = await getRiskPolicy(makeSupabase([{ key: "riskBandRateBase", value: 0.75 }]));
    expect(policy.band.riskBandRatePct.base).toBe(0.75);
    expect(policy.band.riskBandRatePct.a_tier).toBe(DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.a_tier);
  });

  it("default policy values match the pure-function defaults 1:1", () => {
    expect(DEFAULT_RISK_POLICY_VALUES.riskBandRateBase).toBe(DEFAULT_RISK_BAND_THRESHOLDS.riskBandRatePct.base);
    expect(DEFAULT_RISK_POLICY_VALUES.absoluteTierCapPct).toBe(DEFAULT_RISK_BAND_THRESHOLDS.absoluteTierCapPct);
    expect(DEFAULT_RISK_POLICY_VALUES.maxNewPositionsPerDay).toBe(DEFAULT_CIRCUIT_THRESHOLDS.maxNewPositionsPerDay);
  });
});
