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
 *   13). The entry and the initial stop are the swing plan's (Rule 3, W006
 *   pp. 46-47: "old top 50, a close at 53 crosses it, buy 51 down to 48, stop
 *   47"): the entry rule and the stop are not changed by the speed. Once
 *   filled, the stop trails 3 points under each completed day's low (over
 *   each day's high, short), from the fill's own session (W006 Rule 2, p. 46:
 *   in fast moves "1 to 3 points under the day's low", "a 3-points stop loss
 *   order is the safest"; the 1940-41 soybean trade's stops 1 cent under each
 *   day's low, W001 pp. 134-137; *Truth of the Stock Tape*, "buy on the second
 *   day's reaction and stop three points", anchored on the day bought;
 *   *Commodities* Selling Point 9: fast declines "run 10 to 30 days without
 *   crossing the high of the previous day"). Held for days, until a day's low
 *   breaks. The trail is `readGannExit`'s "day_low" (`lib/gann/dayStop.ts`),
 *   read by the live and paper exit managers and the replay alike.
 *
 * Engineering choices inside Gann's range, labelled: Rule 2 gives "1 to 3
 * points" under the day's low or close "in fast high-level advances"; GSPS
 * reads 3 points (the stop he calls safest) under the low, and applies it from
 * the fill wherever the trader chooses Fast, since the choice is the trader's
 * reading that the market is fast. A trade keeps the style that stood when it
 * filled (`styleAt`).
 *
 * Corrected 2026-10-21 (review of #405): the first build put the day stop on
 * as the initial stop, before the fill. That is Rule 2's trail read as an
 * entry stop: it moved the confirmation line Gann's crossing is judged on and
 * sat inside the reaction zone, so the reaction that fills the order broke
 * it.
 *
 * Both styles enter only with the daily trend (never-failing rule 5, "never
 * buck the trend") and take the same targets: the first Gann level that pays
 * more than the risk, then no fixed target (Q14).
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. The expected holds are
 * measured durations from the replay and Gann's own fast-market counts, not
 * cycle claims; Dewey's checklist does not apply. 3. Correspondence: one law
 * on the monthly, daily and hourly charts ("daily and even hourly movements",
 * the 1909 interview); Rhythm: the fast trade breathes with each day's bar.
 * Law of Creation: method ⊗ speed, the same rule read at the day's scale
 * creates a trade whose stop moves with each day, which neither held alone.
 */

/**
 * **Intraday** (2026-10-22, owner: "Determine a way to better suit setups
 * specifically for intraday trades/users. The goal is to get AND out in a
 * matter of seconds, mins, or hours. And ideally closed by the end of the day
 * (although not mandatory)"). Not a preference: it is the style of a trade
 * taken from an intraday alert's "Trade this" (`orders.intraday_sourced`).
 * The plan is the alert's own (its stop and its first target, no MTP), and
 * the exits are Gann's rules read on the session's bars
 * (`lib/gann/intradayExit.ts`): 60% at the first target, the stop one
 * intraday point under each completed 15-minute bottom, out when the hourly
 * chart gives the first change in trend (Master Course Ch. 13). What is left
 * closes at the session's end unless the trader chose to hold it overnight
 * (`orders.hold_overnight`): the owner's choice, not Gann's, who never closed
 * a trade because a session ended. No measured record yet: the intraday
 * replay's six-year run failed its test (2026-10-21), so the order ticket
 * says so.
 */
export type TradeStyle = "swing" | "fast" | "intraday";

/** The styles walked on the daily chart (the swing replay's `tradeStyle`). */
export type DailyTradeStyle = Exclude<TradeStyle, "intraday">;

/** The styles a trader picks as a standing preference; Intraday comes from the trade's source. */
export const PICKABLE_TRADE_STYLES: readonly DailyTradeStyle[] = ["swing", "fast"];

export const DEFAULT_TRADE_STYLE: DailyTradeStyle = "swing";

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
    summary: "The fast-market method: the same entry and stop as Swing; once filled, the stop follows each day's low up. Not closed at the end of the session.",
    trendCharts: "Daily, with the hourly for the first change in trend",
    entryTiming: "Closed hourly and 15-minute bars",
    stopRule: "3 points beyond the old top or bottom the entry crossed, the same as Swing",
    trailRule: "Trails 3 points under each completed day's low from the day filled (over each day's high, short), and is never lowered",
    expectedHold: "Days, until a day's low breaks",
    sources: "W006 Rule 2 p. 46; Truth of the Stock Tape; Commodities p. 31 and Selling Point 9; Master Course Ch. 13",
  },
  intraday: {
    style: "intraday",
    label: "Intraday",
    summary: "In and out within the session: the intraday alert's own stop and first target, managed on the session's bars, and closed by the session's end unless you choose to hold it overnight.",
    trendCharts: "The daily trend, with the hourly chart for the first change in trend",
    entryTiming: "At the market, when the intraday alert fires",
    stopRule: "The alert's own stop: the session's 50% point, or a point beyond the old level it crossed",
    trailRule: "60% leaves at the first target; the stop moves one intraday point under each completed 15-minute bottom (over each top, short); out when the hourly chart turns against the trade",
    expectedHold: "Minutes to hours; closed by the session's end unless you choose to hold it",
    sources: "Master Course Ch. 3 (1-point stops) and Ch. 13 (the hourly chart); the session close is GSPS's own default, not from the source",
  },
};

export function parseTradeStyle(value: unknown): DailyTradeStyle {
  return value === "fast" ? "fast" : DEFAULT_TRADE_STYLE;
}

// The trail itself is `readGannExit`'s "day_low" (`lib/gann/exitRules.ts`),
// kept out of this module so client pages can read the profiles without
// bundling a Gann engine module (review finding R-033).
