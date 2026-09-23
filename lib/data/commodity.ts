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
 *
 * **Three-question mandate** (AGENTS.md), answered in place:
 * 1. Gann grounding — Gann himself traded and wrote forecasts for commodities
 *    (cotton, wheat, coffee — `docs/GANN_HISTORICAL_SOURCES.md`'s A2.1/A2.3
 *    private-course and letter material is explicitly commodity-denominated,
 *    e.g. the "May Coffee Santos D" letter). This stub exists specifically so
 *    Gann's cycle/time/geometry techniques, currently equities/crypto-only,
 *    can eventually reach the asset class most of his own worked examples
 *    were actually written against — a gap, not a feature addition.
 * 2. Dewey/Tomes — no periodicity or recurrence claim is made by this file;
 *    it moves no data and computes nothing. Dewey's checklist
 *    (`lib/validation/cycleRigor.ts`) applies once a real commodity data feed
 *    exists to test cycle claims against, not to the plumbing itself.
 * 3. Hermetic principle — Correspondence ("as above, so below"): the premise
 *    of extending this asset-class path at all is that a technique proven on
 *    equities/crypto is expected to hold on commodities too (the same
 *    reasoning behind AGENTS.md's cross-platform-consistency principle). This
 *    file is the placeholder for that correspondence to be tested later, not
 *    a claim that it already holds — see the TP1/TP2 placeholder note in
 *    `lib/strat/levels.ts` for where "expected to hold" still needs real data
 *    before it can be trusted.
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
