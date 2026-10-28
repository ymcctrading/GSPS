/**
 * Gann's rules for managing an open trade (parity roadmap Stage C, owner
 * decisions 2 and 6, 2026-09-27: "Gann's method supersedes my own").
 *
 * Gann never fixes a profit objective. A trade leaves on its stop, on a rule
 * that says the entry was wrong, or on a change of trend, and the stop is
 * moved on the market's own structure as the trade proves itself.
 *
 * Rules and sources (all Tier A; see `docs/memory-bank/sources/`):
 * - **C1 hold test.** After crossing an old top, a market that is going
 *   higher should not react back 3 points under it (*New Stock Trend
 *   Detector* p. 20; *Commodities* p. 53). A daily close back under the
 *   crossed level by the allowance ends the trade.
 * - **C1 three adverse closes.** If the trade closes against you the third
 *   successive day from entry, you are wrong: get out (*New Stock Trend
 *   Detector* p. 23). Read on the first three sessions after the fill only.
 * - **C2 break-even.** Move the stop to break-even after 3-4 points of profit,
 *   with a 3-point stop (*Truth of the Stock Tape*, Book II; *Wall Street
 *   Stock Selector*, Rule 3; Ch.II rule 4, "once 3 points ahead"). Since
 *   2026-10-16 (M-E6) the price-scaled form is his own: break-even once the
 *   best price is 3 points (`threePoints`) past the entry. It had been
 *   read as one risk unit.
 * - **Weekly trail** (A-STOP-05, PLAN.md item 4). Trail the stop 3 points
 *   under each completed week's bottom once the trade is into a new week
 *   (W006 p.46: "1, 2, 3 or 5 points"; 3 is the stop he calls safest).
 * - **C3 structural trail.** Keep the stop under each higher bottom as the
 *   swings step up (the 3-Day Chart's bottoms, *45 Years in Wall Street*), and
 *   under the prior month's low once the trade has run into a new month
 *   (*Stock Selector* Ch. IV, VII). In the final stage of a campaign (its 3rd
 *   section or later), trail by the size of the last reaction, and after a
 *   2-day counter-move, under the prior day (*Stock Selector* Ch. VII;
 *   *Commodities* BP/SP #9). Short trades are the mirror throughout.
 * - **C4 trend change.** The runner leaves on a change of trend, not at a
 *   fixed price (*Truth of the Stock Tape*, "never fix a target price"): the
 *   weekly swing chart turning against the trade after entry, or the
 *   campaign's greatest reaction over-balanced in space or time (Master
 *   Course Ch. 7; *Commodities* p. 51).
 * - **D2 distribution week** (added 2026-09-28). Two-thirds of the capital
 *   stock changing hands in one week at a top means distribution (*Wall
 *   Street Stock Selector* Ch. VII), and a week turning over almost all of it
 *   is a plain top (Master Course Ch. 12). A long leaves when such a week
 *   prints after the fill. Longs only: the text states these as top rules,
 *   and its bottom rule is volume drying up (D1), not a turnover count, so no
 *   mirror is invented for shorts. Needs the stored share count; without it
 *   the rule is silent. See `capitalStock.ts`.
 * - **A-VOLUME-03 breakdown after a lower top** (added 2026-10-16, fork FV7 b).
 *   After a second, lower top, a narrow spell broken down on increased volume
 *   signals a further decline (W006 pp.39-40, volume Rule 2). A long leaves
 *   when such a breakdown, printed since the fill, still stands
 *   (`distribution.ts`). Longs only: shorts take the breakaway down as their
 *   own entry. Reported as "distribution", the same reason as D2.
 * - **Fast-market day trail** (added 2026-10-21, the trade styles,
 *   `lib/trade/tradeStyle.ts`). A trade opened in the Fast style keeps the
 *   swing plan's entry and stop (Rule 3, W006 pp.46-47) and, from the fill's
 *   own session, trails 3 points under each completed day's low (over its
 *   high, short): W006 Rule 2 p.46, "1 to 3 points under the day's low" in
 *   fast moves; the 1940-41 soybean trade's stops 1 cent under each day's low
 *   (W001 pp.134-137); *Truth of the Stock Tape*, "buy on the second day's
 *   reaction and stop three points", anchored on the day bought. Reported as
 *   "day_low" (`gannDayStop`). Swing trades never read it.
 * - **A-LEVELS-04 failed double or triple top** (added 2026-10-16, fork FL3
 *   a). "Failing to pass an old top is a top" (W006 pp.14-15, 44): a long
 *   leaves when a double or triple top fails after the fill; a short on the
 *   mirror at a double or triple bottom. Reported as "failed_top".
 *
 * - **M-E11 reverse signal day** (added 2026-10-22). A reverse signal day or
 *   a 7-10 Day Rule day against the trade, since the fill, puts the stop 3
 *   points beyond that day's extreme (*Commodities* pp.318, 324; the *Stock
 *   Selector*'s daily time rule). Reported as "reverse_signal".
 * - **M-E12 exhaust gap** (added 2026-10-22). A gap to a new extreme with its
 *   reverse signal day, against the trade and since the fill, is the
 *   culmination of the swing: the trade leaves ("exhaust_gap", *Commodities*
 *   pp.319-320). It takes the trade off without reversing it.
 * - **M-T10 boiling point** (added 2026-10-22). Once the weekly chart's run in
 *   the trade's direction has run 6 weeks, the stop trails his 10 points,
 *   read at his Rumely price (`BOILING_POINT_TRAIL_POINTS`), from the best
 *   price (*Stock Selector* Ch. V). Reported as "boiling_point".
 *
 * Engineering choices, labelled as such:
 * - Gann's "3 points" is price-scaled from his own bands (`pointScale.ts`).
 *   Until 2026-09-28 it reused the entry's 0.3% lost-motion margin, about a
 *   tenth of his figure; the 15-minute diagnosis run showed the hold test
 *   ending most trades on it. Since 2026-10-15 the entry crosses by the
 *   same price-scaled 3 points (PLAN.md item 3).
 * - Every rule reads completed daily sessions only. Callers act on a signal
 *   at the next opportunity (the replay at the next session's open).
 *
 * Three-question basis:
 * 1. Gann: as cited above.
 * 2. Cycles: the monthly and final-stage rules are about how long reactions
 *    last in a campaign. No periodicity is claimed, so Dewey's checklist does
 *    not apply; the replay measures each rule against the fixed bracket.
 * 3. Hermetic: Cause and Effect (each exit names the cause that ends the
 *    trade: a failed test, adverse closes, a changed trend) and Rhythm (the
 *    stop follows the market's own swings instead of a fixed distance).
 *    Polarity: every rule has its mirror for shorts.
 */

