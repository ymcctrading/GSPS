import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const alpaca = vi.hoisted(() => ({
  envCreds: vi.fn(() => ({ key: "k", secret: "s", mode: "paper" })),
  getAccount: vi.fn(async () => ({ equity: "100000", last_equity: "100000", cash: "100000" })),
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
const liveConn = vi.hoisted(() => ({ readLiveAlpacaConnection: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/brokers/live-creds", () => liveConn);

import { runLiveMirror, runPaperMirror } from "@/lib/brokers/paper-mirror";

type Op = { table: string; op: string; payload?: unknown; filters: string[] };

/** A chainable stand-in for the Supabase client: selects answer from `tables`, writes are recorded. */
function fakeSupabase(tables: Record<string, unknown[]>, failWrites: string[] = [], lockFree = true) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const rec: Op = { table, op: "select", filters: [] };
    const result = () => {
      if (rec.op !== "select") {
        ops.push(rec);
        if (failWrites.includes(`${table}.${rec.op}`)) return { data: null, error: { message: "write failed" } };
        return { data: table === "paper_mirror_lock" ? (lockFree ? [{ id: 1 }] : []) : null, error: null };
      }
      return { data: tables[table] ?? [], error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "gte", "lt", "in", "not", "or", "order", "limit", "is"]) {
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

  it("numbers each add, so a later add never reuses an earlier one's id", async () => {
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "AAA", side: "long", qty: "15", avg_entry_price: "100", stop_loss: "95", opened_at: opened, asset_class: "us_equity" }],
      orders: [{ symbol: "AAA", created_at: opened }],
      paper_mirror_lines: [{ position_id: "p1", symbol: "AAA", side: "long", status: "open", target_qty: "10", open_order_id: "o1", add_order_id: null, add_seq: "2", stop_order_id: "s1", stop_price: "95", stop_qty: "10" }],
    });
    alpaca.getPositions.mockResolvedValue([{ symbol: "AAA", qty: "10", side: "long" }]);
    alpaca.placeOrder.mockResolvedValue({ id: "a3", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "a3", status: "filled", filled_qty: "5", filled_avg_price: "101" });
    const r = await runPaperMirror(client);
    expect(r.errors).toEqual([]);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 5, clientOrderId: "gsps-mirror-add-p1-3" }));
    expect(ops.some((o) => o.table === "paper_mirror_lines" && (o.payload as { add_seq?: number }).add_seq === 3)).toBe(true);
  });

  it("keeps an open that reached the broker despite an error on the way back", async () => {
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "AAA", side: "long", qty: "10", avg_entry_price: "100", stop_loss: "95", opened_at: opened, asset_class: "us_equity" }],
      orders: [{ symbol: "AAA", created_at: opened }],
    });
    alpaca.placeOrder.mockRejectedValue(new Error("timeout"));
    alpaca.getOrderByClientId.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "filled", filled_qty: "10", filled_avg_price: "100.1" });
    alpaca.placeExitOrder.mockResolvedValue({ id: "s1", status: "new" });
    const r = await runPaperMirror(client);
    expect(r.errors).toEqual([]);
    expect(ops.some((o) => (o.payload as { status?: string })?.status === "missed")).toBe(false);
    expect(alpaca.placeExitOrder).toHaveBeenCalled();
  });

  it("keeps the filled part of an open whose rest was cancelled", async () => {
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "AAA", side: "long", qty: "10", avg_entry_price: "100", stop_loss: "95", opened_at: opened, asset_class: "us_equity" }],
      orders: [{ symbol: "AAA", created_at: opened }],
    });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "7" });
    await runPaperMirror(client);
    expect(ops.some((o) => (o.payload as { status?: string })?.status === "missed")).toBe(false);
    expect(ops.some((o) => o.table === "paper_mirror_lines" && (o.payload as { target_qty?: number }).target_qty === 7)).toBe(true);
  });

  it("skips the run while another holds the lease", async () => {
    const { client } = fakeSupabase({}, [], false);
    const r = await runPaperMirror(client);
    expect(r.reason).toMatch(/in progress/);
    expect(alpaca.getAccount).not.toHaveBeenCalled();
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

  it("live: does nothing without a connected live account, and never reads env keys", async () => {
    const { client } = fakeSupabase({});
    const r = await runLiveMirror(client);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/No live account connected/);
    expect(alpaca.envCreds).not.toHaveBeenCalled();
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
  });

  it("live: switched off by LIVE_MIRROR_DISABLED", async () => {
    process.env.LIVE_MIRROR_DISABLED = "true";
    const { client } = fakeSupabase({});
    const r = await runLiveMirror(client);
    delete process.env.LIVE_MIRROR_DISABLED;
    expect(r.reason).toBe("LIVE_MIRROR_DISABLED");
    expect(liveConn.readLiveAlpacaConnection).not.toHaveBeenCalled();
  });

  it("live: opens a sized whole-share line on the owner's live keys", async () => {
    const liveOpened = new Date(Date.parse("2026-11-16T15:00:00Z") - 60_000).toISOString();
    liveConn.readLiveAlpacaConnection.mockResolvedValueOnce({ connectionId: "c1", creds: { key: "lk", secret: "ls", mode: "live" } });
    alpaca.getAccount.mockResolvedValueOnce({ equity: "30", last_equity: "30", cash: "30" });
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "LOW", side: "long", qty: "40", avg_entry_price: "12", stop_loss: "11", opened_at: liveOpened, asset_class: "us_equity" }],
      orders: [{ symbol: "LOW", created_at: liveOpened }],
    });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "filled", filled_qty: "2", filled_avg_price: "12.02" });
    alpaca.placeExitOrder.mockResolvedValue({ id: "s1", status: "new" });
    const r = await runLiveMirror(client);
    expect(r.errors).toEqual([]);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ mode: "live" }), expect.objectContaining({ qty: 2, side: "buy" }));
    const claim = ops.find((o) => o.table === "paper_mirror_lines" && o.op === "insert");
    expect(claim?.payload).toMatchObject({ mode: "live", target_qty: 2, scale: 2 / 40 });
    const ev = ops.find((o) => o.table === "paper_mirror_events");
    expect(ev?.payload).toMatchObject({ mode: "live" });
  });

  it("live: records an open the small account can't take, with the reason", async () => {
    const liveOpened = new Date(Date.parse("2026-11-16T15:00:00Z") - 60_000).toISOString();
    liveConn.readLiveAlpacaConnection.mockResolvedValueOnce({ connectionId: "c1", creds: { key: "lk", secret: "ls", mode: "live" } });
    alpaca.getAccount.mockResolvedValueOnce({ equity: "30", last_equity: "30", cash: "30" });
    const { client, ops } = fakeSupabase({
      positions: [{ id: "p1", symbol: "BIG", side: "long", qty: "4", avg_entry_price: "320", stop_loss: "300", opened_at: liveOpened, asset_class: "us_equity" }],
      orders: [{ symbol: "BIG", created_at: liveOpened }],
    });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    const missed = ops.find((o) => o.table === "paper_mirror_events" && (o.payload as { action: string }).action === "missed");
    expect((missed?.payload as { note: string }).note).toMatch(/One share costs \$320.00/);
  });
});

