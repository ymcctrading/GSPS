/**
 * Alpaca Market Data client (stocks + crypto bars, snapshots, most-actives).
 * Uses the free IEX feed for stocks. All calls are plain fetch — no SDK.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";

const DATA_BASE = "https://data.alpaca.markets";

function headers(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error("ALPACA_API_KEY / ALPACA_API_SECRET are not configured");
  }
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function toBars(raw: AlpacaBar[] | undefined): Bar[] {
  return (raw ?? []).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}

async function get(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${DATA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: headers(), next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Normalize a crypto symbol like BTCUSD or BTC-USD to Alpaca's BTC/USD. */
export function normalizeCryptoSymbol(symbol: string): string {
  if (symbol.includes("/")) return symbol.toUpperCase();
  const s = symbol.toUpperCase().replace("-", "");
  if (s.endsWith("USD")) return `${s.slice(0, -3)}/USD`;
  return `${s}/USD`;
}

export function isCryptoSymbol(symbol: string): boolean {
  const knownCrypto = ["BTC", "ETH", "SOL", "DOGE", "LTC", "AVAX", "LINK", "XRP", "BCH", "UNI"];
  const base = symbol.toUpperCase().replace(/[-/]?USD[TC]?$/, "");
  return symbol.includes("/") || knownCrypto.includes(base);
}

export async function fetchBars(
  symbol: string,
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
  limit = 10000,
): Promise<Bar[]> {
  const params: Record<string, string> = {
    timeframe,
    start: start.toISOString(),
    limit: String(limit),
    sort: "asc",
  };
  if (end) params.end = end.toISOString();

  if (assetClass === "crypto") {
    const sym = normalizeCryptoSymbol(symbol);
    const data = await get(`/v1beta3/crypto/us/bars`, { ...params, symbols: sym });
    return toBars(data.bars?.[sym]);
  }

  const data = await get(`/v2/stocks/bars`, {
    ...params,
    symbols: symbol.toUpperCase(),
    adjustment: "split",
    feed: "iex",
  });
  return toBars(data.bars?.[symbol.toUpperCase()]);
}

export async function fetchLatestPrice(symbol: string, assetClass: AssetClass): Promise<number> {
  if (assetClass === "crypto") {
    const sym = normalizeCryptoSymbol(symbol);
    const data = await get(`/v1beta3/crypto/us/latest/trades`, { symbols: sym });
    const p = data.trades?.[sym]?.p;
    if (typeof p !== "number") throw new Error(`No latest trade for ${symbol}`);
    return p;
  }
  const data = await get(`/v2/stocks/${symbol.toUpperCase()}/trades/latest`, { feed: "iex" });
  const p = data.trade?.p;
  if (typeof p !== "number") throw new Error(`No latest trade for ${symbol}`);
  return p;
}

/** Most-active US equities by volume — the coarse universe for the daily market scan. */
export async function fetchMostActives(top = 100): Promise<string[]> {
  const data = await get(`/v1beta1/screener/stocks/most-actives`, {
    by: "volume",
    top: String(top),
  });
  return (data.most_actives ?? []).map((a: { symbol: string }) => a.symbol);
}

/** Convenience: all timeframes needed by the top-down GSPS pipeline. */
export async function fetchAllTimeframes(symbol: string, assetClass: AssetClass) {
  const now = new Date();
  const yearsAgo = (n: number) => new Date(now.getTime() - n * 365.25 * 24 * 3600 * 1000);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);

  // Stocks on the free IEX feed can't query the most recent 15 min of data.
  const end = assetClass === "crypto" ? null : new Date(now.getTime() - 16 * 60 * 1000);

  const [monthly, weekly, daily, hourly, m15] = await Promise.all([
    fetchBars(symbol, "1Month", yearsAgo(10), end, assetClass),
    fetchBars(symbol, "1Week", yearsAgo(5), end, assetClass),
    fetchBars(symbol, "1Day", yearsAgo(1), end, assetClass),
    fetchBars(symbol, "1Hour", daysAgo(30), end, assetClass),
    fetchBars(symbol, "15Min", daysAgo(7), end, assetClass),
  ]);

  return { monthly, weekly, daily, hourly, m15 };
}