import { gannReversal, reversesOn, type GannReversal } from "./reverse";
import type { Bar } from "@/lib/types";
import { readDistributionStanding } from "@/lib/gann/distribution";
import { failedTestAgainst, readMultipleTops } from "@/lib/gann/multipleTops";
import { pricePoint, threePoints } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { readCapitalStock } from "@/lib/gann/capitalStock";
import { toWeeklyBars } from "@/lib/gann/disclosedRules";
import { gannDayStop } from "@/lib/gann/dayStop";
import { exhaustGapAt, readReverseSignal, SEVEN_TO_TEN_MAX_DAYS } from "@/lib/gann/extremeRules";
import { CLASSIC_MIN_WEEKS, runBoilingPointFromPivots } from "@/lib/gann/boilingPoint";
import type { TradeStyle } from "@/lib/trade/tradeStyle";
import type { IntradayExitSignal, IntradayStopReason } from "@/lib/gann/intradayExit";


/**
 * Days of completed sessions the failed-top exit reads: `ENTRY_CHART_DAYS`
 * (`lib/scan/entrySelection.ts`), restated to keep this module free of the
 * scan's imports; a test pins the two equal.
 */
export const FAILED_TOP_CHART_DAYS = 364;

/**
 * The bars the failed-top exit reads for the bars before `upTo`: the 52 weeks
 * (`FAILED_TOP_CHART_DAYS`) before their next session, which is
 * `daily[upTo]` when it exists (the fill session, for the reading at entry)
 * and otherwise the next weekday, as `entryChartBars` reads the session's
 * window (review 12 L2). Holidays are not known here, so the day after a
 * holiday reads one day further back than the scan; an engineering choice.
 */
