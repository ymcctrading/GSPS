import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRiskPolicy, setRiskPolicyValue, DEFAULT_RISK_POLICY_VALUES } from "@/lib/risk/policy";
import { DEFAULT_CIRCUIT_THRESHOLDS } from "@/lib/risk/circuit-breaker";

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
  it("resolves to the same shape as the module-level circuit-breaker defaults when unconfigured", async () => {
    const policy = await getRiskPolicy(makeSupabase([]));
    expect(policy.circuit).toEqual(DEFAULT_CIRCUIT_THRESHOLDS);
  });

  it("overlays a circuit-domain override", async () => {
    const policy = await getRiskPolicy(makeSupabase([{ key: "hardCooldown48hLossPct", value: 4 }]));
    expect(policy.circuit.hardCooldown48hLossPct).toBe(4);
    expect(policy.circuit.softCooldown48hLossPct).toBe(DEFAULT_CIRCUIT_THRESHOLDS.softCooldown48hLossPct);
  });

  it("no longer reads a removed risk-band key (R-004)", async () => {
    const policy = await getRiskPolicy(makeSupabase([{ key: "riskBandRateBase", value: 0.75 }]));
    expect(policy).toEqual({ circuit: DEFAULT_CIRCUIT_THRESHOLDS });
    expect(Object.keys(DEFAULT_RISK_POLICY_VALUES)).not.toContain("riskBandRateBase");
  });

  // Q13: a row may tighten a risk limit, never loosen it.
  it("ignores a row that would loosen a risk limit", async () => {
    const policy = await getRiskPolicy(
      makeSupabase([
        { key: "hardCooldown48hLossPct", value: 9 },
        { key: "hardCooldownBlockedDays", value: 0 },
      ]),
    );
    expect(policy.circuit).toEqual(DEFAULT_CIRCUIT_THRESHOLDS);
  });

  it("refuses to write a looser risk value", async () => {
    await expect(setRiskPolicyValue(makeSupabase([]), "warning48hLossPct", 10, null)).rejects.toThrow(/looser/);
  });

  it("default policy values match the pure-function defaults 1:1", () => {
    expect(DEFAULT_RISK_POLICY_VALUES.warning48hLossPct).toBe(DEFAULT_CIRCUIT_THRESHOLDS.warning48hLossPct);
  });
});
