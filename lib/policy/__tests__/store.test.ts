import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicyOverrides, setPolicyValue } from "@/lib/policy/store";

function makeSupabase(rows: { key: string; value: unknown }[]) {
  const upserts: Record<string, unknown>[] = [];
  const table = {
    select: () => ({
      eq: (_col: string, domain: string) => ({
        in: () => Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null, __domain: domain }),
      }),
    }),
    upsert: (obj: Record<string, unknown>) => {
      upserts.push(obj);
      return Promise.resolve({ error: null });
    },
  };
  return { client: { from: () => table } as unknown as SupabaseClient, upserts };
}

describe("getPolicyOverrides", () => {
  const defaults = { a: 1, b: 2, c: 3 };

  it("returns code defaults when no override rows exist", async () => {
    const { client } = makeSupabase([]);
    const resolved = await getPolicyOverrides(client, "test", defaults);
    expect(resolved).toEqual(defaults);
  });

  it("overlays a valid numeric override on top of the defaults", async () => {
    const { client } = makeSupabase([{ key: "b", value: 20 }]);
    const resolved = await getPolicyOverrides(client, "test", defaults);
    expect(resolved).toEqual({ a: 1, b: 20, c: 3 });
  });

  it("ignores an unknown key not present in defaults", async () => {
    const { client } = makeSupabase([{ key: "unknown", value: 99 }]);
    const resolved = await getPolicyOverrides(client, "test", defaults);
    expect(resolved).toEqual(defaults);
  });

  it("ignores a non-numeric override value", async () => {
    const { client } = makeSupabase([{ key: "a", value: "not-a-number" }]);
    const resolved = await getPolicyOverrides(client, "test", defaults);
    expect(resolved.a).toBe(1);
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
    const resolved = await getPolicyOverrides(errClient, "test", defaults);
    expect(resolved).toEqual(defaults);
  });
});

describe("setPolicyValue", () => {
  it("upserts domain, key, value, and updated_by", async () => {
    const { client, upserts } = makeSupabase([]);
    await setPolicyValue(client, "test", "a", 42, "user-1");
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ domain: "test", key: "a", value: 42, updated_by: "user-1" });
  });

  it("throws on a write error", async () => {
    const errClient = {
      from: () => ({
        upsert: () => Promise.resolve({ error: { message: "write failed" } }),
      }),
    } as unknown as SupabaseClient;
    await expect(setPolicyValue(errClient, "test", "a", 1, null)).rejects.toThrow("write failed");
  });
});

describe("getPolicyOverrides — per-key bounds (audit F4.3, 2026-09-26)", () => {
  const defaults = { pct: 2, days: 5 };
  const bounds = { pct: { min: 0.1, max: 3 }, days: { min: 1, max: 30, integer: true } };

  it("accepts an override inside its bound", async () => {
    const { client } = makeSupabase([{ key: "pct", value: 1.5 }, { key: "days", value: 7 }]);
    expect(await getPolicyOverrides(client, "test", defaults, undefined, bounds)).toEqual({ pct: 1.5, days: 7 });
  });

  it("rejects an out-of-range override and keeps the default", async () => {
    // A percent stored as 200 instead of 2 must not become the live ceiling.
    const { client } = makeSupabase([{ key: "pct", value: 200 }, { key: "days", value: -1 }]);
    expect(await getPolicyOverrides(client, "test", defaults, undefined, bounds)).toEqual(defaults);
  });

  it("rejects a fractional value for an integer key", async () => {
    const { client } = makeSupabase([{ key: "days", value: 2.5 }]);
    expect((await getPolicyOverrides(client, "test", defaults, undefined, bounds)).days).toBe(5);
  });
});

describe("every domain's defaults sit inside its own bounds", () => {
  it("risk, guided and universe", async () => {
    const { policyBoundViolation } = await import("@/lib/policy/store");
    const { DEFAULT_RISK_POLICY_VALUES, RISK_POLICY_BOUNDS } = await import("@/lib/risk/policy");
    const { GUIDED_POLICY_BOUNDS } = await import("@/lib/guided/policy");
    const { DEFAULT_GUIDED_POLICY } = await import("@/lib/guided/config");
    const { DEFAULT_UNIVERSE_POLICY_VALUES, UNIVERSE_POLICY_BOUNDS } = await import("@/lib/universe/policy");
    const pairs: [Record<string, number>, Record<string, { min: number; max: number; integer?: boolean }>][] = [
      [DEFAULT_RISK_POLICY_VALUES as unknown as Record<string, number>, RISK_POLICY_BOUNDS as never],
      [DEFAULT_GUIDED_POLICY as unknown as Record<string, number>, GUIDED_POLICY_BOUNDS as never],
      [DEFAULT_UNIVERSE_POLICY_VALUES as unknown as Record<string, number>, UNIVERSE_POLICY_BOUNDS as never],
    ];
    for (const [defaults, bounds] of pairs) {
      for (const key of Object.keys(defaults)) {
        expect(bounds[key], `missing bound for ${key}`).toBeDefined();
        expect(policyBoundViolation(defaults[key], bounds[key]), key).toBeNull();
      }
    }
  });
});
