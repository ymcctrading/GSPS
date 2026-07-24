/**
 * Market-data provider seam.
 * -----------------------------------------------------------------------------
 * Everything that needs price data (API routes, scan pipeline, chart tabs) talks
 * to a `MarketDataProvider` — never to a vendor SDK directly. Swapping the data
 * source (or falling back to synthetic demo data) is a one-line change here, not
 * a rewrite across the app.
 *
 *   getMarketDataProvider()  →  the active provider for this request
 *
 * Selection order:
 *   1. MARKET_DATA_PROVIDER=alpaca|synthetic  (explicit override)
 *   2. Alpaca, when its credentials are configured
 *   3. Synthetic demo provider (so a public chart still renders with no keys)
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";

export interface MarketDataProvider {
  /** Stable identifier, surfaced to the UI (e.g. "alpaca", "synthetic"). */
  readonly name: string;
  /** True when backed by a real market-data feed; false for demo/simulated data. */
  readonly isLive: boolean;

  fetchBars(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date | null,
    assetClass: AssetClass,
    limit?: number,
  ): Promise<Bar[]>;

  fetchLatestPrice(symbol: string, assetClass: AssetClass): Promise<number>;

  fetchMostActives(top?: number): Promise<string[]>;

  /** Optional extended data. Providers without a real feed for these return undefined. */
  fetchOptionChain?(symbol: string, assetClass: AssetClass): Promise<OptionChain>;
  fetchLevel2?(symbol: string, assetClass: AssetClass): Promise<Level2Book>;
}

/** ---- Extended market-data shapes (Options / Level II tabs) -------------- */

export interface OptionContract {
  strike: number;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
}

export interface OptionChain {
  symbol: string;
  underlyingPrice: number;
  expiration: string;
  /** True when the chain is derived/simulated rather than a live vendor feed. */
  simulated: boolean;
  contracts: OptionContract[];
}

export interface Level2Quote {
  price: number;
  size: number;
}

export interface Level2Book {
  symbol: string;
  price: number;
  /** True when depth is derived/simulated rather than a live vendor feed. */
  simulated: boolean;
  bids: Level2Quote[];
  asks: Level2Quote[];
  spread: number;
}

/** ---- Provider selection ------------------------------------------------ */

// Lazy imports keep the two providers from loading each other's deps eagerly.
import { alpacaProvider, alpacaConfigured } from "./alpaca";
import { syntheticProvider } from "./synthetic";

export function getMarketDataProvider(): MarketDataProvider {
  const choice = (process.env.MARKET_DATA_PROVIDER ?? "").trim().toLowerCase();
  if (choice === "synthetic" || choice === "demo" || choice === "mock") {
    return syntheticProvider;
  }
  if (choice === "alpaca") return alpacaProvider;
  // Auto: prefer the real feed when it's configured, else demo data.
  return alpacaConfigured() ? alpacaProvider : syntheticProvider;
}

/**
 * All timeframes the top-down GSPS pipeline consumes, fetched through whichever
 * provider is active. Lives at the seam so callers never import a vendor module.
 */
export async function fetchAllTimeframes(symbol: string, assetClass: AssetClass) {
  const provider = getMarketDataProvider();
  const now = Date.now();
  const yearsAgo = (n: number) => new Date(now - n * 365.25 * 24 * 3600 * 1000);
  const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000);

  // Stocks on the free IEX feed can't query the most recent ~15 min of data.
  // Synthetic data has no such delay.
  const end =
    assetClass === "crypto" || !provider.isLive
      ? null
      : new Date(now - 16 * 60 * 1000);

  const [monthly, weekly, daily, hourly, m15] = await Promise.all([
    provider.fetchBars(symbol, "1Month", yearsAgo(10), end, assetClass),
    provider.fetchBars(symbol, "1Week", yearsAgo(5), end, assetClass),
    provider.fetchBars(symbol, "1Day", yearsAgo(1), end, assetClass),
    provider.fetchBars(symbol, "1Hour", daysAgo(30), end, assetClass),
    provider.fetchBars(symbol, "15Min", daysAgo(7), end, assetClass),
  ]);

  return { monthly, weekly, daily, hourly, m15 };
}
