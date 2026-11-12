/**
 * Closing a paper option leg (2026-11-12). The close used to price an OCC
 * symbol on the stock feed, which has no such symbol, so every paper option
 * position failed to close with "No live price available". A leg now closes
 * at its own contract's live bid (selling) or ask (buying) when one is fresh,
 * else at the contract's last real trade, labelled; never at an invented
 * price.
 */
import { describe, expect, it, vi } from "vitest";

const snapshot = vi.fn();
const stockPrice = vi.fn();
vi.mock("@/lib/data/alpaca", () => ({
  isCryptoSymbol: () => false,
  fetchOptionLatestTrade: vi.fn(),
  fetchOptionQuoteSnapshot: (s: string) => snapshot(s),
}));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchLatestPrice: (s: string) => stockPrice(s) }),
}));

import { closePositionSim, optionClosePrice, OPTION_QUOTE_FRESH_MS } from "@/lib/brokers/simulator";
import { lastTradeNote } from "@/lib/portfolio/close-note";

const OCC = "EQNR261120C00049000";
// Thursday 2026-11-12, 11:44 AM ET: the regular session is open.
const OPEN = new Date("2026-11-12T16:44:00Z");
// The same day at 5:00 PM ET: closed.
const AFTER = new Date("2026-11-12T22:00:00Z");

const snap = (o: Partial<Parameters<typeof optionClosePrice>[0] & object> = {}) => ({
  bid: 0.1,
  ask: 0.37,
  quoteAt: "2026-11-12T16:43:00Z",
  lastTrade: 0.05,
  lastTradeAt: "2026-11-10T20:36:26Z",
  ...o,
});

describe("optionClosePrice", () => {
  it("sells a long into a fresh bid", () => {
    expect(optionClosePrice(snap(), "sell", OPEN)).toEqual({ price: 0.1, source: "quote", asOf: "2026-11-12T16:43:00Z" });
  });

  it("buys a short back at a fresh ask", () => {
    expect(optionClosePrice(snap(), "buy", OPEN)?.price).toBe(0.37);
  });

  it("falls back to the last real trade when nobody bids (the reported EQNR case)", () => {
    expect(optionClosePrice(snap({ bid: 0 }), "sell", OPEN)).toEqual({
      price: 0.05,
      source: "last_trade",
      asOf: "2026-11-10T20:36:26Z",
    });
  });

  it("falls back to the last trade outside the regular session", () => {
    expect(optionClosePrice(snap({ quoteAt: "2026-11-12T21:59:00Z" }), "sell", AFTER)?.source).toBe("last_trade");
  });

  it("falls back to the last trade when the quote is stale", () => {
    const old = new Date(OPEN.getTime() - OPTION_QUOTE_FRESH_MS - 1000).toISOString();
    expect(optionClosePrice(snap({ quoteAt: old }), "sell", OPEN)?.source).toBe("last_trade");
  });

  it("gives no price rather than an invented one", () => {
    expect(optionClosePrice(snap({ bid: null, lastTrade: null, lastTradeAt: null }), "sell", OPEN)).toBeNull();
    expect(optionClosePrice(snap({ bid: 0, lastTrade: 0 }), "sell", OPEN)).toBeNull();
    expect(optionClosePrice(snap({ quoteAt: "not a date", lastTrade: null }), "sell", OPEN)).toBeNull();
    expect(optionClosePrice(null, "sell", OPEN)).toBeNull();
  });
});

function client(position: Record<string, unknown> | null) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "limit", "insert", "upsert", "order"]) chain[k] = () => chain;
  let table = "";
  chain.maybeSingle = () =>
    Promise.resolve({ data: table === "positions" ? position : { user_id: "u1", cash: 100_000 }, error: null });
  chain.single = chain.maybeSingle;
  return {
    rpcs,
    supabase: {
      from: (t: string) => {
        table = t;
        return chain;
      },
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        return Promise.resolve({ data: { positionId: null, closed: null }, error: null });
      },
    } as never,
  };
}

const longCall = {
  id: "p1",
  symbol: OCC,
  asset_class: "option",
  side: "long",
  qty: 2,
  avg_entry_price: 1.75,
  opened_at: "2026-11-05T15:00:00Z",
};

describe("closePositionSim on an option leg", () => {
  it("prices from the contract's own quote, never the stock feed", async () => {
    snapshot.mockResolvedValueOnce(snap({ bid: 0, quoteAt: new Date().toISOString() }));
    const { supabase, rpcs } = client(longCall);
    const fill = await closePositionSim(supabase, "u1", OCC);
    expect(stockPrice).not.toHaveBeenCalled();
    expect(fill).toMatchObject({ price: 0.05, qty: 2, priceSource: "last_trade", priceAsOf: "2026-11-10T20:36:26Z" });
    expect(rpcs[0].args).toMatchObject({ p_symbol: OCC, p_side: "sell", p_qty: 2, p_price: 0.05, p_asset_class: "option" });
  });

  it("refuses, writing nothing, when the contract has no real price", async () => {
    snapshot.mockResolvedValueOnce(null);
    const { supabase, rpcs } = client(longCall);
    await expect(closePositionSim(supabase, "u1", OCC)).rejects.toThrow(/No real price for EQNR261120C00049000/);
    expect(rpcs).toEqual([]);
  });

  it("leaves equities on the stock feed", async () => {
    stockPrice.mockResolvedValueOnce(50);
    const { supabase, rpcs } = client({ ...longCall, symbol: "EQNR", asset_class: "us_equity" });
    const fill = await closePositionSim(supabase, "u1", "EQNR");
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(fill?.price).toBe(50);
    expect(fill?.priceSource).toBeUndefined();
    expect(rpcs[0].args).toMatchObject({ p_price: 50 });
  });
});

describe("lastTradeNote", () => {
  it("names the last-trade price and its time in ET", () => {
    expect(
      lastTradeNote({ order: { filled_avg_price: 0.05 }, price: { source: "last_trade", asOf: "2026-11-10T20:36:26Z" } }),
    ).toBe("Closed at $0.05, the contract's last trade (Nov 10, 3:36 PM ET). No live quote was available to close against.");
  });

  it("is silent for a live-quote close or any other close", () => {
    expect(lastTradeNote({ price: { source: "quote", asOf: "2026-11-12T16:43:00Z" } })).toBeNull();
    expect(lastTradeNote({ order: { filled_avg_price: 50 } })).toBeNull();
  });
});