export function failedTopWindow(daily: Bar[], upTo: number): Bar[] {
  const day = (b: Bar) => b.t.slice(0, 10);
  let next: string;
  if (upTo < daily.length) next = day(daily[upTo]);
  else {
    let t = Date.parse(`${day(daily[upTo - 1])}T00:00:00Z`) + 86_400_000;
    while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
    next = new Date(t).toISOString().slice(0, 10);
  }
  const from = new Date(Date.parse(`${next}T00:00:00Z`) - FAILED_TOP_CHART_DAYS * 86_400_000).toISOString().slice(0, 10);
  return daily.slice(0, upTo).filter((b) => day(b) >= from);
}

/** Gann's final stage: the 3rd section of a campaign or later. */
export const FINAL_STAGE_SECTION = 3;

/** The price of his worked boiling-point stop: Advance Rumely, 105 in May 1929, "a 10-point stop (out at 95)". */
export const BOILING_POINT_EXAMPLE_PRICE = 105;
/**
 * M-T10's trail: his 10 points read at the price he worked them at, 10 /
 * `pricePoint(105)`, about 5.9 Gann points (*Wall Street Stock Selector*
 * Ch. V, pp. 60-108, the rule and the Advance Rumely example both; W005).
 * Corrected
 * 2026-10-28 (alignment audit, `score-and-levels.md`): it was 10 Gann
 * points, about 17 dollars at 105 and 25 at 200, where his rule trails a raw
 * 10 at 100-260. His point scale already grows with price (`pointScale.ts`),
 * so a figure he gave at 105 is read at 105.
 */
export const BOILING_POINT_TRAIL_POINTS = 10 / pricePoint(BOILING_POINT_EXAMPLE_PRICE);

export interface GannExitPosition {
  side: "long" | "short";
  /** The fill price. */
  entry: number;
  /** The stop the trade was opened with; its distance from entry is the risk unit. */
  initialStop: number;
  /** YYYY-MM-DD of the session the trade was filled in. */
  entryDate: string;
  /** The old top (long) or bottom (short) the entry crossed, for the hold test. */
  crossedLevel: number | null;
  /** The trade style it was opened in. "fast" adds the day trail ("day_low"). Default swing. */
  style?: TradeStyle;
}

export type GannStopReason =
  | "initial"
  | "break_even"
  | "last_reaction"
  | "prior_week"
  | "prior_month"
  | "final_stage"
  | "day_low"
  | "reverse_signal"
  | "boiling_point";
export type GannExitReason = "hold_test_failed" | "three_adverse_closes" | "trend_change" | "distribution" | "failed_top" | "exhaust_gap";

/**
 * A Gann exit rule that can be switched off by name, for measurement only:
 * a stop trail (every `GannStopReason` but the initial stop, which is the
 * plan's own) or an exit signal. Read only by the replay's `disableExits`
 * (`lib/backtest/replay.ts`), which asks what a trade would have done without
 * one rule. No production caller passes a set to `readGannExit`, so live and
 * paper exits always read every rule.
 */
export type GannExitRuleName = Exclude<GannStopReason, "initial"> | GannExitReason;

/** Every name `GannExitRuleName` admits, stop trails first. */
export const GANN_EXIT_RULE_NAMES = [
  "break_even",
  "last_reaction",
  "prior_week",
  "prior_month",
  "final_stage",
  "day_low",
  "reverse_signal",
  "boiling_point",
  "hold_test_failed",
  "three_adverse_closes",
  "trend_change",
  "distribution",
  "failed_top",
  "exhaust_gap",
] as const satisfies readonly GannExitRuleName[];

