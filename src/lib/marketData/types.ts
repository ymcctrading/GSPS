/**
 * Market-data abstraction (Suggestion S-2 in the review log).
 * Every consumer (charts, scanner, tooltips) talks to this interface, never to a
 * concrete vendor. Phase 0 ships a deterministic MockProvider; a real vendor
 * (Polygon/Alpaca/Databento/etc.) can be dropped in without touching consumers.
 */

export type AssetClass =
  | "STOCK"
  | "ETF"
  | "OPTION"
  | "FUTURE"
  | "COMMODITY"
  | "FOREX"
  | "CRYPTO";

/** Chart interval identifiers. */
export type Interval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1d"
  | "1w"
  | "1M";

/** Trading session an individual tick/bar belongs to. */
export type Session = "PRE" | "RTH" | "POST";

/** A single raw trade/quote tick (epoch ms, UTC). */
export interface Tick {
  symbol: string;
  assetClass: AssetClass;
  /** Epoch milliseconds, UTC. */
  timestamp: number;
  price: number;
  size: number;
}

/** An OHLCV bar. `session` is set for intraday aggregation of equities. */
export interface OHLCVBar {
  /** Epoch ms of the bar's opening boundary, UTC. */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Present for equity intraday/daily bars; omitted for 24h assets. */
  session?: Session;
}

export interface CandleRequest {
  symbol: string;
  interval: Interval;
  /** Inclusive lower bound, epoch ms UTC. */
  from: number;
  /** Inclusive upper bound, epoch ms UTC. */
  to: number;
  /** Include pre/post-market (ETH). Default false — "less is more". */
  includeExtendedHours?: boolean;
}

export interface Quote {
  symbol: string;
  assetClass: AssetClass;
  last: number;
  change: number;
  changePct: number;
  /** Epoch ms UTC. */
  timestamp: number;
}

/**
 * The seam. A provider returns raw ticks and/or already-aggregated bars.
 * The candle-aggregation layer (see lib/candles) is responsible for turning
 * ticks into session-correct bars, so providers that only expose ticks still
 * get the 8-vs-9-candle fix for free.
 */
export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<Quote>;
  /** Raw ticks in [from, to]. Used by the candle aggregator. */
  getTicks(symbol: string, from: number, to: number): Promise<Tick[]>;
  /** Convenience: bars for a request, honoring includeExtendedHours. */
  getCandles(req: CandleRequest): Promise<OHLCVBar[]>;
}
