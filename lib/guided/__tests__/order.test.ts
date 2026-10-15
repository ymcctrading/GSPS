/**
 * Guided Mode and the demo account place an old-level entry (Gann's double or
 * triple bottom, PLAN.md item 5, step 2) as one: the kind of buying point goes
 * from the scan onto the card, from the card onto the order, and through the
 * order form's schema, so confirmation never reads it as a crossing.
 */
import { describe, expect, it, vi } from "vitest";

const placeSimulatedOrder = vi.hoisted(() => vi.fn(async () => ({ status: 200, body: { order: { id: "o1" } } })));
vi.mock("@/lib/trade/place-order", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/place-order")>("@/lib/trade/place-order");
  return { ...actual, placeSimulatedOrder };
});
import type { ScanResult } from "@/lib/types";
import { guidedOrder } from "@/lib/guided/order";
import { toRecommendation } from "@/lib/guided/service";
import { OrderSchema } from "@/lib/trade/place-order";
import { placeRecommendation } from "@/lib/demo/auto-trade";
import type { Recommendation } from "@/lib/guided/service";

const levels = { entry: 39.7, stopLoss: 37.74, takeProfit1: 44, masterProfit: 48, entryKind: "oldLevel" as const };

describe("guidedOrder", () => {
  it("is a limit at the entry, judged on the stop and the kind of buying point", () => {
    const o = guidedOrder({ symbol: "AAPL", side: "buy", qty: 10, referencePrice: 41, levels });
    expect(o).toMatchObject({ entryMode: "advised", limitPrice: 39.7, entryStop: 37.74, entryKind: "oldLevel", mode: "paper" });
    expect(o.attachLevels).toEqual({ stopLoss: 37.74, takeProfit: 44, masterProfit: 48 });
    const crossing = { ...levels, entryKind: undefined };
    expect(guidedOrder({ symbol: "AAPL", side: "buy", qty: 10, referencePrice: 41, levels: crossing })).not.toHaveProperty("entryKind");
  });

  it("keeps the kind through the order form's schema", () => {
    const parsed = OrderSchema.parse(guidedOrder({ symbol: "AAPL", side: "buy", qty: 10, referencePrice: 41, levels }));
    expect(parsed.entryKind).toBe("oldLevel");
    // The ticket's own advised body, as the order route parses it.
    const ticket = OrderSchema.parse({ symbol: "AAPL", side: "buy", qty: 1, entryMode: "advised", limitPrice: 39.7, entryStop: 37.74, entryKind: "oldLevel" });
    expect(ticket.entryKind).toBe("oldLevel");
  });
});

describe("a held bottom (PLAN.md item 5, step 4)", () => {
  it("goes onto the order and through the order form's schema as its own kind", () => {
    const held = { ...levels, entryKind: "hold" as const };
    const o = guidedOrder({ symbol: "AAPL", side: "buy", qty: 10, referencePrice: 41, levels: held });
    expect(o.entryKind).toBe("hold");
    expect(OrderSchema.parse(o).entryKind).toBe("hold");
  });

  it("is carried from the scan onto the card", () => {
    const result = {
      symbol: "AAPL", assetClass: "us_equity", currentPrice: 41, direction: "bullish",
      levels: { ...levels, entryKind: "hold", riskPerShare: 1.96, rewardPerShare: 4.3, riskReward: 2.2 },
      decision: { score: 7, outputState: "Execute", breakdown: [], summary: { score: 7, outOf: 9, pillars: [] } },
      trends: [], pattern: null, signals: {},
    } as unknown as ScanResult;
    const sized = { qty: 10, notionalUsd: 397, riskUsd: 19.6, rewardUsd: 43, boundBy: "risk", blockedReason: null } as never;
    expect(toRecommendation(result, "buy", sized, "2026-10-15T20:00:00Z").why.entryKind).toBe("hold");
  });
});

describe("toRecommendation", () => {
  it("carries the scan's kind of buying point onto the card", () => {
    const result = {
      symbol: "AAPL",
      assetClass: "us_equity",
      currentPrice: 41,
      direction: "bullish",
      levels: { ...levels, riskPerShare: 1.96, rewardPerShare: 4.3, riskReward: 2.2 },
      decision: { score: 7, outputState: "Execute", breakdown: [], summary: { score: 7, outOf: 9, pillars: [] } },
      trends: [],
      pattern: null,
      signals: {},
    } as unknown as ScanResult;
    const sized = { qty: 10, notionalUsd: 397, riskUsd: 19.6, rewardUsd: 43, boundBy: "risk", blockedReason: null } as never;
    const rec = toRecommendation(result, "buy", sized, "2026-10-15T20:00:00Z");
    expect(rec.why.entryKind).toBe("oldLevel");
    expect(rec.why.entry).toBe(39.7);
  });
});

describe("the demo account", () => {
  it("places the card's own order, kind of buying point included", async () => {
    const rec = { symbol: "AAPL", action: "buy", qty: 10, currentPrice: 41, why: levels } as unknown as Recommendation;
    await placeRecommendation({} as never, "demo-user", rec);
    expect(placeSimulatedOrder).toHaveBeenCalledWith({}, "demo-user", guidedOrder({ symbol: "AAPL", side: "buy", qty: 10, referencePrice: 41, levels }));
  });
});
