/**
 * Automated pyramid adds (lib/automation/pyramid-adds.ts), placed through the
 * real paper placement path (lib/trade/place-order.ts) against an in-memory
 * fake of the tables involved. Only the simulator's fills and quotes, the
 * entitlement policy and the learning recorder are stubbed, as in
 * portfolio-manager-e2e.test.ts; every placement rule runs unmocked, so a rule
 * that refuses the add would fail these tests.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";

const sim = vi.hoisted(() => ({ quote: 0 }));
vi.mock("@/lib/learning/record", () => ({ recordTradePlanRegime: vi.fn(), recordOrderExecution: vi.fn() }));
vi.mock("@/lib/entitlements/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements/policy")>("@/lib/entitlements/policy");
  return {
    ...actual,
    getUserEntitlementPolicy: async () => ({ automationEnabled: true, proIntradayModuleEnabled: false, maxCorrelatedRiskGroups: "unlimited" }),
  };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => null };
});
vi.mock("@/lib/brokers/simulator", () => ({
  STARTING_CASH: 100_000,
  assetClassOf: () => "us_equity",
  getOrCreateAccount: vi.fn().mockResolvedValue({ cash: 1_000_000 }),
  getOpenPosition: vi.fn().mockResolvedValue({ side: "long", qty: 100, avg_entry_price: 101.8 }),
  listOpenPositions: vi.fn().mockResolvedValue([]),
  listWorkingPaperEntries: vi.fn().mockResolvedValue([]),
  quotePrice: vi.fn(async () => sim.quote),
  quoteOptionPrice: vi.fn(),
  executeFill: vi.fn(async (_s: unknown, _u: string, f: { qty: number; price: number }) => ({ price: f.price, qty: f.qty, positionId: "pos-1", closed: null })),
  logPlainClose: vi.fn(),
  isTriggered: vi.fn(() => true),
}));

import { getOrCreateAccount } from "@/lib/brokers/simulator";
import { lineLots, mergedLine, placeAutomatedPyramidAdds, type PyramidMarket } from "@/lib/automation/pyramid-adds";
import { readPyramidAdd } from "@/lib/gann/pyramid";
import { pricePoint } from "@/lib/gann/pointScale";

type Row = Record<string, unknown>;

/** A small Postgres-shaped fake: select/insert/update with eq, is, in, or, gte, lt and limit. */
function fakeDb(tables: Record<string, Row[]>, onInsert?: (table: string, row: Row, tables: Record<string, Row[]>) => void) {
  const rowsOf = (name: string) => (tables[name] ??= []);
  function filtered(name: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const api = {
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return api;
      },
      neq(c: string, v: unknown) {
        filters.push((r) => r[c] !== v);
        return api;
      },
      not(c: string, op: string, v: unknown) {
        filters.push((r) => !(op === "is" ? (r[c] ?? null) === v : op === "in" ? String(v).includes(String(r[c])) : r[c] === v));
        return api;
      },
      is(c: string, v: unknown) {
        filters.push((r) => (r[c] ?? null) === v);
        return api;
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]));
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push((r) => String(r[c]) >= String(v));
        return api;
      },
      lt(c: string, v: unknown) {
        filters.push((r) => String(r[c]) < String(v));
        return api;
      },
      or(expr: string) {
        const parts = expr.split(",").map((p) => {
          const [c, op, ...rest] = p.split(".");
          const v = rest.join(".");
          return (r: Row) => (op === "is" ? (r[c] ?? null) === null : op === "lt" ? r[c] != null && String(r[c]) < v : false);
        });
        filters.push((r) => parts.some((f) => f(r)));
        return api;
      },
      order: () => api,
      limit: () => api,
      match: () => rowsOf(name).filter((r) => filters.every((f) => f(r))),
      // What a read hands back: copies, as Postgres does, so a later write
      // by another pass never shows through a row already read.
      read: () => rowsOf(name).filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })),
    };
    return api;
  }
  const client = {
    from(name: string) {
      return {
        select() {
          const q = filtered(name);
          const out = {
            ...q,
            eq: (c: string, v: unknown) => (q.eq(c, v), out),
            neq: (c: string, v: unknown) => (q.neq(c, v), out),
            not: (c: string, op: string, v: unknown) => (q.not(c, op, v), out),
            is: (c: string, v: unknown) => (q.is(c, v), out),
            in: (c: string, v: unknown[]) => (q.in(c, v), out),
            gte: (c: string, v: unknown) => (q.gte(c, v), out),
            lt: (c: string, v: unknown) => (q.lt(c, v), out),
            or: (e: string) => (q.or(e), out),
            order: () => out,
            limit: () => out,
            maybeSingle: async () => ({ data: q.read()[0] ?? null, error: null }),
            single: async () => (q.read()[0] ? { data: q.read()[0], error: null } : { data: null, error: { message: "not found" } }),
            then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: q.read(), error: null }),
          };
          return out;
        },
        insert(row: Row) {
          // protocol_exits.status defaults to 'working' (migration 0009).
          const withId = { id: randomUUID(), created_at: new Date().toISOString(), ...(name === "protocol_exits" ? { status: "working" } : {}), ...row };
          rowsOf(name).push(withId);
          onInsert?.(name, withId, tables);
          const done = { data: withId, error: null };
          return { select: () => ({ single: async () => done, maybeSingle: async () => done }), then: (res: (v: { error: null }) => void) => res({ error: null }) };
        },
        update(patch: Row) {
          const q = filtered(name);
          const apply = () => {
            const hit = q.match();
            for (const r of hit) Object.assign(r, patch);
            return hit;
          };
          const out = {
            eq: (c: string, v: unknown) => (q.eq(c, v), out),
            is: (c: string, v: unknown) => (q.is(c, v), out),
            in: (c: string, v: unknown[]) => (q.in(c, v), out),
            or: (e: string) => (q.or(e), out),
            select: () => ({
              maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
              then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: apply(), error: null }),
            }),
            then: (res: (v: { error: null }) => void) => (apply(), res({ error: null })),
          };
          return out;
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient;
  return { client, tables };
}

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
// The pyramid tests' rise: a first lot at 101.8 on June 3 and a swing top near 110.5 since.
const DAILY = days([100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 111]);
const NOW = new Date("2026-06-15T15:00:00Z");
const SMALL_CAP = 200_000_000;

