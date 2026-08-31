import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGuidedPolicy } from "@/lib/guided/policy";
import { DEFAULT_GUIDED_POLICY } from "@/lib/guided/config";

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

describe("getGuidedPolicy", () => {
  it("resolves to the module-level defaults when unconfigured", async () => {
    const policy = await getGuidedPolicy(makeSupabase([]));
    expect(policy).toEqual(DEFAULT_GUIDED_POLICY);
  });

  it("overlays a single override without disturbing the rest", async () => {
    const policy = await getGuidedPolicy(makeSupabase([{ key: "minGuidedQty", value: 5 }]));
    expect(policy.minGuidedQty).toBe(5);
    expect(policy.maxRecommendations).toBe(DEFAULT_GUIDED_POLICY.maxRecommendations);
  });

  it("falls back to defaults on a read error", async () => {
    const errClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    const policy = await getGuidedPolicy(errClient);
    expect(policy).toEqual(DEFAULT_GUIDED_POLICY);
  });
});
