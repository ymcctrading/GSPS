/**
 * Oanda API client for forex (currency pair) market data.
 * Requires OANDA_API_KEY environment variable.
 */

import type { UnifiedMarketData } from "./market-data";
import { getCachedData, setCachedData, getCacheKey } from "./market-data";

const OANDA_BASE = "https://api-fxpractice.oanda.com/v3";

interface OandaCandle {
  complete: boolean;
  bid: { o: string; h: string; l: string; c: string };
  mid: { o: string; h: string; l: string; c: string };
  ask: { o: string; h: string; l: string; c: string };
  volume: number;
  time: string;
}

interface OandaInstrument {
  candles: OandaCandle[];
}

function oandaApiKey(): string {
  const key = process.env.OANDA_API_KEY;
  if (!key) {
    throw new Error("OANDA_API_KEY is not configured");
  }
  return key;
}

function oandaHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${oandaApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Normalize currency pair to Oanda format.
 * E.g., "EUR-USD", "eurusd" → "EUR_USD"
 */
export function normalizeOandaSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase().replace(/[-]/, "_");
  if (!normalized.includes("_")) {
    // Assume XXXYYY format, convert to XXX_YYY
    if (normalized.length === 6) {
      return `${normalized.slice(0, 3)}_${normalized.slice(3)}`;
    }
  }
  return normalized;
}

/**
 * Fetch latest forex data from Oanda (latest candle).
 */
export async function fetchOandaData(symbol: string): Promise<UnifiedMarketData> {
  const cacheKey = getCacheKey("oanda", symbol);
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const oandaSymbol = normalizeOandaSymbol(symbol);
  const url = new URL(
    `${OANDA_BASE}/instruments/${oandaSymbol}/candles`,
  );
  url.searchParams.set("granularity", "M1");
  url.searchParams.set("count", "2");

  try {
    const res = await fetch(url.toString(), { headers: oandaHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Oanda API error (${res.status}): ${body}`);
    }

    const data: OandaInstrument = await res.json();
    if (!data.candles || data.candles.length === 0) {
      throw new Error(`No candles returned for ${symbol}`);
    }

    const latest = data.candles[data.candles.length - 1];
    const prev = data.candles.length > 1 ? data.candles[data.candles.length - 2] : null;

    const currentClose = parseFloat(latest.mid.c);
    const prevClose = prev ? parseFloat(prev.mid.c) : parseFloat(latest.mid.o);
    const changeAbsolute = currentClose - prevClose;
    const change = (changeAbsolute / prevClose) * 100;

    const result: UnifiedMarketData = {
      symbol: symbol.toUpperCase(),
      price: currentClose,
      timestamp: latest.time,
      change,
      changeAbsolute,
      high: parseFloat(latest.mid.h),
      low: parseFloat(latest.mid.l),
      open: parseFloat(latest.mid.o),
      volume: latest.volume,
      source: "oanda",
    };

    // Cache for 10 seconds
    setCachedData(cacheKey, result, 10000);
    return result;
  } catch (err) {
    throw new Error(
      `Oanda ${symbol} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fetch multiple forex pairs in parallel.
 */
export async function fetchOandaMultiple(symbols: string[]): Promise<UnifiedMarketData[]> {
  return Promise.all(symbols.map((sym) => fetchOandaData(sym)));
}
