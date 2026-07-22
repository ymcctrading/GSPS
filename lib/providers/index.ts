/**
 * Market-data provider selection.
 *
 * `resolveMarketDataProvider()` returns the live Alpaca feed when credentials
 * are present, otherwise the deterministic simulated feed. This is what makes
 * going live a config change, not a code change: set ALPACA_API_KEY_ID and
 * ALPACA_API_SECRET_KEY and every scan flips to real data automatically.
 */

import type { MarketDataProvider } from "../scanTicker";
import { simulatedProvider } from "../scanTicker";
import { createAlpacaProvider, hasAlpacaCredentials } from "./alpacaProvider";

export {
  createAlpacaProvider,
  hasAlpacaCredentials,
} from "./alpacaProvider";

/** "live" when Alpaca keys are set, else "simulated". */
export function activeFeedMode(): "live" | "simulated" {
  return hasAlpacaCredentials() ? "live" : "simulated";
}

/**
 * The provider the app should scan with: live Alpaca if configured, otherwise
 * the simulated fallback so the pipeline always runs.
 */
export function resolveMarketDataProvider(): MarketDataProvider {
  return hasAlpacaCredentials() ? createAlpacaProvider() : simulatedProvider;
}
