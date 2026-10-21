/**
 * GSPS — the intraday alerts' display labels and formatters, kept apart from
 * `intraday.ts` so the client panel (`components/scan/intraday-alerts.tsx`)
 * can show them without bundling the scanner, its swing, overnight and
 * campaign readers, into the browser (review finding R-033, 2026-10-21).
 * Type-only imports: this module must stay a leaf.
 */

import type { AssetKind, MoveBasis, SignalType } from "@/lib/scanner/intraday";

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  equity: "Stock",
  etf: "ETF",
  index: "Index",
  crypto: "Crypto",
};

export const MOVE_BASIS_LABELS: Record<MoveBasis, string> = {
  prior_close: "yesterday's close",
  session_open: "today's open",
  prior_session: "the prior session's high or low",
  midpoint: "the middle of today's range",
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  old_level_cross: "Old top or bottom crossed",
  trend_continuation: "Trend continuation",
  space_overbalance: "Over-balance of space",
  overnight_turn: "Overnight Chart turned",
  hourly_turn: "Hourly chart turned",
  reversal_risk: "Reversal risk",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalType, string> = {
  old_level_cross:
    "A bar closed beyond yesterday's high or low by the method's allowance. An old top that is crossed tends to become support, and an old bottom that is broken tends to become resistance.",
  trend_continuation:
    "The swing chart on today's bars is running one way, and price is on that side of the middle of the day's range.",
  space_overbalance:
    "Today's move against the trend is bigger than any pullback since the trend began. In this method that says the trend has changed or soon will.",
  overnight_turn:
    "The one-day swing chart keyed on the lows turned today: a higher bottom after a run of lower ones turns it up, a low that breaks the prior day's bottom turns it down. Its stop goes 1 point beyond the last bottom or top.",
  hourly_turn:
    "The swing chart on hourly bars changed trend on the latest hour. In a very active market this is the first sign the trend is changing.",
  reversal_risk:
    "A cross of yesterday's high or low failed, or price lost the middle of the day's range. The move that was running may be ending — a reason to stand aside, not a reason to trade the other way on its own.",
};

export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds)) return "an unknown amount of time";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

export function formatVolume(volume: number, unit: "shares" | "coins" = "shares"): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M ${unit}`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K ${unit}`;
  return `${volume.toFixed(volume < 10 ? 2 : 0)} ${unit}`;
}

export function formatRvol(rvol: number | null): string {
  return rvol === null ? "no baseline" : `${rvol.toFixed(1)}×`;
}
