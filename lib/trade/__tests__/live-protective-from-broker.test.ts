import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getOpenPosition = vi.fn();
const readLiveAlpacaConnection = vi.fn();
const getAccount = vi.fn();
const placeOrder = vi.fn();
const getPositions = vi.fn();
const evaluateLiveCircuitBreaker = vi.fn();
const countLiveEntriesOpenedToday = vi.fn();
const recordOrderExecution = vi.fn();
const killSwitchRefusal = vi.fn(() => null);

vi.mock("@/lib/brokers/simulator", () => ({
  assetClassOf: vi.fn(),
  executeFill: vi.fn(),
  getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
  isTriggered: vi.fn(),
  logPlainClose: vi.fn(),
  quoteOptionPrice: vi.fn(),
  quotePrice: vi.fn(),
}));
vi.mock("@/lib/brokers/live-creds", () => ({
  readLiveAlpacaConnection: (...args: unknown[]) => readLiveAlpacaConnection(...args),
}));
vi.mock("@/lib/brokers/alpaca", () => ({
  getAccount: (...args: unknown[]) => getAccount(...args),
  placeOrder: (...args: unknown[]) => placeOrder(...args),
  getPositions: (...args: unknown[]) => getPositions(...args),
}));
vi.mock("@/lib/risk/service", () => ({
  evaluateLiveCircuitBreaker: (...args: unknown[]) => evaluateLiveCircuitBreaker(...args),
  countLiveEntriesOpenedToday: (...args: unknown[]) => countLiveEntriesOpenedToday(...args),
}));
vi.mock("@/lib/risk/live-trade-loss", () => ({
  isLiveTradingRestricted: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@/lib/learning/record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/record")>("@/lib/learning/record");
  return { ...actual, recordOrderExecution: (...args: unknown[]) => recordOrderExecution(...args) };
});
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

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

const connection = { connectionId: "conn-1", creds: { key: "k", secret: "s", mode: "live" as const } };

function stubSupabase(overrides: Partial<Record<string, unknown>> = {}) {
  const ordersInsertResult = { data: { id: "order-row-1" }, error: null };
  const protocolExitsInsertResult = { data: { id: "plan-1" }, error: null };
  const tables: Record<string, unknown> = {
    orders: {
      insert: () => ({
        select: () => ({ single: () => Promise.resolve(overrides.ordersInsertResult ?? ordersInsertResult) }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    },
    protocol_exits: {
      select: () => {
        const chain = {
          eq: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: overrides.workingPlans ?? [], error: null }),
        };
        return chain;
      },
      insert: () => ({
        select: () => ({
          maybeSingle: () => Promise.resolve(overrides.protocolExitsInsertResult ?? protocolExitsInsertResult),
        }),
      }),
    },
  };
  return { from: (t: string) => tables[t] } as unknown as SupabaseClient;
}

const baseInput: OrderInput = {
  symbol: "AAPL",
  assetClass: "equity",
  side: "buy",
  qty: 10,
  mode: "live",
  intradaySourced: false,
  // Every new position carries a stop (A-STOP-01, Q1).
  attachLevels: { stopLoss: 95, takeProfit: 110 },
};

// Review 25, ST-4: a live order's "reduces a position" test reads the broker's
// position, not the paper book.
describe("a live order is judged against the live account's own position", () => {
  beforeEach(() => {
    readLiveAlpacaConnection.mockReset().mockResolvedValue(connection);
    getAccount.mockReset().mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockReset().mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    countLiveEntriesOpenedToday.mockReset().mockResolvedValue(0);
    placeOrder.mockReset().mockResolvedValue({ id: "x", status: "accepted" });
    killSwitchRefusal.mockReset().mockReturnValue(null);
  });
  it("refuses a stopless live sell when only the paper book holds the long (it opens a live short)", async () => {
    getOpenPosition.mockReset().mockResolvedValue({ side: "long", qty: 10 }); // paper
    getPositions.mockReset().mockResolvedValue([]); // live account is flat
    const r = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, side: "sell", attachLevels: undefined });
    expect((r.body as { code: string }).code).toBe("stop_required");
    expect(placeOrder).not.toHaveBeenCalled();
  });
  it("treats a live sell that closes a live-only long as protective", async () => {
    getOpenPosition.mockReset().mockResolvedValue(null); // paper is flat
    getPositions.mockReset().mockResolvedValue([{ symbol: "AAPL", qty: "10", side: "long" }]);
    const r = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, side: "sell", attachLevels: undefined });
    expect((r.body as { code?: string }).code).not.toBe("stop_required");
  });
  it("fails closed when the broker cannot be read", async () => {
    getOpenPosition.mockReset().mockResolvedValue({ side: "long", qty: 10 });
    getPositions.mockReset().mockRejectedValue(new Error("down"));
    const r = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, side: "sell", attachLevels: undefined });
    expect((r.body as { code: string }).code).toBe("stop_required");
  });
});