function market(over: Partial<PyramidMarket> = {}): PyramidMarket {
  return {
    daily: async () => DAILY,
    quote: async () => sim.quote,
    sharesOutstanding: async () => SMALL_CAP,
    ...over,
  };
}

function seed(
  over: { line?: Row; order?: Row; profile?: Row | null } = {},
  onInsert?: (table: string, row: Row, tables: Record<string, Row[]>) => void,
) {
  const line: Row = {
    id: "line-1",
    user_id: "u1",
    symbol: "AAPL",
    side: "long",
    mode: "paper",
    status: "working",
    qty: 100,
    entry_price: 101.8,
    stop_loss: 98.3,
    take_profit_1: 140,
    master_profit: null,
    applied_stop: 98.3,
    applied_stop_reason: "protocol",
    scale_out_qty: 0,
    master_qty: 0,
    runner_qty: 100,
    entry_order_id: "order-1",
    created_at: "2026-06-03T14:00:00Z",
    lots: null,
    merged_into: null,
    add_claimed_at: null,
    ...over.line,
  };
  return fakeDb({
    user_automation_profiles: over.profile === null ? [] : [{ user_id: "u1", is_automation_enabled: true, ...over.profile }],
    protocol_exits: [line],
    orders: [{ id: "order-1", user_id: "u1", source_plan_id: randomUUID(), intraday_sourced: false, ...over.order }],
  }, onInsert);
}

const trigger = () =>
  readPyramidAdd({
    side: "long",
    lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }],
    stop: 98.3,
    initialStop: 98.3,
    daily: DAILY,
    price: 111,
    capitalStock: SMALL_CAP,
  }).add!;

