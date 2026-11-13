import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const alpaca = vi.hoisted(() => ({
  cancelOrder: vi.fn(async () => null),
  closePosition: vi.fn(),
  getOpenOrdersNested: vi.fn(async () => [] as unknown[]),
  getOrder: vi.fn(),
  listOptionContracts: vi.fn(async () => [] as unknown[]),
  listOrders: vi.fn(async () => [] as unknown[]),
  placeOrder: vi.fn(),
}));
vi.mock("@/lib/brokers/alpaca", () => alpaca);
const data = vi.hoisted(() => ({
  fetchMovers: vi.fn(),
  fetchDayRanges: vi.fn(async () => new Map()),
  fetchOptionSnapshots: vi.fn(async () => ({})),
}));
vi.mock("@/lib/data/alpaca", () => data);

import { chooseLiveContract } from "@/lib/brokers/live-options";
import {
  OPTION_PLAN,
  lossStreakDate,
  nextWeekday,
  optionPlanPass,
  planEntryHold,
  planExit,
  planSpreadLimit,
  planTakeProfit,
  planTradeId,
  type PlanStockLine,
} from "@/lib/brokers/option-plan";

const quote = (ap: number, bp: number, delta?: number) => ({ latestQuote: { ap, bp }, ...(delta != null ? { greeks: { delta } } : {}) });
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("the plan's contract filter", () => {
  const q = { underlying: "AAA", type: "call" as const, underlyingPrice: 50, budget: 10, today: "2026-11-16", minDays: 7, maxDays: 45, maxSpreadFrac: 0.2, minOpenInterest: 100 };
  const oi = new Map([["AAA261127C00055000", 500], ["AAA261127C00056000", 500], ["AAA261120C00054000", 900]]);

  it("takes only a spread within 20% of the ask, open interest of 100, at least 7 days out", () => {
    const chain = {
      AAA261127C00055000: quote(0.09, 0.05, 0.2), // spread 44%: refused
      AAA261127C00056000: quote(0.08, 0.07, 0.15), // spread 12.5%: taken
      AAA261127C00057000: quote(0.07, 0.065, 0.14), // no open interest read: refused
      AAA261120C00054000: quote(0.09, 0.08, 0.3), // 4 days out: refused
    };
    expect(chooseLiveContract(chain, { ...q, openInterest: oi })).toMatchObject({ symbol: "AAA261127C00056000" });
  });

  it("aims the strike at the setup's TP1 when it lies on the trade's side", () => {
    const chain = {
      AAA261127C00051000: quote(0.09, 0.08, 0.45),
      AAA261127C00055000: quote(0.06, 0.05, 0.2),
      AAA261127C00060000: quote(0.03, 0.025, 0.08),
    };
    const all = new Map(Object.keys(chain).map((k) => [k, 500]));
    expect(chooseLiveContract(chain, { ...q, openInterest: all, strikeTarget: 54 })).toMatchObject({ symbol: "AAA261127C00055000" });
    expect(chooseLiveContract(chain, { ...q, openInterest: all, strikeTarget: 61 })).toMatchObject({ symbol: "AAA261127C00060000" });
    // A target on the wrong side of the price is ignored: closest to the money.
    expect(chooseLiveContract(chain, { ...q, openInterest: all, strikeTarget: 45 })).toMatchObject({ symbol: "AAA261127C00051000" });
    expect(chooseLiveContract(chain, { ...q, openInterest: all, strikeTarget: null })).toMatchObject({ symbol: "AAA261127C00051000" });
  });

  it("says no trade when nothing qualifies", () => {
    const r = chooseLiveContract({ AAA261127C00055000: quote(0.09, 0.05, 0.2) }, { ...q, openInterest: oi });
    expect(r).toEqual({ reason: expect.stringMatching(/spread within 20% of the ask and open interest of 100 or more/) });
  });
});

