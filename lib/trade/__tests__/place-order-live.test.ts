import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const getOpenPosition = vi.fn();
const readLiveAlpacaConnection = vi.fn();
const getAccount = vi.fn();
const placeOrder = vi.fn();
const getPositions = vi.fn();
const getOpenOrdersNested = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
const evaluateLiveCircuitBreaker = vi.fn();
const recordOrderExecution = vi.fn();
const killSwitchRefusal = vi.fn(() => null);
const quotePrice = vi.fn();

vi.mock("@/lib/brokers/simulator", () => ({
  assetClassOf: vi.fn(),
  executeFill: vi.fn(),
  getOpenPosition: (...args: unknown[]) => getOpenPosition(...args),
  isTriggered: vi.fn(),
  logPlainClose: vi.fn(),
  quoteOptionPrice: vi.fn(),
  quotePrice: (...args: unknown[]) => quotePrice(...args),
}));
vi.mock("@/lib/brokers/live-creds", () => ({
  readLiveAlpacaConnection: (...args: unknown[]) => readLiveAlpacaConnection(...args),
}));
vi.mock("@/lib/brokers/alpaca", () => ({
  getAccount: (...args: unknown[]) => getAccount(...args),
  placeOrder: (...args: unknown[]) => placeOrder(...args),
  getPositions: (...args: unknown[]) => getPositions(...args),
  getOpenOrdersNested: (...args: unknown[]) => getOpenOrdersNested(...args),
}));
vi.mock("@/lib/risk/service", () => ({
  evaluateLiveCircuitBreaker: (...args: unknown[]) => evaluateLiveCircuitBreaker(...args),
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
// The capital-rule tests below isolate Gann's rules from the % ceilings.
const limits = vi.hoisted(() => ({ bypass: false }));
vi.mock("@/lib/risk/position-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/risk/position-limits")>("@/lib/risk/position-limits");
  return {
    ...actual,
    checkPositionLimits: (...args: Parameters<typeof actual.checkPositionLimits>) =>
      limits.bypass ? { ok: true, violations: [] } : actual.checkPositionLimits(...args),
  };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => killSwitchRefusal() };
});

// Account tier: Novice unless a test says otherwise (lib/entitlements/policy.ts
// reads profiles.tier, which these stubs don't model).
const tier = vi.hoisted(() => ({ value: "PRACTICE" as "PRACTICE" | "SYSTEM_MASTERY" }));
vi.mock("@/lib/entitlements/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements/policy")>("@/lib/entitlements/policy");
  return { ...actual, getUserEntitlementPolicy: vi.fn(async () => actual.getEntitlementPolicy(tier.value)) };
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
      update: () => ({ eq: function eq(): unknown { return { eq, then: (r: (v: { error: null }) => void) => r({ error: null }) }; } }),
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
    risk_live_equity_snapshots: (() => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "order", "limit"]) q[k] = () => q;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: overrides.snapshots ?? [], error: null });
      return q;
    })(),
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

