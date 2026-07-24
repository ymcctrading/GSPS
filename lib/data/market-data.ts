/**
 * Unified market data schema across all providers.
 * Normalizes responses from Alpaca, Binance, Oanda, Twelve Data, and Polygon.
 */

export interface UnifiedMarketData {
  symbol: string;
  price: number;
  timestamp: string; // ISO timestamp
  change: number; // percentage change (e.g., -2.5 for -2.5%)
  changeAbsolute?: number; // absolute price change
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  source: "alpaca" | "binance" | "oanda" | "twelve_data" | "polygon";
}

export interface MarketDataCache {
  data: UnifiedMarketData;
  cachedAt: number;
  ttl: number; // milliseconds
}

// Simple in-memory cache with TTL
const cache = new Map<string, MarketDataCache>();

export function getCachedData(key: string): UnifiedMarketData | null {
  const cached = cache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.cachedAt;
  if (age > cached.ttl) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

export function setCachedData(key: string, data: UnifiedMarketData, ttlMs = 10000): void {
  cache.set(key, {
    data,
    cachedAt: Date.now(),
    ttl: ttlMs,
  });
}

export function clearCache(): void {
  cache.clear();
}

/**
 * Cache key generator for consistent lookups.
 * Format: "provider:symbol:timeframe" or just "provider:symbol"
 */
export function getCacheKey(provider: string, symbol: string, suffix?: string): string {
  const base = `${provider}:${symbol.toUpperCase()}`;
  return suffix ? `${base}:${suffix}` : base;
}