describe("automated pyramid adds", () => {
  beforeEach(() => {
    sim.quote = 0;
  });

  it("places the second lot through placement and merges it into the line with the whole-line stop", async () => {
    const add = trigger();
    sim.quote = Math.round((add.trigger + 0.1) * 100) / 100;
    const { client, tables } = seed();
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors).toEqual([]);
    expect(run.placed).toBe(1);

    const exits = tables.protocol_exits;
    const line = exits.find((r) => r.id === "line-1")!;
    const addRow = exits.find((r) => r.id !== "line-1")!;
    // One line: the add's own row is closed into it.
    expect(addRow.status).toBe("closed");
    expect(addRow.merged_into).toBe("line-1");
    expect(line.status).toBe("working");
    expect(line.qty).toBe(150);
    expect(line.runner_qty).toBe(150);
    expect(line.lots).toEqual([
      { qty: 100, price: 101.8, date: "2026-06-03" },
      { qty: 50, price: sim.quote, date: "2026-06-15" },
    ]);
    // The blended cost, and a stop at or over break-even, within 5 points of the add.
    const avg = (100 * 101.8 + 50 * sim.quote) / 150;
    expect(line.entry_price).toBeCloseTo(avg, 4);
    expect(line.applied_stop as number).toBeGreaterThanOrEqual(avg);
    expect(sim.quote - (line.applied_stop as number)).toBeLessThanOrEqual(5 * pricePoint(sim.quote) + 0.01);
    expect(line.applied_stop_reason).toBe("break_even");
    expect(line.add_claimed_at).toBeNull();
    // The add's order points at the line.
    const addOrder = tables.orders.find((o) => o.id !== "order-1")!;
    expect(addOrder.exit_plan_id).toBe("line-1");
    expect(addOrder.qty).toBe(50);
    expect(addOrder.side).toBe("buy");
  });

  it("holds the add to the member's per-trade dollar limit, and skips it when one share is over", async () => {
    const add = trigger();
    sim.quote = Math.round((add.trigger + 0.1) * 100) / 100;
    const capped = seed({ profile: { max_trade_dollars: 2000 } });
    const run = await placeAutomatedPyramidAdds(capped.client, market(), NOW);
    expect(run.errors).toEqual([]);
    expect(run.placed).toBe(1);
    const addOrder = capped.tables.orders.find((o) => o.id !== "order-1")!;
    expect(addOrder.qty).toBe(Math.floor((0.95 * 2000) / sim.quote));

    const tiny = seed({ profile: { max_trade_dollars: 50 } });
    const none = await placeAutomatedPyramidAdds(tiny.client, market(), NOW);
    expect(none.placed).toBe(0);
    expect(none.notes.some((n) => /per-trade limit/.test(n))).toBe(true);
    expect(tiny.tables.protocol_exits[0].add_claimed_at).toBeNull();
  });

  it("waits while the market hasn't crossed the trigger", async () => {
    sim.quote = Math.round((trigger().trigger - 0.2) * 100) / 100;
    const { client, tables } = seed();
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.placed).toBe(0);
    expect(tables.protocol_exits).toHaveLength(1);
    expect(tables.protocol_exits[0].add_claimed_at).toBeNull();
  });

  it("adds nothing to a person's own trade, a line with a target tranche, or a member with the manager off", async () => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    for (const over of [
      { order: { source_plan_id: null } },
      { order: { intraday_sourced: true } },
      { line: { scale_out_qty: 60, runner_qty: 40 } },
      { profile: null },
    ]) {
      const { client, tables } = seed(over as Parameters<typeof seed>[0]);
      const run = await placeAutomatedPyramidAdds(client, market(), NOW);
      expect(run.placed).toBe(0);
      expect(tables.protocol_exits).toHaveLength(1);
    }
  });

  it("leaves a line with a live claim alone, and takes over a stale one", async () => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    const fresh = seed({ line: { add_claimed_at: new Date(NOW.getTime() - 60_000).toISOString() } });
    expect((await placeAutomatedPyramidAdds(fresh.client, market(), NOW)).placed).toBe(0);
    const stale = seed({ line: { add_claimed_at: new Date(NOW.getTime() - 60 * 60_000).toISOString() } });
    expect((await placeAutomatedPyramidAdds(stale.client, market(), NOW)).placed).toBe(1);
  });

  it("adds nothing inside the away window or the rest window, nor when the settings can't be read", async () => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    // Away from 2026-06-17: the window opens three days before.
    const awayRun = seed();
    awayRun.tables.settings = [{ user_id: "u1", prefs: { gannRules: { awayFrom: "2026-06-17" } } }];
    expect((await placeAutomatedPyramidAdds(awayRun.client, market(), NOW)).placed).toBe(0);
    // The June rest window opens 06-21.
    const restRun = seed();
    expect((await placeAutomatedPyramidAdds(restRun.client, market(), new Date("2026-06-23T15:00:00Z"))).placed).toBe(0);
    expect(restRun.tables.protocol_exits).toHaveLength(1);
    // With the rest reminder switched off the same day, the add goes in.
    const offRun = seed();
    offRun.tables.settings = [{ user_id: "u1", prefs: { gannRules: { restReminder: false } } }];
    expect((await placeAutomatedPyramidAdds(offRun.client, market(), new Date("2026-06-23T15:00:00Z"))).placed).toBe(1);
  });

  it("adds nothing to a live line, or to a symbol carrying two working exits", async () => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    const live = seed({ line: { mode: "live" } });
    expect((await placeAutomatedPyramidAdds(live.client, market(), NOW)).placed).toBe(0);
    const two = seed();
    two.tables.protocol_exits.push({ ...two.tables.protocol_exits[0], id: "line-2", entry_order_id: "order-2" });
    two.tables.orders.push({ ...two.tables.orders[0], id: "order-2" });
    const run = await placeAutomatedPyramidAdds(two.client, market(), NOW);
    expect(run.placed).toBe(0);
    expect(two.tables.protocol_exits).toHaveLength(2);
  });

  it("never adds a long in a large capital stock (rule 21)", async () => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    const { client } = seed();
    const run = await placeAutomatedPyramidAdds(client, market({ sharesOutstanding: async () => 2_000_000_000 }), NOW);
    expect(run.placed).toBe(0);
  });

  it("is refused by placement's own rules like any entry, and releases its claim", async () => {
    // Gann's 30 points of capital a share (lib/risk/gannCapital.ts): a
    // thousand-dollar account can't carry 50 more shares at $115.
    vi.mocked(getOrCreateAccount).mockResolvedValueOnce({ cash: 1_000 } as Awaited<ReturnType<typeof getOrCreateAccount>>);
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
    const { client, tables } = seed();
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.placed).toBe(0);
    expect(run.notes.join(" ")).toMatch(/not placed/);
    expect(tables.protocol_exits).toHaveLength(1);
    expect(tables.protocol_exits[0].add_claimed_at).toBeNull();
    expect(tables.protocol_exits[0].qty).toBe(100);
  });

  it("adds the third lot, 30 shares, to a line already carrying two", async () => {
    // The second lot filled on June 14 at 111.2; the rise after it makes the
    // new top the third lot crosses.
    const daily = days([100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 111, 113, 116, 118, 117, 115, 114, 116, 119, 122]);
    const lots = [
      { qty: 100, price: 101.8, date: "2026-06-03" },
      { qty: 50, price: 111.2, date: "2026-06-14" },
    ];
    const reading = readPyramidAdd({ side: "long", lots, stop: 105, initialStop: 98.3, daily, price: 122, capitalStock: SMALL_CAP });
    expect(reading.add?.qty).toBe(30);
    sim.quote = Math.round((reading.add!.trigger + 0.1) * 100) / 100;
    const { client, tables } = seed({
      line: { qty: 150, runner_qty: 150, entry_price: (100 * 101.8 + 50 * 111.2) / 150, applied_stop: 105, lots },
    });
    // June 24 is inside Gann's rest window; this trader has the reminder off.
    tables.settings = [{ user_id: "u1", prefs: { gannRules: { restReminder: false } } }];
    const run = await placeAutomatedPyramidAdds(client, market({ daily: async () => daily }), new Date("2026-06-24T15:00:00Z"));
    expect(run.errors).toEqual([]);
    expect(run.placed).toBe(1);
    const line = tables.protocol_exits.find((r) => r.id === "line-1")!;
    expect(line.qty).toBe(180);
    expect((line.lots as unknown[]).length).toBe(3);
  });
});