describe("placeSimulatedOrder — live branch", () => {
  beforeEach(() => {
    getOpenPosition.mockReset().mockResolvedValue(null);
    readLiveAlpacaConnection.mockReset();
    getAccount.mockReset();
    placeOrder.mockReset();
    getPositions.mockReset().mockResolvedValue([]);
    evaluateLiveCircuitBreaker.mockReset();
    recordOrderExecution.mockReset();
    killSwitchRefusal.mockReset().mockReturnValue(null);
    // The risk ceilings read the server's quote, never the ticket's price (F-01).
    quotePrice.mockReset().mockResolvedValue(100);
    limits.bypass = false;
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

  it("refuses a new live position with no stop, before any order is sent (A-STOP-01, Q1)", async () => {
    const result = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, attachLevels: undefined });
    expect(result.status).toBe(400);
    expect((result.body as { code: string }).code).toBe("stop_required");
    expect(getAccount).not.toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("gates on the circuit's loss and drawdown reads only, with no daily entry count (Q8, R-019)", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-count", status: "accepted" });

    await placeSimulatedOrder(stubSupabase(), "u1", baseInput);

    expect(evaluateLiveCircuitBreaker).toHaveBeenCalledWith(expect.anything(), "u1", 450, true);
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
    getAccount.mockResolvedValue({ equity: "100000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockRejectedValue(new Error("insufficient buying power"));

    const result = await placeSimulatedOrder(stubSupabase(), "u1", { ...baseInput, referencePrice: 100 });
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

  it("holds a Wall Street account to neither the group cap nor the percent ceilings", async () => {
    tier.value = "SYSTEM_MASTERY";
    try {
      readLiveAlpacaConnection.mockResolvedValue(connection);
      getAccount.mockResolvedValue({ equity: "10000" });
      evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
      getPositions.mockResolvedValue([{ symbol: "MSFT", market_value: "3000" }]);
      placeOrder.mockResolvedValue({ id: "alpaca-order-ws", status: "accepted" });

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

      // Above Novice only Gann's capital rules apply (2026-10-21): neither the
      // group cap nor the 2% open-risk ceiling refuses it.
      expect((result.body as { code?: string }).code).not.toBe("position_limit");
      expect(placeOrder).toHaveBeenCalledTimes(1);
    } finally {
      tier.value = "PRACTICE";
    }
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
    // The live account's own long (ST-4), read once to judge the order protective.
    getPositions.mockResolvedValue([{ symbol: "AAPL", qty: "10", side: "long" }]);
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "450" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-close", status: "accepted" });

    const result = await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      side: "sell",
      limitPrice: 100,
      referencePrice: 100,
      // Closing a long needs no stop.
      attachLevels: undefined,
    });

    // Read once for the protective check; the ceilings' read is skipped.
    expect(getPositions).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });

  it("refuses a sixth stock: at most five open (A-RISK-08, never-failing rule 8)", async () => {
    limits.bypass = true;
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "100000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    getPositions.mockResolvedValue(
      ["MSFT", "NVDA", "XOM", "JPM", "KO"].map((symbol) => ({ symbol, qty: "1", avg_entry_price: "100", market_value: "100" })),
    );
    const input = { ...baseInput, entryMode: "advised" as const, limitPrice: 100, referencePrice: 100 };

    const fourth = await placeSimulatedOrder(stubSupabase(), "u1", input);
    expect(fourth.status).toBe(409);
    expect((fourth.body as { code: string }).code).toBe("max_open_symbols");
    expect(placeOrder).not.toHaveBeenCalled();

    // Adding to a market already held is not a new market.
    placeOrder.mockResolvedValue({ id: "alpaca-order-1", status: "accepted" });
    const more = await placeSimulatedOrder(stubSupabase(), "u1", { ...input, symbol: "MSFT" });
    expect((more.body as { code?: string }).code).not.toBe("max_open_symbols");
  });

  it("counts a resting live entry toward the five stocks, as on paper (review fix 2, 2026-10-21)", async () => {
    limits.bypass = true;
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "100000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    getPositions.mockResolvedValue(
      ["MSFT", "NVDA", "XOM", "JPM"].map((symbol) => ({ symbol, qty: "1", avg_entry_price: "100", market_value: "100" })),
    );
    getOpenOrdersNested.mockResolvedValueOnce([
      { id: "r1", symbol: "KO", status: "new", side: "buy", qty: "1", filled_qty: "0", type: "limit", limit_price: "60" },
    ]);
    const input = { ...baseInput, entryMode: "advised" as const, limitPrice: 100, referencePrice: 100 };
    const sixth = await placeSimulatedOrder(stubSupabase(), "u1", input);
    expect((sixth.body as { code: string }).code).toBe("max_open_symbols");
    expect(placeOrder).not.toHaveBeenCalled();

    getOpenOrdersNested.mockRejectedValueOnce(new Error("down"));
    const unread = await placeSimulatedOrder(stubSupabase(), "u1", input);
    expect((unread.body as { code: string }).code).toBe("book_unreadable");
  });

  it("refuses more shares than the capital carries: 30 points a share (A-RISK-01, Q4)", async () => {
    limits.bypass = true;
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    // About 49.77 of capital a share at 100, so 10,000 carries 200 shares.
    const result = await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      qty: 250,
      entryMode: "advised",
      limitPrice: 100,
      referencePrice: 100,
    });
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("capital_per_share");
    expect((result.body as { error: string }).error).toContain("at most 200 more");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("refuses a live entry risking more than a tenth of the capital (never-failing rule 1)", async () => {
    limits.bypass = true;
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "10000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    // $8 of risk a share: 150 shares risk $1,200, over a tenth of $10,000.
    const input = { ...baseInput, qty: 150, entryMode: "now" as const, referencePrice: 100, attachLevels: { stopLoss: 92, takeProfit: 110 } };
    const result = await placeSimulatedOrder(stubSupabase(), "u1", input);
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("risk_one_tenth");
    expect(placeOrder).not.toHaveBeenCalled();

    placeOrder.mockResolvedValue({ id: "alpaca-order-tenth", status: "accepted" });
    const within = await placeSimulatedOrder(stubSupabase(), "u1", { ...input, qty: 125 });
    expect((within.body as { code?: string }).code).not.toBe("risk_one_tenth");
    expect(placeOrder).toHaveBeenCalled();
  });

  it("refuses more than a tenth of the profits once they reach the first verified equity (A-RISK-07)", async () => {
    limits.bypass = true;
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "19000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    // Started at 5,000, now 19,000: 14,000 of profits, so at most 1,400 at risk.
    const snapshots = [{ equity: 5_000 }, { equity: 19_000 }];
    const input = { ...baseInput, qty: 200, entryMode: "now" as const, referencePrice: 100, attachLevels: { stopLoss: 92, takeProfit: 110 } };
    const result = await placeSimulatedOrder(stubSupabase({ snapshots }), "u1", input);
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe("risk_tenth_of_profits");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("sends the protocol's confirmed entry to the broker at the market, not as a limit (never-failing rule 9)", async () => {
    readLiveAlpacaConnection.mockResolvedValue(connection);
    getAccount.mockResolvedValue({ equity: "100000" });
    evaluateLiveCircuitBreaker.mockResolvedValue({ decision: { newEntriesAllowed: true, state: "normal" } });
    placeOrder.mockResolvedValue({ id: "alpaca-order-market", status: "accepted" });

    await placeSimulatedOrder(stubSupabase(), "u1", {
      ...baseInput,
      entryMode: "advised",
      limitPrice: 100,
      referencePrice: 100,
      entryStop: 95,
      attachLevels: { stopLoss: 95, takeProfit: 110 },
    });

    expect(placeOrder).toHaveBeenCalledWith(
      connection.creds,
      expect.objectContaining({ type: "market", limitPrice: undefined, bracket: { stopLoss: 95 } }),
    );
  });
});
