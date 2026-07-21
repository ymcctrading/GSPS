/**
 * Deterministic mock market-data provider (Phase 0).
 * No network, no keys. Given the same symbol+window it always returns the same
 * data, so charts, the scanner, and tests are reproducible. Prices are a seeded
 * pseudo-random walk anchored to a per-symbol base price.
 */
import type {
  CandleRequest,
  MarketDataProvider,
  OHLCVBar,
  Quote,
  Tick,
  AssetClass,
} from "./types";
import { aggregate } from "@/lib/candles/aggregate";
import { classifySession } from "@/lib/candles/sessions";

const BASE_PRICES: Record<string, { base: number; assetClass: AssetClass }> = {
  SPY: { base: 742.09, assetClass: "ETF" },
  BTC: { base: 64250, assetClass: "CRYPTO" },
  AAPL: { base: 185.2, assetClass: "STOCK" },
  MSFT: { base: 428.5, assetClass: "STOCK" },
  GOOGL: { base: 178.3, assetClass: "STOCK" },
  AMZN: { base: 201.7, assetClass: "STOCK" },
  NVDA: { base: 128.4, assetClass: "STOCK" },
  META: { base: 612.8, assetClass: "STOCK" },
  TSLA: { base: 248.9, assetClass: "STOCK" },
  NOK: { base: 4.15, assetClass: "STOCK" },
};

/** Small deterministic PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic value in [0,1) from a seed and an integer index (stateless). */
function mulberryAt(seed: number, index: number): number {
  let t = (seed + Math.imul(index, 0x6d2b79f5)) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function meta(symbol: string): { base: number; assetClass: AssetClass } {
  return BASE_PRICES[symbol.toUpperCase()] ?? { base: 100, assetClass: "STOCK" };
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock";

  async getQuote(symbol: string): Promise<Quote> {
    const { base, assetClass } = meta(symbol);
    const rng = makeRng(hashSymbol(symbol) ^ 0x9e3779b9);
    const changePct = (rng() - 0.5) * 4; // +/-2%
    const change = +(base * (changePct / 100)).toFixed(2);
    return {
      symbol: symbol.toUpperCase(),
      assetClass,
      last: +(base + change).toFixed(2),
      change,
      changePct: +changePct.toFixed(2),
      timestamp: Date.now(),
    };
  }

  async getTicks(symbol: string, from: number, to: number): Promise<Tick[]> {
    const { base, assetClass } = meta(symbol);
    const seed = hashSymbol(symbol);
    const isCrypto = assetClass === "CRYPTO";
    const stepMs = 60_000; // one synthetic tick per minute
    const ticks: Tick[] = [];

    // Prices are a PURE function of the absolute minute index, so any query
    // window returns identical values for the same timestamps (a real provider
    // property). No dependency on `from` -> scans are reproducible.
    const start = Math.ceil(from / stepMs) * stepMs;
    for (let ts = start; ts <= to; ts += stepMs) {
      // 24/7 assets always trade; equities only when the session is open.
      if (!isCrypto && classifySession(ts) === "CLOSED") continue;
      const m = Math.floor(ts / stepMs);
      // Layered deterministic oscillation + hashed micro-noise (no random walk).
      const noise = mulberryAt(seed, m) - 0.5; // [-0.5, 0.5]
      const factor =
        1 +
        0.06 * Math.sin(m / 811) +
        0.03 * Math.sin(m / 193) +
        0.012 * noise;
      const price = Math.max(0.01, base * factor);
      ticks.push({
        symbol: symbol.toUpperCase(),
        assetClass,
        timestamp: ts,
        price: +price.toFixed(2),
        size: Math.floor(mulberryAt(seed ^ 0x51ed270b, m) * 1000) + 1,
      });
    }
    return ticks;
  }

  async getCandles(req: CandleRequest): Promise<OHLCVBar[]> {
    const ticks = await this.getTicks(req.symbol, req.from, req.to);
    return aggregate(ticks, req.interval, {
      includeExtendedHours: req.includeExtendedHours,
    });
  }
}
