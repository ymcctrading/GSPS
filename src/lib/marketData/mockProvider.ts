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
import type { Interval } from "./types";

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

/**
 * Sampling resolution (ms between synthetic ticks) per chart interval. Chosen so
 * every aggregation bucket still receives several ticks, while a 120-day daily
 * scan doesn't generate ~47k minute ticks per symbol. Ticks must be finer than
 * the bar width they build.
 */
function tickStepFor(interval: Interval): number {
  switch (interval) {
    case "1m":
      return 60_000; // 1-minute ticks
    case "5m":
      return 60_000;
    case "15m":
      return 5 * 60_000;
    case "30m":
      return 5 * 60_000;
    case "1h":
      return 15 * 60_000;
    case "2h":
      return 30 * 60_000;
    case "4h":
      return 60 * 60_000;
    case "1d":
      return 60 * 60_000; // hourly samples -> daily OHLC
    case "1w":
      return 60 * 60_000;
    case "1M":
      return 4 * 60 * 60_000;
    default:
      return 60_000;
  }
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
    return this.generateTicks(symbol, from, to, 60_000);
  }

  /**
   * Generate synthetic ticks at a given step. Prices are a PURE function of the
   * absolute tick index, so any query window returns identical values for the
   * same timestamps (a real provider property) -> scans are reproducible.
   */
  private generateTicks(
    symbol: string,
    from: number,
    to: number,
    stepMs: number
  ): Tick[] {
    const { base, assetClass } = meta(symbol);
    const seed = hashSymbol(symbol);
    const isCrypto = assetClass === "CRYPTO";
    const ticks: Tick[] = [];

    const start = Math.ceil(from / stepMs) * stepMs;
    for (let ts = start; ts <= to; ts += stepMs) {
      // 24/7 assets always trade; equities only when the session is open.
      if (!isCrypto && classifySession(ts) === "CLOSED") continue;
      // Index against a fixed 1-minute grid so different step sizes still sample
      // the same underlying price curve.
      const m = Math.floor(ts / 60_000);
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
    const ticks = this.generateTicks(
      req.symbol,
      req.from,
      req.to,
      tickStepFor(req.interval)
    );
    return aggregate(ticks, req.interval, {
      includeExtendedHours: req.includeExtendedHours,
    });
  }
}