// Compile-time guard: the list names every rule, so a new reason cannot be
// left out of the replay's validation.
const allRuleNamesListed: [Exclude<GannExitRuleName, (typeof GANN_EXIT_RULE_NAMES)[number]>] extends [never] ? true : never = true;
void allRuleNamesListed;

export function isGannExitRuleName(name: unknown): name is GannExitRuleName {
  return typeof name === "string" && (GANN_EXIT_RULE_NAMES as readonly string[]).includes(name);
}

const NO_RULES_DISABLED: ReadonlySet<GannExitRuleName> = new Set();

export interface GannExitReading {
  /** The tightest stop Gann's rules allow now. Callers ratchet: never loosen a stop already placed. */
  stop: number;
  stopReason: GannStopReason;
  /** Set when a rule says to leave now, at the next opportunity. */
  exit: { reason: GannExitReason; note: string } | null;
  /**
   * A-EXIT-02 (Q15): set when the exit says the trend has changed. The
   * opposite trade at the close the exit was read on, its stop 3 points beyond
   * this trade's extreme (`lib/gann/reverse.ts`).
   */
  reverse?: GannReversal | null;
}

/**
 * A reading the exit managers act on: Gann's daily rules (`GannExitReading`),
 * or the Intraday style's session rules (`lib/gann/intradayExit.ts`).
 */
export interface ExitReading {
  stop: number;
  stopReason: GannStopReason | IntradayStopReason;
  exit: { reason: GannExitReason | IntradayExitSignal; note: string } | null;
  reverse?: GannReversal | null;
}

const day = (b: Bar) => b.t.slice(0, 10);

/**
 * Gann's time to hold (A-TIME-12, W006 p.23): a loss at the first close
 * suggests you are wrong; a profit at the first close that is still there
 * after three days means you are with the main trend. (Three closes against
 * you is the `three_adverse_closes` exit below.) The fill's own session is
 * day one. Null before the first close.
 */
export interface HoldTimeReading {
  /** The first session closed against the trade: a warning, not an exit. */
  firstCloseAgainst: boolean;
  /** In profit at the first close and still at the third: with the trend. Null until three sessions have closed. */
  withTrendAfter3: boolean | null;
}

export function readHoldTime(side: "long" | "short", entry: number, entryDate: string, daily: Bar[]): HoldTimeReading | null {
  const since = daily.filter((b) => day(b) >= entryDate);
  if (since.length === 0) return null;
  const inProfit = (b: Bar) => (side === "long" ? b.c > entry : b.c < entry);
  const against = (b: Bar) => (side === "long" ? b.c < entry : b.c > entry);
  return {
    firstCloseAgainst: against(since[0]),
    withTrendAfter3: since.length >= 3 ? inProfit(since[0]) && inProfit(since[2]) : null,
  };
}

/**
 * Read Gann's exit rules for one open position.
 *
 * `daily` is the completed daily sessions up to now, oldest first, including
 * history from before the entry (the swing charts and the campaign need it).
 * `best` is the best price the trade has seen since the fill.
 * `sharesOutstanding` is the stored share count as of now (D2), when known.
 * `disabled` switches named rules off, for the replay's counterfactual cells
 * only (`ReplayOptions.disableExits`): a disabled trail is never adopted and a
 * disabled signal never fires; every other rule reads as before. It defaults
 * to none, and no production caller passes it.
 */
