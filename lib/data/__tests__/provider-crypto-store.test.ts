/**
 * `fetchAllTimeframesBatch` reads stored closed bars for crypto's hourly and
 * execution charts on the live feed only (`closedBarsStore.ts`, #477):
 * equities, synthetic data and every other timeframe are read as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticProvider } from "@/lib/data/synthetic";

const stored = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/closedBarsStore", async (orig) => {
  const real = await orig<typeof import("@/lib/data/closedBarsStore")>();
  return {
    ...real,
    fetchCryptoClosedStored: stored.mockImplementation(async (fetchBatch, symbols, timeframe, start) =>
      fetchBatch(symbols, timeframe, start, null, "crypto"),
    ),
  };
});

import { fetchAllTimeframesBatch } from "@/lib/data/provider";
import { setMonthlyBarsStore } from "@/lib/data/monthlyStore";

describe("fetchAllTimeframesBatch — the crypto store's gate", () => {
  const originalProvider = process.env.MARKET_DATA_PROVIDER;
  const live = Object.getOwnPropertyDescriptor(syntheticProvider, "isLive");

  beforeEach(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
    setMonthlyBarsStore(null);
    stored.mockClear();
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = originalProvider;
    if (live) Object.defineProperty(syntheticProvider, "isLive", live);
    delete (syntheticProvider as { fetchBarsBatch?: unknown }).fetchBarsBatch;
    setMonthlyBarsStore(undefined);
  });

  // The synthetic feed reads one symbol a call; give it the batched read the live feed has.
  const asLive = () => {
    Object.defineProperty(syntheticProvider, "isLive", { value: true, configurable: true });
    Object.defineProperty(syntheticProvider, "fetchBarsBatch", {
      configurable: true,
      value: async (symbols: string[], tf: never, start: Date, end: Date | null, ac: never) =>
        new Map(await Promise.all(symbols.map(async (s) => [s, await syntheticProvider.fetchBars(s, tf, start, end, ac)] as const))),
    });
  };

  it("crypto on the live feed reads its hourly and execution charts from the store", async () => {
    asLive();
    await fetchAllTimeframesBatch(["BTC/USD"], "15Min", "crypto");
    expect(stored.mock.calls.map((c) => c[2]).sort()).toEqual(["15Min", "1Hour"]);
  });

  it("equities on the live feed never use it", async () => {
    asLive();
    await fetchAllTimeframesBatch(["AAPL"], "15Min", "us_equity");
    expect(stored).not.toHaveBeenCalled();
  });

  it("crypto off the live feed never uses it", async () => {
    asLive();
    Object.defineProperty(syntheticProvider, "isLive", { value: false, configurable: true });
    await fetchAllTimeframesBatch(["BTC/USD"], "15Min", "crypto");
    expect(stored).not.toHaveBeenCalled();
  });
});
