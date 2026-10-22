import { describe, expect, it, vi } from "vitest";
import { cryptoBuyList, fundLists, joinOtherMarkets, scanEveryChart, settleBy, stocksOnly } from "@/lib/marketScan";
import { FUND_MARKETS, isFundMarket, isOtherMarket } from "@/lib/market/otherMarkets";
import { CRYPTO_UNIVERSE } from "@/lib/scan/cryptoUniverse";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import type { ScanResult } from "@/lib/types";

function result(symbol: string, direction: "bullish" | "bearish" | "none", outputState: string, score: number): ScanResult {
  return {
    symbol,
    direction,
    currentPrice: 100,
    decision: { outputState, score },
    levels: { entry: 101, stopLoss: 95, takeProfit1: 110, masterProfit: 120 },
  } as unknown as ScanResult;
}

/** A short's levels, so its plan is priced and unbroken at the price of 100. */
function short(r: ScanResult): ScanResult {
  return { ...r, levels: { entry: 99, stopLoss: 105, takeProfit1: 90, masterProfit: 80 } } as ScanResult;
}

describe("other markets passes", () => {
  it("lists only pairs the market scan can read as crypto", () => {
    expect(CRYPTO_UNIVERSE.length).toBeGreaterThan(0);
    expect(CRYPTO_UNIVERSE.every(isCryptoSymbol)).toBe(true);
    expect(new Set(CRYPTO_UNIVERSE).size).toBe(CRYPTO_UNIVERSE.length);
  });

  it("keeps buy setups with a plan, Execute first, and drops sells, errors and planless reads", () => {
    const listed = cryptoBuyList([
      result("ETH/USD", "bullish", "Watch", 6),
      result("SOL/USD", "bearish", "Execute", 8),
      result("BTC/USD", "bullish", "Execute", 7),
      { ...result("XRP/USD", "bullish", "Execute", 9), levels: null } as ScanResult,
      { symbol: "DOT/USD", error: "feed" } as ScanResult,
      result("LTC/USD", "none", "Watch", 5),
    ]);
    expect(listed.map((r) => r.symbol)).toEqual(["BTC/USD", "ETH/USD"]);
  });

  it("scores every pair, and a failed scan is an error row, not a lost run", async () => {
    const seen: string[] = [];
    const scans = await scanEveryChart(["BTC/USD", "ETH/USD"], "crypto", undefined, (async (symbol: string) => {
      seen.push(symbol);
      if (symbol === "ETH/USD") throw new Error("feed gap");
      return result(symbol, "bullish", "Execute", 7);
    }) as unknown as Parameters<typeof scanEveryChart>[3]);
    expect(seen.sort()).toEqual(["BTC/USD", "ETH/USD"]);
    expect(scans.find((r) => r.symbol === "ETH/USD")?.error).toContain("feed gap");
    expect(cryptoBuyList(scans).map((r) => r.symbol)).toEqual(["BTC/USD"]);
  });

  it("names the funds once, none of them a crypto pair, and counts both as other markets", () => {
    expect(new Set(FUND_MARKETS).size).toBe(FUND_MARKETS.length);
    expect(FUND_MARKETS.some(isCryptoSymbol)).toBe(false);
    expect(isFundMarket("gld")).toBe(true);
    expect(isOtherMarket("GLD")).toBe(true);
    expect(isOtherMarket("BTC/USD")).toBe(true);
    expect(isOtherMarket("AAPL")).toBe(false);
  });

  it("lists a fund's buy and sell setups, each side in order", () => {
    const lists = fundLists([
      result("GLD", "bullish", "Watch", 5),
      result("SLV", "bullish", "Execute", 7),
      { ...result("USO", "bearish", "Execute", 7), levels: { entry: 99, stopLoss: 105, takeProfit1: 90, masterProfit: 80 } } as ScanResult,
      { symbol: "UNG", error: "feed" } as ScanResult,
    ]);
    expect(lists.bullish.map((r) => r.symbol)).toEqual(["SLV", "GLD"]);
    expect(lists.bearish.map((r) => r.symbol)).toEqual(["USO"]);
  });

  it("leaves the funds and pairs out of the stocks, so their own passes alone score them", () => {
    expect(stocksOnly(["AAPL", "GLD", "uso", "BCH/USD", "MSFT", "FXE", "BTC/USD"])).toEqual(["AAPL", "MSFT"]);
  });

  it("joins crypto buys and fund setups in the lists' order, fund shorts through the borrow check", async () => {
    const stocks = { bullish: [result("AAPL", "bullish", "Watch", 5)], bearish: [short(result("KO", "bearish", "Watch", 5))] };
    const shortable = vi.fn(async (ranked: ScanResult[]) => ranked.filter((r) => r.symbol !== "UNG"));
    const joined = await joinOtherMarkets(
      stocks,
      [result("BTC/USD", "bullish", "Execute", 7), result("ETH/USD", "bearish", "Execute", 8)],
      [result("GLD", "bullish", "Watch", 6), short(result("USO", "bearish", "Execute", 7)), short(result("UNG", "bearish", "Execute", 8))],
      Date.now() + 1000,
      shortable,
    );
    expect(joined.bullish.map((r) => r.symbol)).toEqual(["BTC/USD", "GLD", "AAPL"]);
    expect(joined.bearish.map((r) => r.symbol)).toEqual(["USO", "KO"]);
    expect(shortable).toHaveBeenCalledOnce();
    expect(shortable.mock.calls[0][0].map((r: ScanResult) => r.symbol)).toEqual(["UNG", "USO"]);
  });

  it("lists no fund short when the borrow read outlasts the deadline", async () => {
    const stocks = { bullish: [], bearish: [] };
    const never = () => new Promise<ScanResult[]>(() => {});
    const joined = await joinOtherMarkets(stocks, [], [short(result("USO", "bearish", "Execute", 7))], Date.now() + 5, never);
    expect(joined.bearish).toEqual([]);
  });

  it("settleBy returns the value in time, and null once the deadline passes", async () => {
    expect(await settleBy(Promise.resolve(3), Date.now() + 1000)).toBe(3);
    expect(await settleBy(new Promise<number>(() => {}), Date.now() + 5)).toBeNull();
    expect(await settleBy(Promise.resolve(4), Date.now() - 1)).toBe(4);
  });
});
