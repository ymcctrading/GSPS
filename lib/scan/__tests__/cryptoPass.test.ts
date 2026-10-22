import { describe, expect, it } from "vitest";
import { cryptoBuyList, scanCryptoPairs } from "@/lib/marketScan";
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

describe("crypto pass", () => {
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
    const scans = await scanCryptoPairs(undefined, ["BTC/USD", "ETH/USD"], (async (symbol: string) => {
      seen.push(symbol);
      if (symbol === "ETH/USD") throw new Error("feed gap");
      return result(symbol, "bullish", "Execute", 7);
    }) as unknown as Parameters<typeof scanCryptoPairs>[2]);
    expect(seen.sort()).toEqual(["BTC/USD", "ETH/USD"]);
    expect(scans.find((r) => r.symbol === "ETH/USD")?.error).toContain("feed gap");
    expect(cryptoBuyList(scans).map((r) => r.symbol)).toEqual(["BTC/USD"]);
  });
});
