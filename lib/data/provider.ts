/**
 * Market-data provider seam.
 * -----------------------------------------------------------------------------
 * Everything that needs price data (API routes, scan pipeline, chart tabs) talks
 * to a `MarketDataProvider` — never to a vendor SDK directly. Swapping the data
 * source (or falling back to synthetic demo data) is a one-line change here, not
 * a rewrite across the app.
 *
 *   getMarketDataProvider()  →  the active provider for this request
 *
 * Selection order:
 *   1. MARKET_DATA_PROVIDER=alpaca|synthetic  (explicit override)
 *   2. Alpaca, when its credentials are configured
 *   3. Synthetic demo provider (so a public chart still renders with no keys)
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import type { AlertQuote } from "@/lib/alerts/rules";
import { TF_INTERVAL_MS } from "@/lib/timeframe";
import { YEAR_COUNT_MONTHLY_YEARS, longMonthlyWindow } from "@/lib/gann/secondaryTime";

export interface MarketDataProvider {
  /** Stable identifier, surfaced to the UI (e.g. "alpaca", "synthetic"). */
  readonly name: string;
  /** True when backed by a real market-data feed; false for demo/simulated data. */
  readonly isLive: boolean;

  fetchBars(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date | null,
    assetClass: AssetClass,
    limit?: number,
    /**
     * Pre-/post-market bars on sub-daily timeframes, when the provider can
     * serve them (still subject to the free feed's ~15min delay — see
     * app/api/bars/route.ts's `end` comment). Defaults to false so every
     * existing caller (scans, indicators) keeps scoring the regular session
     * only; the chart route is the one caller that opts in.
     */
    includeExtendedHours?: boolean,
  ): Promise<Bar[]>;

  /**
   * Optional batch form of `fetchBars` for providers whose upstream API can
   * price many symbols in one request. Callers that need the same timeframe
   * across a large symbol set (e.g. `runMarketScan`) should prefer this over
   * looping `fetchBars` per symbol — see `fetchAllTimeframesBatch` below.
   */
  fetchBarsBatch?(
    symbols: string[],
    timeframe: Timeframe,
    start: Date,
    end: Date | null,
    assetClass: AssetClass,
  ): Promise<Map<string, Bar[]>>;

  fetchLatestPrice(symbol: string, assetClass: AssetClass): Promise<number>;

  /**
   * Optional batch form of `fetchLatestPrice`: many symbols in a few requests.
   * A symbol missing from the map is read with `fetchLatestPrice`.
   */
  fetchLatestPrices?(symbols: string[], assetClass: AssetClass): Promise<Map<string, number>>;

  fetchMostActives(top?: number): Promise<string[]>;

  /**
   * Optional: the figures the alert editor watches (bid, ask, the day's bar,
   * the closes), for many symbols at once. A provider without it can still
   * check Last alerts through `fetchLatestPrice`.
   */
  fetchAlertQuotes?(symbols: string[], assetClass: AssetClass, now?: Date): Promise<Map<string, AlertQuote>>;

  /** Optional extended data. Providers without a real feed for these return undefined. */
  fetchOptionChain?(symbol: string, assetClass: AssetClass): Promise<OptionChain>;
  fetchLevel2?(symbol: string, assetClass: AssetClass): Promise<Level2Book>;
}

/** ---- Extended market-data shapes (Options / Level II tabs) -------------- */

export interface OptionContract {
  strike: number;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  /** Rate of change of premium per $1 move in the underlying. */
  delta: number;
  /** Rate of change of delta per $1 move — curvature of the position. */
  gamma: number;
  /** Premium decay per day, expressed as a negative number for long options. */
  theta: number;
  /** Premium change per 1 percentage-point move in implied volatility. */
  vega: number;
  /** Underlying's beta vs the broad market — position-level, not per contract. */
  beta: number;
  iv: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  /**
   * Broker symbol to trade this contract (OCC format). Present only when the
   * chain came from a feed that lists real tradable contracts.
   */
  contractSymbol?: string;
}

export interface OptionChain {
  symbol: string;
  underlyingPrice: number;
  expiration: string;
  /** True when the chain is derived/simulated rather than a live vendor feed. */
  simulated: boolean;
  contracts: OptionContract[];
}

export interface Level2Quote {
  price: number;
  size: number;
}

export interface Level2Book {
  symbol: string;
  price: number;
  /** True when depth is derived/simulated rather than a live vendor feed. */
  simulated: boolean;
  bids: Level2Quote[];
  asks: Level2Quote[];
  spread: number;
}

/** ---- Provider selection ------------------------------------------------ */

// Lazy imports keep the two providers from loading each other's deps eagerly.
import { alpacaProvider, alpacaConfigured } from "./alpaca";
import { syntheticProvider } from "./synthetic";
import { fetchMonthlyStored } from "./monthlyStore";
import { fetchCryptoClosedStored, keepsClosedBars } from "./closedBarsStore";

