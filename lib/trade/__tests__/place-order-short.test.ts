/**
 * Short orders against the "How do I trade a sell setup?" panel (owner,
 * 2026-10-28): a short needs a stock the broker lends, a hard-to-borrow one
 * goes with a warning, a sale of shares held closes them rather than staging a
 * new exit, and a managed position is closed whole (lib/trade/short-eligibility.ts,
 * lib/trade/place-order.ts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const quotePrice = vi.fn();
const isTriggered = vi.fn();
const executeFill = vi.fn();
const getOpenPosition = vi.fn();
const killSwitchRefusal = vi.fn(() => null);
const recordOrderExecution = vi.fn();
const hasWorkingPlan = vi.fn();
const getAsset = vi.fn();
const closePaperPosition = vi.fn();

vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    assetClassOf: () => "us_equity",
    quotePrice: (...args: unknown[]) => quotePrice(...args),
    quoteOptionPrice: vi.fn(),
    isTriggered: (...args: unknown[]) => isTriggered(...args),
    executeFill: (...args: unknown[]) => executeFill(...args),
    getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
    listWorkingPaperEntries: async () => [],
    logPlainClose: vi.fn(),
    hasWorkingPlan: (...args: unknown[]) => hasWorkingPlan(...args),
  };
});
vi.mock("@/lib/brokers/alpaca", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/alpaca")>("@/lib/brokers/alpaca");
  return {
    ...actual,
    envCreds: () => ({ key: "k", secret: "s", mode: "paper" }),
    getAsset: (...args: unknown[]) => getAsset(...args),
  };
});
vi.mock("@/lib/trade/close-position", () => ({
  closePaperPosition: (...args: unknown[]) => closePaperPosition(...args),
}));
// Entry confirmation (owner decision 4) reads live bars; these tests cover
// what happens after it, so it reports a confirmed entry.
const confirmNow = vi.hoisted(() => ({ ready: true }));
vi.mock("@/lib/lifecycle/confirmNow", () => ({
  readEntryConfirmationNow: vi.fn(async () =>
    confirmNow.ready
      ? { ready: true, stage: "confirmed", note: "confirmed" }
      : { ready: false, stage: "broken", note: "Price closed through the entry level and is waiting for a retest." },
  ),
}));
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => killSwitchRefusal() };
});
vi.mock("@/lib/learning/record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/record")>("@/lib/learning/record");
  return { ...actual, recordOrderExecution: (...args: unknown[]) => recordOrderExecution(...args) };
});

// Account tier: Novice unless a test says otherwise (lib/entitlements/policy.ts
// reads profiles.tier, which these stubs don't model).
const tier = vi.hoisted(() => ({ value: "PRACTICE" as "PRACTICE" | "SYSTEM_MASTERY" }));
vi.mock("@/lib/entitlements/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements/policy")>("@/lib/entitlements/policy");
  return { ...actual, getUserEntitlementPolicy: vi.fn(async () => actual.getEntitlementPolicy(tier.value)) };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

function stubSupabase() {
  const ordersInsert = vi.fn();
  const protocolExitsInsert = vi.fn();
  const tables: Record<string, unknown> = {
    orders: {
      insert: (row: unknown) => {
        ordersInsert(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "order-1" }, error: null }) }) };
      },
      update: () => ({ eq: function eq(): unknown { return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) }; } }),
    },
    protocol_exits: {
      insert: (row: unknown) => {
        protocolExitsInsert(row);
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "plan-1" }, error: null }) }) };
      },
    },
    // getOrCreateAccount/listOpenPositions (lib/brokers/simulator.ts, used by
    // placeSimulatedOrder's position-limits check) aren't overridden by the
    // module mock above — only getOpenPosition is — so they run for real
    // against this stub. An empty account/no open positions is enough for
    // checkPositionLimits to pass on every fixture's small test quantities.
    paper_accounts: {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { cash: 100_000 }, error: null }) }),
      }),
    },
    positions: {
      select: () => ({
        eq: () => ({
          eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      }),
    },
  };
  return { supabase: { from: (t: string) => tables[t] } as unknown as SupabaseClient, ordersInsert, protocolExitsInsert };
}


const short: OrderInput = {
  symbol: "AMD",
  assetClass: "equity",
  side: "sell",
  qty: 3,
  mode: "paper",
  entryMode: "now",
  referencePrice: 459.48,
  attachLevels: { stopLoss: 462.6, takeProfit: 454.8, masterProfit: 449.5 },
  intradaySourced: false,
};

describe("placeSimulatedOrder — shorts and sales of shares held", () => {
  beforeEach(() => {
    quotePrice.mockReset().mockResolvedValue(459.4);
    isTriggered.mockReset();
    executeFill.mockReset().mockResolvedValue({ price: 459.4, qty: 3, positionId: "pos-1", closed: null });
    getOpenPosition.mockReset().mockResolvedValue(null);
    killSwitchRefusal.mockReset().mockReturnValue(null);
    recordOrderExecution.mockReset();
    hasWorkingPlan.mockReset().mockResolvedValue(false);
    getAsset.mockReset().mockResolvedValue({ symbol: "AMD", tradable: true, shortable: true, easy_to_borrow: true });
    closePaperPosition.mockReset();
  });

  it("refuses a short on a stock the broker won't lend, and places nothing", async () => {
    getAsset.mockResolvedValue({ symbol: "AMD", tradable: true, shortable: false, easy_to_borrow: false });
    const { supabase, ordersInsert } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "not_shortable" });
    expect(ordersInsert).not.toHaveBeenCalled();
    expect(executeFill).not.toHaveBeenCalled();
  });

  it("places a hard-to-borrow short with a warning", async () => {
    getAsset.mockResolvedValue({ symbol: "AMD", tradable: true, shortable: true, easy_to_borrow: false });
    const { supabase, ordersInsert } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(200);
    expect(ordersInsert).toHaveBeenCalledTimes(1);
    expect(String(result.body.warning)).toMatch(/hard to borrow/);
  });

  it("defers to the broker when the lending record can't be read", async () => {
    getAsset.mockRejectedValue(new Error("network"));
    const { supabase } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(200);
  });

  it("still refuses a short with no stop", async () => {
    const { supabase } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", { ...short, attachLevels: undefined });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: "stop_required" });
    expect(getAsset).not.toHaveBeenCalled();
  });

  it("checks the lending record when a sale is larger than the long held", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 1, symbol: "AMD" });
    getAsset.mockResolvedValue({ symbol: "AMD", tradable: true, shortable: false, easy_to_borrow: false });
    const { supabase } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.body).toMatchObject({ code: "not_shortable" });
  });

  it("stages no new exit for a sale of shares held, even with the sell plan's levels attached", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10, symbol: "AMD" });
    executeFill.mockResolvedValue({ price: 459.4, qty: 3, positionId: "pos-1", closed: null });
    const { supabase, protocolExitsInsert, ordersInsert } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(200);
    expect(getAsset).not.toHaveBeenCalled();
    expect(protocolExitsInsert).not.toHaveBeenCalled();
    expect(ordersInsert.mock.calls[0][0]).toMatchObject({ order_type: "market", stop_price: null });
  });

  it("refuses a sale of part of a managed position", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10, symbol: "AMD" });
    hasWorkingPlan.mockResolvedValue(true);
    const { supabase, ordersInsert } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "managed_partial_close" });
    expect(ordersInsert).not.toHaveBeenCalled();
    expect(closePaperPosition).not.toHaveBeenCalled();
  });

  it("closes a whole managed position through Close position, retiring its plan", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 3, symbol: "AMD" });
    hasWorkingPlan.mockResolvedValue(true);
    closePaperPosition.mockResolvedValue({
      ok: true,
      order: { symbol: "AMD", side: "sell", qty: 3, filled_avg_price: 459.4, status: "filled" },
      fullClose: true,
      planRetired: true,
    });
    const { supabase, ordersInsert } = stubSupabase();
    const result = await placeSimulatedOrder(supabase, "u1", short);
    expect(result.status).toBe(200);
    expect(closePaperPosition).toHaveBeenCalledWith(supabase, "u1", "AMD");
    expect(result.body).toMatchObject({ closedPosition: true, order: { status: "filled" } });
    expect(ordersInsert).not.toHaveBeenCalled();
  });
});
