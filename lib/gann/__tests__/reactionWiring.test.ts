/**
 * The reaction entry wired through every live surface (PLAN.md item 4,
 * W006 pp.20, 46-47). `reactionEntry.test.ts` pins the helpers; these pin
 * the callers, so a surface that drops back to the old breakout entry, the
 * swing stop or the retest-and-hold confirmation fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { threePoints } from "@/lib/gann/pointScale";
import { gannCrossedLevel } from "@/lib/gann/entryTrigger";

const readEntryConfirmationNow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/confirmNow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/confirmNow")>("@/lib/lifecycle/confirmNow");
  return { ...actual, readEntryConfirmationNow };
});
const getTradePlan = vi.hoisted(() => vi.fn());
const listTradePlans = vi.hoisted(() => vi.fn());
const applyEventAndPersist = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycle/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/store")>("@/lib/lifecycle/store");
  return { ...actual, getTradePlan, listTradePlans, applyEventAndPersist };
});

import { scanTicker } from "@/lib/scanTicker";
import { entryConfirmationRefusal, riskCapRefusal, type OrderInput } from "@/lib/trade/place-order";
import { advanceEntryConfirmationForSymbol } from "@/lib/lifecycle/advanceConfirmation";
import { isRestingOrderTriggered, REACTION_LIMIT_CUTOVER } from "@/lib/brokers/simulator";

describe("scan plans carry the reaction pair", () => {
  const original = process.env.MARKET_DATA_PROVIDER;
  beforeEach(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = original;
  });

  it("prices every equity plan at the level plus 1 point with the stop 3 points the other side", async () => {
    let checked = 0;
    let oldLevel = 0;
    for (const symbol of ["AAPL", "MSFT", "NVDA", "AMD", "XOM", "JPM", "KO", "TSLA", "PG"]) {
      const r = await scanTicker(symbol);
      if (!r.levels || r.direction === "none") continue;
      const sign = r.direction === "bullish" ? 1 : -1;
      if (r.levels.entryKind === "oldLevel") {
        // A double or triple bottom (top): at the level, stop 3 points beyond (item 5, step 2).
        expect(Math.abs(r.levels.entry - r.levels.stopLoss)).toBeCloseTo(threePoints(r.levels.entry), 1);
        expect(sign * (r.levels.entry - r.levels.stopLoss)).toBeGreaterThan(0);
        oldLevel++;
        continue;
      }
      const level = gannCrossedLevel(r.levels.entry, r.levels.stopLoss);
      const point = threePoints(level) / 3;
      expect(r.levels.entry).toBeCloseTo(level + sign * point, 1);
      expect(r.levels.stopLoss).toBeCloseTo(level - sign * 3 * point, 1);
      // Never more than 5 points at risk (A-STOP-02).
      expect(Math.abs(r.levels.entry - r.levels.stopLoss)).toBeLessThanOrEqual(5 * point + 0.02);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // Both buying points reach a plan (PG's nearer one is its old bottom).
    expect(oldLevel).toBeGreaterThan(0);
  }, 60_000);
});

function stubOrdersSupabase(workingExits: Record<string, unknown>[] = []) {
  const tables: Record<string, unknown> = {
    orders: {
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "order-1" }, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) }) }),
    },
    // No working exit on the other side, so a reversal plan reaches its confirmation.
    protocol_exits: {
      select() {
        const filters: [string, unknown][] = [];
        const chain = {
          eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
          limit: () => Promise.resolve({ data: workingExits.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }),
        };
        return chain;
      },
    },
  };
  return { from: (t: string) => tables[t] } as unknown as SupabaseClient;
}

const notReady = { ready: false, stage: "not_touched", note: "Price hasn't crossed the old level by 3 points yet." };

describe("placement confirms on the crossing read from the protocol's entry and stop", () => {
  beforeEach(() => {
    readEntryConfirmationNow.mockReset().mockResolvedValue(notReady);
    getTradePlan.mockReset();
  });

  it("confirms an advised entry with no levels attached on the protocol stop it carries", async () => {
    const input: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper",
      entryMode: "advised", limitPrice: 101, entryStop: 97, intradaySourced: false,
    };
    const result = await entryConfirmationRefusal(stubOrdersSupabase(), "u1", input);
    expect(result?.body).toMatchObject({ code: "awaiting_confirmation" });
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "bullish", entryTrigger: 101, stopPrice: 97 }),
    );
  });

  it("reads the line from the protocol stop, not a Manual Override stop", async () => {
    const input: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper",
      entryMode: "advised", limitPrice: 101, entryStop: 97,
      attachLevels: { stopLoss: 99, takeProfit: 110 }, intradaySourced: false,
    };
    await entryConfirmationRefusal(stubOrdersSupabase(), "u1", input);
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ stopPrice: 97 }));
  });

  it("confirms a plan-sourced order on its plan's stop", async () => {
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "sig-1", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 101, invalidation: 97 },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 101, attachLevels: { stopLoss: 97, takeProfit: 110 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000001",
    };
    await entryConfirmationRefusal(stubOrdersSupabase(), "u1", order);
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(
      expect.objectContaining({ entryTrigger: 101, stopPrice: 97, since: "2026-10-15T14:00:00Z" }),
    );
  });

  it("keeps a stop-and-reverse plan on the retest-and-hold confirmation", async () => {
    getTradePlan.mockResolvedValue({
      direction: "bearish", signalId: "pivot:abc", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 97, invalidation: 101 },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "sell", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 97, attachLevels: { stopLoss: 101, takeProfit: 90 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000002",
    };
    await entryConfirmationRefusal(stubOrdersSupabase(), "u1", order);
    expect(readEntryConfirmationNow.mock.calls[0][0].stopPrice).toBeUndefined();
  });

  it("holds a re-buy while the reversal at its stop is open, and a reversal while the re-buy is (A-PYRAMID-07)", async () => {
    const shortOpen = [{ user_id: "u1", symbol: "AAPL", side: "short", status: "working" }];
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "rebuy:abc", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 114, invalidation: 111, entryKind: "oldLevel" },
      evidence: { dataTimestamps: { rebuyExtreme: "120" } },
    });
    const buy: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 114, attachLevels: { stopLoss: 111, takeProfit: 117 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000003",
    };
    const held = await entryConfirmationRefusal(stubOrdersSupabase(shortOpen), "u1", buy);
    expect(held).toMatchObject({ status: 409, body: { code: "awaiting_confirmation" } });
    expect(readEntryConfirmationNow).not.toHaveBeenCalled();
    // With nothing open on the other side it confirms on the bars since the stop, called off past 120.
    await entryConfirmationRefusal(stubOrdersSupabase(), "u1", buy);
    expect(readEntryConfirmationNow).toHaveBeenCalledWith(expect.objectContaining({ cancelBeyond: 120, since: "2026-10-15T14:00:00Z" }));

    getTradePlan.mockResolvedValue({
      direction: "bearish", signalId: "pivot:abc", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 117, invalidation: 121 },
    });
    const sell: OrderInput = { ...buy, side: "sell", limitPrice: 117, attachLevels: { stopLoss: 121, takeProfit: 110 } };
    const longOpen = [{ user_id: "u1", symbol: "AAPL", side: "long", status: "working" }];
    expect(await entryConfirmationRefusal(stubOrdersSupabase(longOpen), "u1", sell)).toMatchObject({ status: 409 });
  });
});

describe("never risk more than 5 points (A-STOP-02)", () => {
  it("refuses a stop more than 5 points from the entry, a Manual Override stop included", () => {
    const point = threePoints(100) / 3;
    const base = { entryMode: "advised" as const, limitPrice: 100 };
    expect(riskCapRefusal({ ...base, attachLevels: { stopLoss: 100 - 4 * point, takeProfit: 120 } })).toBeNull();
    expect(riskCapRefusal({ ...base, attachLevels: { stopLoss: 100 - 5.2 * point, takeProfit: 120 } })?.body).toMatchObject({
      code: "risk_over_five_points",
    });
    expect(riskCapRefusal({ entryMode: "now", referencePrice: 100, attachLevels: { stopLoss: 100 + 6 * point, takeProfit: 80 } })).not.toBeNull();
  });

  it("is checked before anything is placed", async () => {
    readEntryConfirmationNow.mockReset().mockResolvedValue({ ready: true, stage: "confirmed", note: "" });
    const point = threePoints(100) / 3;
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 100, attachLevels: { stopLoss: 100 - 6 * point, takeProfit: 120 }, intradaySourced: false,
    };
    const r = await entryConfirmationRefusal(stubOrdersSupabase(), "u1", order);
    expect(r?.body).toMatchObject({ code: "risk_over_five_points" });
  });

  it("yields to the method's own stop on a re-buy or reversal plan, and only to that stop (A-PYRAMID-07, A-EXIT-02)", async () => {
    readEntryConfirmationNow.mockReset().mockResolvedValue({ ready: true, stage: "confirmed", note: "" });
    const point = threePoints(100) / 3;
    // The re-buy's stop is 6 points under its entry, half a 12-point reaction (Tunnel p.198).
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "rebuy:abc", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 100, invalidation: 100 - 6 * point, entryKind: "oldLevel" },
      evidence: { dataTimestamps: { rebuyExtreme: String(100 + 12 * point) } },
    });
    const order: OrderInput = {
      symbol: "AAPL", assetClass: "equity", side: "buy", qty: 1, mode: "paper", entryMode: "advised",
      limitPrice: 100, attachLevels: { stopLoss: 100 - 6 * point, takeProfit: 120 }, intradaySourced: false,
      sourcePlanId: "00000000-0000-4000-8000-000000000004",
    };
    const own = await entryConfirmationRefusal(stubOrdersSupabase(), "u1", order);
    expect((own?.body as { code?: string } | undefined)?.code).not.toBe("risk_over_five_points");
    // A stop moved off the plan's own is capped as any other.
    const moved = await entryConfirmationRefusal(stubOrdersSupabase(), "u1", { ...order, attachLevels: { stopLoss: 100 - 7 * point, takeProfit: 120 } });
    expect(moved?.body).toMatchObject({ code: "risk_over_five_points" });
    // A scan plan with a 6-point stop is still refused: the cap is the entry's own rule.
    getTradePlan.mockResolvedValue({
      direction: "bullish", signalId: "sig-1", generatedAt: "2026-10-15T14:00:00Z",
      coordinates: { entryTrigger: 100, invalidation: 100 - 6 * point, entryKind: "crossing" },
    });
    expect((await entryConfirmationRefusal(stubOrdersSupabase(), "u1", order))?.body).toMatchObject({ code: "risk_over_five_points" });
  });
});

describe("plans advance on the 3-point crossing as price ticks", () => {
  beforeEach(() => {
    listTradePlans.mockReset();
    applyEventAndPersist.mockReset().mockResolvedValue({ ok: true });
  });

  const plan = (signalId: string) => ({
    planId: "p1", signalId, instrument: "AAPL", direction: "bullish",
    coordinates: { entryTrigger: 101, invalidation: 97 },
    entryConfirmation: { touchedAt: null, breakOrSweepAt: null, retestAt: null, entryConfirmedAt: null },
  });

  it("arms a scan plan on a tick at the crossing line, with no retest", async () => {
    listTradePlans.mockResolvedValue([plan("sig-1")]);
    // Break line for entry 101 / stop 97 is 103.
    await advanceEntryConfirmationForSymbol({} as never, "u1", {
      symbol: "AAPL", direction: "bullish", currentPrice: 103.1, scannedAt: "2026-10-15T15:00:00Z",
    });
    const types = applyEventAndPersist.mock.calls.map((c) => c[3].type);
    expect(types).toEqual(["record_confirmation_evidence", "arm"]);
  });

  it("uses plans the caller read once instead of reading them again", async () => {
    await advanceEntryConfirmationForSymbol({} as never, "u1", {
      symbol: "AAPL", direction: "bullish", currentPrice: 103.1, scannedAt: "2026-10-15T15:00:00Z",
    }, [plan("sig-1")] as never);
    expect(listTradePlans).not.toHaveBeenCalled();
    expect(applyEventAndPersist.mock.calls.map((c) => c[3].type)).toEqual(["record_confirmation_evidence", "arm"]);
  });

  it("does not arm a stop-and-reverse plan on a single tick", async () => {
    listTradePlans.mockResolvedValue([plan("pivot:old")]);
    await advanceEntryConfirmationForSymbol({} as never, "u1", {
      symbol: "AAPL", direction: "bullish", currentPrice: 103.1, scannedAt: "2026-10-15T15:00:00Z",
    });
    expect(applyEventAndPersist.mock.calls.map((c) => c[3].type)).not.toContain("arm");
  });
});

describe("resting paper entries placed before the cutover", () => {
  it("keep their breakout reading; later ones fill as limits", () => {
    const before = "2026-08-29T02:22:03Z";
    const after = new Date(Date.parse(REACTION_LIMIT_CUTOVER) + 60_000).toISOString();
    // A buy at 100 with the market at 98.
    expect(isRestingOrderTriggered("buy", 100, 98, before)).toBe(false);
    expect(isRestingOrderTriggered("buy", 100, 98, after)).toBe(true);
    // A sell at 100 with the market at 102.
    expect(isRestingOrderTriggered("sell", 100, 102, before)).toBe(false);
    expect(isRestingOrderTriggered("sell", 100, 102, after)).toBe(true);
  });
});