export function getMarketDataProvider(): MarketDataProvider {
  const choice = (process.env.MARKET_DATA_PROVIDER ?? "").trim().toLowerCase();
  if (choice === "synthetic" || choice === "demo" || choice === "mock") {
    return syntheticProvider;
  }
  if (choice === "alpaca") return alpacaProvider;
  // Auto: prefer the real feed when it's configured, else demo data.
  return alpacaConfigured() ? alpacaProvider : syntheticProvider;
}

/**
 * Bar count the execution series carries at "15Min", the baseline every
 * caller was tuned against (`detectPatterns`, `atr(...slice(-30), 14)`, entry
 * confirmation). Scaled by how much coarser `executionTimeframe` is, so
 * switching it still delivers roughly the same number of execution bars
 * rather than starving pattern detection when the bar widens.
 */
const EXECUTION_LOOKBACK_DAYS_AT_15MIN = 7;

function executionLookbackDays(executionTimeframe: Timeframe): number {
  const scale = TF_INTERVAL_MS[executionTimeframe] / TF_INTERVAL_MS["15Min"];
  return EXECUTION_LOOKBACK_DAYS_AT_15MIN * scale;
}

/**
 * All timeframes the top-down GSPS pipeline consumes, fetched through whichever
 * provider is active. Lives at the seam so callers never import a vendor module.
 *
 * `executionTimeframe` — defaults to "15Min", the pipeline's normal bar. Pass
 * `lib/scanTicker.ts`'s `EXECUTION_TIMEFRAME` explicitly so a caller can never
 * fetch a different bar than the one patterns will actually be detected on;
 * see that constant's own comment for why the two must always agree.
 */
export async function fetchAllTimeframes(
  symbol: string,
  assetClass: AssetClass,
  executionTimeframe: Timeframe = "15Min",
) {
  const provider = getMarketDataProvider();
  const now = Date.now();
  const yearsAgo = (n: number) => new Date(now - n * 365.25 * 24 * 3600 * 1000);
  const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000);

  // Stocks on the free IEX feed can't query the most recent ~15 min of data.
  // Synthetic data has no such delay.
  const end =
    assetClass === "crypto" || !provider.isLive
      ? null
      : new Date(now - 16 * 60 * 1000);

  // The fixed "hourly" slot and an `executionTimeframe` of "1Hour" (as under
  // the temporary EXECUTION_TIMEFRAME override -- see AGENTS.md) are the same
  // series. Fetching both separately doubled a network round-trip for
  // identical data; when they coincide, fetch once with a window wide enough
  // for both needs and reuse it. Reverting the override to "15Min" (its real
  // design) restores the original two-fetch behavior automatically -- no
  // separate cleanup needed here.
  const executionIsHourly = executionTimeframe === "1Hour";
  const hourlyLookbackDays = executionIsHourly
    ? Math.max(30, executionLookbackDays(executionTimeframe))
    : 30;

  const [monthlyYearCount, weekly, daily, hourly, execution] = await Promise.all([
    provider.fetchBars(symbol, "1Month", yearsAgo(YEAR_COUNT_MONTHLY_YEARS), end, assetClass),
    // A week before the five years, so the weekly chart's first week (`levelCharts`) is never cut at the boundary.
    provider.fetchBars(symbol, "1Week", new Date(yearsAgo(5).getTime() - 7 * 24 * 3600 * 1000), end, assetClass),
    provider.fetchBars(symbol, "1Day", yearsAgo(1), end, assetClass),
    provider.fetchBars(symbol, "1Hour", daysAgo(hourlyLookbackDays), end, assetClass),
    executionIsHourly
      ? Promise.resolve(null)
      : provider.fetchBars(symbol, executionTimeframe, daysAgo(executionLookbackDays(executionTimeframe)), end, assetClass),
  ]);

  const monthlyLong = longMonthlyWindow(monthlyYearCount, new Date(now));
  return {
    monthly: tenYears(monthlyLong, yearsAgo(10)),
    monthlyLong,
    monthlyYearCount,
    weekly,
    daily,
    hourly,
    execution: executionIsHourly ? hourly : (execution ?? []),
  };
}

/**
 * The monthly bars every reading uses are ten years; the fetch reaches
 * `YEAR_COUNT_MONTHLY_YEARS` (the time-window hold's yearly counts); the class
 * C long counts get `LONG_MONTHLY_YEARS` of it so they (C-TIME-09's 144 months) can
 * see their pivots, and only those readings get the longer series.
 */
function tenYears(monthly: Bar[], from: Date): Bar[] {
  return monthly.filter((b) => Date.parse(b.t) >= from.getTime());
}

