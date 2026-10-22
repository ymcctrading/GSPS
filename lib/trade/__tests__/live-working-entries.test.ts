import { describe, expect, it } from "vitest";
import type { AlpacaOrder, AlpacaPosition } from "@/lib/brokers/alpaca";
import { workingLiveEntries } from "@/lib/trade/live-working-entries";

const order = (o: Partial<AlpacaOrder>): AlpacaOrder =>
  ({ id: "x", symbol: "AAPL", status: "new", side: "buy", qty: "10", filled_qty: "0", filled_avg_price: null, type: "limit", ...o }) as AlpacaOrder;
const position = (symbol: string, qty: string): AlpacaPosition => ({ symbol, qty, side: Number(qty) < 0 ? "short" : "long", avg_entry_price: "100" }) as AlpacaPosition;
const noQuote = async () => null;

describe("workingLiveEntries", () => {
  it("counts a resting entry at its limit, net of what has filled", async () => {
    const out = await workingLiveEntries([order({ limit_price: "50", qty: "10", filled_qty: "4" })], [], noQuote);
    expect(out).toEqual([{ symbol: "AAPL", side: "buy", qty: 6, price: 50 }]);
  });

  it("leaves out an order that only reduces a position held now, and options", async () => {
    const out = await workingLiveEntries(
      [order({ side: "sell", limit_price: "120" }), order({ symbol: "AAPL261218C00200000", limit_price: "3" })],
      [position("AAPL", "10")],
      noQuote,
    );
    expect(out).toEqual([]);
  });

  it("counts a stop entry at its stop, and prices a queued market order at the quote", async () => {
    const out = await workingLiveEntries(
      [order({ symbol: "MSFT", type: "stop", stop_price: "410" }), order({ symbol: "NVDA", type: "market" })],
      [],
      async (s) => (s === "NVDA" ? 140 : null),
    );
    expect(out).toEqual([
      { symbol: "MSFT", side: "buy", qty: 10, price: 410 },
      { symbol: "NVDA", side: "buy", qty: 10, price: 140 },
    ]);
  });

  it("is null when a resting order can't be priced, so placement fails closed", async () => {
    expect(await workingLiveEntries([order({ type: "market" })], [], noQuote)).toBeNull();
  });

  it("matches a crypto order's BTC/USD to its BTCUSD position, so a protective sell is left out", async () => {
    const out = await workingLiveEntries([order({ symbol: "BTC/USD", side: "sell", qty: "0.5", limit_price: "90000" })], [position("BTCUSD", "0.5")], noQuote);
    expect(out).toEqual([]);
  });
});
