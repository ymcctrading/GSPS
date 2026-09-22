/**
 * Commodities market-data provider — NOT YET CONNECTED.
 * -----------------------------------------------------------------------------
 * This is the extension point for a future commodities/futures data feed, added
 * so `AssetClass`'s `"commodity"` value (see `lib/types.ts`) has somewhere real
 * to plug in later rather than needing a redesign of the provider seam. Every
 * method here throws a clear, typed error instead of silently returning empty
 * or synthetic-looking data, so a caller that accidentally reaches this stub
 * fails loudly in development rather than shipping a quiet wrong answer.
 *
 * What already exists elsewhere in this codebase that a future implementation
 * should build on, rather than duplicate:
 *   - `lib/data/twelve-data.ts`'s `fetchFuturesData()` already calls Twelve
 *     Data's quote endpoint for futures symbols (ES, NQ, CL, ...) — but only a
 *     single current-price snapshot (`UnifiedMarketData`), consumed by the
 *     read-through `/api/futures` display route (`docs/MULTI_PROVIDER_SETUP.md`).
 *     It does not fetch historical bars.
 *   - The scan/scoring/Gann pipeline (`fetchAllTimeframes`, `runMarketScan`,
 *     every `lib/gann/*` cycle/time module) needs actual OHLCV history across
 *     five timeframes (monthly/weekly/daily/hourly/execution), the same shape
 *     `MarketDataProvider.fetchBars` returns for equities/crypto today. Twelve
 *     Data's `/time_series` endpoint (not yet called anywhere in this repo)
 *     is the natural source for that — same vendor, same API key, different
 *     endpoint than `fetchFuturesData()` uses.
 *
 * To actually connect this provider:
 *   1. Implement `fetchBars`/`fetchBarsBatch` here against a real historical
 *      endpoint (Twelve Data `/time_series` or an equivalent futures/
 *      commodities vendor) and set `isLive = true`.
 *   2. Register it in `lib/data/provider.ts`'s `getMarketDataProvider()` (or,
 *      more likely, route by `assetClass` there rather than by a single
 *      "the active provider" choice, since Alpaca still owns equities/crypto).
 *   3. Revisit every `assetClass === "crypto" ? ... : ...` binary check this
 *      module's `AssetClass` doc comment lists — each currently treats
 *      `"commodity"` like `"us_equity"` by default, which needs a real answer
 *      once commodity symbols actually flow through (e.g. `marketSession`'s
 *      regular-hours assumption is wrong for a 23-hour futures session).
 *   4. Confirm `docs/THIRD_PARTY_LIMITS.md`'s Twelve Data free-tier cap
 *      (800 requests/day) still holds once bars/backfill requests are added on
 *      top of the existing quote traffic.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import type { MarketDataProvider } from "./provider";

function notConnected(method: string): never {
  throw new Error(
    `Commodities data is not yet connected (lib/data/commodity.ts's ${method}) — see that file's header for what a future implementation needs.`,
  );
}

export const commodityProvider: MarketDataProvider = {
  name: "commodity",
  isLive: false,

  async fetchBars(
    _symbol: string,
    _timeframe: Timeframe,
    _start: Date,
    _end: Date | null,
    _assetClass: AssetClass,
    _limit?: number,
  ): Promise<Bar[]> {
    notConnected("fetchBars");
  },

  async fetchLatestPrice(_symbol: string, _assetClass: AssetClass): Promise<number> {
    notConnected("fetchLatestPrice");
  },

  async fetchMostActives(_top?: number): Promise<string[]> {
    notConnected("fetchMostActives");
  },
};

// fetchBarsBatch, fetchOptionChain and fetchLevel2 are optional on
// MarketDataProvider and intentionally left unimplemented (undefined) here —
// there is no commodities options chain or order-book depth to stub, and
// callers already treat a missing optional method as "unsupported", not an
// error.
