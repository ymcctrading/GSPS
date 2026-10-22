import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coverReached, readRebuyCover } from "@/lib/automation/rebuy-cover";

/** orders and trade_plans rows, filtered by every `eq`. */
function fake(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(name: string) {
      const rows = tables[name] ?? [];
      const filters: [string, unknown][] = [];
      const chain = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return chain;
        },
        limit: () => Promise.resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const TABLES = {
  orders: [{ id: "o-1", broker_order_id: "b-1", source_plan_id: "pivot-plan" }, { id: "o-2", source_plan_id: "scan-plan" }],
  trade_plans: [
    { user_id: "u", plan_id: "pivot-plan", signal_id: "pivot:stopped", entry_trigger: 117 },
    { user_id: "u", plan_id: "scan-plan", signal_id: "sig-1", entry_trigger: 100 },
    { user_id: "u", plan_id: "rebuy-plan", signal_id: "rebuy:stopped", entry_trigger: 114 },
  ],
};

describe("readRebuyCover", () => {
  it("finds the re-buy seeded for the stop an automated reversal was opened at", async () => {
    expect(await readRebuyCover(fake(TABLES), "u", "o-1", "id")).toBe(114);
    expect(await readRebuyCover(fake(TABLES), "u", "b-1", "broker_order_id")).toBe(114);
  });

  it("covers nothing that is not a reversal, or another member's", async () => {
    expect(await readRebuyCover(fake(TABLES), "u", "o-2", "id")).toBeNull();
    expect(await readRebuyCover(fake(TABLES), "someone-else", "o-1", "id")).toBeNull();
    expect(await readRebuyCover(fake(TABLES), "u", null, "id")).toBeNull();
    expect(await readRebuyCover(fake({ ...TABLES, trade_plans: TABLES.trade_plans.slice(0, 2) }), "u", "o-1", "id")).toBeNull();
  });
});

describe("coverReached", () => {
  it("covers a short reversal once price trades down to the re-buy, a long one once it trades up", () => {
    expect(coverReached("short", 114.2, 114)).toBe(false);
    expect(coverReached("short", 114, 114)).toBe(true);
    expect(coverReached("long", 85.9, 86)).toBe(false);
    expect(coverReached("long", 86.1, 86)).toBe(true);
    expect(coverReached("short", NaN, 114)).toBe(false);
  });
});
