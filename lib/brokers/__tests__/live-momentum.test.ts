import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const alpaca = vi.hoisted(() => ({
  cancelOrder: vi.fn(async () => null),
  closePosition: vi.fn(),
  getOpenOrdersNested: vi.fn(async () => [] as unknown[]),
  getOrder: vi.fn(),
  listOrders: vi.fn(async () => [] as unknown[]),
  placeOrder: vi.fn(),
}));
vi.mock("@/lib/brokers/alpaca", () => alpaca);
const data = vi.hoisted(() => ({
  fetchMovers: vi.fn(),
  fetchDayRanges: vi.fn(),
  fetchOptionSnapshots: vi.fn(),
}));
vi.mock("@/lib/data/alpaca", () => data);

import { chooseLiveContract, liveOptionBudget } from "@/lib/brokers/live-options";
import {
  momentumEntryHold,
  momentumExit,
  momentumPass,
  moverCandidates,
  nyMinutes,
  nyWeekday,
  rankMovers,
  takeProfitPrice,
} from "@/lib/brokers/live-momentum";

const quote = (ap: number, bp: number, delta?: number) => ({ latestQuote: { ap, bp }, ...(delta != null ? { greeks: { delta } } : {}) });

describe("chooseLiveContract", () => {
  const chain = {
    AAA261120C00050000: quote(0.6, 0.5, 0.4), // $60: over budget
    AAA261120C00055000: quote(0.09, 0.07, 0.12),
    AAA261120C00060000: quote(0.03, 0.02, 0.05),
    AAA261204C00058000: quote(0.1, 0.08, 0.11),
    AAA261113C00052000: quote(0.05, 0.04, 0.3), // expires today: outside the window
    AAA261120P00045000: quote(0.05, 0.04, -0.1), // a put
    AAA261120C00054000: quote(0.08, 0, 0.13), // no bid
  };
  const q = { underlying: "AAA", type: "call" as const, underlyingPrice: 50, budget: 10, today: "2026-11-13", minDays: 1, maxDays: 21 };

  it("buys the contract closest to the money that a third of the account pays for", () => {
    expect(chooseLiveContract(chain, q)).toEqual({ symbol: "AAA261120C00055000", expiration: "2026-11-20", strike: 55, ask: 0.09, qty: 1, limitPrice: 0.1 });
  });

  it("buys several when one is cheap, never past the budget", () => {
    const r = chooseLiveContract({ AAA261120C00060000: quote(0.03, 0.02, 0.05) }, q);
    expect(r).toMatchObject({ qty: 3, limitPrice: 0.03 });
  });

  it("falls back to the nearest strike when the feed gives no delta", () => {
    const r = chooseLiveContract({ AAA261120C00055000: quote(0.09, 0.07), AAA261120C00060000: quote(0.03, 0.02) }, q);
    expect(r).toMatchObject({ symbol: "AAA261120C00055000" });
  });

  it("says why when nothing fits", () => {
    expect(chooseLiveContract({ AAA261120C00050000: quote(0.6, 0.5) }, q)).toEqual({ reason: "No call on AAA 1 to 21 days out costs $10.00 or less (a third of the account)." });
    expect(chooseLiveContract(chain, { ...q, budget: 0 })).toEqual({ reason: "No cash for a contract." });
  });

  it("budgets a third of the account within the cash", () => {
    expect(liveOptionBudget(30, 30)).toBe(10);
    expect(liveOptionBudget(30, 6)).toBeCloseTo(5.7);
    expect(liveOptionBudget(Number.NaN, 30)).toBe(0);
  });
});

