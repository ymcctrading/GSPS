/**
 * Provider factory. Reads GSPS_MARKET_DATA_PROVIDER; only "mock" exists in
 * Phase 0. Adding a real vendor = implement MarketDataProvider and register it
 * here — no consumer changes required.
 */
import type { MarketDataProvider } from "./types";
import { MockMarketDataProvider } from "./mockProvider";

let cached: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  const which = process.env.GSPS_MARKET_DATA_PROVIDER ?? "mock";
  switch (which) {
    case "mock":
      cached = new MockMarketDataProvider();
      break;
    default:
      // Fail loud rather than silently trading on the wrong data source.
      throw new Error(
        `Unknown GSPS_MARKET_DATA_PROVIDER "${which}". Only "mock" is supported in Phase 0.`
      );
  }
  return cached;
}

export * from "./types";
