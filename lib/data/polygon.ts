/**
 * Polygon.io API client for stocks, options, forex, and crypto.
 * Requires POLYGON_API_KEY environment variable.
 */

import type { UnifiedMarketData } from "./market-data";
import { getCachedData, setCachedData, getCacheKey } from "./market-data";

const POLYGON_BASE = "https://api.polygon.io";

interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  type: string;
  updated: number;
}

interface PolygonSnapshot {
  status: string;
  results: {
    updated: number;
    c: number; // close
    h: number; // high
    l: number; // low
    o: number; // open
    v: number; // volume
    vw: number; // volume weighted average price
    t: number; // timestamp
    n: number; // transactions
  }[];
}

function polygonApiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    throw new Error("POLYGON_API_KEY is not configured");
  }
  return key;
}

/**
 * Fetch latest stock snapshot from Polygon.
 */
export async function fetchPolygonStockSnapshot(symbol: string): Promise<UnifiedMarketData> {
  const cacheKey = getCacheKey("polygon", symbol, "stock");
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const url = new URL(`${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol.toUpperCase()}`);
  url.searchParams.set("apikey", polygonApiKey());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Polygon API error (${res.status}): ${body}`);
    }

    const data: PolygonSnapshot = await res.json();
    if (!data.results || data.results.length === 0) {
      throw new Error(`No snapshot data for ${symbol}`);
    }

    const snapshot = data.results[0];
    const priceChange = snapshot.c - snapshot.o;
    const changePercent = (priceChange / snapshot.o) * 100;

    const result: UnifiedMarketData = {
      symbol: symbol.toUpperCase(),
      price: snapshot.c,
      timestamp: new Date(snapshot.t).toISOString(),
      change: changePercent,
      changeAbsolute: priceChange,
      volume: snapshot.v,
      high: snapshot.h,
      low: snapshot.l,
      open: snapshot.o,
      source: "polygon",
    };

    // Cache for 15 seconds
    setCachedData(cacheKey, result, 15000);
    return result;
  } catch (err) {
    throw new Error(
      `Polygon ${symbol} snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fetch crypto snapshot from Polygon.
 */
export async function fetchPolygonCryptoSnapshot(symbol: string): Promise<UnifiedMarketData> {
  const cacheKey = getCacheKey("polygon", symbol, "crypto");
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const cryptoSymbol = symbol.toUpperCase().replace(/[-/]USD[TC]?$/, "");
  const url = new URL(`${POLYGON_BASE}/v2/snapshot/locale/global/markets/crypto/tickers/X:${cryptoSymbol}USD`);
  url.searchParams.set("apikey", polygonApiKey());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Polygon API error (${res.status}): ${body}`);
    }

    const data: PolygonSnapshot = await res.json();
    if (!data.results || data.results.length === 0) {
      throw new Error(`No crypto snapshot for ${symbol}`);
    }

    const snapshot = data.results[0];
    const priceChange = snapshot.c - snapshot.o;
    const changePercent = (priceChange / snapshot.o) * 100;

    const result: UnifiedMarketData = {
      symbol: symbol.toUpperCase(),
      price: snapshot.c,
      timestamp: new Date(snapshot.t).toISOString(),
      change: changePercent,
      changeAbsolute: priceChange,
      volume: snapshot.v,
      high: snapshot.h,
      low: snapshot.l,
      open: snapshot.o,
      source: "polygon",
    };

    // Cache for 10 seconds for crypto
    setCachedData(cacheKey, result, 10000);
    return result;
  } catch (err) {
    throw new Error(
      `Polygon crypto ${symbol} snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fetch multiple stock snapshots in parallel.
 */
export async function fetchPolygonMultiple(symbols: string[]): Promise<UnifiedMarketData[]> {
  return Promise.all(symbols.map((sym) => fetchPolygonStockSnapshot(sym)));
}
