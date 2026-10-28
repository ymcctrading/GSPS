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
  plan_entry: "the daily plan's entry",
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  old_level_cross: "Old top or bottom crossed",
  trend_continuation: "Trend continuation",
  space_overbalance: "Largest pullback of the trend",
  overnight_turn: "Daily swing turned",
  hourly_turn: "Hourly chart turned",
  plan_level_held: "Daily plan's level held",
  reversal_risk: "Reversal risk",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalType, string> = {
  old_level_cross:
    "A bar closed beyond yesterday's high or low by the method's allowance. An old top that is crossed tends to become support, and an old bottom that is broken tends to become resistance.",
  trend_continuation:
    "The swing chart on today's bars is running one way, and price is on that side of the middle of the day's range.",
  space_overbalance:
    "Today's move against the trend is bigger than any pullback since the trend began. That often means the trend has changed or soon will.",
  overnight_turn:
    "The one-day swing chart keyed on the lows turned today: a higher bottom after a run of lower ones turns it up, a low that breaks the prior day's bottom turns it down. Its stop goes just beyond the last bottom or top.",
  hourly_turn:
    "The swing chart on hourly bars changed trend on the latest hour. In a very active market this is the first sign the trend is changing.",
  plan_level_held:
    "Price reacted to the daily plan's entry and turned back the plan's way on today's chart. The daily plan entered on the intraday chart: the daily plan's own stop and targets, with the stop moved by your trade style once filled.",
  reversal_risk:
    "A cross of yesterday's high or low failed, or price lost the middle of the day's range. The move that was running may be ending — a reason to stand aside, not a reason to trade the other way on its own.",
};

/**
 * A signal the intraday replay measured losing, with its record. Shown on the
 * card, and the signal is held back from action: no "Trade this", no bell,
 * email or push (`alertsForTier`), until a run on the current rule reads
 * otherwise. Visible, labelled, and never offered as a trade: an inverted
 * reading is presumed a translation defect to find, not a trade to take
 * (AGENTS.md, "Gann-derived AND measured").
 *
 * plan_level_held: backtest-universe run 80 (2026-10-22, 832 symbols,
 * 2026-08-26 to 2026-10-21, five-minute bars, Gann exits): 152 trades,
 * −0.107R, 95% CI [−0.185, −0.028], both halves losing
 * (`replay-diagnosis/2026-10-22-intraday-alerts-replay.md`). That run used
 * the earlier stop (the tighter of the plan's stop and 3 points beyond the
 * day's low); most of its trades left on Gann's exit signals, not the stop
 * (9 of 152 on the initial stop, 33 on three adverse closes, 15 on a failed
 * top). The diagnosis (2026-10-22): the alert also fired on plans whose entry
 * was a crossing still to be made, buying the first intraday bar through an
 * old top's 3-point line before the daily close gave the indication. Fixed in
 * `detectPlanLevelHeld` (the prior close must sit on the plan's side). Re-run
 * on the fix before lifting the hold.
 */
export const MEASURED_LOSING: Partial<Record<SignalType, string>> = {
  plan_level_held:
    "Measured losing: the replay of Aug 26 to Oct 21, 2026 lost on this signal (152 trades, −0.11R a trade, with an earlier stop). Shown for study only; it is not offered as a trade until a new run reads otherwise.",
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