describe("momentum rules", () => {
  const ranges = new Map([
    ["RUN", { price: 20, high: 20.2, low: 15 }],
    ["FADE", { price: 18, high: 21, low: 15 }], // 14% off its high: not running
    ["DROP", { price: 10.1, high: 14, low: 10 }],
    ["CHEAP", { price: 3, high: 3, low: 2 }],
  ]);
  const movers = {
    gainers: [
      { symbol: "RUN", pct: 30, price: 20 },
      { symbol: "FADE", pct: 40, price: 18 },
      { symbol: "CHEAP", pct: 90, price: 3 },
      { symbol: "SLOW", pct: 2, price: 50 },
    ],
    losers: [{ symbol: "DROP", pct: -35, price: 10.1 }],
  };

  it("takes the strongest mover still running, a call on a riser and a put on a faller", () => {
    expect(rankMovers(movers, ranges, new Set())).toEqual([
      { symbol: "DROP", type: "put", price: 10.1, pct: -35 },
      { symbol: "RUN", type: "call", price: 20, pct: 30 },
    ]);
    expect(rankMovers(movers, ranges, new Set(["DROP"])).map((p) => p.symbol)).toEqual(["RUN"]);
    expect(moverCandidates(movers)).toEqual(["FADE", "DROP", "RUN"]);
  });

  it("rests the take-profit at +50% and cuts at half the cost", () => {
    expect(takeProfitPrice(0.07)).toBe(0.11);
    expect(takeProfitPrice(0.1)).toBe(0.15);
    const base = { avgEntry: 0.1, minutes: 11 * 60, openedToday: true, sameDaySellOk: true };
    expect(momentumExit({ ...base, current: 0.06 })).toBeNull();
    expect(momentumExit({ ...base, current: 0.05 })).toBe("cut");
    expect(momentumExit({ ...base, current: 0.09, minutes: 15 * 60 + 35 })).toBe("close_out");
    expect(momentumExit({ ...base, current: 0.05, sameDaySellOk: false })).toBe("held_for_day_trades");
    // Bought yesterday: selling today is no day trade.
    expect(momentumExit({ ...base, current: 0.05, openedToday: false, sameDaySellOk: false })).toBe("cut");
  });

  const gate = { minutes: 11 * 60, weekday: 1, marketOpen: true, halted: false, equity: 30, lastEquity: 30, dayTrades: 0, openContracts: 0, boughtToday: 0, heldFromToday: 0 };
  it("enters only inside the window and the account's limits", () => {
    expect(momentumEntryHold(gate)).toBeNull();
    expect(momentumEntryHold({ ...gate, minutes: 9 * 60 + 45 })).toMatch(/entry window/);
    expect(momentumEntryHold({ ...gate, minutes: 15 * 60 })).toMatch(/entry window/);
    expect(momentumEntryHold({ ...gate, equity: 14 })).toMatch(/floor/);
    expect(momentumEntryHold({ ...gate, equity: 26 })).toMatch(/down 10%/);
    expect(momentumEntryHold({ ...gate, openContracts: 3 })).toMatch(/3 contracts already open/);
    expect(momentumEntryHold({ ...gate, boughtToday: 3 })).toMatch(/3 bought today/);
    expect(momentumEntryHold({ ...gate, halted: true })).toMatch(/halted/);
  });

  it("with the day trades used, buys to hold overnight, but never on a Friday", () => {
    expect(momentumEntryHold({ ...gate, dayTrades: 3 })).toBeNull();
    expect(momentumEntryHold({ ...gate, dayTrades: 3, weekday: 5 })).toMatch(/Friday buy must be sold today/);
    expect(momentumEntryHold({ ...gate, dayTrades: 2, heldFromToday: 1, weekday: 5 })).toMatch(/Friday/);
    expect(momentumEntryHold({ ...gate, dayTrades: 2, weekday: 5 })).toBeNull();
  });

  it("reads New York time", () => {
    expect(nyMinutes(Date.parse("2026-11-13T15:00:00Z"))).toBe(10 * 60);
    expect(nyWeekday(Date.parse("2026-11-13T15:00:00Z"))).toBe(5);
    expect(nyWeekday(Date.parse("2026-11-14T03:00:00Z"))).toBe(5); // Friday evening in New York
  });
});

