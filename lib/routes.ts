/**
 * The site's base URL as configured in `NEXT_PUBLIC_APP_URL`, trimmed and
 * without a trailing slash, or null when it is unset or empty
 * (`.env.example` ships it empty). Emails fall back to www.gsps.world,
 * billing to the request's own origin; both read the variable here so an
 * empty value or a trailing slash can't break one and not the other.
 */
export function configuredAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return raw ? raw : null;
}

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
export function intradayTradeHref(
  symbol: string,
  side: "buy" | "sell",
  plan?: { stop: number; target: number; master?: number | null },
): string {
  const base = `${tickerHref(symbol)}?intraday=1&side=${side}`;
  // The alert's own plan (the Intraday style, lib/trade/tradeStyle.ts): its
  // stop, first target and MTP fill the ticket, which the person can still edit.
  if (!plan) return base;
  const mtp = plan.master != null && plan.master > 0 ? `&mtp=${plan.master}` : "";
  return `${base}&stop=${plan.stop}&tp1=${plan.target}${mtp}`;
}

/**
 * The alert's stop, first target and MTP from a ticker page's query, or null
 * when the stop or first target is missing or not a price. A missing or bad
 * MTP is null on its own: the plan still stands without one.
 */
export function intradayPlanFromQuery(
  stop: string | null,
  tp1: string | null,
  mtp: string | null = null,
): { stop: number; target: number; master: number | null } | null {
  const s = Number(stop);
  const t = Number(tp1);
  if (stop === null || tp1 === null || !(s > 0) || !(t > 0) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
  const m = mtp === null ? NaN : Number(mtp);
  return { stop: s, target: t, master: Number.isFinite(m) && m > 0 ? m : null };
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
