import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const alpaca = vi.hoisted(() => ({
  envCreds: vi.fn(() => ({ key: "k", secret: "s", mode: "paper" })),
  getAccount: vi.fn(async () => ({ equity: "100000", last_equity: "100000", cash: "100000" }) as Record<string, unknown>),
  getPositions: vi.fn(async () => [] as unknown[]),
  placeOrder: vi.fn(),
  placeExitOrder: vi.fn(),
  replaceOrder: vi.fn(),
  cancelOrder: vi.fn(async () => null),
  closePosition: vi.fn(),
  getOrder: vi.fn(),
  getOrderByClientId: vi.fn(),
  getAsset: vi.fn(async () => ({ symbol: "ETH/USD", tradable: true, minOrderSize: 0.001, minTradeIncrement: 0.000001, priceIncrement: 0.1 }) as Record<string, unknown>),
  getNetDeposits: vi.fn(async () => 30),
}));
vi.mock("@/lib/brokers/alpaca", () => alpaca);
const liveConn = vi.hoisted(() => ({ readLiveAlpacaConnection: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/brokers/live-creds", () => liveConn);
const momo = vi.hoisted(() => ({ momentumPass: vi.fn(async () => ({ placed: 0, held: [] as string[], errors: [] as string[] })) }));
vi.mock("@/lib/brokers/live-momentum", () => momo);
const plan = vi.hoisted(() => ({ optionPlanPass: vi.fn(async () => ({ placed: 0, held: [] as string[], errors: [] as string[] })) }));
vi.mock("@/lib/brokers/option-plan", () => plan);
const pm = vi.hoisted(() => ({ readPlanScores: vi.fn(async () => ({ scores: new Map<string, number>([["LOW:bullish", 8]]), error: null as string | null })) }));
vi.mock("@/lib/automation/portfolio-manager", () => pm);

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
  alpaca.getNetDeposits.mockResolvedValue(30);
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

  it("paper: a coin's add goes immediate-or-cancel (crypto takes no day order)", async () => {
    const { client } = fakeSupabase({
      positions: [{ id: "c1", symbol: "BTC/USD", side: "long", qty: "0.002", avg_entry_price: "90000", stop_loss: "88000", opened_at: opened, asset_class: "crypto" }],
      orders: [{ symbol: "BTC/USD", created_at: opened }],
      paper_mirror_lines: [{ position_id: "c1", symbol: "BTC/USD", side: "long", status: "open", target_qty: "0.001", sim_qty: "0.001", open_order_id: "o1", add_seq: 0, stop_order_id: "s1", stop_price: "88000", stop_qty: "0.001" }],
    });
    alpaca.getPositions.mockResolvedValue([{ symbol: "BTCUSD", qty: "0.001", side: "long", asset_class: "crypto" }]);
    alpaca.placeOrder.mockResolvedValue({ id: "a1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "a1", status: "filled", filled_qty: "0.001", filled_avg_price: "90010" });
    alpaca.replaceOrder.mockResolvedValue({ id: "s2", status: "new" });
    await runPaperMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ symbol: "BTC/USD", qty: 0.001, type: "market", timeInForce: "ioc" }));
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

  const liveSetup = (account: Record<string, unknown>) => {
    liveConn.readLiveAlpacaConnection.mockResolvedValueOnce({ connectionId: "c1", creds: { key: "lk", secret: "ls", mode: "live" } });
    alpaca.getAccount.mockResolvedValueOnce({ equity: "30", last_equity: "30", cash: "30", ...account } as never);
  };
  const liveOpened = new Date(NOW - 60_000).toISOString();
  // The simulator bought half a coin at $3,000, stop $2,950.
  const coinOpen = { id: "c1", symbol: "ETH/USD", side: "long", qty: "0.5", avg_entry_price: "3000", stop_loss: "2950", opened_at: liveOpened, asset_class: "crypto" };
  const coinOrders = [{ symbol: "ETH/USD", created_at: liveOpened }];
  const heldAfterFee = [{ symbol: "ETHUSD", qty: "0.003325", side: "long", asset_class: "crypto" }];
  const liveOpen = { id: "p1", symbol: "LOW", side: "long", qty: "40", avg_entry_price: "4", stop_loss: "3.8", asset_class: "us_equity" };
  const liveLine = (openedAt: string) => ({
    mode: "live", position_id: "p1", symbol: "LOW", side: "long", status: "open", target_qty: 1, sim_qty: 1, open_order_id: "o1",
    add_order_id: null, add_seq: 0, stop_order_id: "s1", stop_price: 11, stop_qty: 1, opened_at: openedAt,
  });

  it("live: opens a coin within a third of the account, protected by a stop-limit on what is held", async () => {
    liveSetup({ daytrade_count: 0 });
    const { client, ops } = fakeSupabase({ positions: [coinOpen], orders: coinOrders });
    alpaca.getPositions.mockResolvedValueOnce([]).mockResolvedValue(heldAfterFee);
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "filled", filled_qty: "0.003333", filled_avg_price: "2999.5" });
    alpaca.placeExitOrder.mockResolvedValue({ id: "s1", status: "new" });
    const r = await runLiveMirror(client);
    expect(r.errors).toEqual([]);
    // $10 (a third of $30) buys 0.003333; a good-till-cancelled limit, as crypto takes no day order.
    expect(alpaca.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "live" }),
      expect.objectContaining({ symbol: "ETH/USD", qty: 0.003333, side: "buy", type: "limit", limitPrice: 3000.3, timeInForce: "ioc" }),
    );
    // The fee came out of the coin: the stop covers the 0.003325 held, as a stop-limit 2% under.
    expect(alpaca.placeExitOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.003325, stopLoss: 2950, stopLimit: 2891, side: "sell" }));
    const stopWrite = ops.find((o) => o.table === "paper_mirror_lines" && (o.payload as { stop_order_id?: string })?.stop_order_id === "s1");
    expect(stopWrite?.payload).toMatchObject({ stop_qty: 0.003325, target_qty: 0.003325 });
    const claim = ops.find((o) => o.table === "paper_mirror_lines" && o.op === "insert");
    expect(claim?.payload).toMatchObject({ mode: "live", target_qty: 0.003333 });
  });

  it("live: a deposit never moves the loss limit's step", async () => {
    // $60 of equity, all of it deposited: no trading gain, so a tenth ($6) at
    // an $1,800 stop that may fill 2% under it, fees both ways, allows
    // 0.004808 of a coin, not the 0.006666 a fifth would.
    liveSetup({ equity: "60", last_equity: "60", cash: "60", daytrade_count: 0 });
    alpaca.getNetDeposits.mockResolvedValue(60);
    const { client } = fakeSupabase({ positions: [{ ...coinOpen, stop_loss: "1800" }], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.004808 }));
  });

  it("live: $30 made on $30 deposited takes the second step", async () => {
    liveSetup({ equity: "60", last_equity: "60", cash: "60", daytrade_count: 0 });
    alpaca.getNetDeposits.mockResolvedValue(30);
    const { client } = fakeSupabase({ positions: [{ ...coinOpen, stop_loss: "1800" }], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.006666 }));
  });

  it("live: unreadable transfers take the first step", async () => {
    liveSetup({ equity: "60", last_equity: "60", cash: "60", daytrade_count: 0 });
    alpaca.getNetDeposits.mockRejectedValue(new Error("403"));
    const { client } = fakeSupabase({ positions: [{ ...coinOpen, stop_loss: "1800" }], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.004808 }));
  });

  it("live: no deposits on record takes the first step, never equity read as all gain", async () => {
    liveSetup({ equity: "60", last_equity: "60", cash: "60", daytrade_count: 0 });
    alpaca.getNetDeposits.mockResolvedValue(0);
    const { client } = fakeSupabase({ positions: [{ ...coinOpen, stop_loss: "1800" }], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.004808 }));
  });

  it("live: a coin's stop is sized under the fill when the holding can't be read", async () => {
    liveSetup({ daytrade_count: 0 });
    const { client } = fakeSupabase({ positions: [coinOpen], orders: coinOrders });
    alpaca.getPositions.mockResolvedValueOnce([]).mockRejectedValue(new Error("timeout"));
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "filled", filled_qty: "0.003333", filled_avg_price: "2999.5" });
    alpaca.placeExitOrder.mockResolvedValue({ id: "s1", status: "new" });
    await runLiveMirror(client);
    // 0.003333 less the 0.25% fee, rounded down to the lot.
    expect(alpaca.placeExitOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ qty: 0.003324 }));
  });

  it("live: a coin's stop-limit moves its stop and its limit together", async () => {
    liveSetup({ daytrade_count: 0 });
    const coinLine = {
      mode: "live", position_id: "c1", symbol: "ETH/USD", side: "long", status: "open", target_qty: 0.003325, sim_qty: 0.003333, open_order_id: "o1",
      add_order_id: null, add_seq: 0, stop_order_id: "s1", stop_price: 2950, stop_qty: 0.003325, opened_at: liveOpened,
    };
    const { client } = fakeSupabase({ positions: [{ ...coinOpen, stop_loss: "2990" }], orders: coinOrders, paper_mirror_lines: [coinLine] });
    alpaca.getPositions.mockResolvedValue(heldAfterFee);
    alpaca.replaceOrder.mockResolvedValue({ id: "s2", status: "new" });
    const r = await runLiveMirror(client);
    expect(r.errors).toEqual([]);
    expect(alpaca.replaceOrder).toHaveBeenCalledWith(expect.anything(), "s1", { stopPrice: 2990, limitPrice: 2930.2, qty: 0.003325 });
  });

  it("live: a coin's close goes by its position symbol", async () => {
    liveSetup({ daytrade_count: 3 });
    const coinLine = {
      mode: "live", position_id: "c1", symbol: "ETH/USD", side: "long", status: "open", target_qty: 0.003325, sim_qty: 0.003333, open_order_id: "o1",
      add_order_id: null, add_seq: 0, stop_order_id: "s1", stop_price: 2950, stop_qty: 0.003325, opened_at: liveOpened,
    };
    const { client } = fakeSupabase({ paper_mirror_lines: [coinLine] });
    alpaca.getPositions.mockResolvedValue(heldAfterFee);
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) => (id === "s1" ? { id, status: "canceled" } : { id, status: "filled", filled_qty: "0.003325", filled_avg_price: "3010" }));
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    await runLiveMirror(client);
    // Same day, day trades used: a coin has no day-trade rule, so it closes.
    expect(alpaca.closePosition).toHaveBeenCalledWith(expect.anything(), "ETHUSD", 0.003325);
  });

  it("runs the options plan on both accounts (paper at $10); momentum only manages what it holds", async () => {
    liveSetup({ daytrade_count: 0 });
    const live = fakeSupabase({ positions: [{ ...liveOpen, opened_at: liveOpened }], orders: [{ symbol: "LOW", created_at: liveOpened }] }).client;
    await runLiveMirror(live);
    expect(momo.momentumPass).toHaveBeenLastCalledWith(
      live, expect.objectContaining({ mode: "live" }), expect.anything(), expect.anything(), expect.objectContaining({ isOpen: true }), expect.any(Set), expect.any(Number), expect.any(Number), { mode: "live", entries: false },
    );
    expect(plan.optionPlanPass).toHaveBeenLastCalledWith(
      live, expect.objectContaining({ mode: "live" }), expect.anything(), expect.anything(), expect.objectContaining({ isOpen: true }),
      [expect.objectContaining({ symbol: "LOW", side: "long", automated: true, score: 8 })], expect.any(Set), expect.any(Number), expect.any(Number), { mode: "live" },
    );
    const paper = fakeSupabase({}).client;
    await runPaperMirror(paper);
    expect(momo.momentumPass).toHaveBeenLastCalledWith(
      paper, expect.objectContaining({ mode: "paper" }), expect.anything(), [], expect.objectContaining({ isOpen: true }), new Set(), expect.any(Number), expect.any(Number), { mode: "paper", fixedBudget: 10, entries: false },
    );
    expect(plan.optionPlanPass).toHaveBeenLastCalledWith(
      paper, expect.objectContaining({ mode: "paper" }), expect.anything(), [], expect.objectContaining({ isOpen: true }), [], new Set(), expect.any(Number), expect.any(Number), { mode: "paper", fixedBudget: 10 },
    );
  });

  it("an unreadable score stops the plan pass, and a failure never fails the run", async () => {
    pm.readPlanScores.mockResolvedValueOnce({ scores: new Map(), error: "db down" });
    plan.optionPlanPass.mockClear();
    const r = await runPaperMirror(fakeSupabase({}).client);
    expect(r.ran).toBe(true);
    expect(plan.optionPlanPass).not.toHaveBeenCalled();
    expect(r.errors.join(" ")).toMatch(/option plan: scores: db down/);
    momo.momentumPass.mockRejectedValueOnce(new Error("orders down"));
    const r2 = await runPaperMirror(fakeSupabase({}).client);
    expect(r2.ran).toBe(true);
    expect(r2.errors.join(" ")).toMatch(/option plan: orders down/);
  });

  it("live: a stock trade is skipped and recorded with the reason", async () => {
    liveSetup({ daytrade_count: 0 });
    const { client, ops } = fakeSupabase({ positions: [{ ...liveOpen, opened_at: liveOpened }], orders: [{ symbol: "LOW", created_at: liveOpened }] });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    const missed = ops.find((o) => o.table === "paper_mirror_events" && (o.payload as { action: string }).action === "missed");
    expect((missed?.payload as { note: string }).note).toMatch(/Stock trade/);
  });

  it("live: a coin opens with the day trades used and the stock market closed", async () => {
    liveSetup({ daytrade_count: 3 });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ is_open: false }) })));
    const { client } = fakeSupabase({ positions: [coinOpen], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.placeOrder).toHaveBeenCalledTimes(1);
  });

  it("live: a limit the market moved past is cancelled, not left resting", async () => {
    liveSetup({ daytrade_count: 0 });
    const { client, ops } = fakeSupabase({ positions: [coinOpen], orders: coinOrders });
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockResolvedValueOnce({ id: "o1", status: "new" }).mockResolvedValueOnce({ id: "o1", status: "new" }).mockResolvedValueOnce({ id: "o1", status: "new" })
      .mockResolvedValue({ id: "o1", status: "canceled", filled_qty: "0" });
    await runLiveMirror(client);
    expect(alpaca.cancelOrder).toHaveBeenCalledWith(expect.anything(), "o1");
    expect(alpaca.placeExitOrder).not.toHaveBeenCalled();
    const missed = ops.find((o) => o.table === "paper_mirror_lines" && o.op === "update" && (o.payload as { status?: string }).status === "missed");
    expect(missed).toBeDefined();
  });

  it("live: an open filled at or under the stop is closed at once, by the coin's position symbol", async () => {
    liveSetup({ daytrade_count: 0 });
    const { client, ops } = fakeSupabase({ positions: [coinOpen], orders: coinOrders });
    alpaca.getPositions.mockResolvedValueOnce([]).mockResolvedValue(heldAfterFee);
    alpaca.placeOrder.mockResolvedValue({ id: "o1", status: "accepted" });
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) =>
      id === "o1" ? { id: "o1", status: "filled", filled_qty: "0.003333", filled_avg_price: "2949" } : { id, status: "filled", filled_qty: "0.003325", filled_avg_price: "2948" },
    );
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    await runLiveMirror(client);
    expect(alpaca.placeExitOrder).not.toHaveBeenCalled();
    expect(alpaca.closePosition).toHaveBeenCalledWith(expect.anything(), "ETHUSD", 0.003325);
    expect(ops.some((o) => o.table === "paper_mirror_lines" && (o.payload as { status?: string })?.status === "closed")).toBe(true);
  });

  it("live: a same-day close the day-trade rule would refuse is held and the stop stays", async () => {
    liveSetup({ daytrade_count: 3 });
    alpaca.getPositions.mockResolvedValue([{ symbol: "LOW", qty: "1", side: "long" }]);
    const { client } = fakeSupabase({ paper_mirror_lines: [liveLine(new Date(NOW - 30 * 60_000).toISOString())] });
    const r = await runLiveMirror(client);
    expect(alpaca.cancelOrder).not.toHaveBeenCalled();
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/day-trade rule/);
  });

  it("live: a close on a line from an earlier day goes even with the day trades used", async () => {
    liveSetup({ daytrade_count: 3 });
    alpaca.getPositions.mockResolvedValue([{ symbol: "LOW", qty: "1", side: "long" }]);
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) => (id === "s1" ? { id, status: "canceled" } : { id, status: "filled", filled_qty: "1", filled_avg_price: "12.4" }));
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    const { client } = fakeSupabase({ paper_mirror_lines: [liveLine(new Date(NOW - 3 * 24 * 3600_000).toISOString())] });
    await runLiveMirror(client);
    expect(alpaca.closePosition).toHaveBeenCalledWith(expect.anything(), "LOW", 1);
  });

  it("live: a sell refused after the stop came off puts the stop back", async () => {
    liveSetup({ daytrade_count: 0 });
    alpaca.getPositions.mockResolvedValue([{ symbol: "LOW", qty: "1", side: "long" }]);
    alpaca.getOrder.mockResolvedValue({ id: "s1", status: "canceled" });
    alpaca.closePosition.mockRejectedValue(new Error("403 pattern day trading protection"));
    alpaca.placeExitOrder.mockResolvedValue({ id: "s2", status: "new" });
    const { client, ops } = fakeSupabase({ paper_mirror_lines: [liveLine(new Date(NOW - 30 * 60_000).toISOString())] });
    const r = await runLiveMirror(client);
    expect(alpaca.placeExitOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ symbol: "LOW", qty: 1, stopLoss: 11, side: "sell" }));
    const restored = ops.find((o) => o.table === "paper_mirror_lines" && (o.payload as { stop_order_id?: string })?.stop_order_id === "s2");
    expect(restored?.filters.join(" ")).toMatch(/"mode","live"/);
    expect(r.errors.join(" ")).toMatch(/day trading/);
  });
});
