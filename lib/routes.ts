/** Builds an href to a ticker page, safely encoding symbols that contain a "/" (e.g. "BTC/USD"). */
export function tickerHref(symbol: string): string {
  return `/ticker/${symbol.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Builds an href to a ticker page's order ticket, pre-armed as
 * intraday-sourced. The only caller is the intraday alerts panel's "Trade
 * this" action (components/scan/intraday-alerts.tsx) — see
 * components/scan/ticker-view.tsx and lib/trade/place-order.ts for where
 * `?intraday=1` is read back and turned into a gated order.
 */
export function intradayTradeHref(symbol: string, side: "buy" | "sell"): string {
  return `${tickerHref(symbol)}?intraday=1&side=${side}`;
}

/**
 * The in-app path to send someone to after signing in, from a `?next=`
 * value they could have been handed by anyone. Only a same-origin path
 * passes: "/x" yes; "//evil.com", "/\\evil.com", "https://evil.com" and
 * "@evil.com" (which `${origin}${next}` turns into a userinfo URL on
 * evil.com) fall back to the dashboard.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