describe("the plan's exits", () => {
  const stock = { side: "long" as const, price: 52, stop: 48, tp1: 56 };
  const base = { avgEntry: 0.1, current: 0.12, armed: false, stock, toClose: 300, weekday: 2 };

  it("sells on the stock's stop, the app's close, half the cost, break-even once armed, the stock's TP1, and Friday's close", () => {
    expect(planExit(base)).toBeNull();
    expect(planExit({ ...base, stock: null })).toBe("trade_closed");
    expect(planExit({ ...base, stock: { ...stock, price: 48 } })).toBe("stock_stop");
    expect(planExit({ ...base, stock: { ...stock, side: "short", stop: 53, tp1: 47 } })).toBeNull();
    expect(planExit({ ...base, stock: { ...stock, side: "short", price: 53.5, stop: 53, tp1: 47 } })).toBe("stock_stop");
    expect(planExit({ ...base, current: 0.05 })).toBe("cut");
    expect(planExit({ ...base, current: 0.1 })).toBeNull();
    expect(planExit({ ...base, current: 0.1, armed: true })).toBe("break_even");
    expect(planExit({ ...base, stock: { ...stock, price: 56.1 } })).toBe("tp1");
    expect(planExit({ ...base, weekday: 5, toClose: 51 })).toBe("close_out");
    expect(planExit({ ...base, weekday: 4, toClose: 21 })).toBeNull(); // Mon to Thu: held overnight
    expect(planExit({ ...base, stock: { ...stock, price: Number.NaN } })).toBeNull(); // no stock price: nothing read from it
  });

  it("rests the take-profit at double the cost", () => {
    expect(planTakeProfit(0.08)).toEqual({ fine: 0.16, coarse: 0.2 });
    expect(planTakeProfit(1.5)).toEqual({ fine: 3, coarse: 3 });
  });

  it("reads the trade id from its orders", () => {
    expect(planTradeId(`gsps-plan-${ID}-1763300000000`)).toBe(ID);
    expect(planTradeId(`gsps-plan-tp-${ID}-1763300000000-c`)).toBe(ID);
    expect(planTradeId(`gsps-momo-${ID}`)).toBeNull();
  });
});

describe("the plan's brakes", () => {
  const g = {
    minutes: 11 * 60, toClose: 300, weekday: 1, today: "2026-11-16", marketOpen: true, halted: false, equity: 30, lastEquity: 30,
    openContracts: 0, dayTradesFree: 3, lossStreakDate: null as string | null,
  };

  it("enters Monday to Thursday only, never on the holiday window", () => {
    expect(planEntryHold(g)).toBeNull();
    expect(planEntryHold({ ...g, weekday: 5 })).toMatch(/Monday to Thursday/);
    expect(planEntryHold({ ...g, weekday: 3, today: "2026-11-25" })).toMatch(/2026-11-25/);
    expect(planEntryHold({ ...g, toClose: 10 })).toMatch(/close/);
  });

  it("two open at most, one under $20, none under $15 or down 10% on the day", () => {
    expect(planEntryHold({ ...g, openContracts: 1 })).toBeNull();
    expect(planEntryHold({ ...g, openContracts: 2 })).toMatch(/2 trades already open/);
    expect(planEntryHold({ ...g, equity: 19, lastEquity: 19, openContracts: 1 })).toMatch(/1 trade already open \(under \$20\)/);
    expect(planEntryHold({ ...g, equity: 14, lastEquity: 14 })).toMatch(/\$15 floor/);
    expect(planEntryHold({ ...g, equity: 26 })).toMatch(/down 10%/);
  });

  it("keeps a day trade in reserve", () => {
    expect(planEntryHold({ ...g, dayTradesFree: 1 })).toBeNull();
    expect(planEntryHold({ ...g, dayTradesFree: 0 })).toMatch(/reserve/);
  });

  it("sits out the day of a second loss in a row and the trading day after", () => {
    expect(nextWeekday("2026-11-13")).toBe("2026-11-16");
    expect(planEntryHold({ ...g, lossStreakDate: "2026-11-13" })).toMatch(/2 losses in a row/);
    expect(planEntryHold({ ...g, today: "2026-11-17", weekday: 2, lossStreakDate: "2026-11-13" })).toBeNull();
  });

  it("counts losses from the plan's own filled orders, newest first", () => {
    const buy = (sym: string, p: string, at: string) => ({ id: `b${sym}`, side: "buy", symbol: sym, client_order_id: `gsps-plan-${ID}-1`, filled_qty: "1", filled_avg_price: p, filled_at: at });
    const sell = (sym: string, p: string, at: string) => ({ id: `s${sym}`, side: "sell", symbol: sym, filled_qty: "1", filled_avg_price: p, filled_at: at });
    const a = [buy("A", "0.10", "2026-11-16T15:00:00Z"), sell("A", "0.05", "2026-11-17T15:00:00Z")];
    const b = [buy("B", "0.10", "2026-11-17T16:00:00Z"), sell("B", "0.08", "2026-11-18T15:00:00Z")];
    const c = [buy("C", "0.10", "2026-11-12T16:00:00Z"), sell("C", "0.20", "2026-11-13T15:00:00Z")];
    expect(lossStreakDate([...a, ...b, ...c] as never, new Set())).toBe("2026-11-18");
    const win = [buy("D", "0.10", "2026-11-18T16:00:00Z"), sell("D", "0.20", "2026-11-18T19:00:00Z")];
    expect(lossStreakDate([...a, ...b, ...win] as never, new Set())).toBeNull();
    // A contract still held is no closed trade.
    expect(lossStreakDate([...a, ...b] as never, new Set(["B"]))).toBeNull();
  });
});

