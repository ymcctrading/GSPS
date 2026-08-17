import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The URL of a symbol's detail page.
 *
 * Crypto pairs carry a slash — `BTC/USD` — and a slash inside a template
 * literal is a path separator, so `/ticker/${symbol}` produced `/ticker/BTC/USD`:
 * two segments against a one-segment route, which 404s. Percent-encoding is not
 * a fix either, because `%2F` inside a path segment is normalised back to a
 * slash by proxies and by the router itself before the route ever matches.
 *
 * So the pair separator becomes a hyphen in the URL and is restored by
 * `symbolFromRoute` on the way in. `BTC-USD` is a form the data layer already
 * accepts and normalises (see `normalizeCryptoSymbol`), which is why this is
 * safe rather than merely convenient.
 */
export function tickerHref(symbol: string): string {
  return `/ticker/${encodeURIComponent(symbol.replace(/\//g, "-"))}`;
}

export function formatPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}
