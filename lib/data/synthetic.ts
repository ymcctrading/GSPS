/**
 * Synthetic market-data provider.
 * -----------------------------------------------------------------------------
 * A deterministic, seeded generator that stands in for a real feed when no
 * vendor credentials are configured. It exists so the public/shareable chart
 * always renders something coherent (and so local dev works offline), and to
 * back the Options / Level II tabs with clearly-labelled simulated depth.
 *
 * Everything here is a pseudo-random function of the symbol, so the same symbol
 * always produces the same chart shape — only the trailing live price jitters.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import type {
  Level2Book,
  MarketDataProvider,
  OptionChain,
  OptionContract,
} from "./provider";

/** Deterministic 32-bit hash of a string. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 seeded PRNG — cheap, deterministic, good enough for demo data. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Recognisable anchor prices so the demo looks credible for common tickers.
const ANCHOR: Record<string, number> = {
  SPY: 548, QQQ: 478, AAPL: 224, MSFT: 425, NVDA: 128, TSLA: 248,
  AMZN: 184, GOOGL: 178, META: 512, AMD: 158, NFLX: 640, DIS: 96,
  BTC: 64200, "BTC/USD": 64200, ETH: 3180, "ETH/USD": 3180, SOL: 148,
  DOGE: 0.16, LTC: 82, AVAX: 34, LINK: 14.2, XRP: 0.58, BCH: 380, UNI: 9.4,
};

function isCrypto(symbol: string): boolean {
  const known = ["BTC", "ETH", "SOL", "DOGE", "LTC", "AVAX", "LINK", "XRP", "BCH", "UNI"];
  const base = symbol.toUpperCase().replace(/[-/]?USD[TC]?$/, "");
  return symbol.includes("/") || known.includes(base);
}

/** Stable "fair" price for a symbol (session-stable; excludes live jitter). */
function anchorPrice(symbol: string): number {
  const up = symbol.toUpperCase();
  const base = up.replace(/[-/]?USD[TC]?$/, "");
  if (ANCHOR[up] != null) return ANCHOR[up];
  if (ANCHOR[base] != null) return ANCHOR[base];
  const h = hashStr(base);
  if (isCrypto(symbol)) return 5 + (h % 4200); // wide crypto spread
  return 18 + (h % 560); // typical equity range
}

const INTERVAL_MS: Record<Timeframe, number> = {
  "1Month": 30.44 * 24 * 3600 * 1000,
  "1Week": 7 * 24 * 3600 * 1000,
  "1Day": 24 * 3600 * 1000,
  "1Hour": 3600 * 1000,
  "15Min": 15 * 60 * 1000,
  "5Min": 5 * 60 * 1000,
  "1Min": 60 * 1000,
};

// Per-bar volatility (stdev of returns) by timeframe — larger on higher TFs.
const VOL: Record<Timeframe, number> = {
  "1Month": 0.075,
  "1Week": 0.045,
  "1Day": 0.018,
  "1Hour": 0.006,
  "15Min": 0.003,
  "5Min": 0.0018,
  "1Min": 0.0009,
};

const MIN_BARS: Record<Timeframe, number> = {
  "1Month": 60,
  "1Week": 80,
  "1Day": 120,
  "1Hour": 120,
  "15Min": 120,
  "5Min": 120,
  "1Min": 120,
};

const HARD_CAP = 1500;

function genBars(
  symbol: string,
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  limit: number,
): Bar[] {
  const interval = INTERVAL_MS[timeframe];
  const endMs = (end ?? new Date()).getTime();
  const span = Math.max(0, endMs - start.getTime());
  let n = Math.floor(span / interval);
  n = Math.min(n, limit, HARD_CAP);
  n = Math.max(n, MIN_BARS[timeframe]);

  const rnd = mulberry32(hashStr(`${symbol.toUpperCase()}|${timeframe}`));
  const vol = VOL[timeframe];
  // A gentle, seeded drift so charts trend rather than pure-random-walk.
  const drift = (rnd() - 0.5) * vol * 0.6;

  // Build a raw close series, then rescale so the final close hits the anchor.
  const rawCloses: number[] = [];
  let c = 1;
  for (let i = 0; i < n; i++) {
    const shock = (rnd() * 2 - 1) * vol;
    c *= 1 + drift + shock;
    if (c <= 0) c = 0.01;
    rawCloses.push(c);
  }
  const scale = anchorPrice(symbol) / rawCloses[n - 1];

  const bars: Bar[] = [];
  let prevClose = rawCloses[0] * scale;
  for (let i = 0; i < n; i++) {
    const close = rawCloses[i] * scale;
    const open = i === 0 ? close * (1 + (rnd() - 0.5) * vol) : prevClose;
    const wick = Math.abs(rnd() - 0.5) * vol + vol * 0.4;
    const hi = Math.max(open, close) * (1 + wick * rnd());
    const lo = Math.min(open, close) * (1 - wick * rnd());
    const vol_ = Math.round(1e5 + rnd() * 5e6);
    bars.push({
      t: new Date(start.getTime() + i * interval).toISOString(),
      o: round(open),
      h: round(hi),
      l: round(lo),
      c: round(close),
      v: vol_,
    });
    prevClose = close;
  }
  return bars;
}

function round(n: number): number {
  return n >= 100 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
}

