/**
 * Twelve Data API client for futures, stocks, indices, and ETFs.
 * Requires TWELVE_DATA_API_KEY environment variable.
 */

import type { UnifiedMarketData } from "./market-data";
import { getCachedData, setCachedData, getCacheKey } from "./market-data";

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

interface TwelveDataQuote {
  symbol: string;
  name: string;
  exchange: string;
  mic_code: string;
  currency: string;
  datetime: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  previous_close: number;
  change: number;
  percent_change: number;
  average_volume: number;
  volume: number;
  market_cap?: number;
  pe?: number;
  eps?: number;
  div_yield?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  is_market_open: boolean;
}

function twelveDataApiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    throw new Error("TWELVE_DATA_API_KEY is not configured");
  }
  return key;
}

/**
 * Fetch latest quote from Twelve Data.
 * Supports stocks, futures, indices, ETFs, crypto.
 */
export async function fetchTwelveDataQuote(symbol: string): Promise<UnifiedMarketData> {
  const cacheKey = getCacheKey("twelve_data", symbol);
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const url = new URL(`${TWELVE_DATA_BASE}/quote`);
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("apikey", twelveDataApiKey());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twelve Data API error (${res.status}): ${body}`);
    }

    const data: TwelveDataQuote = await res.json();

    const result: UnifiedMarketData = {
      symbol: data.symbol,
      price: data.close,
      timestamp: data.datetime,
      change: data.percent_change,
      changeAbsolute: data.change,
      volume: data.volume,
      high: data.high,
      low: data.low,
      open: data.open,
      source: "twelve_data",
    };

    // Cache for 15 seconds for delayed feeds
    setCachedData(cacheKey, result, 15000);
    return result;
  } catch (err) {
    throw new Error(
      `Twelve Data ${symbol} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fetch multiple symbols from Twelve Data in parallel.
 */
export async function fetchTwelveDataMultiple(symbols: string[]): Promise<UnifiedMarketData[]> {
  return Promise.all(symbols.map((sym) => fetchTwelveDataQuote(sym)));
}

/**
 * Get real-time data for a futures contract.
 * Example symbols: "ES" (S&P 500), "NQ" (Nasdaq 100), "CL" (Crude Oil)
 */
export async function fetchFuturesData(symbol: string): Promise<UnifiedMarketData> {
  return fetchTwelveDataQuote(symbol);
}
