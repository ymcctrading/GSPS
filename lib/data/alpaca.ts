/**
 * Alpaca Market Data client (stocks + crypto bars, snapshots, most-actives).
 * Uses the free IEX feed for stocks. All calls are plain fetch — no SDK.
 *
 * Consumers should reach this through the provider seam (`getMarketDataProvider`
 * in ./provider), not import these functions directly, so the data source stays
 * swappable. The `alpacaProvider` export at the bottom adapts this module to the
 * `MarketDataProvider` interface.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import type { MarketDataProvider } from "./provider";

const DATA_BASE = "https://data.alpaca.markets";

// Accept the common Alpaca env-var spellings so a naming mismatch doesn't break data.
function alpacaKeyId(): string | undefined {
  return (
    process.env.ALPACA_API_KEY ??
    process.env.ALPACAP_API ??
    process.env.ALPACA_KEY_ID ??
    process.env.APCA_API_KEY_ID
  );
}
function alpacaSecret(): string | undefined {
  return (
    process.env.ALPACA_API_SECRET ??
    process.env.ALPACA_API_SECRET_KEY ??
    process.env.ALPACA_SECRET_KEY ??
    process.env.APCA_API_SECRET_KEY
  );
}

/** True when both Alpaca credentials are present — used by the provider seam. */
export function alpacaConfigured(): boolean {
  return Boolean(alpacaKeyId() && alpacaSecret());
}

function headers(): Record<string, string> {
  const key = alpacaKeyId();
  const secret = alpacaSecret();
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

export interface Snapshot {
  /** Most recent trade — reflects extended-hours prints on IEX / 24-7 crypto. */
  price: number;
  /** Close of the most recent regular-session daily bar. */
  dailyClose: number | null;
  /** Previous regular-session daily close (yesterday). */
  prevClose: number | null;
}

/**
 * Snapshot: latest trade plus today's and yesterday's daily bars. Lets the UI
 * separate the live (possibly extended-hours) print from the regular close.
 */
export async function fetchSnapshot(symbol: string, assetClass: AssetClass): Promise<Snapshot> {
  if (assetClass === "crypto") {
    const sym = normalizeCryptoSymbol(symbol);
    const data = await get(`/v1beta3/crypto/us/snapshots`, { symbols: sym });
    const snap = data.snapshots?.[sym] ?? {};
    const price = snap.latestTrade?.p ?? snap.dailyBar?.c;
    if (typeof price !== "number") throw new Error(`No snapshot for ${symbol}`);
    return {
      price,
      dailyClose: snap.dailyBar?.c ?? null,
      prevClose: snap.prevDailyBar?.c ?? null,
    };
  }
  const sym = symbol.toUpperCase();
  const snap = await get(`/v2/stocks/${sym}/snapshot`, { feed: "iex" });
  const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c;
  if (typeof price !== "number") throw new Error(`No snapshot for ${symbol}`);
  return {
    price,
    dailyClose: snap.dailyBar?.c ?? null,
    prevClose: snap.prevDailyBar?.c ?? null,
  };
}

/** Most-active US equities by volume — the coarse universe for the daily market scan. */
export async function fetchMostActives(top = 100): Promise<string[]> {
  const data = await get(`/v1beta1/screener/stocks/most-actives`, {
    by: "volume",
    top: String(top),
  });
  return (data.most_actives ?? []).map((a: { symbol: string }) => a.symbol);
}

/**
 * Adapter exposing this module as a `MarketDataProvider`. Alpaca's free IEX feed
 * doesn't include an options chain or Level II depth, so those optional methods
 * are intentionally omitted — the API routes derive a simulated view instead.
 */
export const alpacaProvider: MarketDataProvider = {
  name: "alpaca",
  isLive: true,
  fetchBars,
  fetchLatestPrice,
  fetchMostActives,
};
