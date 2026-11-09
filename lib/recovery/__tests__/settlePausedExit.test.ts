import { describe, expect, it } from "vitest";
import { applySettlement, planSettlement, storedWalkStopReason, walkOrderId, type PausedExitRow, type SettleDeps } from "@/lib/recovery/settlePausedExit";
import type { PausedWalk } from "@/lib/recovery/pausedPaperExits";

const row = (over: Partial<PausedExitRow> = {}): PausedExitRow => ({
  id: "01210ed6-aaaa-bbbb-cccc-000000000001",
  user_id: "user-1",
  symbol: "MTD",
  side: "long",
  qty: 10,
  entry_price: 1680,
  stop_loss: 1644,
  take_profit_1: 1720,
  master_profit: 1800,
  scale_out_qty: 0,
  master_qty: 0,
  runner_qty: 10,
  scale_out_order_id: null,
  master_order_id: null,
  runner_order_id: null,
  scale_out_fill_price: null,
  master_fill_price: null,
  runner_fill_price: null,
  applied_stop: 1644,
  applied_stop_reason: "protocol",
  high_water: 1700,
  entry_order_id: "order-1",
  created_at: "2026-10-28T15:00:00.000Z",
  last_managed_at: "2026-10-30T19:24:00.000Z",
  ...over,
});

const walk = (over: Partial<PausedWalk> = {}): PausedWalk => ({
  state: "closed",
  fills: [{ key: "runner", qty: 10, price: 1692, at: "2026-11-05T15:30:00.000Z", reason: "stop (final_stage)" }],
  stop: 1692,
  stopReason: "final_stage",
  best: 1735,
  barsWalked: 120,
  ambiguousBars: 0,
  rMultiple: 0.33,
  ...over,
});

const END = new Date("2026-11-30T14:00:00.000Z");

describe("planSettlement", () => {
  it("dates the close at the bar the stop filled on, not at the write", () => {
    const p = planSettlement(row(), walk(), END);
    expect(p.close?.at).toBe("2026-11-05T15:30:00.000Z");
    expect(p.close?.exitCondition).toBe("stop_loss");
    expect(p.close?.stoppedOut).toBe(true);
    expect(p.close?.exitPrice).toBe(1692);
    expect(p.close?.profitLossDollars).toBe(120);
    expect(p.patch.runner_fill_price).toBe(1692);
    expect(p.patch.runner_order_id).toBe("sim_walk_01210ed6_runner");
    expect(p.patch.applied_stop).toBe(1692);
    expect(p.patch.applied_stop_reason).toBe("trailing");
    expect(p.patch.high_water).toBe(1735);
    // The claim leaves last_managed_at alone (the hold keeps hiding the row); the release sets it.
    expect(p.patch.last_managed_at).toBeUndefined();
    expect(p.managedAt).toBe(END.toISOString());
  });

  it("leaves an open walk open, moving only its stop, best and managed time", () => {
    const p = planSettlement(row(), walk({ state: "open", fills: [], stop: 1660, stopReason: "break_even", best: 1710 }), END);
    expect(p.close).toBeNull();
    expect(p.patch).toEqual({ applied_stop: 1660, applied_stop_reason: "break_even", high_water: 1710 });
    expect(p.managedAt).toBe(END.toISOString());
  });

  it("blends a tranche filled before the pause into the logged exit and reads the master as the target", () => {
    const r = row({ scale_out_qty: 4, runner_qty: 0, master_qty: 6, scale_out_order_id: "sim_1", scale_out_fill_price: 1720 });
    const p = planSettlement(r, walk({ fills: [{ key: "master", qty: 6, price: 1800, at: "2026-11-12T16:00:00.000Z", reason: "MTP" }] }), END);
    expect(p.close?.exitCondition).toBe("master_target");
    expect(p.close?.stoppedOut).toBe(false);
    expect(p.close?.exitQty).toBe(10);
    expect(p.close?.exitPrice).toBeCloseTo((4 * 1720 + 6 * 1800) / 10, 10);
    expect(p.patch.scale_out_order_id).toBeUndefined();
  });

  it("reads a short's profit the right way round", () => {
    const r = row({ side: "short", entry_price: 100, stop_loss: 105, applied_stop: 105, high_water: 98 });
    const p = planSettlement(r, walk({ fills: [{ key: "runner", qty: 10, price: 96, at: "2026-11-04T15:00:00.000Z", reason: "stop (trailing)" }], stop: 96, best: 94 }), END);
    expect(p.close?.profitLossDollars).toBe(40);
    expect(p.close?.profitLossPercent).toBe(4);
  });

  it("refuses a walk that fills a tranche the row already filled", () => {
    expect(() => planSettlement(row({ runner_order_id: "sim_x" }), walk(), END)).toThrow(/already filled/);
  });

  it("keeps the row's own stop reason when the walk never moved it", () => {
    expect(storedWalkStopReason({ stopReason: "applied" }, { applied_stop_reason: "break_even" })).toBe("break_even");
    expect(storedWalkStopReason({ stopReason: "protocol" }, { applied_stop_reason: null })).toBe("protocol");
    expect(storedWalkStopReason({ stopReason: "initial" }, { applied_stop_reason: null })).toBe("protocol");
  });
});

