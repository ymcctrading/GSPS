/**
 * Alpaca live market-data provider.
 * -----------------------------------------------------------------------------
 * A real `MarketDataProvider` (the seam `lib/scanTicker.ts` scans through) that
 * turns Alpaca's Market Data API into the `MarketSnapshot` the engine expects.
 * Pass it to `scanTicker(ticker, premium, alpacaProvider)` and the whole
 * pipeline runs on live prices instead of the simulated feed — no other code
 * changes.
 *
 * What comes straight from real data (objective, computed here):
 *   price, previousClose, relativeVolume, ATR (current + prior), direction.
 *
 * What is a documented, tunable first-pass (the 0-9 checklist + Strat gate):
 *   each rule below is a named technical confirmation computed from real bars.
 *   This is an honest v1 scoring you can tune or swap for the full proprietary
 *   Strat/Gann rule engine later — it is NOT a black box.
 *
 * The HTTP layer is injectable (`httpGetJson`) so every helper and the provider
 * itself is unit-testable with canned Alpaca payloads and needs no live keys.
 */

import type { Direction } from "../../engine/scanner/types";
import type { MarketDataProvider, MarketSnapshot } from "../scanTicker";

export const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
export const ATR_PERIOD = 14;
export const RVOL_LOOKBACK = 10;
export const SMA_PERIOD = 20;
/** Daily bars to request — enough history for ATR + SMA + prior-ATR. */
export const BARS_LIMIT = 40;

/** A single Alpaca daily bar (OHLCV). */
export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
}

/** Injectable HTTP seam: GET a URL with headers, parse JSON. */
export type HttpGetJson = (
  url: string,
  headers: Record<string, string>,
) => Promise<unknown>;

export interface AlpacaProviderConfig {
  /** Defaults to ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY from the environment. */
  credentials?: AlpacaCredentials;
  /** Defaults to a `fetch`-based implementation. */
  httpGetJson?: HttpGetJson;
  /** Defaults to the production data host. */
  baseUrl?: string;
  /** Data feed: free accounts use "iex" (default); paid use "sip". */
  feed?: "iex" | "sip";
  /** Fetch the latest trade for a truly live intraday price. Default true. */
  useLatestTrade?: boolean;
}

// --- Pure indicator helpers (exported for direct unit testing) --------------

/** Wilder True Range for one bar given the prior close. */
export function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );
}

/** Simple-average ATR over `period`; needs at least `period + 1` bars. */
export function computeAtr(bars: AlpacaBar[], period = ATR_PERIOD): number {
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(trueRange(bars[i].h, bars[i].l, bars[i - 1].c));
  }
  const recent = trs.slice(-period);
  if (recent.length === 0) return 0;
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/** Wilder RSI over `period`; needs at least `period + 1` closes. */
export function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number {
  const recent = values.slice(-period);
  if (recent.length === 0) return 0;
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/** Average volume over the last `lookback` bars. */
export function averageVolume(bars: AlpacaBar[], lookback = RVOL_LOOKBACK): number {
  const recent = bars.slice(-lookback);
  if (recent.length === 0) return 0;
  return recent.reduce((s, b) => s + b.v, 0) / recent.length;
}

/** Count trailing consecutive closes moving in `dir` (momentum exhaustion). */
export function consecutiveCloses(closes: number[], dir: "up" | "down"): number {
  let count = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    const up = closes[i] > closes[i - 1];
    const down = closes[i] < closes[i - 1];
    if ((dir === "up" && up) || (dir === "down" && down)) count++;
    else break;
  }
  return count;
}

/**
 * Turn a run of daily bars (ascending by time) into a scored `MarketSnapshot`.
 * Pure — no network — so it is exhaustively unit-testable.
 */