export interface AllTimeframeBars {
  monthly: Bar[];
  /** `LONG_MONTHLY_YEARS` of monthly bars, for the class C long counts only. */
  monthlyLong?: Bar[];
  /** `YEAR_COUNT_MONTHLY_YEARS` of monthly bars, for the time-window hold's yearly counts only. */
  monthlyYearCount?: Bar[];
  weekly: Bar[];
  daily: Bar[];
  hourly: Bar[];
  /** Bars on whatever `executionTimeframe` the fetch was called with — see that param's own comment. */
  execution: Bar[];
}

/**
 * Batched form of `fetchAllTimeframes` for many symbols at once — five
 * requests total (one per timeframe, each covering every symbol) instead of
 * five per symbol. Falls back to an empty map when the active provider has
 * no batch support (e.g. the synthetic demo provider); callers should treat
 * a missing entry as "fetch this symbol individually" rather than an error.
 * One asset class a call: equities by default, crypto for the market scan's
 * crypto pass (`lib/scan/cryptoUniverse.ts`), which has no feed delay to
 * hold back for. `executionTimeframe` — see `fetchAllTimeframes`'s
 * own comment; the caller must pass the same value it will detect patterns
 * against, or this prefetch silently hands `scanTicker` the wrong bar.
 */
export async function fetchAllTimeframesBatch(
  symbols: string[],
  executionTimeframe: Timeframe = "15Min",
  assetClass: AssetClass = "us_equity",
  /** Called as each timeframe's request settles, with its wall time, so a slow chart can be named. */
  onTimeframe?: (timeframe: Timeframe, ms: number) => void,
): Promise<Map<string, AllTimeframeBars>> {
  const provider = getMarketDataProvider();
  const out = new Map<string, AllTimeframeBars>();
  if (!provider.fetchBarsBatch || symbols.length === 0) return out;
  const fetchBatch = provider.fetchBarsBatch.bind(provider);
  const timed = (timeframe: Timeframe, start: Date) => {
    const began = Date.now();
    return fetchBatch(symbols, timeframe, start, end, assetClass).finally(() =>
      onTimeframe?.(timeframe, Date.now() - began),
    );
  };

  const now = Date.now();
  const yearsAgo = (n: number) => new Date(now - n * 365.25 * 24 * 3600 * 1000);
  const daysAgo = (n: number) => new Date(now - n * 24 * 3600 * 1000);
  const end = assetClass === "crypto" || !provider.isLive ? null : new Date(now - 16 * 60 * 1000);

  // See the matching comment in `fetchAllTimeframes` above -- same
  // deduplication, batched form. A widened universe makes this one
  // batched request (not five per symbol) that gets skipped, so the saving
  // scales with `symbols.length` the way every other timeframe here does.
  const executionIsHourly = executionTimeframe === "1Hour";
  const hourlyLookbackDays = executionIsHourly
    ? Math.max(30, executionLookbackDays(executionTimeframe))
    : 30;
  // Closed crypto bars come from the store (`closedBarsStore.ts`): only the
  // newest are read live. Equities are split adjusted, so they are read whole.
  const intraday = (timeframe: Timeframe, start: Date) => {
    if (assetClass !== "crypto" || !provider.isLive || !keepsClosedBars(timeframe)) return timed(timeframe, start);
    const began = Date.now();
    return fetchCryptoClosedStored(fetchBatch, symbols, timeframe, start).finally(() =>
      onTimeframe?.(timeframe, Date.now() - began),
    );
  };

  const [monthly, weekly, daily, hourly, execution] = await Promise.all([
    // Closed months come from the month's store (`monthlyStore.ts`): only the
    // last two are read live.
    assetClass === "us_equity" && provider.isLive
      ? (() => {
          const began = Date.now();
          return fetchMonthlyStored(fetchBatch, symbols, yearsAgo(YEAR_COUNT_MONTHLY_YEARS), end).finally(() =>
            onTimeframe?.("1Month", Date.now() - began),
          );
        })()
      : timed("1Month", yearsAgo(YEAR_COUNT_MONTHLY_YEARS)),
    timed("1Week", new Date(yearsAgo(5).getTime() - 7 * 24 * 3600 * 1000)),
    timed("1Day", yearsAgo(1)),
    intraday("1Hour", daysAgo(hourlyLookbackDays)),
    executionIsHourly
      ? Promise.resolve(null)
      : intraday(executionTimeframe, daysAgo(executionLookbackDays(executionTimeframe))),
  ]);

  for (const symbol of symbols) {
    const sym = symbol.toUpperCase();
    const hourlyBars = hourly.get(sym) ?? [];
    const monthlyYearCount = monthly.get(sym) ?? [];
    const monthlyLong = longMonthlyWindow(monthlyYearCount, new Date(now));
    out.set(symbol, {
      monthly: tenYears(monthlyLong, yearsAgo(10)),
      monthlyLong,
      monthlyYearCount,
      weekly: weekly.get(sym) ?? [],
      daily: daily.get(sym) ?? [],
      hourly: hourlyBars,
      execution: executionIsHourly ? hourlyBars : (execution?.get(sym) ?? []),
    });
  }
  return out;
}
