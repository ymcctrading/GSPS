/** /api/audit/orders: own rows only, CSV download, plain errors. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  tables: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
  calls: [] as { table: string; eq: [string, unknown][]; in?: [string, unknown[]] }[],
}));

function query(table: string) {
  const call: (typeof state.calls)[number] = { table, eq: [] };
  state.calls.push(call);
  const result = () => state.tables[table] ?? { data: [], error: null };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (call.eq.push([c, v]), q),
    in: (c: string, v: unknown[]) => ((call.in = [c, v]), q),
    order: () => q,
    limit: () => q,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => query(t),
  }),
}));

import { GET } from "@/app/api/audit/orders/route";

const baseOrder = {
  id: "o1", created_at: "2026-11-02T15:00:00Z", mode: "paper", symbol: "MSFT", side: "buy", order_type: "limit",
  qty: 5, limit_price: 400, stop_price: 390, take_profit: 420, master_profit: 440, level_source: "own",
  strategy_version: "v", status: "filled", broker_submitted_at: null, reject_reason: null, filled_qty: 5,
  filled_avg_price: 400, source_plan_id: "p1",
};

beforeEach(() => {
  state.user = { id: "u1" };
  state.tables = {};
  state.calls = [];
});

describe("GET /api/audit/orders", () => {
  it("answers 401 without a session and reads nothing", async () => {
    state.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });

  it("returns the member's own trail as a CSV attachment", async () => {
    state.tables.orders = { data: [baseOrder], error: null };
    state.tables.trade_plans = { data: [{ plan_id: "p1", generated_at: "2026-11-02T13:00:00Z", entry_trigger: 400, invalidation: 390, take_profit_1: 420, master_profit: 440, state: "filled" }], error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="order-audit-trail-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder().decode(bytes);
    expect(body).toMatch(/MSFT/);
    expect(body).toMatch(/Your own levels/);
    for (const c of state.calls) expect(c.eq).toContainEqual(["user_id", "u1"]);
    expect(state.calls.find((c) => c.table === "trade_logs")?.in).toEqual(["order_id", ["o1"]]);
  });

  it("answers a plain 500 when a read fails, never the database's words", async () => {
    state.tables.orders = { data: [baseOrder], error: null };
    state.tables.trade_logs = { data: null, error: { message: "relation secret_detail" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/secret_detail/);
    spy.mockRestore();
  });

  it("skips the plan and log reads when there are no orders", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.calls.map((c) => c.table)).toEqual(["orders"]);
  });
});
