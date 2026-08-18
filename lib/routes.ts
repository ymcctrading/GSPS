/** Builds an href to a ticker page, safely encoding symbols that contain a "/" (e.g. "BTC/USD"). */
export function tickerHref(symbol: string): string {
  return `/ticker/${symbol.split("/").map(encodeURIComponent).join("/")}`;
}