describe("an add that races an exit pass", () => {
  // What another pass does at the moment placement writes the add's exit row.
  const race = (act: (addRow: Row, line: Row) => void) => (table: string, row: Row, tables: Record<string, Row[]>) => {
    if (table === "protocol_exits" && row.id !== "line-1") act(row, tables.protocol_exits.find((r) => r.id === "line-1")!);
  };
  beforeEach(() => {
    sim.quote = Math.round((trigger().trigger + 0.1) * 100) / 100;
  });

  it("leaves the add on its own row when an exit pass is already selling it", async () => {
    const { client, tables } = seed({}, race((addRow) => Object.assign(addRow, { runner_order_id: "sim_1" })));
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors.join(" ")).toMatch(/closed before it could join/);
    const line = tables.protocol_exits.find((r) => r.id === "line-1")!;
    expect(line.qty).toBe(100);
    expect(line.add_claimed_at).toBeNull();
    const addRow = tables.protocol_exits.find((r) => r.id !== "line-1")!;
    expect(addRow.status).toBe("working");
    expect(addRow.merged_into ?? null).toBeNull();
  });

  it("puts the add back on its own row and stop when the line changed before it could join", async () => {
    const { client, tables } = seed({}, race((_addRow, line) => Object.assign(line, { status: "closed" })));
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors.join(" ")).toMatch(/line changed/);
    const addRow = tables.protocol_exits.find((r) => r.id !== "line-1")!;
    expect(addRow.status).toBe("working");
    expect(addRow.merged_into).toBeNull();
    expect(addRow.closed_at).toBeNull();
    const line = tables.protocol_exits.find((r) => r.id === "line-1")!;
    expect(line.qty).toBe(100);
    expect(line.lots).toBeNull();
  });

  it("puts the add back when an exit pass starts selling the line before the join", async () => {
    const { client, tables } = seed({}, race((_addRow, line) => Object.assign(line, { runner_order_id: "sim_2" })));
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors.join(" ")).toMatch(/line changed/);
    const addRow = tables.protocol_exits.find((r) => r.id !== "line-1")!;
    expect(addRow.status).toBe("working");
    expect(tables.protocol_exits.find((r) => r.id === "line-1")!.qty).toBe(100);
  });

  it("never writes over a stop an exit pass trailed since the line was read", async () => {
    const { client, tables } = seed({}, race((_addRow, line) => Object.assign(line, { applied_stop: 112, applied_stop_reason: "trailing" })));
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors.join(" ")).toMatch(/line changed/);
    const line = tables.protocol_exits.find((r) => r.id === "line-1")!;
    expect(line.applied_stop).toBe(112);
    expect(line.qty).toBe(100);
    expect(tables.protocol_exits.find((r) => r.id !== "line-1")!.status).toBe("working");
  });

  it("says so when the add's own exit row can't be found", async () => {
    const { client, tables } = seed({}, race((addRow) => Object.assign(addRow, { entry_order_id: "someone-else" })));
    const run = await placeAutomatedPyramidAdds(client, market(), NOW);
    expect(run.errors.join(" ")).toMatch(/exit row wasn't found/);
    expect(tables.protocol_exits.find((r) => r.id === "line-1")!.add_claimed_at).toBeNull();
  });
});

