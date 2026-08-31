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
