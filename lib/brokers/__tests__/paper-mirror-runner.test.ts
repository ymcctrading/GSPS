import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const alpaca = vi.hoisted(() => ({
  envCreds: vi.fn(() => ({ key: "k", secret: "s", mode: "paper" })),
  getAccount: vi.fn(async () => ({ equity: "100000", last_equity: "100000" })),
  getPositions: vi.fn(async () => [] as unknown[]),
  placeOrder: vi.fn(),
  placeExitOrder: vi.fn(),
  replaceOrder: vi.fn(),
  cancelOrder: vi.fn(async () => null),
  closePosition: vi.fn(),
  getOrder: vi.fn(),
  getOrderByClientId: vi.fn(),
}));
vi.mock("@/lib/brokers/alpaca", () => alpaca);

import { runPaperMirror } from "@/lib/brokers/paper-mirror";

type Op = { table: string; op: string; payload?: unknown; filters: string[] };

/** A chainable stand-in for the Supabase client: selects answer from `tables`, writes are recorded. */
function fakeSupabase(tables: Record<string, unknown[]>, failWrites: string[] = []) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const rec: Op = { table, op: "select", filters: [] };
    const result = () => {
      if (rec.op !== "select") {
        ops.push(rec);
        return { data: null, error: failWrites.includes(`${table}.${rec.op}`) ? { message: "write failed" } : null };
      }
      return { data: tables[table] ?? [], error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "gte", "in", "not", "or", "order", "limit", "is"]) {
      b[m] = (...args: unknown[]) => {
        rec.filters.push(`${m}:${JSON.stringify(args)}`);
        return b;
      };
    }
    b.insert = (payload: unknown) => ((rec.op = "insert"), (rec.payload = payload), b);
    b.update = (payload: unknown) => ((rec.op = "update"), (rec.payload = payload), b);
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return b;
  };
  const client = {
    from,
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: "owner", email: "icharles.coleman@gmail.com" }] }, error: null }) } },
  };
  return { client: client as unknown as SupabaseClient, ops };
}

// A session after MIRROR_START; only Date is faked, so the runner's short waits still run.
const NOW = Date.parse("2026-11-16T15:00:00Z");
const opened = new Date(NOW - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  delete process.env.PAPER_MIRROR_DISABLED;
  delete process.env.TRADING_DISABLED;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ is_open: true }) })));
  alpaca.getPositions.mockResolvedValue([]);
});

describe("runPaperMirror", () => {
  it("claims the line before the open order and sends a client order id", async () => {
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "AAA", side: "long", qty: "10", avg_entry_price: "100", stop_loss: "95", opened_at: opened, asset_class: "us_equity" }],
      orders: [{ symbol: "AAA", created_at: opened }],
    });
    const calls: string[] = [];
    alpaca.placeOrder.mockImplementation(async (_c: unknown, input: { clientOrderId?: string }) => {
      calls.push(`order ${input.clientOrderId}`);
      return { id: "o1", status: "accepted" };
    });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "filled", filled_qty: "10", filled_avg_price: "100.05", filled_at: opened });
    alpaca.placeExitOrder.mockResolvedValue({ id: "s1", status: "new" });
    const r = await runPaperMirror(client);
    expect(r.errors).toEqual([]);
    const claimIdx = ops.findIndex((o) => o.table === "paper_mirror_lines" && o.op === "insert");
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(calls).toEqual(["order gsps-mirror-open-p1"]);
    expect(alpaca.placeExitOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ side: "sell", qty: 10, stopLoss: 95 }));
    const openEvent = ops.find((o) => o.table === "paper_mirror_events" && (o.payload as { action: string }).action === "open");
    expect(openEvent?.payload).toMatchObject({ sim_price: 100, fill_price: 100.05, status: "filled" });
  });

  it("places no order when the line can't be claimed", async () => {
    const { client } = fakeSupabase(
      {
        positions: [{ id: "p1", symbol: "AAA", side: "long", qty: "10", avg_entry_price: "100", stop_loss: "95", opened_at: opened, asset_class: "us_equity" }],
        orders: [{ symbol: "AAA", created_at: opened }],
      },
      ["paper_mirror_lines.insert"],
    );
    const r = await runPaperMirror(client);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.errors.join(" ")).toMatch(/claim line/);
  });

  it("sends no sell when the stop being cancelled had already filled", async () => {
    // The simulator closed the line; the broker still shows shares from a stale read.
    const { client, ops } = fakeSupabase({
      positions: [],
      paper_mirror_lines: [{ position_id: "p1", symbol: "AAA", side: "long", status: "open", target_qty: "10", open_order_id: "o1", stop_order_id: "s1", stop_price: "95", stop_qty: "10" }],
    });
    alpaca.getPositions.mockResolvedValue([{ symbol: "AAA", qty: "10", side: "long" }]);
    alpaca.getOrder.mockResolvedValue({ id: "s1", status: "filled", filled_qty: "10", filled_avg_price: "94.9", filled_at: opened });
    await runPaperMirror(client);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    const ev = ops.find((o) => o.table === "paper_mirror_events" && (o.payload as { action: string }).action === "broker_stopped");
    expect(ev?.payload).toMatchObject({ status: "filled", fill_price: 94.9 });
  });

  it("closes through closePosition only after the stop's cancel is confirmed", async () => {
    const { client } = fakeSupabase({
      positions: [],
      paper_mirror_lines: [{ position_id: "p1", symbol: "AAA", side: "long", status: "open", target_qty: "10", open_order_id: "o1", stop_order_id: "s1", stop_price: "95", stop_qty: "10" }],
    });
    alpaca.getPositions.mockResolvedValue([{ symbol: "AAA", qty: "10", side: "long" }]);
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) =>
      id === "s1" ? { id: "s1", status: "canceled" } : { id, status: "filled", filled_qty: "10", filled_avg_price: "101" },
    );
    alpaca.closePosition.mockResolvedValue({ id: "c1", status: "accepted" });
    const r = await runPaperMirror(client);
    expect(r.errors).toEqual([]);
    expect(alpaca.cancelOrder).toHaveBeenCalledWith(expect.anything(), "s1");
    expect(alpaca.closePosition).toHaveBeenCalledWith(expect.anything(), "AAA", 10);
  });

  it("refuses to sell while the stop's cancel is unconfirmed", async () => {
    const { client } = fakeSupabase({
      positions: [],
      paper_mirror_lines: [{ position_id: "p1", symbol: "AAA", side: "long", status: "open", target_qty: "10", open_order_id: "o1", stop_order_id: "s1", stop_price: "95", stop_qty: "10" }],
    });
    alpaca.getPositions.mockResolvedValue([{ symbol: "AAA", qty: "10", side: "long" }]);
    alpaca.getOrder.mockResolvedValue({ id: "s1", status: "pending_cancel" });
    const r = await runPaperMirror(client);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    expect(r.errors.join(" ")).toMatch(/not confirmed cancelled/);
  });

  it("does nothing when switched off", async () => {
    process.env.PAPER_MIRROR_DISABLED = "true";
    const { client } = fakeSupabase({});
    const r = await runPaperMirror(client);
    expect(r).toMatchObject({ ran: false, reason: "PAPER_MIRROR_DISABLED" });
    expect(alpaca.getAccount).not.toHaveBeenCalled();
  });

  it("only ever uses paper credentials", async () => {
    const { client } = fakeSupabase({});
    await runPaperMirror(client);
    expect(alpaca.envCreds).toHaveBeenCalledWith("paper");
    expect(alpaca.envCreds).not.toHaveBeenCalledWith("live");
  });
});
