/**
 * US market session detection (America/New_York), holiday-agnostic.
 *
 * Extended hours per Alpaca: pre-market 04:00–09:30 ET, regular 09:30–16:00 ET,
 * after-hours 16:00–20:00 ET. Weekends are closed. Crypto trades 24/7 and is
 * always reported as "regular".
 */

import type { AssetClass } from "@/lib/types";

export type MarketSession = "pre" | "regular" | "post" | "closed";

const OPEN = 9 * 60 + 30; // 09:30 ET
const CLOSE = 16 * 60; //   16:00 ET
const PRE_OPEN = 4 * 60; //  04:00 ET
const POST_CLOSE = 20 * 60; // 20:00 ET

/** Minutes-since-midnight and weekday (0=Sun…6=Sat) in America/New_York. */
export function etParts(date: Date = new Date()): { minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  const minute = Number(get("minute"));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: hour * 60 + minute, weekday: weekdayMap[get("weekday")] ?? 0 };
}

/** Classify a moment for US equities. */
export function equitySession(date: Date = new Date()): MarketSession {
  const { minutes, weekday } = etParts(date);
  if (weekday === 0 || weekday === 6) return "closed";
  if (minutes >= OPEN && minutes < CLOSE) return "regular";
  if (minutes >= PRE_OPEN && minutes < OPEN) return "pre";
  if (minutes >= CLOSE && minutes < POST_CLOSE) return "post";
  return "closed";
}

/** Session for any asset class (crypto is always "regular"). */
export function marketSession(assetClass: AssetClass, date: Date = new Date()): MarketSession {
  return assetClass === "crypto" ? "regular" : equitySession(date);
}

/** Classify a single bar's timestamp — used to shade extended-hours candles. */
export function barSession(isoTimestamp: string, assetClass: AssetClass): MarketSession {
  if (assetClass === "crypto") return "regular";
  return equitySession(new Date(isoTimestamp));
}

export function isExtended(session: MarketSession): boolean {
  return session === "pre" || session === "post";
}

export function sessionLabel(session: MarketSession): string {
  switch (session) {
    case "pre":
      return "Pre-market";
    case "regular":
      return "Market open";
    case "post":
      return "After hours";
    case "closed":
      return "Market closed";
  }
}
