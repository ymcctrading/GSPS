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

/**
 * Notices, not trades: price nearing or at a standing daily plan's entry
 * (`detectEntryApproach`, `intraday.ts`). They price the daily plan, never a
 * session entry of their own, so nothing replays or places them as an intraday
 * trade; the order is the daily plan's, rested at its entry.
 */
export const NOTICE_SIGNALS: ReadonlySet<SignalType> = new Set<SignalType>(["entry_approach", "entry_reached", "line_approach", "line_crossed"]);

/**
 * The notices on a plan whose crossing is still ahead (`detectLineCrossing`):
 * the session nearing or trading through the plan's line. A heads-up the
 * night's plan already named, never a buy; the method buys after the close
 * confirms, on the pullback.
 */
export const LINE_NOTICES: ReadonlySet<SignalType> = new Set<SignalType>(["line_approach", "line_crossed"]);

/** The notices that carry a time left (`Alert.approach`), read against a member's lead. */
export const APPROACH_NOTICES: ReadonlySet<SignalType> = new Set<SignalType>(["entry_approach", "line_approach"]);

export const SIGNAL_LABELS: Record<SignalType, string> = {
  old_level_cross: "Old top or bottom crossed",
  trend_continuation: "Trend continuation",
  space_overbalance: "Largest pullback of the trend",
  overnight_turn: "Daily swing turned",
  hourly_turn: "Hourly chart turned",
  plan_level_held: "Daily plan's level held",
  reversal_risk: "Reversal risk",
  entry_approach: "Nearing the plan's entry",
  entry_reached: "At the plan's entry",
  line_approach: "Nearing the plan's line",
  line_crossed: "Through the plan's line",
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
  entry_approach:
    "Price is moving back toward a standing daily plan's entry. The time left is read from how fast it has moved since its last high (low, for a sell) and counts the price feed's delay. A heads-up to open the plan before price gets there: once a bar closes at the entry, the plan's entry goes at the market. The pace can change.",
  entry_reached:
    "Price has come back to a standing daily plan's entry and the plan's stop has not traded. Once a bar closes there, the plan's entry goes at the market, with the plan's own stop and targets.",
  line_approach:
    "The daily plan named a line price has not yet crossed, and price is moving toward it. A heads-up, not a buy: crossing the line is only the start. The plan can turn ready once a session closes far enough past it, and its entry is then taken on a pullback.",
  line_crossed:
    "Price has traded through the line a standing daily plan named the night before. A heads-up, not a buy: the plan can turn ready once the session closes far enough past the line, shown on the card, and its entry is then taken on a pullback to it.",
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

/**
 * Signals read on the daily chart, so their stop and targets are sized for a
 * swing of days, not one session (2026-10-29, Chuck on META: entry 623.56,
 * stop 604.21, TP1 676.63, two days' range away, offered as a trade closed at
 * 3:45 PM). `overnight_turn` is Gann's Overnight Chart (Master Course Ch. 3):
 * a daily swing chart traded with stops 1 point beyond the last daily bottom
 * or top and held overnight, stop and reverse. Its stop is daily-scale (median
 * 3.1% of price over Oct 21-29, against 0.3-0.6% for the session signals),
 * and `gannFirstTarget`'s "pays more than the risk" (M-K5) then pushes TP1 to
 * an old daily level (median 3.9%, the top tenth past 10.6%). Closing it at
 * the session's end (the Intraday style) trades a swing stop with a day
 * trade's reach, which Gann never did; as a swing it is the Overnight method,
 * which is measured (`replayOvernight.ts`) and never placed (AGENTS.md, "Master
 * Course methods with no plan"). So it is shown for study, never offered as an
 * intraday trade; the swing trade on the stock comes from its daily plan.
 */
export const DAILY_SCALE_SIGNALS: ReadonlySet<SignalType> = new Set<SignalType>(["overnight_turn"]);

/** The note on a daily-scale signal (`DAILY_SCALE_SIGNALS`). */
export const DAILY_SCALE_HOLD =
  "A daily swing signal: its stop sits beyond yesterday's swing, sized for a trade held for days, and its first target is often more than a day's range away. Shown for study only; it is not offered as an intraday trade. Swing trades come from the stock's daily plan.";

/** The note on an alert that runs against the daily trend (`Alert.againstDailyTrend`, audit I-02). */
export const AGAINST_DAILY_TREND =
  "Against the daily trend: the daily swing chart runs the other way. Shown for study only; the method trades with the main trend, so this is not offered as a trade.";

/** The note on an alert that runs against the market's trend (`Alert.againstMarketTrend`). */
export const AGAINST_MARKET_TREND =
  "Against the market's trend: the overall market's daily and weekly swings run the other way. Shown for study only; trades go with the market's trend, so this is not offered as a trade.";

/** The note on an alert whose stop sits inside one intraday point of its price (`Alert.riskUnderPoint`). */
export const STOP_INSIDE_NOISE =
  "Stop too close: the stop sits closer to the price than the market's ordinary back-and-forth, so it would most likely be hit on noise. Shown for study only; it is not offered as a trade.";

/**
 * Why an alert is shown but not offered as a trade, or null when it is
 * tradeable on these grounds: a signal the replay measured losing, one that
 * runs against the daily trend or the market's trend, or one whose stop sits
 * inside one intraday point of its price (the replay's `risk_under_point`), or a
 * daily-scale signal (`DAILY_SCALE_SIGNALS`). The panel, the setup
 * card, the bell and push all read this one function.
 */
export function tradeHold(alert: {
  type: SignalType;
  againstDailyTrend?: boolean | null;
  againstMarketTrend?: boolean | null;
  riskUnderPoint?: boolean | null;
}): string | null {
  return (
    MEASURED_LOSING[alert.type] ??
    (DAILY_SCALE_SIGNALS.has(alert.type) ? DAILY_SCALE_HOLD : null) ??
    (alert.againstDailyTrend
      ? AGAINST_DAILY_TREND
      : alert.againstMarketTrend
        ? AGAINST_MARKET_TREND
        : alert.riskUnderPoint
          ? STOP_INSIDE_NOISE
          : null)
  );
}

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
