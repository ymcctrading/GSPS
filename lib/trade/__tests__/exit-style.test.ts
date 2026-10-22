import { describe, expect, it } from "vitest";
import { positionTradeStyle } from "@/lib/trade/exit-style";
import { resolveGannRulePrefs, styleAt, withStyleChange, DEFAULT_GANN_RULE_PREFS } from "@/lib/gann/traderPrefs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A stand-in for `orders` that records the key it was asked by. */
function fakeOrders(row: { source_plan_id: string | null } | null, fail = false) {
  const seen: { key?: string; value?: string } = {};
  const client = {
    from: () => ({
      select: () => ({
        eq: (key: string, value: string) => {
          seen.key = key;
          seen.value = value;
          return { maybeSingle: async () => (fail ? { data: null, error: { message: "down" } } : { data: row, error: null }) };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, seen };
}

const fastSince = [{ style: "fast" as const, since: "2026-10-21T15:00:00.000Z" }];

describe("the style a trade is managed in", () => {
  it("is the style that stood at its fill, Swing before any change", () => {
    expect(styleAt([], "2026-10-21T16:00:00Z")).toBe("swing");
    expect(styleAt(fastSince, "2026-10-21T14:00:00Z")).toBe("swing");
    expect(styleAt(fastSince, "2026-10-21T16:00:00Z")).toBe("fast");
    const back = [...fastSince, { style: "swing" as const, since: "2026-10-22T15:00:00Z" }];
    expect(styleAt(back, "2026-10-21T16:00:00Z")).toBe("fast");
    expect(styleAt(back, "2026-10-23T16:00:00Z")).toBe("swing");
  });

  it("records a change only when the style differs from the last recorded", () => {
    const now = new Date("2026-10-21T15:00:00Z");
    expect(withStyleChange(DEFAULT_GANN_RULE_PREFS, "swing", now)).toEqual([]);
    expect(withStyleChange(DEFAULT_GANN_RULE_PREFS, "fast", now)).toEqual(fastSince);
    const prefs = { ...DEFAULT_GANN_RULE_PREFS, tradeStyle: "fast" as const, tradeStyleHistory: fastSince };
    expect(withStyleChange(prefs, "fast", now)).toBe(fastSince);
  });

  it("parses a stored history and drops malformed entries", () => {
    const prefs = resolveGannRulePrefs({ gannRules: { tradeStyle: "fast", tradeStyleHistory: [{ style: "fast", since: "2026-10-21T15:00:00.000Z" }, { style: "fast" }, "x"] } });
    expect(prefs.tradeStyleHistory).toEqual(fastSince);
  });

  it("reads paper orders by id and live by broker_order_id, and keeps automation on Swing", async () => {
    const at = "2026-10-21T16:00:00Z";
    const paper = fakeOrders({ source_plan_id: null });
    expect(await positionTradeStyle(paper.client, fastSince, at, "o-1", "id")).toBe("fast");
    expect(paper.seen).toEqual({ key: "id", value: "o-1" });
    const live = fakeOrders({ source_plan_id: "plan-9" });
    expect(await positionTradeStyle(live.client, fastSince, at, "b-1", "broker_order_id")).toBe("swing");
    expect(live.seen.key).toBe("broker_order_id");
  });

  it("answers Swing on a failed read, and Swing for a fill before Fast was chosen", async () => {
    const at = "2026-10-21T16:00:00Z";
    expect(await positionTradeStyle(fakeOrders(null, true).client, fastSince, at, "o-1", "id")).toBe("swing");
    expect(await positionTradeStyle(fakeOrders({ source_plan_id: null }).client, fastSince, "2026-10-20T16:00:00Z", "o-1", "id")).toBe("swing");
  });
});