/** A query builder fake that records each chained call and answers from `answers`. */
function fakeDb(answers: { claim?: unknown; order?: unknown; reread?: unknown; log?: unknown; releaseError?: string }) {
  const calls: { table: string; op: string; args: unknown[]; filters: [string, string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      const call = { table, op: "", args: [] as unknown[], filters: [] as [string, string, unknown][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const op of ["update", "select", "insert"]) q[op] = (...args: unknown[]) => ((call.op ||= op), call.op === op && (call.args = args), q);
      for (const f of ["eq", "is"]) q[f] = (col: string, v: unknown) => (call.filters.push([f, col, v]), q);
      q.maybeSingle = async () => ({
        data: table === "orders" ? answers.order ?? null : table === "trade_logs" ? answers.log ?? null : call.op === "select" ? answers.reread ?? null : answers.claim ?? null,
        error: null,
      });
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: call.op === "update" && answers.releaseError ? { message: answers.releaseError } : null }).then(res);
      return q;
    },
  };
  return { db, calls };
}

function deps(db: SettleDeps["db"]) {
  const log: Record<string, unknown>[] = [];
  const fills: unknown[] = [];
  const stopOuts: unknown[] = [];
  const d: SettleDeps = {
    db,
    executeFill: async (userId, f) => void fills.push({ userId, ...f }),
    insertTradeLog: async (r) => (log.push(r), { error: null, duplicate: false }),
    stopOut: async (userId, a) => void stopOuts.push({ userId, ...a }),
    signalCalled: () => "Protocol levels",
    now: () => new Date("2026-11-30T14:05:00.000Z"),
  };
  return { d, log, fills, stopOuts };
}

describe("applySettlement", () => {
  it("claims the row only as the walk read it, then fills, logs at the bar's time, closes and ends the automated plan", async () => {
    const { db, calls } = fakeDb({ claim: { id: "x" }, order: { source_plan_id: "plan-9", intraday_sourced: false } });
    const { d, log, fills, stopOuts } = deps(db);
    const r = row();
    const res = await applySettlement(r, planSettlement(r, walk(), END), d);
    expect(res.outcome).toBe("settled");
    const claim = calls[0];
    expect(claim.op).toBe("update");
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ["eq", "status", "working"],
        ["eq", "mode", "paper"],
        ["eq", "qty", 10],
        ["eq", "last_managed_at", "2026-10-30T19:24:00.000Z"],
        ["is", "runner_order_id", null],
      ]),
    );
    expect(fills).toEqual([{ userId: "user-1", symbol: "MTD", side: "sell", qty: 10, price: 1692 }]);
    expect(log[0].exit_timestamp).toBe("2026-11-05T15:30:00.000Z");
    expect(log[0].exit_condition).toBe("stop_loss");
    expect((claim.args[0] as Record<string, unknown>).last_managed_at).toBeUndefined();
    const release = calls.find((c) => c.table === "protocol_exits" && c.op === "update" && (c.args[0] as Record<string, unknown>).status === "closed");
    expect((release?.args[0] as Record<string, unknown>).closed_at).toBe("2026-11-05T15:30:00.000Z");
    // Released last: after the claim, and carrying the walk's end as last_managed_at.
    expect(calls.indexOf(release!)).toBeGreaterThan(0);
    expect((release?.args[0] as Record<string, unknown>).last_managed_at).toBe(END.toISOString());
    expect(stopOuts).toEqual([expect.objectContaining({ planId: "plan-9", stoppedAt: "2026-11-05T15:30:00.000Z" })]);
  });

  it("reports an earlier run's unfinished claim as partial, not as a skip", async () => {
    const r = row();
    const { db } = fakeDb({ claim: null, reread: { status: "working", last_managed_at: r.last_managed_at, runner_order_id: walkOrderId(r.id, "runner") }, log: null });
    const { d, fills } = deps(db);
    const res = await applySettlement(r, planSettlement(r, walk(), END), d);
    expect(res.outcome).toBe("partial");
    expect(res.detail).toMatch(/not released/);
    expect(res.detail).toMatch(/trade log not written/);
    expect(fills).toHaveLength(0);
  });

  it("says how far it got when a write fails after the claim, and leaves the row unreleased", async () => {
    const { db, calls } = fakeDb({ claim: { id: "x" } });
    const { d } = deps(db);
    d.insertTradeLog = async () => ({ error: { message: "boom" }, duplicate: false });
    const r = row();
    await expect(applySettlement(r, planSettlement(r, walk(), END), d)).rejects.toThrow(/stopped after: claimed; 1 of 1 fill\(s\) booked\. trade log not written: boom/);
    expect(calls.filter((c) => c.table === "protocol_exits" && c.op === "update")).toHaveLength(1);
  });

  it("writes nothing more when the claim finds the row changed", async () => {
    const { db, calls } = fakeDb({ claim: null });
    const { d, log, fills } = deps(db);
    const r = row();
    const res = await applySettlement(r, planSettlement(r, walk(), END), d);
    expect(res.outcome).toBe("skipped");
    expect(fills).toHaveLength(0);
    expect(log).toHaveLength(0);
    // The claim, then one read to tell a change apart from an unfinished claim; no writes.
    expect(calls.map((c) => c.op)).toEqual(["update", "select"]);
  });

  it("does not log or close a walk that stays open", async () => {
    const { db } = fakeDb({ claim: { id: "x" } });
    const { d, log } = deps(db);
    const r = row();
    const res = await applySettlement(r, planSettlement(r, walk({ state: "open", fills: [], stop: 1660, stopReason: "break_even" }), END), d);
    expect(res.outcome).toBe("updated");
    expect(log).toHaveLength(0);
  });

  it("ends no plan for a trade a person placed", async () => {
    const { db } = fakeDb({ claim: { id: "x" }, order: { source_plan_id: null } });
    const { d, stopOuts } = deps(db);
    const r = row();
    await applySettlement(r, planSettlement(r, walk(), END), d);
    expect(stopOuts).toHaveLength(0);
  });
});