/** Latest price = anchor plus a small, time-derived wobble so LIVE looks alive. */
function latestPrice(symbol: string): number {
  const base = anchorPrice(symbol);
  // Wobble cycles roughly every ~30s; amplitude ~0.15%.
  const phase = (Date.now() / 30000) % (Math.PI * 2);
  const jitter = Math.sin(phase + (hashStr(symbol) % 100)) * 0.0015;
  return round(base * (1 + jitter));
}

const DEFAULT_ACTIVES = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD", "NFLX",
  "SPY", "QQQ", "DIS", "BA", "JPM", "XOM", "WMT", "COIN", "PLTR", "SOFI", "F",
];

/** ---- Simulated Options chain (anchored on a real price when available) --- */

export function simulateOptionChain(symbol: string, underlyingPrice: number): OptionChain {
  const rnd = mulberry32(hashStr(`${symbol.toUpperCase()}|options`));
  const crypto = isCrypto(symbol);
  // Strike spacing scales with price magnitude.
  const step = niceStep(underlyingPrice);
  const atm = Math.round(underlyingPrice / step) * step;
  const contracts: OptionContract[] = [];

  // 7 strikes each side of the money.
  for (let k = -7; k <= 7; k++) {
    const strike = round(atm + k * step);
    if (strike <= 0) continue;
    for (const type of ["call", "put"] as const) {
      const itm =
        type === "call" ? strike < underlyingPrice : strike > underlyingPrice;
      const dist = Math.abs(strike - underlyingPrice) / underlyingPrice;
      // Rough Black-Scholes-ish delta proxy.
      const rawDelta = Math.max(0.02, Math.min(0.98, 0.5 - k * 0.06 * (type === "call" ? 1 : -1)));
      const delta = type === "call" ? rawDelta : -Math.abs(1 - rawDelta);
      const iv = 0.25 + dist * 1.4 + rnd() * 0.05;
      const intrinsic = itm ? Math.abs(underlyingPrice - strike) : 0;
      const extrinsic = underlyingPrice * iv * 0.06 * Math.exp(-dist * 3);
      const mid = Math.max(0.01, round(intrinsic + extrinsic));
      const halfSpread = Math.max(0.01, round(mid * 0.03));
      contracts.push({
        strike,
        type,
        bid: round(Math.max(0.01, mid - halfSpread)),
        ask: round(mid + halfSpread),
        last: round(mid * (1 + (rnd() - 0.5) * 0.02)),
        delta: Math.round(delta * 100) / 100,
        iv: Math.round(iv * 1000) / 1000,
        openInterest: Math.round(rnd() * 12000 * Math.exp(-dist * 2)),
        volume: Math.round(rnd() * 4000 * Math.exp(-dist * 2)),
        inTheMoney: itm,
      });
    }
  }

  // Next monthly-ish expiration (third Friday-ish — just a near-future date).
  const exp = new Date(Date.now() + (crypto ? 7 : 21) * 24 * 3600 * 1000);
  return {
    symbol: symbol.toUpperCase(),
    underlyingPrice: round(underlyingPrice),
    expiration: exp.toISOString().slice(0, 10),
    simulated: true,
    contracts,
  };
}

/** ---- Simulated Level II order book -------------------------------------- */

export function simulateLevel2(symbol: string, price: number): Level2Book {
  const rnd = mulberry32(hashStr(`${symbol.toUpperCase()}|${Math.floor(Date.now() / 4000)}|l2`));
  const tick = niceTick(price);
  const bids = [];
  const asks = [];
  let bidPx = price - tick;
  let askPx = price + tick;
  for (let i = 0; i < 10; i++) {
    bids.push({ price: round(bidPx), size: Math.round(100 + rnd() * 3000) * 10 });
    asks.push({ price: round(askPx), size: Math.round(100 + rnd() * 3000) * 10 });
    bidPx -= tick * (1 + Math.floor(rnd() * 2));
    askPx += tick * (1 + Math.floor(rnd() * 2));
  }
  return {
    symbol: symbol.toUpperCase(),
    price: round(price),
    simulated: true,
    bids,
    asks,
    spread: round(asks[0].price - bids[0].price),
  };
}

function niceStep(price: number): number {
  if (price >= 1000) return 50;
  if (price >= 200) return 10;
  if (price >= 50) return 5;
  if (price >= 10) return 1;
  if (price >= 1) return 0.5;
  return 0.05;
}

function niceTick(price: number): number {
  if (price >= 1000) return 1;
  if (price >= 100) return 0.05;
  if (price >= 1) return 0.01;
  return 0.0005;
}

export const syntheticProvider: MarketDataProvider = {
  name: "synthetic",
  isLive: false,
  async fetchBars(symbol, timeframe, start, end, _assetClass, limit = 10000) {
    return genBars(symbol, timeframe, start, end, limit);
  },
  async fetchLatestPrice(symbol) {
    return latestPrice(symbol);
  },
  async fetchMostActives(top = 20) {
    return DEFAULT_ACTIVES.slice(0, top);
  },
  async fetchOptionChain(symbol) {
    return simulateOptionChain(symbol, anchorPrice(symbol));
  },
  async fetchLevel2(symbol) {
    return simulateLevel2(symbol, latestPrice(symbol));
  },
};