describe("momentumPass", () => {
  const events: unknown[] = [];
  const supabase = {
    from: () => ({ insert: async (row: unknown) => (events.push(row), { error: null }) }),
  } as unknown as SupabaseClient;
  const creds = { key: "k", secret: "s", mode: "live" as const };
  const account = { equity: "30", last_equity: "30", cash: "30", buying_power: "30", currency: "USD", daytrade_count: 0 };
  const MON_11 = Date.parse("2026-11-16T16:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    alpaca.listOrders.mockResolvedValue([]);
    alpaca.getOpenOrdersNested.mockResolvedValue([]);
  });

  it("buys the strongest running mover's contract and rests a +50% take-profit", async () => {
    data.fetchMovers.mockResolvedValue({ gainers: [{ symbol: "RUN", pct: 30, price: 20 }], losers: [] });
    data.fetchDayRanges.mockResolvedValue(new Map([["RUN", { price: 20, high: 20.2, low: 15 }]]));
    data.fetchOptionSnapshots.mockResolvedValue({ RUN261127C00025000: quote(0.08, 0.06, 0.1) });
    alpaca.placeOrder.mockResolvedValueOnce({ id: "b1", status: "accepted" }).mockResolvedValueOnce({ id: "t1", status: "new" });
    alpaca.getOrder.mockResolvedValue({ id: "b1", status: "filled", filled_qty: "1", filled_avg_price: "0.08" });
    const r = await momentumPass(supabase, creds, account, [], true, new Set(), Date.now() + 30_000, MON_11);
    expect(r.errors).toEqual([]);
    expect(alpaca.placeOrder).toHaveBeenNthCalledWith(1, creds, expect.objectContaining({ symbol: "RUN261127C00025000", side: "buy", qty: 1, type: "limit", limitPrice: 0.1 }));
    expect(alpaca.placeOrder).toHaveBeenNthCalledWith(2, creds, expect.objectContaining({ symbol: "RUN261127C00025000", side: "sell", qty: 1, type: "limit", limitPrice: 0.12 }));
    expect(events.map((e) => (e as { action: string }).action)).toEqual(["momentum_open", "momentum_take_profit"]);
    expect((events[0] as { mode: string }).mode).toBe("live");
  });

  it("sells a contract worth half its cost after cancelling its take-profit", async () => {
    const pos = { symbol: "RUN261127C00025000", qty: "1", side: "long", avg_entry_price: "0.10", current_price: "0.05", asset_class: "us_option" };
    alpaca.getOpenOrdersNested.mockResolvedValue([{ id: "t1", symbol: pos.symbol, side: "sell" }]);
    alpaca.closePosition.mockResolvedValue({ id: "x1", status: "accepted" });
    alpaca.getOrder.mockResolvedValue({ id: "x1", status: "filled", filled_qty: "1", filled_avg_price: "0.05" });
    data.fetchMovers.mockResolvedValue({ gainers: [], losers: [] });
    await momentumPass(supabase, creds, account, [pos as never], true, new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.cancelOrder).toHaveBeenCalledWith(creds, "t1");
    expect(alpaca.closePosition).toHaveBeenCalledWith(creds, pos.symbol);
    expect(events[0]).toMatchObject({ action: "momentum_close", status: "filled" });
  });

  it("never touches a symbol the mirror owns, and does nothing with the market closed", async () => {
    const pos = { symbol: "RUN261127C00025000", qty: "1", side: "long", avg_entry_price: "0.10", current_price: "0.01", asset_class: "us_option" };
    data.fetchMovers.mockResolvedValue({ gainers: [], losers: [] });
    await momentumPass(supabase, creds, account, [pos as never], true, new Set([pos.symbol]), Date.now() + 30_000, MON_11);
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    const r = await momentumPass(supabase, creds, account, [], false, new Set(), Date.now() + 30_000, MON_11);
    expect(r.held).toEqual([]);
    expect(data.fetchMovers).toHaveBeenCalledTimes(1);
  });

  it("cancels a buy the market didn't fill and rests nothing", async () => {
    data.fetchMovers.mockResolvedValue({ gainers: [{ symbol: "RUN", pct: 30, price: 20 }], losers: [] });
    data.fetchDayRanges.mockResolvedValue(new Map([["RUN", { price: 20, high: 20.2, low: 15 }]]));
    data.fetchOptionSnapshots.mockResolvedValue({ RUN261127C00025000: quote(0.08, 0.06, 0.1) });
    alpaca.placeOrder.mockResolvedValue({ id: "b1", status: "accepted" });
    alpaca.getOrder.mockResolvedValueOnce({ id: "b1", status: "new" }).mockResolvedValueOnce({ id: "b1", status: "new" }).mockResolvedValueOnce({ id: "b1", status: "new" }).mockResolvedValueOnce({ id: "b1", status: "new" })
      .mockResolvedValue({ id: "b1", status: "canceled", filled_qty: "0" });
    await momentumPass(supabase, creds, account, [], true, new Set(), Date.now() + 30_000, MON_11);
    expect(alpaca.cancelOrder).toHaveBeenCalledWith(creds, "b1");
    expect(alpaca.placeOrder).toHaveBeenCalledTimes(1);
  });
});
