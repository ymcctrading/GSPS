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

/**
 * Why a write that members or money act on must not run on this provider, or
 * null when it may. `getMarketDataProvider()` falls back to the synthetic
 * random walk when the Alpaca keys are missing, so a missing or rotated key
 * in production would otherwise publish setups, send alerts and fill paper
 * orders priced from noise with no error (senior code review,
 * `06-full-coverage-notes.md`, lib/data). Synthetic data stays allowed
 * outside production (tests, local dev) and for read-only surfaces such as
 * the public chart, which label it through `activeFeedMode`.
 *
 * Every refusal is logged here with the action it stopped, so the reason is
 * in the logs whichever caller hit it.
 */
export function syntheticDataRefusal(action: string, provider: MarketDataProvider = getMarketDataProvider()): string | null {
  if (provider.isLive || process.env.NODE_ENV !== "production") return null;
  const reason =
    `Refused to ${action}: market data is coming from the "${provider.name}" generator, not a live feed. ` +
    "Check that the Alpaca key and secret are set in this environment (lib/data/alpaca.ts reads them), and that MARKET_DATA_PROVIDER isn't forcing synthetic data.";
  console.error(`[market-data] ${reason}`);
  return reason;
}

/**
 * What a response body says when `syntheticDataRefusal` refuses. The refusal's
 * own text names the server's configuration (the provider, the env variables
 * it reads), so it stays in the log and never reaches a member (S-14).
 */
export const MARKET_DATA_UNAVAILABLE = "Market data is unavailable right now, so nothing was run.";

/** Thrown where a caller already fails closed on a thrown error. */
export class SyntheticMarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticMarketDataError";
  }
}

/** `syntheticDataRefusal`, thrown. */
export function assertLiveMarketData(action: string, provider: MarketDataProvider = getMarketDataProvider()): void {
  const reason = syntheticDataRefusal(action, provider);
  if (reason) throw new SyntheticMarketDataError(reason);
}
