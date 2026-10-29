import { describe, expect, it, vi, beforeEach } from "vitest";

const quotePrice = vi.fn();
const executeFill = vi.fn();

vi.mock("@/lib/brokers/simulator", () => ({
  quotePrice: (...args: unknown[]) => quotePrice(...args),
  executeFill: (...args: unknown[]) => executeFill(...args),
  assetClassOf: vi.fn(() => "us_equity"),
}));
// No Gann reading: the stop under test is the one already applied.
const readLiveRebuy = vi.fn();
const readLiveGannExit = vi.fn(async (...args: unknown[]) => (void args, null));
// No closed bar since the fill unless a test says so: the quote alone, as before.
const readLiveBestSinceFill = vi.fn(async (...args: unknown[]): Promise<number | null> => (void args, null));
vi.mock("@/lib/trade/gann-exit-live", () => ({
  readLiveGannExit: (...args: unknown[]) => readLiveGannExit(...args),
  readLiveRebuy: (...args: unknown[]) => readLiveRebuy(...args),
  readLiveBestSinceFill: (...args: unknown[]) => readLiveBestSinceFill(...args),
}));
vi.mock("@/lib/automation/stop-out", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation/stop-out")>()),
  handleAutomatedStopOut: vi.fn(async () => undefined),
}));

import { closeSimPlanForSymbol, manageSimulatedExits } from "@/lib/trade/exit-manager-sim";
import { handleAutomatedStopOut } from "@/lib/automation/stop-out";

/** The AMD position from the report: long 3 at 476.08, stop moved up by hand to 618. */
function amdPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-amd",
    symbol: "AMD",
    side: "long",
    qty: 3,
    entry_price: 476.08,
    stop_loss: 618,
    take_profit_1: 650,
    master_profit: 725,
    scale_out_qty: 2,
    master_qty: 1,
    runner_qty: 0,
    scale_out_order_id: null,
    master_order_id: null,
    runner_order_id: null,
    scale_out_fill_price: null,
    master_fill_price: null,
    runner_fill_price: null,
    entry_order_id: null,
    high_water: 640,
    applied_stop: 618,
    applied_stop_reason: "manual",
    status: "working",
    created_at: "2026-09-05T15:15:00.000Z",
    ...overrides,
  };
}