describe("the merged line", () => {
  it("reads a row with no lots as one lot", () => {
    expect(lineLots({ qty: 10, entry_price: 50, created_at: "2026-06-03T14:00:00Z", lots: null })).toEqual([
      { qty: 10, price: 50, date: "2026-06-03" },
    ]);
  });

  it("measures the 5 points from the add's own fill when the server filled past the pass's quote", () => {
    // The order's stop was measured from a quote of 119; the fill came at 121.
    const orderStop = 119 - 5 * pricePoint(119);
    const m = mergedLine(
      { side: "long", qty: 100, entry_price: 100, applied_stop: 97, stop_loss: 97, created_at: "2026-06-03T14:00:00Z", lots: null },
      { qty: 50, price: 121, date: "2026-06-10", stop: orderStop },
    );
    expect(m.stop).toBeCloseTo(121 - 5 * pricePoint(121), 9);
    expect(m.stop).toBeGreaterThan(orderStop);
  });

  it("never loosens the stop, and mirrors for a short", () => {
    const long = mergedLine(
      { side: "long", qty: 100, entry_price: 100, applied_stop: 112, stop_loss: 97, created_at: "2026-06-03T14:00:00Z", lots: null },
      { qty: 50, price: 115, date: "2026-06-10", stop: 110 },
    );
    expect(long.stop).toBe(112);
    expect(long.raised).toBe(false);
    const short = mergedLine(
      { side: "short", qty: 100, entry_price: 100, applied_stop: 103, stop_loss: 103, created_at: "2026-06-03T14:00:00Z", lots: null },
      { qty: 50, price: 90, date: "2026-06-10", stop: 95 },
    );
    // Break-even is 96.67 to the cent down; the add's stop 95 is tighter.
    expect(short.stop).toBe(95);
    expect(short.raised).toBe(true);
    expect(short.qty).toBe(150);
    expect(short.entryPrice).toBeCloseTo(96.666667, 5);
  });
});
