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

  /**
   * Optional batch form of `fetchBars` for providers whose upstream API can
   * price many symbols in one request. Callers that need the same timeframe
   * across a large symbol set (e.g. `runMarketScan`) should prefer this over
   * looping `fetchBars` per symbol — see `fetchAllTimeframesBatch` below.
   */
  fetchBarsBatch?(
    symbols: string[],
    timeframe: Timeframe,
    start: Date,
    end: Date | null,
    assetClass: AssetClass,
  ): Promise<Map<string, Bar[]>>;

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
  /** Rate of change of premium per $1 move in the underlying. */
  delta: number;
  /** Rate of change of delta per $1 move — curvature of the position. */
  gamma: number;
  /** Premium decay per day, expressed as a negative number for long options. */
  theta: number;
  /** Premium change per 1 percentage-point move in implied volatility. */
  vega: number;
  /** Underlying's beta vs the broad market — position-level, not per contract. */
  beta: number;
  iv: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  /**
   * Broker symbol to trade this contract (OCC format). Present only when the
   * chain came from a feed that lists real tradable contracts.
   */
  contractSymbol?: string;
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

export interface AllTimeframeBars {
  monthly: Bar[];
  weekly: Bar[];
  daily: Bar[];
  hourly: Bar[];
  m15: Bar[];
}

/**
 * Batched form of `fetchAllTimeframes` for many symbols at once — five
 * requests total (one per timeframe, each covering every symbol) instead of
 * five per symbol. Falls back to an empty map when the active provider has
 * no batch support (e.g. the synthetic demo provider); callers should treat
 * a missing entry as "fetch this symbol individually" rather than an error.
 * Scoped to equities, matching the only current caller (`runMarketScan`'s
 * equities-only universe).
 */
export async function fetchAllTimeframesBatch(
  symbols: string[],
): Promise<Map<string, AllTimeframeBars>> {
  const provider = getMarketDataProvider();
  const out = new Map<string, AllTimeframeBars>();
  if (!provider.fetchBarsBatch || symbols.length === 0) return out;

  const now = Date.now();
  const yearsAgo = (n: number) => new Date(now - n * 365.25 * 24 * 3600 * 1000);
  const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000);
  const end = provider.isLive ? new Date(now - 16 * 60 * 1000) : null;

  const [monthly, weekly, daily, hourly, m15] = await Promise.all([
    provider.fetchBarsBatch(symbols, "1Month", yearsAgo(10), end, "us_equity"),
    provider.fetchBarsBatch(symbols, "1Week", yearsAgo(5), end, "us_equity"),
    provider.fetchBarsBatch(symbols, "1Day", yearsAgo(1), end, "us_equity"),
    provider.fetchBarsBatch(symbols, "1Hour", daysAgo(30), end, "us_equity"),
    provider.fetchBarsBatch(symbols, "15Min", daysAgo(7), end, "us_equity"),
  ]);

  for (const symbol of symbols) {
    const sym = symbol.toUpperCase();
    out.set(symbol, {
      monthly: monthly.get(sym) ?? [],
      weekly: weekly.get(sym) ?? [],
      daily: daily.get(sym) ?? [],
      hourly: hourly.get(sym) ?? [],
      m15: m15.get(sym) ?? [],
    });
  }
  return out;
}