/** A chainable stand-in for the Supabase query builder. */
function stubSupabase(plan: Record<string, unknown>, sourcePlanId: string | null = null) {
  const updates: Record<string, unknown>[] = [];
  const inserts: { table: string; row: unknown }[] = [];
  const from = (table: string) => {
    let mode: "select" | "update" | "insert" = "select";
    const q: Record<string, unknown> = {};
    const self = () => q;
    Object.assign(q, {
      select: self,
      eq: self,
      is: self,
      limit: self,
      order: self,
      update: (patch: Record<string, unknown>) => {
        mode = "update";
        updates.push(patch);
        return q;
      },
      insert: (row: unknown) => {
        mode = "insert";
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
      maybeSingle: () =>
        Promise.resolve({
          data:
            mode === "update"
              ? { id: plan.id }
              : table === "protocol_exits"
                ? plan
                : table === "orders" && sourcePlanId
                  ? { source_plan_id: sourcePlanId }
                  : null,
        }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(mode === "select" && table === "protocol_exits" ? { data: [plan], error: null } : { data: null, error: null }),
    });
    return q;
  };
  return { client: { from } as never, updates, inserts };
}

describe("manageSimulatedExits — a stop already applied", () => {
  beforeEach(() => {
    quotePrice.mockReset();
    executeFill.mockReset();
    readLiveRebuy.mockReset().mockResolvedValue(null);
    readLiveGannExit.mockClear();
    readLiveBestSinceFill.mockReset().mockResolvedValue(null);
  });

  it("reads the exit rules on the best bar since the fill, not only the quote (2026-10-29)", async () => {
    // The quote is 625, but a 15-minute bar since the fill reached 645: the
    // replay's best price, so break-even and the trails read 645, and the
    // row's high-water mark keeps it.
    quotePrice.mockResolvedValue(625);
    readLiveBestSinceFill.mockResolvedValue(645);
    const { client, updates } = stubSupabase(amdPlan({ high_water: 630 }));

    const run = await manageSimulatedExits(client, "user-1");

    expect(run.closed).toBe(0);
    expect(readLiveBestSinceFill).toHaveBeenCalledWith(expect.objectContaining({ symbol: "AMD", side: "long", openedAt: "2026-09-05T15:15:00.000Z" }));
    expect(readLiveGannExit).toHaveBeenCalledWith(expect.objectContaining({ best: 645 }));
    expect(updates.some((u) => u.high_water === 645)).toBe(true);
  });

  it("never lowers the high-water mark on a bar read below it", async () => {
    quotePrice.mockResolvedValue(625);
    readLiveBestSinceFill.mockResolvedValue(620);
    const { client } = stubSupabase(amdPlan({ high_water: 640 }));

    await manageSimulatedExits(client, "user-1");

    expect(readLiveGannExit).toHaveBeenCalledWith(expect.objectContaining({ best: 640 }));
  });

  it("closes a long once price trades below a manual stop that hasn't moved", async () => {
    quotePrice.mockResolvedValue(601.6);
    const { client, inserts } = stubSupabase(amdPlan());

    const run = await manageSimulatedExits(client, "user-1");

    expect(run.error).toBeNull();
    expect(run.closed).toBe(1);
    // Both open tranches sell at the market price seen, as a triggered stop-market would.
    expect(executeFill).toHaveBeenCalledTimes(2);
    for (const [, , fill] of executeFill.mock.calls) {
      expect(fill).toMatchObject({ symbol: "AMD", side: "sell", price: 601.6 });
    }
    const log = inserts.find((i) => i.table === "trade_logs")?.row as Record<string, unknown>;
    expect(log).toMatchObject({ exit_condition: "stop_loss", quantity: 3, exit_price: 601.6 });
    // A person placed this trade, so the reversal is offered, not placed (Q15).
    // It enters at the stop that broke (618), not the quote that gapped through it.
    expect(run.notes.some((n) => n.includes("reverse") && n.includes("sell short at 618.00") && n.includes("Nothing was placed"))).toBe(true);
    expect(run.notes.some((n) => n.includes("sell short at 601.60"))).toBe(false);
  });

  it("reverses at the stop, not the blend with TP1 (2026-10-21)", async () => {
    quotePrice.mockResolvedValue(601.6);
    // 2 shares already out at TP1 (650); the last share is stopped at the market.
    const { client, inserts } = stubSupabase(amdPlan({ scale_out_order_id: "sim-tp1", scale_out_fill_price: 650 }));

    const run = await manageSimulatedExits(client, "user-1");

    const log = inserts.find((i) => i.table === "trade_logs")?.row as Record<string, unknown>;
    // The trade log keeps the blended price for P&L: (2 × 650 + 601.6) / 3.
    expect(log.exit_price as number).toBeCloseTo((2 * 650 + 601.6) / 3, 6);
    expect(run.notes.some((n) => n.includes("sell short at 618.00"))).toBe(true);
    expect(run.notes.some((n) => n.includes("sell short at 633.87"))).toBe(false);
  });

  it("reverses an automated trade at the stop when the quote gaps through it", async () => {
    // Stop 618; the quote opens at 590, well through it. The fill is at the
    // market, as a triggered stop-market's would be, but the reversal enters at
    // the stop, as the replay and the broker exit manager do.
    quotePrice.mockResolvedValue(590);
    const { client } = stubSupabase(amdPlan({ entry_order_id: "ord-1" }), "tp-1");
    const stopOut = vi.mocked((await import("@/lib/automation/stop-out")).handleAutomatedStopOut);
    stopOut.mockClear();

    await manageSimulatedExits(client, "user-1");

    for (const [, , fill] of executeFill.mock.calls) expect(fill).toMatchObject({ price: 590 });
    expect(stopOut).toHaveBeenCalledTimes(1);
    expect(stopOut.mock.calls[0][2]).toMatchObject({ planId: "tp-1", cause: "stop", brokenLevel: 618, exitPrice: 590 });
  });

  it("offers to buy again on the reaction when the trend still runs up (A-PYRAMID-07)", async () => {
    quotePrice.mockResolvedValue(601.6);
    readLiveRebuy.mockResolvedValue({ side: "long", entry: 590, stop: 580, extreme: 620 });
    const { client } = stubSupabase(amdPlan());

    const run = await manageSimulatedExits(client, "user-1");

    expect(readLiveRebuy).toHaveBeenCalledWith(expect.objectContaining({ symbol: "AMD", side: "long", cause: "stop" }));
    expect(run.notes.some((n) => n.includes("buy again") && n.includes("590.00") && n.includes("580.00"))).toBe(true);
  });

  it("leaves the position alone while price holds above the stop", async () => {
    quotePrice.mockResolvedValue(625);
    const { client } = stubSupabase(amdPlan());

    const run = await manageSimulatedExits(client, "user-1");

    expect(run.closed).toBe(0);
    expect(executeFill).not.toHaveBeenCalled();
  });

  it("closes a short once price trades above its applied stop", async () => {
    quotePrice.mockResolvedValue(112);
    const { client } = stubSupabase(
      amdPlan({
        symbol: "XYZ",
        side: "short",
        entry_price: 120,
        stop_loss: 110,
        take_profit_1: 90,
        master_profit: 80,
        high_water: 95,
        applied_stop: 110,
      }),
    );

    const run = await manageSimulatedExits(client, "user-1");

    expect(run.closed).toBe(1);
    for (const [, , fill] of executeFill.mock.calls) {
      expect(fill).toMatchObject({ side: "buy", price: 112 });
    }
  });
});

describe("a close by hand (review finding R-009)", () => {
  beforeEach(() => {
    vi.mocked(handleAutomatedStopOut).mockClear();
    readLiveRebuy.mockReset().mockResolvedValue(null);
  });

  it("logs a manual close as manual, even after the stop has trailed, and reverses nothing", async () => {
    const { client, inserts } = stubSupabase(amdPlan({ applied_stop_reason: "trailing", entry_order_id: "order-1" }));
    await closeSimPlanForSymbol(client, "user-1", "AMD", 630);
    const log = inserts.find((i) => i.table === "trade_logs")?.row as Record<string, unknown>;
    expect(log).toMatchObject({ exit_condition: "manual", exit_price: 630 });
    expect(handleAutomatedStopOut).not.toHaveBeenCalled();
    expect(readLiveRebuy).not.toHaveBeenCalled();
  });
});

describe("a stop the price has already passed (review finding R-010)", () => {
  it("fills at the market seen, not at the stop", async () => {
    // No stop rests yet; the plan's stop is 600 and the first quote is 590.
    // Every share leaves at 590, where the market is (it used to fill at 600).
    quotePrice.mockReset().mockResolvedValue(590);
    executeFill.mockReset();
    const { client } = stubSupabase(amdPlan({ applied_stop: null, applied_stop_reason: null, stop_loss: 600 }));
    const run = await manageSimulatedExits(client, "user-1");
    expect(run.closed).toBe(1);
    for (const [, , fill] of executeFill.mock.calls) expect(fill).toMatchObject({ price: 590 });
  });
});

describe("a line pyramided by automation (lib/automation/pyramid-adds.ts)", () => {
  // 100 at 101.8, then 50 at 115.88: one row, the whole quantity, the blended
  // cost, the stop raised to break-even or better by the add.
  const lots = [
    { qty: 100, price: 101.8, date: "2026-06-03" },
    { qty: 50, price: 115.88, date: "2026-06-15" },
  ];
  const blended = (100 * 101.8 + 50 * 115.88) / 150;
  const line = (overrides: Record<string, unknown> = {}) =>
    amdPlan({
      symbol: "AAPL",
      qty: 150,
      entry_price: blended,
      stop_loss: 98.3,
      take_profit_1: 140,
      master_profit: null,
      scale_out_qty: 0,
      master_qty: 0,
      runner_qty: 150,
      high_water: 118,
      applied_stop: 107,
      applied_stop_reason: "break_even",
      entry_order_id: "ord-1",
      lots,
      ...overrides,
    });

  beforeEach(() => {
    quotePrice.mockReset();
    executeFill.mockReset();
    readLiveRebuy.mockReset().mockResolvedValue(null);
    vi.mocked(handleAutomatedStopOut).mockClear();
  });

  it("sells the whole line at the stop, logs it at the blended cost, and hands the stop-out the first lot's entry", async () => {
    quotePrice.mockResolvedValue(106.5);
    const { client, inserts } = stubSupabase(line(), "tp-1");
    const run = await manageSimulatedExits(client, "user-1");
    expect(run.closed).toBe(1);
    expect(executeFill).toHaveBeenCalledTimes(1);
    expect(executeFill.mock.calls[0][2]).toMatchObject({ side: "sell", qty: 150, price: 106.5 });
    const log = inserts.find((i) => i.table === "trade_logs")?.row as Record<string, unknown>;
    expect(log).toMatchObject({ exit_condition: "stop_loss", quantity: 150 });
    expect(log.entry_price as number).toBeCloseTo(blended, 6);
    expect(log.profit_loss_dollars as number).toBeCloseTo(Math.round((106.5 - blended) * 150 * 100) / 100, 2);
    expect(vi.mocked(handleAutomatedStopOut).mock.calls[0][2]).toMatchObject({ entryFillPrice: 101.8, brokenLevel: 107 });
  });

  it("claims only the line it read, so an add that joined since makes this pass lose", async () => {
    quotePrice.mockResolvedValue(106.5);
    const eqs: [string, unknown][] = [];
    const { client } = stubSupabase(line());
    const from = (client as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (client as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = from(t);
      const eq = q.eq as (c: string, v: unknown) => unknown;
      q.eq = (c: string, v: unknown) => (eqs.push([c, v]), eq(c, v));
      return q;
    };
    await manageSimulatedExits(client, "user-1");
    expect(eqs).toContainEqual(["qty", 150]);
  });

  it("reads the exit rules from the first lot, as the replay does", async () => {
    quotePrice.mockResolvedValue(117);
    const gannExit = readLiveGannExit;
    gannExit.mockClear();
    const { client } = stubSupabase(line());
    await manageSimulatedExits(client, "user-1");
    expect(gannExit).toHaveBeenCalledWith(expect.objectContaining({ entryPrice: 101.8, initialStop: 98.3 }));
  });
});
