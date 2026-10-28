import { describe, expect, it } from "vitest";
import { positionExitStyle } from "@/lib/trade/exit-style";
import { resolveGannRulePrefs, styleAt, withStyleChange, DEFAULT_GANN_RULE_PREFS } from "@/lib/gann/traderPrefs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAST_RETIRED_AT, PICKABLE_TRADE_STYLES } from "@/lib/trade/tradeStyle";

/** A stand-in for `orders` that records the key it was asked by. */
function fakeOrders(row: { source_plan_id: string | null; intraday_sourced?: boolean; hold_overnight?: boolean } | null, fail = false) {
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

  it("is Swing for any fill once Fast was retired, while a Fast trade filled before keeps Fast", () => {
    const retired = Date.parse(FAST_RETIRED_AT);
    expect(styleAt(fastSince, new Date(retired - 60_000).toISOString())).toBe("fast");
    expect(styleAt(fastSince, FAST_RETIRED_AT)).toBe("swing");
    expect(styleAt([{ style: "fast", since: new Date(retired + 60_000).toISOString() }], new Date(retired + 120_000).toISOString())).toBe("swing");
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
    expect((await positionExitStyle(paper.client, fastSince, at, "o-1", "id", "AAPL")).style).toBe("fast");
    expect(paper.seen).toEqual({ key: "id", value: "o-1" });
    const live = fakeOrders({ source_plan_id: "plan-9" });
    expect((await positionExitStyle(live.client, fastSince, at, "b-1", "broker_order_id", "AAPL")).style).toBe("swing");
    expect(live.seen.key).toBe("broker_order_id");
  });

  it("answers Swing on a failed read, and Swing for a fill before Fast was chosen", async () => {
    const at = "2026-10-21T16:00:00Z";
    expect((await positionExitStyle(fakeOrders(null, true).client, fastSince, at, "o-1", "id", "AAPL")).style).toBe("swing");
    expect((await positionExitStyle(fakeOrders({ source_plan_id: null }).client, fastSince, "2026-10-20T16:00:00Z", "o-1", "id", "AAPL")).style).toBe("swing");
  });

  it("manages an intraday alert's trade as Intraday, closing it at the session's end unless held", async () => {
    const at = "2026-10-21T16:00:00Z";
    const intraday = fakeOrders({ source_plan_id: null, intraday_sourced: true, hold_overnight: false });
    expect(await positionExitStyle(intraday.client, [], at, "o-1", "id", "AAPL")).toEqual({ style: "intraday", closeAtSessionEnd: true });
    const held = fakeOrders({ source_plan_id: null, intraday_sourced: true, hold_overnight: true });
    expect(await positionExitStyle(held.client, fastSince, at, "o-1", "id", "AAPL")).toEqual({ style: "intraday", closeAtSessionEnd: false });
    // Crypto has no session to close at.
    expect(await positionExitStyle(intraday.client, [], at, "o-1", "id", "BTC/USD")).toEqual({ style: "intraday", closeAtSessionEnd: false });
  });
});

describe("the styles a trader can pick", () => {
  it("is Swing alone: Intraday comes from an intraday alert, and Fast is retired", () => {
    expect(PICKABLE_TRADE_STYLES).toEqual(["swing"]);
  });
});
