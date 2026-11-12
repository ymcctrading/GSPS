/**
 * /api/trade-notes and /api/trade-record (Q3 plan item 2): a note goes only on
 * the member's own closed trade, on the member's own session (never the
 * ledger's service client), a blank note removes it, and the record reads the
 * trades the loss-series pause reads.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Result = { data: unknown; error: { message: string } | null };
interface Call {
  table: string;
  ops: [string, unknown[]][];
}

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  calls: [] as Call[],
  results: {} as Record<string, Result[]>,
}));

function builder(table: string) {
  const call: Call = { table, ops: [] };
  state.calls.push(call);
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "not", "order", "limit", "maybeSingle", "delete", "upsert", "insert", "update"]) {
    b[op] = (...args: unknown[]) => {
      call.ops.push([op, args]);
      return b;
    };
  }
  b.then = (resolve: (r: Result) => unknown) => {
    const queue = state.results[table] ?? [];
    return Promise.resolve(resolve(queue.shift() ?? { data: null, error: null }));
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => builder(table),
  }),
}));
// A note is never a ledger write: fail loudly if a route reaches for it.
vi.mock("@/lib/supabase/ledger", () => ({
  ledgerWriter: () => {
    throw new Error("a note must not go through the ledger writer");
  },
}));

import { PUT } from "@/app/api/trade-notes/route";
import { GET } from "@/app/api/trade-record/route";

const TRADE = "11111111-1111-4111-8111-111111111111";

function put(body: unknown) {
  return PUT(new NextRequest("http://localhost/api/trade-notes", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.calls = [];
  state.results = {};
});

describe("PUT /api/trade-notes", () => {
  it("answers 401 without a session and touches nothing", async () => {
    state.user = null;
    const res = await put({ tradeLogId: TRADE, note: "x" });
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("refuses a malformed body", async () => {
    expect((await put({ tradeLogId: "nope", note: "x" })).status).toBe(400);
    expect((await put({ tradeLogId: TRADE })).status).toBe(400);
  });

  it("refuses a note longer than the column allows", async () => {
    const res = await put({ tradeLogId: TRADE, note: "a".repeat(2001) });
    expect(res.status).toBe(400);
  });

  it("answers 404 for a trade that isn't the member's", async () => {
    state.results.trade_logs = [{ data: null, error: null }];
    const res = await put({ tradeLogId: TRADE, note: "x" });
    expect(res.status).toBe(404);
    expect(state.calls[0].ops).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(state.calls.some((c) => c.table === "trade_notes")).toBe(false);
  });

  it("refuses a note on a trade still open", async () => {
    state.results.trade_logs = [{ data: { id: TRADE, outcome: "pending", exit_timestamp: null }, error: null }];
    expect((await put({ tradeLogId: TRADE, note: "x" })).status).toBe(409);
  });

  it("writes a trimmed note on the member's own closed trade", async () => {
    state.results.trade_logs = [{ data: { id: TRADE, outcome: "loss", exit_timestamp: "2026-11-05T15:00:00Z" }, error: null }];
    const res = await put({ tradeLogId: TRADE, note: "  chased it  " });
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe("chased it");
    const write = state.calls.find((c) => c.table === "trade_notes")!;
    const upsert = write.ops.find(([op]) => op === "upsert")!;
    expect(upsert[1][0]).toMatchObject({ trade_log_id: TRADE, user_id: "u1", note: "chased it" });
    expect(upsert[1][1]).toEqual({ onConflict: "trade_log_id" });
  });

  it("removes the note when it is cleared", async () => {
    state.results.trade_logs = [{ data: { id: TRADE, outcome: "profit", exit_timestamp: "2026-11-05T15:00:00Z" }, error: null }];
    const res = await put({ tradeLogId: TRADE, note: "   " });
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBeNull();
    const write = state.calls.find((c) => c.table === "trade_notes")!;
    expect(write.ops.map(([op]) => op)).toContain("delete");
    expect(write.ops).toContainEqual(["eq", ["user_id", "u1"]]);
  });

  it("answers a plain message when the write fails, never the database's words", async () => {
    state.results.trade_logs = [{ data: { id: TRADE, outcome: "profit", exit_timestamp: "2026-11-05T15:00:00Z" }, error: null }];
    state.results.trade_notes = [{ data: null, error: { message: "secret detail" } }];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await put({ tradeLogId: TRADE, note: "x" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/secret/);
    spy.mockRestore();
  });
});

describe("GET /api/trade-record", () => {
  it("reads the paper and live closes the pause reads, with notes and the pause marked", async () => {
    const rows = [
      ["t3", "2026-11-05T15:00:00Z"],
      ["t2", "2026-11-04T15:00:00Z"],
      ["t1", "2026-11-03T15:00:00Z"],
    ].map(([id, exit]) => ({
      id,
      symbol: "AAA",
      direction: "buy",
      quantity: "10",
      entry_timestamp: "2026-11-01T15:00:00Z",
      entry_price: "100",
      exit_timestamp: exit,
      exit_price: "95",
      outcome: "loss",
      profit_loss_dollars: "-50",
      exit_condition: "stop_loss",
      mode: "paper",
    }));
    state.results.trade_logs = [{ data: rows, error: null }];
    state.results.loss_series_resets = [{ data: null, error: null }];
    state.results.trade_notes = [{ data: [{ trade_log_id: "t2", note: "ignored the level", updated_at: "2026-11-04T21:00:00Z" }], error: null }];

    const res = await GET(new NextRequest("http://localhost/api/trade-record"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record.pauses).toHaveLength(1);
    expect(body.trades.map((x: { id: string; startedPause: boolean }) => [x.id, x.startedPause])).toEqual([
      ["t3", true],
      ["t2", false],
      ["t1", false],
    ]);
    expect(body.trades[1].note).toBe("ignored the level");
    expect(body.trades[0]).toMatchObject({ quantity: 10, profitLossDollars: -50, account: "paper" });
    expect(JSON.stringify(body)).not.toMatch(/strategy_version/);

    const read = state.calls.find((c) => c.table === "trade_logs")!;
    expect(read.ops).toContainEqual(["in", ["mode", ["paper", "live"]]]);
    expect(read.ops).toContainEqual(["eq", ["user_id", "u1"]]);
  });

  it("answers 401 without a session", async () => {
    state.user = null;
    const res = await GET(new NextRequest("http://localhost/api/trade-record"));
    expect(res.status).toBe(401);
  });
});
