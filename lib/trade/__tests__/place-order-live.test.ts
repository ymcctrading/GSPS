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
};

describe("placeSimulatedOrder — live branch", () => {
  beforeEach(() => {
    getOpenPosition.mockReset().mockResolvedValue(null);
    readLiveAlpacaConnection.mockReset();
    getAccount.mockReset();
    placeOrder.mockReset();
    getPositions.mockReset().mockResolvedValue([]);
    evaluateLiveCircuitBreaker.mockReset();
    countLiveEntriesOpenedToday.mockReset().mockResolvedValue(0);
    recordOrderExecution.mockReset();
    killSwitchRefusal.mockReset().mockReturnValue(null);
  });

  it("refuses a live options order — no live options infrastructure", async () => {
    const result = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, assetClass: "option" });
    expect(result.status).toBe(400);
    expect((result.body as { code: string }).code).toBe("live_options_unsupported");
    expect(readLiveAlpacaConnection).not.toHaveBeenCalled();
  });

  it("refuses when there is no connected live brokerage", async () => {
    readLiveAlpacaConnection.mockResolvedValue(null);
    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);
    expect(result.status).toBe(400);
    expect((result.body as { code: string }).code).toBe("no_live_connection");
  });

  it("fails closed with 502 when the broker's equity can't be read", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockRejectedValue(new Error("network error"));
    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);
    expect(result.status).toBe(502);
    expect((result.body as { code: string }).code).toBe("live_equity_unreadable");
  });

  it("blocks the order when the risk gate disallows new entries", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({
      decision: { newEntriesAllowed: false, state: "hard_cooldown", reason: "48h loss reached 5%." },
    });
    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("risk_cooldown");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("submits a market order with no bracket when there are no attach levels", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-1", status: "accepted" });

    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);

    expect(placeOrder).toHaveBeenCalledWith(
      connection.creds,
      expect.objectContaining({ symbol: "AAPL", side: "buy", qty: 10, type: "market", bracket: undefined }),
    );
    expect(result.status).toBe(200);
    expect((result.body as { brokerOrderId: string }).brokerOrderId).toBe("alpaca-order-1");
  });

  it("passes a real live-entries-today count into the circuit-breaker gate, not a hardcoded 0", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    countLiveEntriesOpenedToday.mockResolvedValue(3);
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-count", status: "accepted" });

    await placeSimulatedOrder(stubSupabase(), "u1", baseInput);

    expect(countLiveEntriesOpenedToday).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(evaluateLiveCircuitBreaker).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      450,
      true,
      3,
    );
  });

  it("submits a stop-only bracket (no take-profit leg) when attach levels are given, and writes a protocol_exits plan", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-2", status: "accepted" });

    const result = await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      entryMode: "advised",
      limitPrice: 100,
      referencePrice: 100,
      attachLevels: { stopLoss: 95, takeProfit: 110 },
    });

    expect(placeOrder).toHaveBeenCalledWith(
      connection.creds,
      expect.objectContaining({
        type: "limit",
        limitPrice: 100,
        bracket: { stopLoss: 95 },
      }),
    );
    expect(result.status).toBe(200);
    expect((result.body as { caveat: string | null }).caveat).toBeNull();
  });

  it("refuses when a real Alpaca rejection is thrown, and logs it", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockRejectedValue(new Error("insufficient buying power"));

    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);
    expect(result.status).toBe(502);
    expect((result.body as { code: string }).code).toBe("live_order_rejected");
    expect(recordOrderExecution).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ brokerStatus: "rejected" }),
    );
  });
  it("enforces the position-limit ceilings on a live entry, same as paper (F3.5)", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });

    const result = await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      entryMode: "advised",
      limitPrice: 100,
      referencePrice: 100,
      attachLevels: { stopLoss: 95, takeProfit: 110 },
    });

    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("position_limit");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("counts broker-held positions and working live exit plans toward the ceilings", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    // Another symbol is already held, so the Novice one-correlated-group
    // ceiling refuses a second; the working plan's 150 of planned risk plus
    // this order's 51 passes the 2% (200) total-open-risk ceiling.
    getPositions.mockResolvedValue([{ symbol: "MSFT", market_value: "3000" }]);

    const result = await placeSimulatedOrder(
      stubSupabase({ workingPlans: [{ qty: 30, entry_price: 100, stop_loss: 95 }] }),
      "u1",
      {
        ...baseInput,
        entryMode: "advised",
        limitPrice: 100,
        referencePrice: 100,
        attachLevels: { stopLoss: 94.9, takeProfit: 110 },
      },
    );

    expect(result.status).toBe(409);
    const violations = (result.body as { violations: string[] }).violations;
    expect(violations.some((v) => v.includes("open risk"))).toBe(true);
    expect(violations.some((v) => v.includes("correlated risk group"))).toBe(true);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("fails closed with 502 when the broker's positions can't be read", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    getPositions.mockRejectedValue(new Error("network error"));

    const result = await placeSimulatedOrder(stubSupabase(), "u1", baseInput);
    expect(result.status).toBe(502);
    expect((result.body as { code: string }).code).toBe("live_positions_unreadable");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("skips the ceilings for a protective (position-reducing) live order", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10, symbol: "AAPL" });
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-close", status: "accepted" });

    const result = await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      side: "sell",
      limitPrice: 100,
      referencePrice: 100,
    });

    expect(getPositions).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
  });
});
