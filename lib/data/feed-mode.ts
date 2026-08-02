/**
 * Feed-mode helper.
 * -----------------------------------------------------------------------------
 * Reports whether the app is serving a real market-data feed ("live") or the
 * synthetic demo generator ("simulated"), without eyeballing prices. It reads
 * straight from the provider seam (`getMarketDataProvider().isLive`), so it can
 * never disagree with the data the charts, scanner, and order ticket actually
 * receive — flip `MARKET_DATA_PROVIDER` / configure Alpaca keys and this moves
 * with it.
 */

import { getMarketDataProvider, type MarketDataProvider } from "./provider";

export type FeedMode = "live" | "simulated";

/** Map a resolved provider to its feed mode. Pure — no environment access. */
export function feedModeOf(provider: MarketDataProvider): FeedMode {
  return provider.isLive ? "live" : "simulated";
}

/** The feed mode for the active provider given the current environment. */
export function activeFeedMode(): FeedMode {
  return feedModeOf(getMarketDataProvider());
}
