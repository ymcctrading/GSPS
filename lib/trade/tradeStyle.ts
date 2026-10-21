/**
 * The trade style a trader asks for, and how Gann's plan reads in each
 * (owner, 2026-10-21: "how can we make it possible that the trade plan aligns
 * with the type of trade that the user is looking for. Swing, intraday").
 *
 * **Gann did not day-trade, and said so.** "The big money in the markets is
 * made on the long swings and not by day to day trading" (W036); a scalper
 * pays 150 points a year in commissions against 6 for one trade a month
 * (*Commodities* pp. 4-7; W004 p. 6); "follow the main trend and the long
 * swings" (*Commodities* p. 55). He never closed a trade because a session
 * ended. So GSPS offers his two speeds of one method, not a day-trading
 * method he rejected:
 *
 * - **Swing**, his main method and the default: the monthly and weekly
 *   charts decide the trend, the 3-Day Chart times it, the stop is 3 points
 *   beyond the old level (W006 pp. 20, 46-47), and the trade runs on his exit
 *   rules (`lib/gann/exitRules.ts`). Held for weeks.
 * - **Fast**, his fast-market method: the daily chart "in fast markets"
 *   (*Commodities* p. 31; Master Course PDF 255; W011), the hourly chart for
 *   "the first change in trend" in very active markets (Master Course Ch.
 *   13), entry on the reaction ("buy on the second day's reaction and stop
 *   three points", *Truth of the Stock Tape*), the stop 3 points beyond the
 *   last completed day's low (high, short) and trailed under each day's low
 *   (W006 Rule 2, p. 46: "a 3-points stop loss order is the safest"; the
 *   1940-41 soybean trade; *Commodities* Selling Point 9: fast declines "run
 *   10 to 30 days without crossing the high of the previous day"). Held for
 *   days, until a day's low breaks. `lib/gann/dayStop.ts`.
 *
 * Both styles enter only with the daily trend (never-failing rule 5, "never
 * buck the trend") and take the same targets: the first Gann level that pays
 * more than the risk, then no fixed target (Q14).
 *
 * Measured basis for the Fast stop: the six-year one-hour replay lost
 * (49.1% wins against 50.8% needed), all of it from initial stops inside the
 * day's range. The Fast stop sits behind the prior day's bar.
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. The expected holds are
 * measured durations from the replay and Gann's own fast-market counts, not
 * cycle claims; Dewey's checklist does not apply. 3. Correspondence: one law
 * on the monthly, daily and hourly charts ("daily and even hourly movements",
 * the 1909 interview); Rhythm: the fast trade breathes with each day's bar.
 * Law of Creation: method ⊗ speed, the same rule read at the day's scale
 * creates a trade whose stop moves with each day, which neither held alone.
 */

export type TradeStyle = "swing" | "fast";

export const DEFAULT_TRADE_STYLE: TradeStyle = "swing";

export interface TradeStyleProfile {
  style: TradeStyle;
  label: string;
  /** One line for the setup card and order ticket. */
  summary: string;
  /** The charts that decide the trend, slowest first. */
  trendCharts: string;
  /** The bars the entry is timed on. */
  entryTiming: string;
  stopRule: string;
  trailRule: string;
  /** Expected hold, in plain words. */
  expectedHold: string;
  sources: string;
}

export const TRADE_STYLES: Record<TradeStyle, TradeStyleProfile> = {
  swing: {
    style: "swing",
    label: "Swing",
    summary: "The main method: trade the main trend's swings and hold while the swing chart runs your way.",
    trendCharts: "Monthly, weekly, then the 3-Day Chart",
    entryTiming: "Closed 15-minute bars at the daily level",
    stopRule: "3 points beyond the old top or bottom the entry crossed",
    trailRule: "The exit rules on the swing chart",
    expectedHold: "Weeks; often more than ten sessions",
    sources: "W006 pp. 20, 46-47; Commodities p. 55",
  },
  fast: {
    style: "fast",
    label: "Fast",
    summary: "The fast-market method: entry timed intraday, stop behind the last day's bar, trailed under each day's low. Not closed at the end of the session.",
    trendCharts: "Daily, with the hourly for the first change in trend",
    entryTiming: "Closed hourly and 15-minute bars",
    stopRule: "3 points beyond the last completed day's low (high, short), never looser than the swing plan's stop",
    trailRule: "3 points under each new day's low (over each day's high, short)",
    expectedHold: "Days, until a day's low breaks",
    sources: "W006 Rule 2 p. 46; Truth of the Stock Tape; Commodities p. 31 and Selling Point 9; Master Course Ch. 13",
  },
};

export function parseTradeStyle(value: unknown): TradeStyle {
  return value === "fast" ? "fast" : DEFAULT_TRADE_STYLE;
}

// The pricing half (the day stop, the fast plan) is `tradeStylePlan.ts`, kept
// apart so client pages can read the profiles without bundling a Gann engine
// module (review finding R-033).
