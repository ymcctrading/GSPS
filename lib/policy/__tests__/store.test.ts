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

// Q13 (owner, 2026-10-16): a database row may tighten a limit, never loosen
// it. Each key says which way is tighter; a looser row is ignored on read
// and refused on write.
describe("policy overrides only tighten", () => {
  const defaults = { cap: 10, floor: 5 };
  const directions = { cap: "atMost", floor: "atLeast" } as const;

  it("applies a tighter row and ignores a looser one", async () => {
    const { client } = makeSupabase([{ key: "cap", value: 8 }, { key: "floor", value: 4 }]);
    expect(await getPolicyOverrides(client, "test", defaults, undefined, directions)).toEqual({ cap: 8, floor: 5 });
    const { client: c2 } = makeSupabase([{ key: "cap", value: 12 }, { key: "floor", value: 6 }]);
    expect(await getPolicyOverrides(c2, "test", defaults, undefined, directions)).toEqual({ cap: 10, floor: 6 });
  });

  it("ignores a negative row", async () => {
    const { client } = makeSupabase([{ key: "cap", value: -1 }]);
    expect((await getPolicyOverrides(client, "test", defaults, undefined, directions)).cap).toBe(10);
  });

  it("refuses to write a looser value", async () => {
    const { client, upserts } = makeSupabase([]);
    await expect(setPolicyValue(client, "test", "cap", 11, null, { default: 10, direction: "atMost" })).rejects.toThrow(/looser/);
    await expect(setPolicyValue(client, "test", "floor", 4, null, { default: 5, direction: "atLeast" })).rejects.toThrow(/looser/);
    await setPolicyValue(client, "test", "cap", 9, null, { default: 10, direction: "atMost" });
    expect(upserts).toHaveLength(1);
  });
});
