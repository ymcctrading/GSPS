import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newTargetHits, recordTargetHits } from "@/lib/trade/target-hits";

describe("newTargetHits", () => {
  const levels = { takeProfit1: 348.69, masterProfit: 370.75 };

  it("marks TP1 and the MTP the pass the best price first crosses them", () => {
    expect(newTargetHits("long", 340, 350, levels)).toEqual({ tp1: true, mp: false });
    expect(newTargetHits("long", 350, 377.535, levels)).toEqual({ tp1: false, mp: true });
    expect(newTargetHits("long", null, 377.535, levels)).toEqual({ tp1: true, mp: true });
  });

  it("never re-marks a level already through before the pass", () => {
    expect(newTargetHits("long", 377.535, 380, levels)).toEqual({ tp1: false, mp: false });
  });

  it("reads a short from above", () => {
    const short = { takeProfit1: 90, masterProfit: 80 };
    expect(newTargetHits("short", 95, 89, short)).toEqual({ tp1: true, mp: false });
    expect(newTargetHits("short", 89, 79, short)).toEqual({ tp1: false, mp: true });
  });

  it("ignores a missing, zero or non-finite level or price", () => {
    expect(newTargetHits("long", 1, 500, { takeProfit1: null, masterProfit: 0 })).toEqual({ tp1: false, mp: false });
    expect(newTargetHits("long", 1, Number.NaN, levels)).toEqual({ tp1: false, mp: false });
  });
});

describe("recordTargetHits", () => {
  function stub() {
    const writes: { row: Record<string, unknown>; filters: unknown[][] }[] = [];
    const supabase = {
      from: () => ({
        update: (row: Record<string, unknown>) => {
          const w = { row, filters: [] as unknown[][] };
          writes.push(w);
          const q: Record<string, unknown> = {
            eq: (...a: unknown[]) => { w.filters.push(["eq", ...a]); return q; },
            is: (...a: unknown[]) => { w.filters.push(["is", ...a]); return Promise.resolve({ error: null }); },
          };
          return q;
        },
      }),
    } as unknown as SupabaseClient;
    return { supabase, writes };
  }

  it("writes each hit once, only while the column is empty", async () => {
    const { supabase, writes } = stub();
    const at = new Date("2026-11-12T15:00:00Z");
    await recordTargetHits(supabase, "u1", { column: "id", value: "o1" }, { tp1: true, sl: true }, at);
    expect(writes.map((w) => Object.keys(w.row)[0])).toEqual(["tp1_hit_at", "sl_hit_at"]);
    expect(writes[0].row.tp1_hit_at).toBe(at.toISOString());
    expect(writes[0].filters).toContainEqual(["is", "tp1_hit_at", null]);
    expect(writes[0].filters).toContainEqual(["eq", "id", "o1"]);
    expect(writes[0].filters).toContainEqual(["eq", "user_id", "u1"]);
  });

  it("does nothing without an entry order", async () => {
    const { supabase, writes } = stub();
    await recordTargetHits(supabase, "u1", { column: "broker_order_id", value: null }, { tp1: true });
    expect(writes).toHaveLength(0);
  });

  it("never throws when the write fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = { from: () => { throw new Error("down"); } } as unknown as SupabaseClient;
    await expect(recordTargetHits(supabase, "u1", { column: "id", value: "o1" }, { mp: true })).resolves.toBeUndefined();
    err.mockRestore();
  });
});
