/**
 * Binance API client for cryptocurrency market data.
 * Uses public endpoints — no API key required for basic market data.
 */

import type { UnifiedMarketData } from "./market-data";
import { getCachedData, setCachedData, getCacheKey } from "./market-data";

const BINANCE_BASE = "https://api.binance.com/api/v3";

interface BinanceTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteAsset: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/**
 * Normalize crypto symbol to Binance format.
 * E.g., "BTC", "btc", "BTC-USD" → "BTCUSDT"
 */
export function normalizeBinanceSymbol(symbol: string): string {
  const base = symbol.toUpperCase().replace(/[-\/].*$/, "");
  return `${base}USDT`;
}

/**
 * Fetch latest crypto price and 24h stats from Binance.
 */
export async function fetchBinanceData(symbol: string): Promise<UnifiedMarketData> {
  const cacheKey = getCacheKey("binance", symbol);
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const binanceSymbol = normalizeBinanceSymbol(symbol);
  const url = new URL(`${BINANCE_BASE}/ticker/24hr`);
  url.searchParams.set("symbol", binanceSymbol);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Binance API error: ${res.status}`);
    }

    const data: BinanceTicker = await res.json();
    const change = parseFloat(data.priceChangePercent);
    const changeAbsolute = parseFloat(data.priceChange);
    const price = parseFloat(data.lastPrice);

    const result: UnifiedMarketData = {
      symbol: symbol.toUpperCase(),
      price,
      timestamp: new Date(data.closeTime).toISOString(),
      change,
      changeAbsolute,
      volume: parseFloat(data.volume),
      high: parseFloat(data.highPrice),
      low: parseFloat(data.lowPrice),
      open: parseFloat(data.openPrice),
      source: "binance",
    };

    // Cache for 10 seconds
    setCachedData(cacheKey, result, 10000);
    return result;
  } catch (err) {
    throw new Error(
      `Binance ${symbol} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fetch multiple crypto symbols in parallel (Binance public API).
 */
export async function fetchBinanceMultiple(symbols: string[]): Promise<UnifiedMarketData[]> {
  return Promise.all(symbols.map((sym) => fetchBinanceData(sym)));
}
