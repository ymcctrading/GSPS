/**
 * Review finding R-011: a resting paper bracket fills with its stop and its
 * staged exit, or is refused when the market has already run past its levels.
 */
import { describe, expect, it, vi } from "vitest";

const price = vi.fn();
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchLatestPrice: (...a: unknown[]) => price(...a) }) }));
vi.mock("@/lib/data/alpaca", () => ({ isCryptoSymbol: () => false, fetchOptionLatestTrade: vi.fn() }));
// The capital rules at the fill have their own tests (resting-entry-capital.test.ts).
vi.mock("@/lib/trade/resting-entry-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/resting-entry-guard")>()),
  restingEntryRefusal: async () => null,
}));
vi.mock("@/lib/notifications/resend-handler", () => ({ sendOrderInvalidatedEmail: vi.fn(async () => undefined) }));

import { evaluateRestingOrders } from "@/lib/brokers/simulator";

function stub(order: Record<string, unknown>) {
  const orderUpdates: Record<string, unknown>[] = [];
  const planInserts: Record<string, unknown>[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const chain = (result: unknown): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const k of ["eq", "in", "select", "limit"]) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve(result);
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return q;
  };
  const tables: Record<string, unknown> = {
    orders: {
      select: () => chain({ data: [order], error: null }),
      update: (row: Record<string, unknown>) => { orderUpdates.push(row); return chain({ data: { id: order.id }, error: null }); },
    },
    protocol_exits: {
      insert: (row: Record<string, unknown>) => { planInserts.push(row); return chain({ data: { id: "plan-1" }, error: null }); },
    },
    paper_accounts: { select: () => chain({ data: { cash: 100_000 }, error: null }) },
  };
  const client = {
    from: (t: string) => tables[t],
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: fn === "execute_position_fill" || fn === "execute_paper_fill" ? { positionId: "pos-1", closed: null } : null, error: null });
    },
  };
  return { client: client as never, orderUpdates, planInserts, rpcs };
}

const bracket = {
  id: "order-1", symbol: "AAPL", side: "buy", qty: 10, order_type: "bracket",
  limit_price: 100, stop_price: 95, take_profit: 110, master_profit: null,
  asset_class: "us_equity", created_at: "2026-10-20T15:00:00Z",
};

describe("a resting bracket that fills (R-011)", () => {
  it("fills with its stop on the position and its staged exit plan", async () => {
    price.mockResolvedValue(99.5);
    const { client, planInserts, rpcs, orderUpdates } = stub(bracket);
    const r = await evaluateRestingOrders(client, "u1");
    expect(r.filled).toBe(1);
    const fill = rpcs.find((c) => c.fn === "execute_paper_fill")!.args;
    expect(fill).toMatchObject({ p_stop_loss: 95, p_take_profit: 110 });
    expect(planInserts[0]).toMatchObject({ mode: "paper", entry_order_id: "order-1", entry_price: 99.5, stop_loss: 95, applied_stop: 95 });
    expect(orderUpdates.some((u) => u.exit_plan_id === "plan-1")).toBe(true);
  });

  it("is refused, not filled, when the market is already past its target", async () => {
    // A pre-cutover breakout trigger reads as a buy-stop: it fills at or above 100.
    price.mockResolvedValue(112);
    const { client, planInserts, rpcs, orderUpdates } = stub({ ...bracket, created_at: "2026-08-29T02:00:00Z" });
    const r = await evaluateRestingOrders(client, "u1");
    expect(r.filled).toBe(0);
    expect(rpcs.some((c) => c.fn === "execute_paper_fill" || c.fn === "execute_position_fill")).toBe(false);
    expect(planInserts).toHaveLength(0);
    expect(orderUpdates[0]).toMatchObject({ status: "rejected" });
  });

  it("leaves a plain limit with no plan", async () => {
    price.mockResolvedValue(99.5);
    const { client, planInserts } = stub({ ...bracket, order_type: "limit", stop_price: null, take_profit: null });
    const r = await evaluateRestingOrders(client, "u1");
    expect(r.filled).toBe(1);
    expect(planInserts).toHaveLength(0);
  });
});