export function snapshotFromBars(
  symbol: string,
  bars: AlpacaBar[],
  latestPrice?: number,
): MarketSnapshot {
  const minBars = Math.max(ATR_PERIOD + 2, SMA_PERIOD + 1, RVOL_LOOKBACK + 1);
  if (bars.length < minBars) {
    throw new Error(
      `Alpaca returned ${bars.length} bars for ${symbol}; need >= ${minBars} to score. ` +
        `The symbol may be illiquid/invalid or the free IEX feed may lack history.`,
    );
  }

  const closes = bars.map((b) => b.c);
  const last = bars[bars.length - 1];
  const priorBars = bars.slice(0, -1);

  const price = latestPrice ?? last.c;
  const previousClose = bars[bars.length - 2].c;

  const atr = computeAtr(bars);
  const previousAtr = computeAtr(priorBars);

  const avgVol = averageVolume(priorBars, RVOL_LOOKBACK);
  const relativeVolume = avgVol > 0 ? Number((last.v / avgVol).toFixed(2)) : 0;

  // Mean reversion: price stretched BELOW its mean is an oversold (bullish)
  // revert-up candidate; stretched above is an overbought (bearish) one.
  const smaValue = sma(closes.slice(0, -1), SMA_PERIOD);
  const direction: Direction = price < smaValue ? "bullish" : "bearish";

  // Simplified Strat "actionable reversal bar" gate: the most recent bar closes
  // in the reversion direction (bullish candle for a bullish reversion). Replace
  // with the full Strat sniper/snapper rule set when it is implemented.
  const structuralAgreement =
    direction === "bullish" ? last.c >= last.o : last.c <= last.o;

  // 0-9 checklist — each entry is one named, real technical confirmation.
  const rsi = computeRsi(closes);
  const stretch = Math.abs(price - smaValue);
  const window = closes.slice(-SMA_PERIOD);
  const windowLow = Math.min(...window);
  const windowHigh = Math.max(...window);
  const consecutive =
    direction === "bullish"
      ? consecutiveCloses(priorBars.map((b) => b.c), "down")
      : consecutiveCloses(priorBars.map((b) => b.c), "up");
  const gapPct =
    previousClose > 0 ? Math.abs(last.o - previousClose) / previousClose : 0;

  const checklist: boolean[] = [
    relativeVolume >= 1.5, // 1. volume surge
    atr >= previousAtr * 1.1, // 2. ATR expansion
    stretch >= atr, // 3. price stretched >= 1 ATR from the mean
    direction === "bullish" ? rsi <= 35 : rsi >= 65, // 4. RSI at an extreme
    consecutive >= 2, // 5. momentum exhaustion (2+ bars against reversion)
    direction === "bullish"
      ? price <= windowLow * 1.03
      : price >= windowHigh * 0.97, // 6. near the 20-day extreme
    last.v >= avgVol, // 7. above-average volume
    gapPct >= 0.01, // 8. >= 1% gap from prior close
    last.h - last.l >= atr * 1.5, // 9. wide-range bar
  ];

  return {
    symbol: symbol.toUpperCase(),
    price,
    previousClose,
    relativeVolume,
    atr,
    previousAtr,
    direction,
    structuralAgreement,
    checklist,
  };
}

// --- Network provider factory -----------------------------------------------

const defaultHttpGetJson: HttpGetJson = async (url, headers) => {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Alpaca request failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
    );
  }
  return res.json();
};

/**
 * Accepted env-var names, in priority order. The canonical names are first; the
 * rest are common variants (including Alpaca's own SDK `APCA_` prefix) so a
 * reasonable name just works without an exact match.
 */
export const KEY_ID_ENV_VARS = [
  "ALPACA_API_KEY_ID",
  "ALPACA_API_KEY",
  "APCA_API_KEY_ID",
];
export const SECRET_ENV_VARS = [
  "ALPACA_API_SECRET_KEY",
  "ALPACA_SECRET_KEY",
  "APCA_API_SECRET_KEY",
];

/** First non-empty environment variable among `names`. */
function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function resolveCredentials(config: AlpacaProviderConfig): AlpacaCredentials {
  const keyId = config.credentials?.keyId ?? firstEnv(KEY_ID_ENV_VARS);
  const secretKey = config.credentials?.secretKey ?? firstEnv(SECRET_ENV_VARS);
  if (!keyId || !secretKey) {
    throw new Error(
      `Alpaca credentials missing. Set one of [${KEY_ID_ENV_VARS.join(", ")}] and ` +
        `one of [${SECRET_ENV_VARS.join(", ")}] (or pass config.credentials).`,
    );
  }
  return { keyId, secretKey };
}

/** True when Alpaca credentials are present in the environment. */
export function hasAlpacaCredentials(): boolean {
  return Boolean(firstEnv(KEY_ID_ENV_VARS) && firstEnv(SECRET_ENV_VARS));
}

/**
 * Build a live `MarketDataProvider` backed by Alpaca. Credentials and the HTTP
 * layer are resolved lazily (on first call), so importing this never throws.
 */
export function createAlpacaProvider(
  config: AlpacaProviderConfig = {},
): MarketDataProvider {
  const baseUrl = config.baseUrl ?? ALPACA_DATA_BASE_URL;
  const feed = config.feed ?? "iex";
  const useLatestTrade = config.useLatestTrade ?? true;
  const httpGetJson = config.httpGetJson ?? defaultHttpGetJson;

  return async (ticker: string): Promise<MarketSnapshot> => {
    const { keyId, secretKey } = resolveCredentials(config);
    const headers = {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secretKey,
    };
    const symbol = ticker.toUpperCase();

    const barsUrl =
      `${baseUrl}/v2/stocks/${symbol}/bars` +
      `?timeframe=1Day&limit=${BARS_LIMIT}&adjustment=split&feed=${feed}`;
    const barsRes = (await httpGetJson(barsUrl, headers)) as {
      bars?: AlpacaBar[] | null;
    };
    const bars = barsRes.bars ?? [];

    let latestPrice: number | undefined;
    if (useLatestTrade) {
      const tradeUrl =
        `${baseUrl}/v2/stocks/${symbol}/trades/latest?feed=${feed}`;
      const tradeRes = (await httpGetJson(tradeUrl, headers)) as {
        trade?: { p?: number };
      };
      latestPrice = tradeRes.trade?.p;
    }

    return snapshotFromBars(symbol, bars, latestPrice);
  };
}
