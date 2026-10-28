import { describe, it, expect } from "vitest";
import { heldOffPlanNote, readLevelSource, readPositionLevelSources, resolveLevelSource } from "@/lib/trade/level-source";
import { orderLevelSource } from "@/lib/trade/place-order";
import { intradayPlanForSide, planStopForEdit, swingPlanForSide } from "@/lib/portfolio/plan-levels";

describe("resolveLevelSource", () => {
  it("keeps the ticket's choice when it agrees with how the order is managed", () => {
    expect(resolveLevelSource({ levelSource: "swing", hasLevels: true })).toBe("swing");
    expect(resolveLevelSource({ levelSource: "intraday", intradaySourced: true, hasLevels: true })).toBe("intraday");
    expect(resolveLevelSource({ levelSource: "own", hasLevels: true })).toBe("own");
    // Own levels may be managed within the session.
    expect(resolveLevelSource({ levelSource: "own", intradaySourced: true, hasLevels: true })).toBe("own");
  });

  it("falls back to what the order says when the choice disagrees", () => {
    expect(resolveLevelSource({ levelSource: "intraday", intradaySourced: false, hasLevels: true })).toBeNull();
    expect(resolveLevelSource({ levelSource: "swing", intradaySourced: true, hasLevels: true })).toBe("intraday");
    expect(resolveLevelSource({ levelSource: "own", hasLevels: false })).toBeNull();
  });

  it("names an automated trade the swing plan and a technique's levels the person's own", () => {
    expect(resolveLevelSource({ sourcePlanId: "p", hasLevels: true })).toBe("swing");
    expect(resolveLevelSource({ techniqueSource: "macdMomentum", hasLevels: true })).toBe("own");
    expect(orderLevelSource({ intradaySourced: false, sourcePlanId: "p" }, true)).toBe("swing");
  });
});

describe("readLevelSource", () => {
  it("reads the stored choice, else the intraday flag and the automation link", () => {
    expect(readLevelSource({ level_source: "own", intraday_sourced: true })).toBe("own");
    expect(readLevelSource({ level_source: null, intraday_sourced: true })).toBe("intraday");
    expect(readLevelSource({ source_plan_id: "p" })).toBe("swing");
    expect(readLevelSource({ level_source: "bogus" })).toBeNull();
    expect(readLevelSource({})).toBeNull();
  });
});

describe("heldOffPlanNote", () => {
  it("speaks only for a position off the swing plan", () => {
    expect(heldOffPlanNote("AAPL", "own")).toMatch(/your own levels, so this doesn't move its stop/);
    expect(heldOffPlanNote("AAPL", "intraday")).toMatch(/the intraday plan/);
    expect(heldOffPlanNote("AAPL", "swing")).toBeNull();
    expect(heldOffPlanNote("AAPL", null)).toBeNull();
  });
});

describe("plan levels for the Edit flow", () => {
  it("takes the swing plan only on the position's side", () => {
    const result = { direction: "bullish", levels: { stopLoss: 95, takeProfit1: 110, masterProfit: null } };
    expect(swingPlanForSide(result, "long")).toEqual({ ok: true, levels: { stopLoss: 95, takeProfit: 110, masterProfit: null } });
    expect(swingPlanForSide(result, "short").ok).toBe(false);
    expect(swingPlanForSide({ direction: "bullish", levels: null }, "long").ok).toBe(false);
    // A rejected or expired plan offers nothing, whatever levels it kept.
    expect(swingPlanForSide({ ...result, decision: { outputState: "Reject" } }, "long").ok).toBe(false);
    expect(swingPlanForSide({ ...result, planExpired: { note: "past TP1" } }, "long").ok).toBe(false);
  });

  it("reads the intraday plan's side from its stop and target", () => {
    expect(intradayPlanForSide({ stop: 101, firstTarget: 97, masterTarget: 95 }, "short")).toEqual({
      ok: true,
      levels: { stopLoss: 101, takeProfit: 97, masterProfit: 95 },
    });
    expect(intradayPlanForSide({ stop: 101, firstTarget: 97 }, "long").ok).toBe(false);
    expect(intradayPlanForSide(null, "long").ok).toBe(false);
  });

  it("never loosens the stop, and moves it only in profit", () => {
    expect(planStopForEdit({ planStop: 98, currentStop: 95, side: "long", inProfit: true })).toEqual({ stop: 98, note: null });
    expect(planStopForEdit({ planStop: 93, currentStop: 95, side: "long", inProfit: true }).stop).toBe(95);
    expect(planStopForEdit({ planStop: 98, currentStop: 95, side: "long", inProfit: false }).stop).toBe(95);
    expect(planStopForEdit({ planStop: 102, currentStop: 105, side: "short", inProfit: true }).stop).toBe(102);
  });
});

/** A query builder that records its filters and resolves to the table's rows. */
function fakeSupabase(tables: Record<string, { data: unknown; error?: unknown }>) {
  const filters: Record<string, [string, string, unknown][]> = {};
  return {
    filters,
    client: {
      from(table: string) {
        filters[table] = [];
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "is", "in"]) {
          chain[op] = (col: string, val: unknown) => {
            filters[table].push([op, col, val]);
            return chain;
          };
        }
        chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table]?.data ?? null, error: tables[table]?.error ?? null });
        return chain;
      },
    } as never,
  };
}

describe("readPositionLevelSources", () => {
  it("reads each paper exit's entry order by its id, merged lines left out", async () => {
    const fake = fakeSupabase({
      protocol_exits: { data: [{ symbol: "aapl", entry_order_id: "o1" }, { symbol: "MSFT", entry_order_id: "o2" }] },
      orders: { data: [{ id: "o1", level_source: "own" }, { id: "o2", level_source: null, intraday_sourced: true }] },
    });
    const sources = await readPositionLevelSources(fake.client, "u", "paper");
    expect([...sources]).toEqual([
      ["AAPL", "own"],
      ["MSFT", "intraday"],
    ]);
    expect(fake.filters.protocol_exits).toContainEqual(["is", "merged_into", null]);
    expect(fake.filters.orders).toContainEqual(["in", "id", ["o1", "o2"]]);
  });

  it("returns nothing when a read fails", async () => {
    const fake = fakeSupabase({ protocol_exits: { data: null, error: { message: "down" } } });
    expect((await readPositionLevelSources(fake.client, "u", "paper")).size).toBe(0);
  });
});