export function readGannExit(
  pos: GannExitPosition,
  daily: Bar[],
  best: number | null,
  sharesOutstanding: number | null = null,
  disabled: ReadonlySet<GannExitRuleName> = NO_RULES_DISABLED,
): GannExitReading {
  const long = pos.side === "long";
  // Gann's "3 points" beyond a level, price-scaled as he scaled it (pointScale.ts).
  const below = (p: number) => (long ? p - threePoints(p) : p + threePoints(p));
  const tighter = (x: number, y: number) => (long ? x > y : x < y);

  let stop = pos.initialStop;
  let stopReason: GannStopReason = "initial";
  const adopt = (candidate: number | null, reason: Exclude<GannStopReason, "initial">) => {
    if (disabled.has(reason)) return;
    if (candidate === null || !Number.isFinite(candidate)) return;
    if (tighter(candidate, stop)) {
      stop = candidate;
      stopReason = reason;
    }
  };

  const firstAfter = daily.findIndex((b) => day(b) >= pos.entryDate);
  const since = firstAfter === -1 ? [] : daily.slice(firstAfter);
  if (since.length === 0) return { stop, stopReason, exit: null };
  const last = since[since.length - 1];

  // C1: the hold test and three adverse closes.
  let exit: GannExitReading["exit"] = null;
  const on = (reason: GannExitReason) => !disabled.has(reason);
  if (on("hold_test_failed") && pos.crossedLevel !== null) {
    const failed = since.some((b) => (long ? b.c < below(pos.crossedLevel!) : b.c > below(pos.crossedLevel!)));
    if (failed) {
      exit = {
        reason: "hold_test_failed",
        // The level may be an old top crossed or an old bottom regained (A-TREND-10).
        note: `Closed back ${long ? "under" : "over"} the old level it crossed (${pos.crossedLevel.toFixed(2)}): the breakout did not hold.`,
      };
    }
  }
  // Gann counts from the entry: "if it closes against you the first day you
  // are apt to be wrong; the third successive day, you are wrong" (A05 p. 23).
  // So it tests the first three sessions after the fill (the fill's own session
  // is day one); a check that runs late still acts on those three. Until 2026-09-28 it
  // fired on any three closes under the entry at any point in the trade, a
  // pullback in a winner included; run 19 showed that exit costing 107 trades
  // at -0.25R.
  if (!exit && on("three_adverse_closes") && since.length >= 3) {
    const adverse = since.slice(0, 3).every((b) => (long ? b.c < pos.entry : b.c > pos.entry));
    if (adverse) exit = { reason: "three_adverse_closes", note: "Closed against the trade on each of its first three days." };
  }

  // A-LEVELS-04 (fork FL3 a): "failing to pass an old top is a top". A long
  // exits when a double or triple top fails after the fill; a short exits on
  // the mirror at a double or triple bottom. A test that had already failed at
  // entry was part of the setup (the scan holds the long to Watch and
  // placement refuses it only when that top stands before TP1), so the exit
  // needs a new failure: either none had failed on the sessions before the
  // fill (review 11 M1: the 3-Day Chart confirms the test's peak days after it
  // prints, so the peak's own date is not the test), or the failing test now
  // is a later one than the one that stood then, such as the third test of a
  // top already failed twice (review 12 H1; W006 p.44, the third test
  // decides). Each reading covers the 52 weeks before its next session, the
  // entry chart's window (`FAILED_TOP_CHART_DAYS`; review 12 L2): the fill
  // session for the reading at entry, the next weekday for today's.
  if (!exit && on("failed_top")) {
    const window = (upTo: number) => failedTopWindow(daily, upTo);
    const side = long ? "bullish" : "bearish";
    const nowBars = window(daily.length);
    const failed = failedTestAgainst(readMultipleTops(nowBars), side);
    const entryBars = firstAfter > 0 ? window(firstAfter) : [];
    const atEntry = firstAfter > 0 ? failedTestAgainst(readMultipleTops(entryBars), side) : null;
    // The same test: its latest swing extreme is the same session (a later
    // test is a later swing).
    const sameTest = failed !== null && atEntry !== null && nowBars[failed.lastTestIndex].t === entryBars[atEntry.lastTestIndex].t;
    if (failed && !sameTest) {
      exit = {
        reason: "failed_top",
        note: `Failed at a ${failed.tests >= 3 ? "triple" : "double"} ${failed.kind} near ${failed.level.toFixed(2)} and closed back ${long ? "under" : "over"} it: a ${failed.kind}.`,
      };
    }
  }

  // C4: a change of trend after entry.
  const weekly = walkSwingChart(daily, WEEKLY_SWING_CHART);
  if (!exit && on("trend_change")) {
    const changedAt = weekly.trendChanges[weekly.trendChanges.length - 1];
    const against = long ? "bearish" : "bullish";
    if (weekly.trend === against && changedAt !== undefined && changedAt >= firstAfter) {
      exit = { reason: "trend_change", note: "The weekly swing chart turned against the trade." };
    }
  }
  const ledger = buildCampaignLedger(daily);
  const withCampaign = ledger !== null && ledger.trend === (long ? "bullish" : "bearish");
  // Only a reaction that began after the fill: one already running at entry
  // was part of the setup, not a signal about this trade.
  // The over-balancing reaction's own start: the one in progress, or a
  // completed one still standing (`overbalance`, 2026-10-21).
  const reactionStart = ledger?.overbalance?.fromIndex ?? -1;
  if (!exit && on("trend_change") && withCampaign && reactionStart >= firstAfter && (ledger!.spaceOverbalanced || ledger!.timeOverbalanced)) {
    exit = {
      reason: "trend_change",
      note: `A reaction since the fill is larger than any earlier one in this campaign (${[
        ledger!.spaceOverbalanced && "price",
        ledger!.timeOverbalanced && "time",
      ]
        .filter(Boolean)
        .join(" and ")}): the trend is changing.`,
    };
  }

  // The ledger's other trend-change calls (item 7 review L1): a reaction still
  // making new extremes in its third month (A-TIME-01/-02), or a monthly break
  // whose reaction went under the previous section's top (A-TREND-06). Only
  // when the call was not already standing at entry: one that was is part of
  // the setup, the same rule as the over-balance above. The same call means
  // the same reaction, counted from the same section top; a new section's
  // own call after the fill exits (item 7 second review L-c).
  const sectionChange = (l: NonNullable<typeof ledger>) =>
    l.counterMoveThirdMonth || (l.monthlyBreakInReaction && l.reactionBelowPriorSection);
  if (!exit && on("trend_change") && withCampaign && sectionChange(ledger!)) {
    const atEntry = buildCampaignLedger(daily.slice(0, firstAfter));
    if (!(atEntry && atEntry.trend === ledger!.trend && atEntry.sectionTopDate === ledger!.sectionTopDate && sectionChange(atEntry))) {
      exit = {
        reason: "trend_change",
        note: ledger!.counterMoveThirdMonth
          ? "The reaction is still making new extremes in its third month: the trend is changing."
          : "A month broke the one before it and the reaction went past the previous section's top: the trend is changing.",
      };
    }
  }

  // M-E12: an exhaust gap against the trade since the fill, "the culmination
  // of a major swing" (Commodities p.319: after a prolonged advance a final
  // one-day gap and a reverse signal day; mirrored p.320). The gap must print
  // on a session after the fill's (`firstAfter` + 1): a gap on the fill day,
  // or one before it, was part of the setup. Read after the trend-change
  // calls, so a trade that changed trend on the same reading still reverses
  // (Q15) rather than being taken off flat.
  if (!exit && on("exhaust_gap")) {
    const against = long ? "top" : "bottom";
    for (let g = daily.length - 1; g >= Math.max(1, firstAfter + 1); g--) {
      if (exhaustGapAt(daily, g) !== against) continue;
      exit = {
        reason: "exhaust_gap",
        note: `An exhaust gap ${long ? "up" : "down"} on ${day(daily[g])} with a reverse signal day: the move has culminated.`,
      };
      break;
    }
  }

  // D2: a distribution week at a top, printed after the fill.
  if (!exit && on("distribution") && long && sharesOutstanding) {
    const cs = readCapitalStock(daily, toWeeklyBars(daily), sharesOutstanding);
    // Weekly bars are keyed by their Monday, so a week that began before the
    // fill but closed after it still counts.
    const entryWeek = toWeeklyBars(since)[0]?.t.slice(0, 10) ?? pos.entryDate;
    if (cs && (cs.distributionWeek || cs.plainTopWeek) && cs.peakRecentWeek !== null && cs.peakRecentWeek >= entryWeek) {
      exit = {
        reason: "distribution",
        note: `${(cs.peakRecentWeekTurnover * 100).toFixed(0)}% of the capital stock changed hands in the week of ${cs.peakRecentWeek}, at a top: distribution.`,
      };
    }
  }

  // A-VOLUME-03 (fork FV7 b): after a lower top, a narrow spell broken down on
  // increased volume signals a further decline, so an open long exits while
  // such a breakdown stands, whenever it was bought (review M2, 2026-10-16:
  // Gann's signal does not depend on the fill date; placement also refuses a
  // long while one stands, `entryConfirmationRefusal`).
  if (!exit && on("distribution") && long) {
    const standing = readDistributionStanding(daily, new Date(Date.parse(last.t) + 36 * 3_600_000));
    if (standing) {
      exit = {
        reason: "distribution",
        note: `After a lower top, the narrow range broke down on ${standing.breakoutVolumeRatio.toFixed(1)}× its average volume (${standing.breakDate}): a sign of a further decline.`,
      };
    }
  }

  // Break-even once 3 points ahead (M-E6): "at 3-4 points' profit, move the
  // stop to breakeven" (*Truth of the Stock Tape* Ch.VIII rule 4; the *Stock
  // Selector* Ch.II rule 4, "once 3 points ahead"), price-scaled as his 3
  // points are, which covers his "4-5 in high-priced" stocks. Until
  // 2026-10-16 it waited for a profit equal to the risk taken.
  const threeAhead = best !== null && (long ? best >= pos.entry + threePoints(pos.entry) : best <= pos.entry - threePoints(pos.entry));
  if (threeAhead) {
    adopt(pos.entry, "break_even");
  }

  // C3: under the last higher bottom (over the last lower top) since entry.
  const swings = walkSwingChart(daily, THREE_DAY_CHART);
  const lastSwing = [...swings.pivots].reverse().find((p) => p.kind === (long ? "bottom" : "top") && p.index >= firstAfter);
  if (lastSwing) adopt(below(lastSwing.price), "last_reaction");

  // A-STOP-05: under each week's bottom (over each week's top when short),
  // once the trade has run into a new week. For longs W006 p.46 (Rule 2)
  // gives "1, 2, 3 or 5 points"; GSPS takes 3, the stop he calls safest on
  // the same page. For shorts Rule 4 (p.47) gives one figure: 1 point above
  // the previous week's high.
  const weeks = toWeeklyBars(daily);
  const thisWeek = weeks.length > 0 ? weeks[weeks.length - 1].t.slice(0, 10) : null;
  const entryWeek = toWeeklyBars(since)[0]?.t.slice(0, 10) ?? null;
  if (thisWeek && entryWeek && thisWeek > entryWeek && weeks.length >= 2) {
    const prior = weeks[weeks.length - 2];
    adopt(long ? below(prior.l) : prior.h + pricePoint(prior.h), "prior_week");
  }

  // C3: under the prior month's low once the trade has run into a new month.
  const month = day(last).slice(0, 7);
  if (month > pos.entryDate.slice(0, 7)) {
    const prior = daily.filter((b) => day(b).slice(0, 7) < month);
    const priorMonth = prior.length > 0 ? day(prior[prior.length - 1]).slice(0, 7) : null;
    if (priorMonth) {
      const bars = prior.filter((b) => day(b).slice(0, 7) === priorMonth);
      adopt(below(long ? Math.min(...bars.map((b) => b.l)) : Math.max(...bars.map((b) => b.h))), "prior_month");
    }
  }

  // C3: the final stage of the campaign. Its trails follow an advance (W006
  // p.46, Rule 2: "in fast high-level advances trail 5 points under each
  // day's high"), so they start only once the trade itself has advanced 3
  // points, the point at which Gann first moves a stop at all (break-even
  // above, *Stock Selector* Ch.II rule 4). Before that the initial stop
  // stands: a trade bought in the final stage that has not yet moved is in
  // no advance to trail. Until 2026-10-23 they started at the fill, so the
  // day's-high trail could sit above the entry on the fill's next session
  // and take a trade that had not moved off on noise (intraday alerts run
  // 90: 3 of 6 final-stage exits had a best of 0.02R or less).
  if (withCampaign && ledger!.sections >= FINAL_STAGE_SECTION && threeAhead) {
    const counter = [...ledger!.legs].reverse().find((l) => l.direction === (long ? "down" : "up"));
    if (counter) adopt(long ? best * (1 - counter.pct / 100) : best * (1 + counter.pct / 100), "final_stage");
    if (since.length >= 3) {
      const [p2, p1, p0] = since.slice(-3);
      const twoDayCounter = long ? p1.c < p2.c && p0.c < p1.c : p1.c > p2.c && p0.c > p1.c;
      if (twoDayCounter) adopt(below(long ? p0.l : p0.h), "final_stage");
    }
    // A-STOP-04 (W006 p.46, Rule 2): in fast advances at high levels, trail 5
    // points under each day's high (his 10 points "at very high levels" is
    // the same 5 once the point is price-scaled). The final stage is GSPS's
    // reading of "a fast advance at high levels"; mirrored for shorts.
    adopt(long ? last.h - 5 * pricePoint(last.h) : last.l + 5 * pricePoint(last.l), "final_stage");
  }

  // The Fast style's day trail: 3 points beyond the latest completed session
  // since the fill, its own session included (header). Adopted only when
  // tighter, so the stop follows each day's low up and is never lowered.
  if (pos.style === "fast") {
    adopt(gannDayStop({ extreme: long ? last.l : last.h, side: pos.side }), "day_low");
  }

  // M-E11 (APPROXIMATED: the day is Gann's, the stop beyond it is his daily
  // time rule's). A reverse signal day or a 7-10 Day Rule day against the
  // trade, since the fill, is "an indication for a change in trend" (Commodities p.318,
  // the 7-10 Day Rule p.324), so the stop goes 3 points beyond that day's
  // extreme: under its low when the signal is a top against a long, over its
  // high when it is a bottom against a short (the daily time rule's stop "3
  // points beyond" a top or bottom, *Wall Street Stock Selector* Ch. IV). The
  // latest such day since the fill. Each day is read on the bars up to it, at
  // most the 7-10 Day Rule's longest run back, so a later day never moves it.
  {
    const against = long ? "top" : "bottom";
    for (let i = daily.length - 1; i >= Math.max(2, firstAfter); i--) {
      const r = readReverseSignal(daily.slice(Math.max(0, i - SEVEN_TO_TEN_MAX_DAYS - 2), i + 1));
      if (r.signal !== against) continue;
      adopt(below(long ? daily[i].l : daily[i].h), "reverse_signal");
      break;
    }
  }

  // M-T10, the boiling point: "wait to sell your stock until it boils ... the
  // final fast advance lasts 6-7 weeks (sometimes 10)", with a 10-point
  // trailing stop (*Wall Street Stock Selector* Ch. V; the 6-7 week panic
  // that ends a bear campaign is the mirror). Once the weekly swing chart's
  // run in the trade's direction has run 6 weeks (`CLASSIC_MIN_WEEKS`, the
  // start of his 6-7 week window), the stop trails his 10 points from the
  // best price, `BOILING_POINT_TRAIL_POINTS` Gann points. Engineering choice,
  // labelled: the run is the weekly chart's from its last swing extreme
  // (`computeRunBoilingPoint`), whether or not it was fast; Gann gives no
  // speed for "fast".
  if (best !== null) {
    const run = runBoilingPointFromPivots(daily, weekly.pivots);
    if (run && run.run === (long ? "up" : "down") && run.weeksSinceStart >= CLASSIC_MIN_WEEKS) {
      const trail = BOILING_POINT_TRAIL_POINTS * pricePoint(best);
      adopt(long ? best - trail : best + trail, "boiling_point");
    }
  }

  let reverse: GannReversal | null = null;
  if (exit && reversesOn(exit.reason)) {
    const extreme = best ?? (long ? Math.max(...since.map((b) => b.h)) : Math.min(...since.map((b) => b.l)));
    reverse = gannReversal({ side: pos.side, brokenLevel: last.c, extreme });
  }
  return { stop, stopReason, exit, reverse };
}