describe("optionPlanPass", () => {
  const events: Record<string, unknown>[] = [];
  let armedRows: { position_id: string }[] = [];
  const supabase = {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: armedRows, error: null }).then(res);
      b.insert = async (row: Record<string, unknown>) => (events.push(row), { error: null });
      return b;
    },
  } as unknown as SupabaseClient;
  const creds = { key: "k", secret: "s", mode: "live" as const };
  const account = { equity: "30", last_equity: "30", cash: "30", buying_power: "30", currency: "USD", daytrade_count: 0 };
  const MON_11 = Date.parse("2026-11-16T16:00:00Z");
  const FRI_1540 = Date.parse("2026-11-20T20:39:00Z");
  const OPEN = { isOpen: true, nextClose: Date.parse("2026-11-16T21:00:00Z") };
  const line = (o: Partial<PlanStockLine> = {}): PlanStockLine => ({
    positionId: ID, symbol: "RUN", side: "long", stop: 18, tp1: 24, openedAt: new Date(MON_11 - 20 * 60_000).toISOString(), automated: true, score: 8, ...o,
  });
  const CALL = "RUN261127C00022000";

  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    armedRows = [];
    alpaca.listOrders.mockResolvedValue([]);
    alpaca.getOpenOrdersNested.mockResolvedValue([]);
    alpaca.listOptionContracts.mockResolvedValue([{ symbol: CALL, open_interest: "350" }]);
    data.fetchDayRanges.mockResolvedValue(new Map([["RUN", { price: 20, high: 21, low: 19 }]]));
    data.fetchOptionSnapshots.mockResolvedValue({ [CALL]: quote(0.09, 0.08, 0.2) });
  });

  it("carries the app's Execute-grade trade as a call and rests a +50% take-profit while the account is small", async () => {
    alpaca.placeOrder.mockResolvedValueOnce({ id: "b1", status: "accepted" }).mockResolvedValueOnce({ id: "t1", status: "new" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "filled", filled_qty: "1", filled_avg_price: "0.09" });
    const r = await optionPlanPass(supabase, creds, account, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(r.errors).toEqual([]);
    expect(alpaca.placeOrder).toHaveBeenNthCalledWith(1, creds, expect.objectContaining({ symbol: CALL, side: "buy", qty: 1, type: "limit", limitPrice: 0.1, clientOrderId: `gsps-plan-${ID}-${MON_11}` }));
    expect(alpaca.placeOrder).toHaveBeenNthCalledWith(2, creds, expect.objectContaining({ symbol: CALL, side: "sell", qty: 1, limitPrice: 0.14 }));
    expect(String(events[1].note)).toMatch(/\+50%/);
    expect(events.map((e) => e.action)).toEqual(["plan_open", "plan_take_profit"]);
    expect(events[0]).toMatchObject({ position_id: ID, mode: "live", stop_price: 18 });
  });

  it("follows nothing under Execute grade, nothing by hand, nothing over an hour old, and nothing already carried", async () => {
    const lines = [
      line({ score: 6 }),
      line({ positionId: ID2, automated: false }),
      line({ positionId: "33333333-3333-4333-8333-333333333333", openedAt: new Date(MON_11 - 2 * 3600_000).toISOString() }),
    ];
    const r = await optionPlanPass(supabase, creds, account, [], OPEN, lines, new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/no Execute-grade trade/);
    alpaca.listOrders.mockResolvedValue([{ id: "b0", side: "buy", symbol: CALL, client_order_id: `gsps-plan-${ID}-1`, filled_qty: "1", filled_avg_price: "0.09", filled_at: "2026-11-16T15:30:00Z" }]);
    await optionPlanPass(supabase, creds, account, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
  });

  it("takes a spread up to half the ask while the budget is under $200 (owner's choice), 20% above it", async () => {
    expect(planSpreadLimit(10)).toBe(0.5);
    expect(planSpreadLimit(199.99)).toBe(0.5);
    expect(planSpreadLimit(200)).toBe(0.2);
    data.fetchOptionSnapshots.mockResolvedValue({ [CALL]: quote(0.1, 0.06, 0.2) }); // 40% wide
    alpaca.placeOrder.mockResolvedValue({ id: "b1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "canceled", filled_qty: "0" });
    await optionPlanPass(supabase, creds, account, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(creds, expect.objectContaining({ symbol: CALL, side: "buy" }));
    alpaca.placeOrder.mockClear();
    const big = { ...account, equity: "3000", last_equity: "3000", cash: "3000" };
    await optionPlanPass(supabase, creds, big, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
  });

  it("buys no contract that fails the filter", async () => {
    alpaca.listOptionContracts.mockResolvedValue([{ symbol: CALL, open_interest: "40" }]);
    const r = await optionPlanPass(supabase, creds, account, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/open interest of 100/);
  });

  it("buys a put for a short", async () => {
    const PUT = "RUN261127P00018000";
    alpaca.listOptionContracts.mockResolvedValue([{ symbol: PUT, open_interest: "350" }]);
    data.fetchOptionSnapshots.mockResolvedValue({ [PUT]: quote(0.09, 0.08, -0.2) });
    alpaca.placeOrder.mockResolvedValue({ id: "b1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "canceled", filled_qty: "0" });
    await optionPlanPass(supabase, creds, account, [], OPEN, [line({ side: "short", stop: 22, tp1: 16 })], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).toHaveBeenCalledWith(creds, expect.objectContaining({ symbol: PUT, side: "buy" }));
  });

  const held = (o: Record<string, string> = {}) => ({ symbol: CALL, qty: "1", side: "long", avg_entry_price: "0.10", current_price: "0.12", asset_class: "us_option", ...o });
  const bought = (at: string) => [{ id: "b0", side: "buy", symbol: CALL, client_order_id: `gsps-plan-${ID}-1`, filled_qty: "1", filled_avg_price: "0.10", filled_at: at }];

  it("sells when the stock breaks the stop, cancelling the take-profit first", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-13T15:00:00Z"));
    alpaca.getOpenOrdersNested.mockResolvedValue([{ id: "t1", symbol: CALL, side: "sell" }]);
    data.fetchDayRanges.mockResolvedValue(new Map([["RUN", { price: 17.9, high: 21, low: 17.8 }]]));
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) => (id === "t1" ? { id, status: "canceled" } : { id, status: "filled", filled_qty: "1", filled_avg_price: "0.06" }));
    await optionPlanPass(supabase, creds, account, [held() as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.cancelOrder).toHaveBeenCalledWith(creds, "t1");
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
    expect(events[0]).toMatchObject({ action: "plan_close", position_id: ID, status: "filled" });
    expect(String(events[0].note)).toMatch(/broke the trade's stop/);
  });

  it("sells when the app closes the stock trade", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-13T15:00:00Z"));
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "x1", status: "filled", filled_qty: "1", filled_avg_price: "0.11" });
    await optionPlanPass(supabase, creds, account, [held() as never], OPEN, [], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
  });

  it("arms break-even at +50%, then sells back at the cost", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-13T15:00:00Z"));
    alpaca.getOpenOrdersNested.mockResolvedValue([{ id: "t1", symbol: CALL, side: "sell" }]);
    await optionPlanPass(supabase, creds, account, [held({ current_price: "0.15" }) as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(events[0]).toMatchObject({ action: "plan_breakeven_armed", position_id: ID, stop_price: 0.1 });
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    events.length = 0;
    armedRows = [{ position_id: ID }];
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockImplementation(async (_c: unknown, id: string) => (id === "t1" ? { id, status: "canceled" } : { id, status: "filled", filled_qty: "1", filled_avg_price: "0.10" }));
    await optionPlanPass(supabase, creds, account, [held({ current_price: "0.10" }) as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
    expect(String(events[0].note)).toMatch(/break-even/);
  });

  it("an emergency same-day exit may take the reserved day trade; a same-day take-profit may not", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-16T15:00:00Z"));
    const twoUsed = { ...account, daytrade_count: 2 };
    // Up 20% on the day it was bought, one day trade left: no take-profit rests.
    await optionPlanPass(supabase, creds, twoUsed, [held() as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    // Worth half its cost: the reserve is spent on the cut.
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "x1", status: "filled", filled_qty: "1", filled_avg_price: "0.05" });
    await optionPlanPass(supabase, creds, twoUsed, [held({ current_price: "0.05" }) as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
    // With none left, it is held to the next session.
    alpaca.closePosition.mockClear();
    const r = await optionPlanPass(supabase, creds, { ...account, daytrade_count: 3 }, [held({ current_price: "0.05" }) as never], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/held to the next session/);
  });

  it("a cut that is the second loss in a row buys nothing the same run", async () => {
    const PRIOR = "RUN261127C00030000";
    alpaca.listOrders.mockResolvedValue([
      { id: "p0", side: "buy", symbol: PRIOR, client_order_id: `gsps-plan-${ID2}-1`, filled_qty: "1", filled_avg_price: "0.10", filled_at: "2026-11-12T15:00:00Z" },
      { id: "p1", side: "sell", symbol: PRIOR, filled_qty: "1", filled_avg_price: "0.04", filled_at: "2026-11-13T15:00:00Z" },
      ...bought("2026-11-13T16:00:00Z"),
    ]);
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "x1", status: "filled", filled_qty: "1", filled_avg_price: "0.05" });
    const fresh = line({ positionId: "44444444-4444-4444-8444-444444444444", symbol: "NEW" });
    const r = await optionPlanPass(supabase, creds, account, [held({ current_price: "0.05" }) as never], OPEN, [line(), fresh], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/sold this run/);
  });

  it("keeps a day trade for each contract bought today before another entry", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-16T15:00:00Z"));
    const fresh = line({ positionId: "44444444-4444-4444-8444-444444444444", symbol: "NEW" });
    const r = await optionPlanPass(supabase, creds, { ...account, daytrade_count: 2 }, [held() as never], OPEN, [line(), fresh], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/reserve/);
  });

  it("a paper same-day test day enters on a Friday and sells before the close; live keeps its rules", async () => {
    const FRI_11 = Date.parse("2026-11-13T16:00:00Z");
    const fri = { isOpen: true, nextClose: Date.parse("2026-11-13T21:00:00Z") };
    alpaca.placeOrder.mockResolvedValue({ id: "b1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "canceled", filled_qty: "0" });
    const fresh = line({ openedAt: new Date(FRI_11).toISOString() });
    const live = await optionPlanPass(supabase, creds, account, [], fri, [fresh], new Set(), Date.now() + 30_000, FRI_11);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(live.held.join(" ")).toMatch(/Monday to Thursday/);
    await optionPlanPass(supabase, creds, account, [], fri, [fresh], new Set(), Date.now() + 30_000, FRI_11, { mode: "paper", fixedBudget: 500 });
    expect(alpaca.placeOrder).toHaveBeenCalledWith(creds, expect.objectContaining({ symbol: CALL, side: "buy" }));
    // No entry in the last hour of a test day.
    alpaca.placeOrder.mockClear();
    const late = await optionPlanPass(supabase, creds, account, [], fri, [line({ openedAt: new Date(FRI_11 + 4 * 3600_000).toISOString() })], new Set(), Date.now() + 30_000, FRI_11 + 4.5 * 3600_000, { mode: "paper", fixedBudget: 500 });
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(late.held.join(" ")).toMatch(/last hour/);
    expect(planExit({ avgEntry: 0.1, current: 0.12, armed: false, stock: { side: "long", price: 20, stop: 18, tp1: 24 }, toClose: 50, weekday: 3, sameDay: true })).toBe("close_out");
    expect(planExit({ avgEntry: 0.1, current: 0.12, armed: false, stock: { side: "long", price: 20, stop: 18, tp1: 24 }, toClose: 50, weekday: 3 })).toBeNull();
  });

  it("is flat by Friday's close and buys nothing on a Friday", async () => {
    alpaca.listOrders.mockResolvedValue(bought("2026-11-18T15:00:00Z"));
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "x1", status: "filled", filled_qty: "1", filled_avg_price: "0.12" });
    const fri = { isOpen: true, nextClose: Date.parse("2026-11-20T21:00:00Z") };
    const r = await optionPlanPass(supabase, creds, account, [held() as never], fri, [line({ positionId: ID2, openedAt: new Date(FRI_1540 - 600_000).toISOString() }), line()], new Set(), Date.now() + 30_000, FRI_1540);
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, CALL);
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(r.held.join(" ")).toMatch(/sold this run/);
  });

  it("never touches an option it didn't buy, or a mirror symbol; does nothing with the market closed", async () => {
    alpaca.listOrders.mockResolvedValue([{ ...bought("2026-11-13T15:00:00Z")[0], client_order_id: `gsps-momo-${ID}` }]);
    await optionPlanPass(supabase, creds, account, [held({ current_price: "0.01" }) as never], OPEN, [], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    alpaca.listOrders.mockResolvedValue(bought("2026-11-13T15:00:00Z"));
    await optionPlanPass(supabase, creds, account, [held({ current_price: "0.01" }) as never], OPEN, [], new Set([CALL]), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    const r = await optionPlanPass(supabase, creds, account, [held({ current_price: "0.01" }) as never], { isOpen: false, nextClose: Number.NaN }, [], new Set(), Date.now() + 30_000, MON_11);
    expect(r.placed).toBe(0);
    expect(alpaca.listOrders).toHaveBeenCalledTimes(2);
  });

  it("paper practices at the live size", async () => {
    alpaca.placeOrder.mockResolvedValue({ id: "b1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "canceled", filled_qty: "0" });
    data.fetchOptionSnapshots.mockResolvedValue({ [CALL]: quote(0.09, 0.08, 0.2), RUN261127C00020000: quote(0.9, 0.8, 0.5) });
    alpaca.listOptionContracts.mockResolvedValue([{ symbol: CALL, open_interest: "350" }, { symbol: "RUN261127C00020000", open_interest: "900" }]);
    const big = { ...account, equity: "100000", last_equity: "100000", cash: "100000" };
    await optionPlanPass(supabase, creds, big, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11, { mode: "paper", fixedBudget: 10 });
    expect(alpaca.placeOrder).toHaveBeenCalledWith(creds, expect.objectContaining({ symbol: CALL }));
    expect(events[0]).toMatchObject({ mode: "paper" });
  });

  it("rests +100% once a third of the account is $200 or more", async () => {
    alpaca.placeOrder.mockResolvedValueOnce({ id: "b1", status: "accepted" }).mockResolvedValueOnce({ id: "t1", status: "new" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "filled", filled_qty: "1", filled_avg_price: "0.09" });
    const big = { ...account, equity: "600", last_equity: "600", cash: "600" };
    await optionPlanPass(supabase, creds, big, [], OPEN, [line()], new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.placeOrder).toHaveBeenNthCalledWith(2, creds, expect.objectContaining({ side: "sell", limitPrice: 0.18 }));
  });

  it("uses the plan's figures", () => {
    expect(OPTION_PLAN).toMatchObject({ takeProfit: 1, cut: 0.5, breakEvenAfter: 0.5, maxOpen: 2, minDays: 7, maxSpreadFrac: 0.2, minOpenInterest: 100, minScore: 7 });
  });
});
