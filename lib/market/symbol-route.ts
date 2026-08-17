/**
 * The other half of `tickerHref` (lib/utils.ts): turning a `/ticker/[symbol]`
 * route parameter back into the symbol the scan engine uses.
 *
 * Kept apart from `tickerHref` because this side needs to know what a crypto
 * pair looks like, and that knowledge lives in the data layer. `tickerHref` is
 * called from client components and stays a pure string transform with no
 * imports; this runs on the server, where the ticker page renders.
 */

import { isCryptoSymbol, normalizeCryptoSymbol } from "@/lib/data/alpaca";

/**
 * `BTC-USD` → `BTC/USD`; `AAPL` → `AAPL`; `BRK.B` → `BRK.B`.
 *
 * Only a symbol the data layer recognises as crypto has its hyphen restored to
 * a slash — an equity ticker that happens to contain a hyphen is left exactly
 * as it arrived, because that hyphen is part of its name.
 */
export function symbolFromRoute(param: string): string {
  const raw = decodeURIComponent(param).toUpperCase();
  return isCryptoSymbol(raw) ? normalizeCryptoSymbol(raw) : raw;
}
