/**
 * "Large cap", for the one thing this app uses it for: giving a stop room to
 * breathe on names where a tight, noise-width stop was cutting off trades
 * that would otherwise have worked. GSPS has no fundamentals feed — no
 * market cap, no shares outstanding — so this is not a market-cap read. It's
 * a proxy built from what the app already has: a maintained list of
 * mega/large-cap names, unioned with a price-and-turnover floor high enough
 * that clearing it without being a large cap is rare. Either signal alone was
 * the wrong tradeoff — a list alone misses everything not on it (and rots as
 * the market changes); a liquidity floor alone would as happily flag a
 * heavily-traded small float as it would AAPL. Together, a symbol only needs
 * to clear one of the two, so the list's blind spots are covered by the
 * proxy and the proxy's false positives are rare at this threshold.
 *
 * Stocks only — `isLargeCapStock` returns false for crypto unconditionally.
 * Nothing here changes when the list drifts out of date: a name that grows
 * into large-cap liquidity clears the proxy on its own before anyone updates
 * the list, and a name that shrinks out of it stops clearing the proxy the
 * same way.
 */

import type { AssetClass } from "@/lib/types";
import type { LiquidityRead } from "@/lib/scan/liquidity";

/**
 * Roughly the S&P 100 / mega-cap names, as of 2026. Not exhaustive and not
 * meant to be — it exists to catch well-known large caps whose price or
 * turnover might dip under the proxy floor below on a quiet day, not to be
 * the system of record for what counts as "large cap". Review periodically;
 * a name missing from this list still clears the mode via the proxy if it's
 * genuinely large.
 */
export const LARGE_CAP_SYMBOLS: ReadonlySet<string> = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "AVGO",
  "JPM", "V", "MA", "UNH", "JNJ", "XOM", "CVX", "HD", "PG", "COST",
  "ABBV", "MRK", "KO", "PEP", "WMT", "BAC", "ORCL", "ADBE", "CSCO", "CRM",
  "ACN", "NFLX", "TMO", "ABT", "LIN", "DHR", "TXN", "VZ", "NKE", "PM",
  "MCD", "INTC", "IBM", "QCOM", "HON", "UNP", "LOW", "AMD", "SBUX", "GS",
  "CAT", "BA", "GE", "MS", "AXP", "BLK", "SPGI", "INTU", "AMGN", "DE",
  "PLD", "ISRG", "NOW", "BKNG", "MDT", "GILD", "ADI", "LMT", "SYK", "TJX",
  "MMC", "VRTX", "REGN", "C", "CB", "SCHW", "ELV", "ZTS", "MO", "CI",
  "SO", "PGR", "BSX", "CME", "DUK", "FI", "EQIX", "APD", "CL", "ITW",
  "PANW", "SLB", "EOG", "ETN", "AON", "NOC", "SHW", "MU", "WM", "KLAC",
  "MCK", "HUM", "USB", "DIS",
]);

/** Price floor for the liquidity-proxy half of the union. */
export const LARGE_CAP_PROXY_MIN_PRICE_USD = 50;

/**
 * Average daily dollar turnover floor for the proxy half. Two orders of
 * magnitude above the platform-wide liquidity floor (`MIN_EQUITY_AVG_VOLUME`
 * priced at `MIN_EQUITY_PRICE_USD` is $2.5M/day) — this is meant to flag
 * mega-cap-grade turnover, not merely "liquid enough to scan".
 */
export const LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME = 150_000_000;

/**
 * Whether a stock should get the large-cap stop treatment: on the known-name
 * list, or clearing the price-and-turnover proxy. Always false for crypto —
 * this exists to fix a stocks-only complaint (large-cap names getting
 * stopped out by noise before the trade could move), and crypto's volatility
 * profile is different enough that extending it there was never asked for.
 */
export function isLargeCapStock(
  symbol: string,
  assetClass: AssetClass,
  liquidity: LiquidityRead | null | undefined,
): boolean {
  if (assetClass !== "us_equity") return false;
  if (LARGE_CAP_SYMBOLS.has(symbol.toUpperCase())) return true;
  if (!liquidity) return false;
  return (
    liquidity.price >= LARGE_CAP_PROXY_MIN_PRICE_USD &&
    liquidity.avgDollarVolume >= LARGE_CAP_PROXY_MIN_AVG_DOLLAR_VOLUME
  );
}
