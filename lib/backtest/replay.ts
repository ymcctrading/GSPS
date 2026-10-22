/**
 * Bar-by-bar replay of the protocol's own entry logic.
 *
 * This exists because win rate and expectancy were being quoted from ad-hoc
 * scripts. It replays the same functions the live scan uses, so a number
 * quoted from here describes the shipped system rather than a
 * re-implementation of it.
 *
 * What arms a trade (rewritten 2026-09-25, alignment audit F3.1–F3.3): the
 * same thing that arms one in `lib/scanTicker.ts`. That is Gann's
 * swing-crossing trigger (`lib/gann/entryTrigger.ts`) computed from **daily**
 * bars, in the directions `armSessionEntries` derives from the macro
 * trends (`lib/scan/entrySelection.ts`, shared with the scan). Between
 * 2026-09-17 and this rewrite, the replay instead computed the trigger from
 * 15-minute bars, only on STRAT-detected candidates, in the pattern's
 * direction, and filtered it through the STRAT gap rule and risk floor. The
 * live scan applies none of those to the trigger. Runs committed in that
 * window measure a trigger production never used. Do not compare them with
 * runs from this version as if they measured the same rule
 * (`STRATEGY_VERSION` was bumped for exactly this).
 *
 * The daily trigger is fixed for a session, because it is read from prior
 * sessions only. The 15-minute bars decide when, and whether, the stop order
 * resting at it fills. A given swing top or bottom is crossed once: after a
 * fill, that pivot does not arm again.
 *
 * Both of the scan's setup kinds are replayed (2026-09-26):
 *   - **Reversion**, against Gann's weighted trend (`reversionEntry`), the
 *     way `scanTicker` arms every symbol.
 *   - **Continuation**, with Gann's weighted trend, the way
 *     `runMarketScan`'s continuation pass calls `scanTicker` with a
 *     direction. Since PLAN.md item 6 step 11 (A-TREND-09, "never too high
 *     to buy while the trend is up") the trend alone arms it
 *     (`armSessionEntries`, `isWithGannTrend`): no momentum, breadth or score
 *     gate, live or here. What is not modelled is the live pass's candidate
 *     pool and per-side list length, which are cross-symbol rationing, not
 *     properties of one symbol's setup.
 *   - With no trend on any chart, one reversion: the nearer of the two
 *     sides' buying points (fork F4 a), as `scanTicker` arms it.
 *   - One a session, as the live scan shows (`chooseSessionEntry`, since
 *     2026-10-21): the continuation when it armed, else the reversion. The
 *     other side is set aside, not traded.
 *
 * A session arms once it has `MIN_DAILY_BARS_FOR_SCAN` prior daily bars, the
 * same minimum `scanTicker` enforces (it was 120 here until 2026-09-26, which
 * excluded early history the live scan does trade). Since 2026-10-20 both
 * read the provider's closed weeks and months, with the bar in progress built
 * from completed sessions (`levelCharts`), so the weekly and monthly trends
 * agree; `pillarParity.test.ts` compares all three.
 *
 * Deliberately pessimistic wherever a bar is ambiguous:
 *   - The trigger is a resting stop order. If a candle opens already beyond
 *     it, the fill is that open, not the trigger price.
 *   - A stop a candle opens through fills at that open, not the stop
 *     (`stopFill`).
 *   - When a single bar's range covers both the stop and the target there is
 *     no way to know which came first, so it counts as a loss.
 *   - Round-trip friction is charged against every trade, widening losses and
 *     narrowing wins.
 *
 * What it cannot see: the true intra-bar path, the real bid/ask at the moment
 * of the fill, and overnight gaps beyond the session data supplied. Treat the
 * output as an upper bound on a strategy's quality, never a promise.
 */

import type { UniverseStrength } from "@/lib/gann/universeStrength";
import type { TradeStyle } from "@/lib/trade/tradeStyle";
import type { AssetClass, Bar, GannLevels, ScanDecision, SetupKind, StratPattern, Timeframe, TrendReading } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { computeStopWithLeeway, computeTradeLevels, gannEntrySource, gannTargetPool, type EntrySource } from "@/lib/strat/levels";
import type { TradeLevels } from "@/lib/types";
import {
  MIN_DAILY_BARS_FOR_SCAN,
  chooseSessionEntry,
  entryChart,
  gannEntryOf,
  preferWithTrend,
  rankArmedPatterns,
} from "@/lib/scan/entrySelection";
import { isLargeCapStock } from "@/lib/strat/large-cap";
import { readLiquidity } from "@/lib/scan/liquidity";
import { levelCharts, mondayOf, yearCycleMonths } from "@/lib/scan/levelCharts";
import { etDateKey } from "@/lib/market/session";
import { readPillarFacts, type PillarFacts } from "@/lib/scoring/pillars";
import { buildStructuralLevels } from "@/lib/scan/structuralLevels";
import { applyBreakawayHold, applyDistributionBreakdownHold, applyFailedTopHold, applyMonthlyBreakHold, applyRuleFollowingHold, applyTimeWindowHold, applyWeakStockHold, applyFigureCrossingHold, computeScore, srMatchForSide } from "@/lib/scoring/score";
import { withDecisionState } from "@/lib/scoring/decisionState";
import { readWindowTurn, type WindowTurn } from "@/lib/gann/timeWindow";
import { failedTestInPath } from "@/lib/gann/multipleTops";
import { breakawayVolumeMet, readBreakaway, type BreakawayReading } from "@/lib/gann/breakaway";
import { readMonthlyBreakWarning, type MonthlyBreakWarning } from "@/lib/gann/campaignLedger";
import { RECLAIM_POINTS, isReclaimedByClose, isStopBreached, isStopBreachedByBar } from "@/lib/gann/stopBreach";
import {
  GANN_EXIT_RULE_NAMES,
  isGannExitRuleName,
  readGannExit,
  type GannExitReason,
  type GannExitRuleName,
  type GannStopReason,
} from "@/lib/gann/exitRules";
import { gannReversal, reversesOn, type ReversalCause } from "@/lib/gann/reverse";
import { gannRebuy, rebuysOn, type GannRebuy } from "@/lib/gann/rebuy";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { SCALE_OUT_PCT } from "@/lib/trade/protocol-exit";
import { readPyramidAdd, type PyramidLot } from "@/lib/gann/pyramid";
import { longMonthlyWindow, yearCountMonthlyWindow } from "@/lib/gann/secondaryTime";

/** Whole-share scale for fractional replay lots (1 lot = 1024 shares, so four halvings stay whole). */
const PYRAMID_SHARE_SCALE = 1024;
import { figureCrossingOf, roundNumberEntryBlocked } from "@/lib/gann/evenFigures";
import { selectionStrength } from "@/lib/gann/leadership";
import {
  atrPercentOfPrice,
  nearestLevelMatchByRole,
  levelBandPct,
} from "@/lib/scoring/proximity";
import type { CriterionWeights } from "@/lib/scoring/weights";
import { computeGannEntryTrigger, gannBreakLine, sameGannLevel, tradedIntoBuyZone, type GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { restsWithoutCrossing, type GannEntryKind, type GannHoldBasis } from "@/lib/gann/entryKind";
import { advanceEntryConfirmation, entryReady, freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import type { EntryConfirmationEvidence } from "@/lib/lifecycle/types";
import { readTrend } from "@/lib/analysis/trend";
import { countLevelTests, levelRole, type LevelRole } from "@/lib/analysis/levelRole";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { recentSquareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles, yearCycleConvergence } from "@/lib/gann/timeCycles";
import { computeAngleSlopes } from "@/lib/gann/normalizedSlope";
import { computeRetracementLevels } from "@/lib/gann/retracement";
import { priceTimeConfluence } from "@/lib/gann/digitalRoot";
import { computeCampaignLeg, computeSwingChart, type CampaignLegReading, type SwingChartReading } from "@/lib/gann/swingChart";
import {
  readDisclosedRules,
  type DisclosedRulesContext,
  type InstrumentFacts,
} from "@/lib/gann/disclosedRules";
import { splitAdjustedSharesAsOf, type SharesPoint } from "@/lib/data/instrumentReference";
import type { Inception } from "@/lib/gann/incorporationCycle";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { computeRuleOfThree, type RuleOfThreeReading } from "@/lib/gann/ruleOfThree";
import { computeTimePriceSquare, type TimePriceSquareReading } from "@/lib/gann/timePriceSquare";
import { computeVolumeClimax, type VolumeClimaxReading } from "@/lib/gann/volumeClimax";
import { computeBoilingPoint, type BoilingPointReading } from "@/lib/gann/boilingPoint";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";

/** 6.5 hours of 15-minute candles. */
export const BARS_PER_SESSION = 26;
/** Crypto trades around the clock: 24 hours of 15-minute candles. */
export const CRYPTO_BARS_PER_SESSION = 96;

/**
 * Daily history needed before a session can arm. This is the live scan's own
 * minimum (`MIN_DAILY_BARS_FOR_SCAN`), not a separate replay threshold, so the
 * replay trades exactly the history production trades. It was 120 until
 * 2026-09-26.
 */
export const MIN_DAILY_BARS_FOR_SCORE = MIN_DAILY_BARS_FOR_SCAN;

export interface ReplayOptions {
  /** Take-profit distance as a multiple of the trade's risk. */
  targetR: number;
  /**
   * Round-trip friction per share — spread crossed twice plus slippage on a
   * stop entry. Charged against every trade, win or lose.
   */
  costPerShare?: number;
  /** Abandon a position that has not resolved within this many bars. */
  maxBarsHeld?: number;
  /** Minimum bars of history before a setup may be taken. */
  warmupBars?: number;
  /**
   * Daily bars for the same symbol. Supplying them turns on the confluence
   * score, so each trade records the verdict the scanner would have shown.
   * Only sessions strictly before the day being traded are ever read.
   */
  dailyBars: Bar[];
  /**
   * Monthly bars for the same symbol (up to ten years). Supplying them tags
   * each trade with `yearCycleHits`. Only months that closed before the
   * trade's month are read, and a monthly pivot needs three later months to
   * confirm, so no future bar can reach the tag.
   */
  monthlyBars?: Bar[];
  /**
   * The provider's weekly bars for the same symbol, reaching
   * `WEEKLY_CHART_YEARS` before the first session. Supplying them gives the
   * replay the live scan's weekly chart: the closed weeks before each
   * session's week, and the week in progress built from its completed
   * sessions (`levelCharts`). Without them the weeks are rolled up from
   * `dailyBars`, which differs from the provider's weeks and holds no weeks
   * from before the daily history starts (2026-10-20, weekly parity).
   */
  weeklyBars?: Bar[];
  /**
   * Criterion weights to score with. Defaults to `DEFAULT_CRITERION_WEIGHTS`
   * (`lib/scoring/weights.ts`) — one point each, restored on principle
   * 2026-09-16 after a hand-set distribution held from 2026-09-14; see that
   * constant's own doc comment. Supplying a candidate set is how a weight
   * proposal is checked against the same trades the current weights produced
   * — see lib/backtest/propose-weights.ts.
   *
   * Note this defaults to the *code* constant, deliberately — unlike the live
   * scan, which resolves weights through `lib/scoring/active-weights.ts` and
   * may be scoring with a promoted `learning_models` row instead. A replay
   * must be reproducible from the repo alone, so it does not read that table;
   * the cost is that a replay and the live scan can disagree while a model is
   * promoted. Pass `weights` explicitly to reproduce what production actually
   * scored with.
   */
  weights?: CriterionWeights;
  /**
   * Walk the P&L simulation against the leeway/large-cap-widened stop
   * (`computeStopWithLeeway`) instead of the raw pattern stop. Defaults false,
   * which is the harness's original, unwidened behaviour and what every
   * existing result and test describes.
   *
   * This is *not* the same thing as the `score`/`outputState` a trade carries
   * when `dailyBars` is supplied — that has always reflected
   * `computeTradeLevels`'s widened stop via the verdict, because the scanner's
   * own decision does. What the verdict never touched is the stop the
   * outcome walk below actually checks: `stop`/`target` here come from the
   * raw pattern regardless of the verdict, so the win-rate and expectancy
   * numbers a report reads have never moved when this widening shipped. Set
   * this to true to ask the question directly — the same run twice, once
   * with each stop, is the before/after `docs/BACKTESTING.md` asks for.
   */
  useProductionStop?: boolean;
  /**
   * Trade the plan production actually attaches (2026-09-28). For US
   * equities `computeTradeLevels` prices the stop with
   * `computeEquityTradeLevels` (a structural stop in a percent-of-price band)
   * and TP1 from Gann and S/R levels. `useProductionStop` never used that
   * model: it capped the daily-structure stop at 2.5–3.5× the *execution-bar*
   * ATR (`computeStopWithLeeway`), a stop a small fraction of the plan's, and
   * paired it with a `targetR` target. With this on, the bracket's stop is the
   * plan's `stopLoss` and its target the plan's `takeProfit1` (the Gann exit
   * rules scale out at that TP1 too), exactly as `scoreSetup` prices it for
   * the verdict. `targetR` is then unused. R stays measured on the plan's own
   * risk (trigger to plan stop). Takes precedence over `useProductionStop`.
   * A setup with no valid plan is skipped, as production publishes none.
   */
  usePlanLevels?: boolean;
  /**
   * The trade style walked (`lib/trade/tradeStyle.ts`, 2026-10-21). "fast"
   * trades Gann's fast-market method: the same plan, entry and stop as
   * swing (Rule 3, W006 pp.46-47), and from the fill's session the stop
   * trails 3 points under each completed day's low (over its high, short;
   * `readGannExit`'s "day_low", W006 Rule 2 p.46), as the live and paper exit
   * managers trail it. Read by Gann's exits only (`exitRule` "gann" or
   * "gann-runner"); the fixed bracket has no trail, so "fast" changes
   * nothing there. Default "swing".
   */
  tradeStyle?: TradeStyle;
  /**
   * Skip entries the autonomous portfolio manager holds at a round number by
   * default (`lib/gann/evenFigures.ts#roundNumberEntryBlocked`): an entry just
   * short of a figure whose breakout level isn't that figure. Mirrors the
   * manager's default setting (auto-ordering at round numbers off).
   */
  roundNumberHold?: boolean;
  /**
   * Which entry rule fills the trade. Since PLAN.md item 4 (2026-10-15)
   * every production path enters on `"reaction"`, which is the default; the
   * other two are kept to measure against it.
   *
   * - `"stop"`: a resting stop order at the trigger, filled the moment a
   *   candle reaches it (at the open when it gaps past). This is how the
   *   manual ticket, Guided Mode and the demo account entered until item 4.
   * - `"confirmed"`: the full entry-confirmation sequence
   *   (`lib/lifecycle/entryConfirmation.ts`: touch, a close beyond the
   *   trigger by the 3-point-rule buffer, a retest, then a close that holds).
   *   The trade fills at the open of the bar after the hold confirms. This is
   *   how plan-scoped automation and the autonomous portfolio manager entered
   *   until item 4. It is no production path now: it arms from the crossing
   *   alone (`computeGannEntryTrigger`, no old-level or held buys) and
   *   measures R from the crossing price, 2 points past the reaction entry
   *   the plan, its TP1 and M-K5 are priced from. A run meant to describe
   *   production uses `"reaction"` (2026-10-21).
   *
   * Added 2026-09-26 (alignment audit F3.4). Before this the replay measured
   * only the stop entry, so nothing measured the rule automation trades on.
   *
   * - `"reaction"` (default; 2026-10-15, PLAN.md item 4): Gann's own crossing rule
   *   (W006 pp.20, 46-47). A close 3 points beyond the old level crosses it;
   *   the buy is on the reaction into the zone from 1 point past the level
   *   (`reactionEntry`) down to 1 point short of the stop; the stop is 3
   *   points the other side of the level (`reactionStop`), so the plan risks
   *   4 points, inside his 5-point cap. Since never-failing rule 9
   *   (2026-10-16; "trade at the market", Commodities rule 9 pp.43-45 and
   *   p.19) no limit rests at `reactionEntry`: once a closed candle after the
   *   crossing has traded into the zone, the buy is a market order, filled at
   *   the next candle's open, as production places it (`confirmEntry`). A
   *   closed candle through the stop before then calls the entry off; an open
   *   through it is refused (`fill_outran_bracket`). R is measured on the
   *   plan's 4 points; a fill away from `reactionEntry` moves the P&L, not
   *   the bracket. A double or triple bottom, or a bottom that held, has
   *   nothing to cross and is bought the same way once a closed candle has
   *   come back to its entry.
   */
  entryRule?: "stop" | "confirmed" | "reaction";
  /**
   * How an open trade leaves (parity roadmap Stage C, owner decisions 2 and 6):
   *
   * - `"bracket"` (default): the plan's fixed stop and a `targetR` target.
   * - `"gann"`: no fixed target (Gann never fixes one). The trade leaves on
   *   its stop, which moves on Gann's structure, or at the next session's open
   *   after a Gann exit signal: the hold test, three adverse closes, or a
   *   change of trend. See `lib/gann/exitRules.ts`. Stops and signals update
   *   once per session from completed daily bars only.
   *
   * - `"gann-runner"`: the rule live and paper positions use since 2026-09-28
   *   (`lib/trade/protocol-exit.ts#LIVE_EXIT_RULE`): 60% leaves at the target,
   *   the rest runs on Gann's stop and exit signals exactly as `"gann"` does.
   *   Before the target, Gann's stop covers the whole position. A bar that
   *   touches both the target and the stop counts the stop (the conservative
   *   order, as the bracket does). The replay's target is `targetR`, while live
   *   TP1 is a Gann level; the tranche split is the same.
   *
   * All fill a stop at the stop price, or at the open of a candle that opens
   * through it (`stopFill`), so they are compared on the same convention.
   */
  exitRule?: "bracket" | "gann" | "gann-runner";
  /**
   * Measurement only: switch named Gann exit rules off inside the replay's
   * walk, to ask what the same trades would have done without them (the
   * 2026-10-21 15-minute exit diagnosis). A stop trail named here
   * (`prior_week`, `break_even`, ...) is never adopted; an exit signal named
   * here (`three_adverse_closes`, `trend_change`, ...) never fires; every
   * other rule reads as before. Applies to every trade the walk opens,
   * reversals and re-buys included, under `exitRule: "gann"` or
   * `"gann-runner"`; the bracket has no Gann rules to switch off. An unknown
   * name throws (`resolveDisableExits`). Default empty: identical results.
   * The live exit path never reads it: no production caller passes a set to
   * `readGannExit`. Not covered: the pyramid's whole-line stop
   * (`pyramid: true`), which is not one of the named rules.
   */
  disableExits?: GannExitRuleName[];
  /**
   * Reverse when caught (A-EXIT-02, W006 p.48 Rule 6; owner's Q15,
   * 2026-10-16), under the Gann exit rules only. A trade that leaves on a stop
   * or on an exit that says the trend changed (`lib/gann/reverse.ts`) is
   * followed by the opposite trade, as automation seeds it
   * (lib/automation/stop-out.ts): entry at the level that broke, stop 3 points
   * beyond the old trade's best price, entered once it confirms on the closed
   * candles of the same session (the plan expires at the session's close), and
   * walked on the same exit rules. A reversal that is caught reverses again,
   * up to `MAX_REVERSALS` deep. Default true: production reverses.
   */
  reverseWhenCaught?: boolean;
  /**
   * Re-buy after a stop (A-PYRAMID-07, W022 p.198; owner's pick, 2026-10-16),
   * under the Gann exit rules only. A trade that leaves on a trailing stop
   * while the swing chart still runs its way rests a re-entry 12 points back
   * from its best price, stop half the reaction beyond (`lib/gann/rebuy.ts`);
   * any reversal opened at the stop is covered there. Default true.
   */
  rebuyAfterStop?: boolean;
  /**
   * How many of Gann's points a closed candle has to clear a broken stop by for
   * the break to count as failed and the plan to stand again
   * (`lib/gann/stopBreach.ts#reclaimLevel`). Defaults to `RECLAIM_POINTS` (3),
   * the figure the live scan uses. This exists only so the stricter reading (5,
   * `RECLAIM_POINTS_STRICT`: "more than 5 above means it is going higher",
   * *Master Stock Market Course* pp. 246-248) can be measured against it
   * before the live number moves. Pre-registered in
   * `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 5; 3 versus 5 are the
   * only two values to run, and no other is searched.
   */
  reclaimPoints?: number;
  /**
   * Under a Gann exit rule, add to winning trades on Gann's pyramiding rules
   * (`lib/gann/pyramid.ts`): half the last lot at each crossed swing top made
   * since it, once it shows a full risk unit of profit, with the whole
   * position's stop lifted to at least its combined break-even. R stays in
   * units of the first lot's risk. Ignored under the bracket.
   */
  pyramid?: boolean;
  /**
   * Stored filings facts for the symbol (parity roadmap D2, D3; see
   * `lib/data/instrumentReference.ts`). Each session reads the share count
   * that had been filed before it, restated to the bars' split basis, so no
   * later filing reaches a trade. Omit it and the capital-stock and
   * incorporation readings are null, as they are for symbols with no stored
   * row.
   */
  instrument?: { sharesHistory: SharesPoint[]; inception: Inception | null };
  /**
   * The market's daily bars (SPY), for Gann's early and late leaders (G25).
   * Each session reads only the bars before it. Omit it and the leadership
   * reading carries only the first-year high.
   */
  marketDailyBars?: Bar[];
  /**
   * The market's monthly bars (SPY), to date its bull market for Gann's weak
   * stocks (`readWeakStock`). Each session reads only the months before its
   * own; the current month is built from the daily bars, as live.
   */
  marketMonthlyBars?: Bar[];
  /**
   * The scan universe's monthly positions (`fetchUniverseStrengthSince`), for
   * Gann's relative strength rank (S6, P3(c)). Each session reads the
   * positions of the months closed before its own. Omit it and the rank is
   * unread. Not read for crypto, which has no peer list.
   */
  universeStrength?: UniverseStrength | null;
  /**
   * The stock's monthly bars over a longer span, for the class C long month
   * counts only (C-TIME-09's 144 months); each session reads the
   * `LONG_MONTHLY_YEARS` before it, as the live scan holds them. Falls back to
   * `monthlyBars`.
   */
  longMonthlyBars?: Bar[];
  /**
   * The stock's monthly bars over `YEAR_COUNT_MONTHLY_YEARS`, for the
   * time-window hold's yearly counts (A-TIME-11's 20 years) only; each session
   * reads the months closed before it within that span, as the live scan holds
   * them. Falls back to `longMonthlyBars`.
   */
  yearCountMonthlyBars?: Bar[];
  /**
   * Collect the daily plan each session stands on, as the daily scan prices it
   * (`lib/backtest/replayIntradayAlerts.ts`): the session's chosen buying point
   * (`chooseSessionEntry`'s rule, the with-trend point first), its plan levels
   * and its verdict, read from the sessions before it. Keyed by date; null when
   * the session arms nothing or prices no plan. Read once per session, on its
   * first execution bar.
   */
  sessionPlans?: Map<string, SessionDailyPlan | null>;
  /** With `sessionPlans`: collect the plans only, and trade nothing. */
  plansOnly?: boolean;
}

/** One session's daily plan, as `ReplayOptions.sessionPlans` collects it. */
export interface SessionDailyPlan {
  direction: "up" | "down";
  verdict: ScanDecision["outputState"];
  entry: number;
  stop: number;
  tp1: number;
  mtp: number;
}

/**
 * Validate `ReplayOptions.disableExits`: an array of `GANN_EXIT_RULE_NAMES`.
 * Anything else throws, so a misspelt rule cannot leave a cell silently
 * identical to its baseline. Given the cell's `exitRule`, a non-empty list
 * under the bracket throws too: the bracket reads no Gann rule to switch off.
 */
export function resolveDisableExits(names: unknown, exitRule?: ReplayOptions["exitRule"]): ReadonlySet<GannExitRuleName> {
  if (names === undefined || names === null) return new Set();
  if (!Array.isArray(names)) throw new Error(`disableExits must be an array of rule names (${GANN_EXIT_RULE_NAMES.join(", ")})`);
  const unknown = names.filter((n) => !isGannExitRuleName(n));
  if (unknown.length > 0) {
    throw new Error(`Unknown exit rule${unknown.length > 1 ? "s" : ""} in disableExits: ${unknown.map((n) => JSON.stringify(n)).join(", ")} (expected ${GANN_EXIT_RULE_NAMES.join(", ")})`);
  }
  if (names.length > 0 && exitRule === "bracket") {
    throw new Error(`disableExits switches off named exit rules and needs exitRule "gann" or "gann-runner" (got "bracket")`);
  }
  return new Set(names as GannExitRuleName[]);
}

/** Why an intraday-profile trade left (`lib/backtest/replayIntraday.ts`). */
export type IntradayExitReason = "intraday_initial_stop" | "intraday_trailing_stop" | "intraday_trend_change";

/**
 * Why a trade with no stop, target or exit signal left, marked at the last
 * close it reached (2026-10-21; both were one "timeout" before):
 * `held_to_limit` when `maxBarsHeld` was reached inside the data, and
 * `open_at_end` when the data ended first, so the trade was still open and
 * its R is only marked to market. Gann's exits cut losers early, so the open
 * ones are mostly winners: a summary that counts them reads higher than the
 * closed trades do, which is why every report scope also carries a `closed`
 * summary without them. Neither changes a trade: both are `outcome: "timeout"`.
 */
export type TimeoutReason = "held_to_limit" | "open_at_end";

export function isTimeoutReason(reason: string | null | undefined): reason is TimeoutReason {
  return reason === "held_to_limit" || reason === "open_at_end";
}

/** Which timeout a walk from `from` met: the session limit inside `barCount` bars, or the data's end. */
export function timeoutReasonAt(from: number, maxBarsHeld: number, barCount: number): TimeoutReason {
  return from + maxBarsHeld <= barCount ? "held_to_limit" : "open_at_end";
}

/** A trade still open when the data ended: its R is marked to market, not realised. */
export function isOpenAtEnd(trade: Pick<ReplayTrade, "exitReason">): boolean {
  return trade.exitReason === "open_at_end";
}

export interface ReplayTrade {
  symbol: string;
  /**
   * Timestamp of the bar the setup triggered on. Carried so a run can state the
   * window it actually covered, and so a study can split trades chronologically
   * — an out-of-sample check that shuffled trades at random would leak the
   * future into the training half.
   */
  openedAt: string;
  /**
   * The top-ranked bar-sequence pattern on the closed 15-minute bars at the
   * fill, ranked the way the scan shows it. Display/confluence metadata only
   * (it feeds the bare-reversal confirmation); since 2026-09-25 it neither
   * selects nor prices the trade. Null when no pattern was armed.
   */
  pattern: StratPattern["name"] | null;
  /**
   * Which of the scan's two setup kinds armed this trade. A reversion is
   * armed against the macro move. A continuation is armed with it, the way
   * the market scan's continuation pass arms one.
   */
  setupKind: SetupKind;
  /**
   * Which of Gann's buying points priced the entry: a crossing of an old top
   * (or bottom), a double or triple bottom bought at the old level, or a buy at
   * the close over a bottom that held. Undefined only on records built before
   * the field existed.
   */
  entryKind?: GannEntryKind;
  /** For a held entry, which form of the hold priced it (the rally sell apart from the bottoms). */
  holdBasis?: GannHoldBasis;
  direction: "bullish" | "bearish";
  entry: number;
  stop: number;
  /** The first target. NaN (null in JSON) when the intraday profile names none: Gann fixes no target and the stop trails. */
  target: number;
  barsHeld: number;
  /**
   * Stamp of the bar the trade left on (the bar it was marked at, for a
   * timeout). Undefined only on records built before the field existed.
   */
  closedAt?: string;
  outcome: "win" | "loss" | "timeout";
  /** Lots held at the end, under `pyramid: true` (1 when nothing was added). */
  lots?: number;
  /**
   * Set on a reversal (`reverseWhenCaught`): how many trades back the caught
   * one was, 1 for the reversal of an armed setup. Undefined on an armed setup.
   */
  reversal?: number;
  /** Set on a re-entry after a stop (`rebuyAfterStop`). */
  rebuy?: boolean;
  /**
   * Set on a trade the replay opened from another one rather than armed and
   * scored: a reversal (`reverseWhenCaught`) or a re-entry after a stop
   * (`rebuyAfterStop`). Nothing scored it, so it carries no `score`,
   * `outputState` or `criteria`: it counts in the population totals but in no
   * verdict bucket, score band or factor table (`byDerived` reports it).
   */
  derived?: "reversal" | "rebuy";
  /**
   * Why the trade left, under `exitRule: "gann"` or the intraday profile.
   * Under the bracket only a timeout carries one (`TimeoutReason`); a stop or
   * target there leaves it undefined.
   */
  exitReason?: GannStopReason | GannExitReason | IntradayExitReason | "covered" | TimeoutReason;
  /**
   * Reporting only: the old level the plan's entry was priced from, the old
   * top or bottom crossed (`crossing`) or the double or triple bottom bought
   * (`oldLevel`). Null for a `hold` entry and for a derived trade. Undefined
   * on records built before the field existed.
   */
  crossedLevel?: number | null;
  /**
   * Reporting only: the price the last of the position left at (the stop's
   * fill, the signal's open, the cover, the target), or the close it was
   * marked at for a timeout. Under a scale-out it is the last tranche's price,
   * not the blend `rMultiple` is computed from. Undefined on records built
   * before the field existed.
   */
  exitPrice?: number;
  /** Realised result in units of the trade's own risk, after costs. */
  rMultiple: number;
  /** True when one bar covered both stop and target, and the loss was assumed. */
  ambiguous: boolean;
  /**
   * Stop width as a multiple of the execution-timeframe ATR at entry. This is
   * the one measure of "too tight" that is knowable before the trade, which
   * makes it the lever worth tuning — unlike bars-held, which is only known
   * afterwards.
   */
  atrMultiple: number;
  /**
   * The verdict the scanner would have displayed, when daily bars were
   * supplied and there was enough history to compute one. Undefined otherwise
   * — never defaulted, because a missing score and a score of zero mean very
   * different things.
   */
  score?: number;
  outputState?: ScanDecision["outputState"];
  /**
   * Which of the score's criteria passed on this setup, keyed by the stable
   * `key` each breakdown item now carries (`lib/scoring/weights.ts`), falling
   * back to the criterion text for any item built without one.
   *
   * This used to key by the display text verbatim, to stop a mapping table from
   * silently mis-attributing results after a rename. The stable id is the
   * stronger version of that guarantee: a rename now changes neither the key
   * nor the factor's history, where verbatim text split one factor into two
   * half-sized samples. It also merges the two spellings of the pattern
   * criterion ("Reversal"/"Continuation pattern armed"), which were always one
   * criterion asked of two setup kinds.
   *
   * Partial by construction. Some checks are appended only in the situations
   * that trigger them (the trade-plan hold, the bare-2-2 downgrade, the
   * decision-lag hold), so an absent key means "not evaluated on this setup",
   * never "failed". Consumers must not read absence as false — see
   * `attribution.ts`.
   */
  criteria?: Record<string, boolean>;
  /**
   * Gann readings recorded on the trade that the score doesn't count yet
   * (`lib/gann/contextFactors.ts`), in the trade's direction. Measured by the
   * factor table the same way as `criteria`, so each can be promoted on
   * evidence. Absent means not evaluated.
   */
  contextFactors?: Record<string, boolean>;
  /**
   * Whether this symbol read as large-cap at the time of the trade — see
   * `lib/strat/large-cap.ts`. Always computed (unlike `score`, which needs
   * `dailyBars`) since it only needs the symbol and, when available, prior
   * daily bars for the liquidity proxy. Lets a report bucket trades by it
   * the same way it already buckets by verdict or stop width.
   */
  largeCap?: boolean;
  /**
   * Yearly Gann cycles landing on the trade's month in its own direction
   * (`yearCycleConvergence` — major lows for a long, highs for a short), read
   * from months closed before entry. Undefined when no monthly bars were
   * supplied — never defaulted to 0, which would read as "checked, none".
   * Not a scored criterion: this is what lets a run measure whether the
   * market scan's yearly-cycle re-rank picks better trades.
   */
  yearCycleHits?: number;
  /**
   * The selection strength the live lists order by (`selectionStrength`,
   * early leaders first; A-SELECTION-02). The replay has no list to order, so
   * it records the value per trade for the run to split on.
   */
  selectionStrength?: number;
}

export interface ReplayResult {
  trades: ReplayTrade[];
  armed: number;
  triggered: number;
  wins: number;
  losses: number;
  timeouts: number;
  /** Timeouts whose data ended before the session limit (`open_at_end`): still open, marked to market. */
  openAtEnd: number;
  ambiguous: number;
  winRate: number;
  /** Mean result per trade, in R, after costs. */
  expectancyR: number;
  /** Sum of all results, in R. */
  totalR: number;
  /**
   * Triggered entries whose fill landed at or beyond the plan's own stop or
   * target, and were dropped rather than counted. Production refuses these
   * (`fill_outran_bracket`, lib/trade/place-order.ts): an order that fills
   * past its bracket is never opened. Reported so a run says how many there
   * were.
   */
  refusedFills: number;
  /**
   * Triggered entries dropped after they fired because no tradeable plan
   * stood behind them, so no trade was recorded: the production plan was
   * missing (`usePlanLevels`), the stop did not sit on the losing side of the
   * entry, the plan's TP1 lay at or short of the entry the rule measures from,
   * or the round-number hold refused it. Counted beside `refusedFills` so a
   * run's fires add up: `triggered = trades from armed setups + refusedFills
   * + droppedPlans` (2026-10-21; 392 of 1,475 fires vanished this way on the
   * 2026-10-20 run, uncounted).
   */
  droppedPlans: number;
  /** `droppedPlans` by reason. */
  droppedPlanReasons: DroppedPlanReasons;
  /**
   * Session plans retired by a breached stop (owner decision, 2026-09-30;
   * `lib/gann/stopBreach.ts`): the prior session's last close, or an earlier
   * candle of the session, had already traded through the plan's own stop. It
   * is not entered while broken. It stands again if a closed candle closes back
   * through the broken level by Gann's 3-point allowance (a failed break), and
   * otherwise stays out for the rest of the session, when the next session's
   * read of the swing chart replaces it with a new plan. Counted once per plan
   * per session, whether or not it was later reinstated or its entry would have
   * fired.
   */
  retiredPlans: number;
}

/** Why a fired entry was dropped with no trade recorded (`ReplayResult.droppedPlans`). */
export interface DroppedPlanReasons {
  /** `usePlanLevels` and the plan could not be priced. */
  noLevels: number;
  /** The stop was not on the losing side of the entry (no risk). */
  invalidRisk: number;
  /** The plan's TP1 lay at or short of the entry the rule measures from. */
  targetNotBeyondEntry: number;
  /** `roundNumberHold` refused the entry. */
  roundNumberHold: number;
}

export function emptyDroppedPlanReasons(): DroppedPlanReasons {
  return { noLevels: 0, invalidRisk: 0, targetNotBeyondEntry: 0, roundNumberHold: 0 };
}

const EMPTY: Omit<ReplayResult, "trades" | "droppedPlanReasons"> = {
  armed: 0, triggered: 0, refusedFills: 0, droppedPlans: 0, retiredPlans: 0, wins: 0, losses: 0, timeouts: 0, openAtEnd: 0, ambiguous: 0,
  winRate: 0, expectancyR: 0, totalR: 0,
};

/**
 * Roll a bar series up to a coarser timeframe by a key on each bar's stamp.
 * Assumes the input is ordered oldest first, which every provider path is.
 */
export function rollUp(bars: Bar[], key: (bar: Bar) => string): Bar[] {
  const out: Bar[] = [];
  let current: Bar | null = null;
  let currentKey = "";
  for (const b of bars) {
    const k = key(b);
    if (k !== currentKey) {
      if (current) out.push(current);
      current = { ...b };
      currentKey = k;
    } else if (current) {
      current.h = Math.max(current.h, b.h);
      current.l = Math.min(current.l, b.l);
      current.c = b.c;
      current.v += b.v;
    }
  }
  if (current) out.push(current);
  return out;
}


/**
 * The slower-moving half of a scan: macro trends, structural levels and the
 * volatility regime. Everything here is derived from daily bars, so it only
 * changes once a session and is cached per date by the caller.
 *
 * This mirrors lib/scanTicker.ts rather than calling it, because that function
 * fetches live data. The two can drift — if the scan's context assembly
 * changes, this needs the same change, or the replay stops describing the
 * shipped system.
 */
export interface MacroContext {
  /** The 52-week level chart's daily bars, for readings the holds take straight off the chart. */
  dailyChart: Bar[];
  macroTrends: TrendReading[];
  swingChart: SwingChartReading;
  /** How many 3-day swing-chart legs since the weekly chart's last trend change, and Gann's "sections of a campaign" confidence read on that count. Confluence/context only — see lib/gann/swingChart.ts#computeCampaignLeg. */
  campaignLeg: CampaignLegReading;
  ruleOfThree: RuleOfThreeReading;
  ruleOfThreeWeekly: RuleOfThreeReading | null;
  ruleOfThreeMonthly: RuleOfThreeReading | null;
  timePriceSquare: TimePriceSquareReading[];
  volumeClimax: VolumeClimaxReading[];
  boilingPoint: BoilingPointReading[];
  gann: GannLevels;
  nearSupportResistance: boolean;
  /**
   * The nearest in-band level on each side, with its role and test count; the
   * score reads its direction's (`srMatchForSide`), as lib/scanTicker.ts does.
   */
  srMatches: Record<LevelRole, { price: number; timeframe: Timeframe; role: LevelRole; testCount: number } | null>;
  momentumElevated: boolean;
  /**
   * Daily ATR as a percentage of price on the day being traded. The structural
   * proximity criteria are measured in multiples of it, so the replay has to
   * carry it for the same reason the live scan does — see
   * lib/scoring/proximity.ts.
   */
  atrPct?: number;
  /**
   * Every clustered daily/weekly/monthly support and resistance price
   * `srMatch` was matched against — not just the single nearest one. Feeds
   * `computeTradeLevels`'s equities stop/runner anchoring
   * (`computeEquityTradeLevels`, lib/strat/levels.ts), which needs the whole
   * set to search for the nearest one on the trade's own favorable side, not
   * only whichever is closest to price in either direction.
   */
  structuralLevels: number[];
  /** Stage A readings and the B2 campaign ledger, as the live scan's confluence card shows them. */
  disclosedRules: DisclosedRulesContext;
  /** The turn at a dated window (Q19, `lib/gann/timeWindow.ts`), read on the same chart as the live scan, once per direction when needed. */
  windowTurn: (direction: "bullish" | "bearish") => WindowTurn | null;
  /** The facts the nine pillars read, built as lib/scanTicker.ts builds them. */
  pillarFacts: PillarFacts;
}

/**
 * `asOf` is the session being replayed. It must be passed through to every
 * date-relative read (`timeCycles`): left to default, those compare historical
 * pivots against the wall-clock time the backtest runs, not the replayed
 * session — which is how every replay before 2026-09-25 measured `timeCycle`.
 * Defaults to the day after the last bar, i.e. the session `daily` precedes.
 */
export function buildMacroContext(
  daily: Bar[],
  price: number,
  asOf: Date = new Date(new Date(daily[daily.length - 1].t).getTime() + 24 * 3600 * 1000),
  /** Closed monthly bars before `asOf`, when the run has them. They anchor Gann's percentage-of-price levels the way the live scan's monthly history does. */
  priorMonthly: Bar[] = [],
  /** Shares outstanding as of this session and the inception date (D2, D3), when stored. */
  instrument: InstrumentFacts | null = null,
  /**
   * The provider's weekly bars, when the run has them: the closed weeks the
   * live scan's weekly chart reads (2026-10-20, weekly parity). Null (unit
   * fixtures) rolls the weeks up from `daily` instead.
   */
  priorWeekly: Bar[] | null = null,
): MacroContext {
  const windowTurns = new Map<"bullish" | "bearish", WindowTurn | null>();
  // Mirrors lib/scanTicker.ts: the level charts both surfaces read (PLAN.md
  // item 9 step 4), from the completed sessions and closed months held here.
  // The closed weeks are the provider's, as live (2026-10-20); the week in
  // progress is built from the completed sessions on both.
  const charts = levelCharts({ daily, weekly: priorWeekly, monthly: priorMonthly }, etDateKey(asOf));
  const weekly = charts.weekly;
  const monthly = charts.monthly;
  const monthlyTrend = readTrend(monthly, "1Month");
  const weeklyTrend = readTrend(weekly, "1Week");
  const dailyTrend = readTrend(charts.daily, "1Day");
  const swingChart = computeSwingChart(daily);
  const campaignLeg = computeCampaignLeg(daily);
  const ruleOfThree = computeRuleOfThree(daily);

  const fanLines = computeFanLines(charts.daily, price);
  const s9 = recentSquareOf9Levels(charts.daily, price).slice(0, 12);
  const cycles = timeCycles(daily, asOf);
  const angleSlopes = computeAngleSlopes(daily, price);
  const timePriceSquare = computeTimePriceSquare(daily, price);
  // Mirrors lib/scanTicker.ts: completed sessions, and the closed months for A-VOLUME-09.
  const volumeClimax = computeVolumeClimax(daily, undefined, { asOf, monthly: priorMonthly.length > 0 ? priorMonthly : null });
  const boilingPoint = computeBoilingPoint(daily, volumeClimax);
  const retracementLevels = computeRetracementLevels(charts.daily, price);
  const digitalRootConfluences = angleSlopes
    .map((r) => {
      const confluence = priceTimeConfluence(price, r.anchorPrice, r.barsSinceAnchor);
      return confluence && { anchorKind: r.anchorKind, ...confluence };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  // Read before the levels: its campaign ledger supplies the secondary turn.
  const disclosedRules = readDisclosedRules(charts.daily, price, instrument ? { ...instrument, monthly: instrument.monthly ? monthly : instrument.monthly } : instrument, asOf);
  // Mirrors lib/scanTicker.ts: one builder (lib/scan/structuralLevels.ts).
  const structural = buildStructuralLevels({
    trends: { daily: dailyTrend, weekly: weeklyTrend, monthly: monthlyTrend },
    charts,
    campaign: disclosedRules.campaign,
    price,
    asOf,
  });
  const allLevels = structural.all;
  const recentAtr = atr(daily.slice(-20), 14);
  const baselineAtr = atr(daily.slice(-100, -20), 14);
  const atrPct = atrPercentOfPrice(recentAtr, price);

  // Mirrors lib/scanTicker.ts: keep the matched level (and its role at
  // current price) rather than just a boolean, so the score can tell whether
  // it's on the trade's side or not.
  const srBandPct = levelBandPct(price);
  const srByRole = nearestLevelMatchByRole(price, allLevels, srBandPct);
  const withTests = (m: (typeof allLevels)[number] | null) =>
    m && { ...m, role: levelRole(price, m.price), testCount: countLevelTests(daily, m.price, srBandPct) };

  return {
    dailyChart: charts.daily,
    macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
    swingChart,
    campaignLeg,
    ruleOfThree,
    // Mirrors lib/scanTicker.ts: the same weekly and monthly level charts,
    // the provider's closed bars and the bar in progress from completed sessions.
    ruleOfThreeWeekly: weekly.length >= 4 ? computeRuleOfThree(weekly) : null,
    ruleOfThreeMonthly: monthly.length >= 4 ? computeRuleOfThree(monthly) : null,
    timePriceSquare,
    volumeClimax,
    boilingPoint,
    gann: {
      fanLines: fanLines.slice(0, 6).map(({ angle, price: p, distancePct, role }) => ({
        angle, price: Math.round(p * 100) / 100, distancePct, role,
      })),
      squareOf9: s9.slice(0, 6).map(({ degree, price: p, distancePct, role }) => ({
        degree, price: Math.round(p * 100) / 100, distancePct, role,
      })),
      timeCycleActive: cycles.active,
      timeCycleBullishActive: cycles.bullishActive,
      timeCycleBearishActive: cycles.bearishActive,
      timeCycleDates: cycles.dates,
      timeCycleFixedCalendarActive: cycles.fixedCalendarActive,
      timeCycleFixedCalendarDates: cycles.fixedCalendarDates,
      angleSlopes,
      retracementLevels: retracementLevels.slice(0, 7).map(({ fraction, label, price: p, distancePct, role, importance }) => ({
        fraction, label, price: Math.round(p * 100) / 100, distancePct, role, importance,
      })),
      digitalRootConfluences,
    },
    nearSupportResistance: srByRole.support !== null || srByRole.resistance !== null,
    srMatches: { support: withTests(srByRole.support), resistance: withTests(srByRole.resistance) },
    momentumElevated: baselineAtr > 0 && recentAtr / baselineAtr >= 1.2,
    atrPct,
    structuralLevels: allLevels.map((l) => l.price),
    disclosedRules,
    pillarFacts: readPillarFacts({ rules: disclosedRules, daily: charts.daily, monthly, marketDaily: instrument?.marketDaily ?? null, universe: instrument?.universe ?? null, oldLevels: structural.old, price, asOf }),
    windowTurn: (direction) => {
      if (!windowTurns.has(direction)) windowTurns.set(direction, readWindowTurn(charts.daily, direction, instrument?.monthlyYearCount ?? instrument?.monthlyLong ?? charts.monthly));
      return windowTurns.get(direction) ?? null;
    },
  };
}

/**
 * The length of bar `i` in minutes, from its neighbours (the replay runs on
 * 15-minute or 1-hour bars and carries no timeframe here). Used for Gann's day
 * clock at entry (`lib/gann/dayCircle.ts`).
 */
function barMinutesAt(bars: { t: string }[], i: number): number {
  const gaps: number[] = [];
  for (const j of [i - 1, i]) {
    const a = bars[j];
    const b = bars[j + 1];
    if (!a || !b) continue;
    const m = (Date.parse(b.t) - Date.parse(a.t)) / 60_000;
    if (m > 0 && m <= 240) gaps.push(m);
  }
  return gaps.length > 0 ? Math.min(...gaps) : 0;
}

/** One armed trigger for a session, and the setup kind it belongs to. */
interface SessionTrigger {
  setupKind: SetupKind;
  trigger: GannEntryTrigger;
  /** Gann's breakaway reading for this trigger, from prior sessions only (as the live scan reads it). */
  breakaway: BreakawayReading;
  /** The monthly break as a warning, from the same chart (PLAN.md item 6, step 3). */
  monthlyWarning: MonthlyBreakWarning | null;
  /**
   * Leaving a narrow range, the crossing session closed past the line on more
   * than the range's mean volume (A-VOLUME-10), read from completed sessions
   * as `readEntryConfirmationNow` reads it. A buy resting at a level, with
   * nothing to cross, is exempt there and here.
   */
  breakawayVolume: boolean;
  /** When the trigger's level formed: names it across sessions, as the window it is read from moves. */
  pivotAt: string;
}

/** One session's arming state: read once per date from prior sessions only. */
interface SessionArm {
  context: MacroContext;
  triggers: SessionTrigger[];
  largeCap: boolean;
}

export function replay(symbol: string, bars: Bar[], options: ReplayOptions): ReplayResult {
  const {
    targetR,
    costPerShare = DEFAULT_COST_PER_SHARE_USD,
    maxBarsHeld: maxBarsHeldOption,
    warmupBars = 40,
    dailyBars,
    monthlyBars,
    weeklyBars,
    weights,
    useProductionStop = false,
    usePlanLevels = false,
    tradeStyle = "swing",
    roundNumberHold = false,
    entryRule = "reaction",
    exitRule = "bracket",
    reverseWhenCaught = true,
    rebuyAfterStop = true,
    reclaimPoints = RECLAIM_POINTS,
    pyramid = false,
    disableExits,
    instrument,
    marketDailyBars,
    marketMonthlyBars,
    longMonthlyBars,
    yearCountMonthlyBars,
    universeStrength,
    sessionPlans,
    plansOnly = false,
  } = options;

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  // Ten sessions held on every asset (review finding F-06): ten equity
  // sessions are 260 candles, but 260 candles of a coin that trades all day
  // and night are under three days.
  const maxBarsHeld = maxBarsHeldOption ?? (assetClass === "crypto" ? CRYPTO_BARS_PER_SESSION : BARS_PER_SESSION) * 10;
  const disabled = resolveDisableExits(disableExits, exitRule);

  const trades: ReplayTrade[] = [];
  // Entry-confirmation evidence per armed pivot, used only when
  // `entryRule === "confirmed"`. Each pivot records the date it first armed
  // on, so no bar from before that session can count toward its confirmation.
  const confirmation = new Map<string, { since: string; evidence: EntryConfirmationEvidence }>();
  // Gann's crossing, per pivot, when `entryRule === "reaction"`: whether a
  // close has crossed the level by 3 points since the pivot first armed, the
  // time of that close (empty when nothing had to be crossed), and whether a
  // closed candle after it has traded into the buying zone (rule 9).
  const crossing = new Map<string, { since: string; crossed: boolean; crossedAt: string; reacted: boolean }>();
  // Counted once per session a pivot is armed on, and once per fill.
  const armedKeys = new Set<string>();
  let triggered = 0;
  let refusedFills = 0;
  const dropped = emptyDroppedPlanReasons();
  // A swing top/bottom is crossed once per setup kind. Pivot indices are
  // stable across sessions because each session's daily history is a prefix
  // of the next.
  const consumedPivots = new Set<string>();
  // A crossed level bought once is not bought again under another reading of
  // it (step 3 review R2): a previous year's top that is also a swing top is
  // dated by the daily chart before its crossing and by the monthly chart
  // after. Matched by price (`sameGannLevel`), unless its top formed after the
  // fill, which is a newer top the live scan would offer too.
  const boughtLevels: Array<{ prefix: string; level: number; at: string }> = [];
  // A breached stop retires the plan (owner decision, 2026-09-30;
  // lib/gann/stopBreach.ts). The plan's stop is read once per plan per session
  // (`sessionPlanStops`, keyed by date and pivot). Once price has traded through
  // it the plan is in `brokenPlans` and is not entered, until a closed candle
  // closes back through the broken level by Gann's 3-point allowance: a failed
  // break, which stands the plan again. Otherwise it stays out for the rest of
  // the session, and the next session's read of the swing chart is what replaces
  // it with a new plan. `retiredSessionPlans` counts each plan once that was ever
  // retired, for the report.
  const sessionPlanStops = new Map<string, number | null>();
  // The same plan's entry and first target, for the failed-top check below.
  const sessionPlanPaths = new Map<string, { entry: number; takeProfit1: number } | null>();
  const brokenPlans = new Set<string>();
  const retiredSessionPlans = new Set<string>();
  // Macro context and the daily triggers only move once a session, so they
  // are built per date, not per bar.
  const armByDate = new Map<string, SessionArm | null>();

  const sessionArm = (date: string, price: number): SessionArm | null => {
    const cached = armByDate.get(date);
    if (cached !== undefined) return cached;
    const priorSessions = dailyBars.filter((b) => b.t.slice(0, 10) < date);
    let arm: SessionArm | null = null;
    if (priorSessions.length >= MIN_DAILY_BARS_FOR_SCORE) {
      const priorMonthly = monthlyBars ? monthlyBars.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)) : [];
      const facts: InstrumentFacts | null =
        instrument || marketDailyBars || universeStrength
          ? {
              sharesOutstanding: instrument ? splitAdjustedSharesAsOf(instrument.sharesHistory, date) : null,
              inception: instrument?.inception ?? null,
              marketDaily: marketDailyBars ?? null,
              monthly: monthlyBars ? priorMonthly : null,
              monthlyLong: longMonthlyBars
                ? longMonthlyWindow(longMonthlyBars.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)), new Date(`${date}T12:00:00Z`))
                : null,
              monthlyYearCount: yearCountMonthlyBars
                ? yearCountMonthlyWindow(yearCountMonthlyBars.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)), new Date(`${date}T12:00:00Z`))
                : null,
              marketMonthly: marketMonthlyBars ? marketMonthlyBars.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)) : null,
              // The rank reads only the months closed before this session's (`readUniverseRank`).
              universe: universeStrength && assetClass === "us_equity" ? { symbol, strength: universeStrength } : null,
            }
          : null;
      // Only weeks that began before this session's week; `levelCharts` builds
      // the week in progress from the completed sessions, so no later bar is read.
      const thisWeek = mondayOf(date);
      const priorWeekly = weeklyBars ? weeklyBars.filter((b) => mondayOf(b.t.slice(0, 10)) < thisWeek) : null;
      const context = buildMacroContext(priorSessions, price, new Date(`${date}T12:00:00Z`), priorMonthly, facts, priorWeekly);
      const triggers: SessionTrigger[] = [];
      // The reaction rule is production's, and production prices from the
      // nearer of the crossing and the old level (PLAN.md item 5, step 2). The
      // older rules measure the crossing alone, as they always have.
      //
      // The buying point is read from the live scan's window, the 52 weeks of
      // sessions before the day (`entryChartBars`), not from all the history
      // the replay holds: a level held only on older history is one the scan
      // never sees.
      // The monthly chart's older levels come with it, from months closed
      // before the session (item 5 step 3).
      const chart = entryChart(dailyBars, monthlyBars ?? [], date);
      const entryDaily = chart.bars;
      const reactionEntryOf = gannEntryOf(entryDaily, chart.older, context.macroTrends);
      const entryOf = (d: "bullish" | "bearish") =>
        entryRule === "reaction" ? reactionEntryOf(d) : computeGannEntryTrigger(entryDaily, d);
      const monthlyWarning = readMonthlyBreakWarning(entryDaily);
      const sessionTrigger = (setupKind: SetupKind, trigger: GannEntryTrigger): SessionTrigger => ({
        setupKind,
        trigger,
        breakaway: readBreakaway(entryDaily, trigger),
        monthlyWarning,
        breakawayVolume:
          restsWithoutCrossing(trigger.kind) ||
          breakawayVolumeMet(entryDaily, trigger.direction, gannBreakLine(trigger.reactionEntry, trigger.reactionStop)),
        pivotAt: trigger.formedAt,
      });
      // The one buying point the live scan shows for the session
      // (`chooseSessionEntry`): the one with the trend when it armed, else the
      // reversion. Before 2026-10-21 the replay traded every entry that armed
      // (`armSessionEntries`), so when both sides armed it also traded the
      // reversion against the trend, which the live scan sets aside: "never
      // buck the trend" (never-failing rule 5, Commodities pp. 43-45; review of
      // #395, finding 4).
      if (entryDaily.length > 0) {
        const chosen = chooseSessionEntry(context.macroTrends, entryOf, entryDaily[entryDaily.length - 1].c);
        if (chosen) triggers.push(sessionTrigger(chosen.setupKind, chosen.trigger));
      }
      arm = {
        context,
        triggers,
        largeCap: isLargeCapStock(symbol, assetClass, readLiquidity(priorSessions)),
      };
    }
    armByDate.set(date, arm);
    return arm;
  };

  // One execution bar per session (a 1Day replay). The reaction and confirmed
  // rules act on a closed bar and fill at the next bar's open, so the plan a
  // closed bar is read against is the one its own session armed, priced from
  // the sessions before it. On intraday bars that is the live candle's session
  // too. On daily bars it is the session before the live candle's: reading the
  // live session's plan instead tested the closed bar against a plan priced
  // from that same bar, so a crossing or an old level it traded into was
  // already spent and offered no plan, and a held bottom's entry, that bar's
  // own close, was always traded into (2026-10-21, daily entry kinds). A stop
  // entry fills on the live candle, so it keeps the live session's plan.
  const sessionBars = bars.length > 1 && bars.every((b, j) => j === 0 || b.t.slice(0, 10) !== bars[j - 1].t.slice(0, 10));
  const closedBarRule = entryRule === "reaction" || entryRule === "confirmed";

  for (let i = warmupBars; i < bars.length - 1; i++) {
    const history = bars.slice(0, i);
    const live = bars[i]; // the candle a resting order may fill on
    const closedSession = sessionBars && closedBarRule;
    const date = closedSession ? history[history.length - 1].t.slice(0, 10) : live.t.slice(0, 10);
    const lastClose = history[history.length - 1].c;
    // The price the session's scan read: the last close before the session.
    const armPrice = closedSession && history.length > 1 ? history[history.length - 2].c : lastClose;

    const arm = sessionArm(date, armPrice);
    if (sessionPlans && !sessionPlans.has(date)) sessionPlans.set(date, arm ? sessionDailyPlan(arm, history, armPrice, assetClass, weights) : null);
    if (plansOnly || !arm) continue;

    for (const { setupKind, trigger, breakaway, monthlyWarning, breakawayVolume, pivotAt } of arm.triggers) {
      const levelPrefix = `${setupKind}:${trigger.kind}:${trigger.direction}:${trigger.pivot.kind}`;
      // A crossing held for its reaction is one crossing of its level: a
      // level crossed again after a break is a new buy, as it is live (step 4
      // review S1), so the crossing's date is part of its key.
      const crossedOn = trigger.kind === "crossing" && trigger.held && trigger.crossedAt ? trigger.crossedAt.slice(0, 10) : null;
      const pivotKey = crossedOn ? `${levelPrefix}:${pivotAt}:${crossedOn}` : `${levelPrefix}:${pivotAt}`;
      if (consumedPivots.has(pivotKey)) continue;
      // One level read two ways (a swing top that is also an older top) is
      // still one level: bought on this crossing, or since it formed when not
      // yet crossed, it is not bought again under the other reading (R2).
      if (
        trigger.kind === "crossing" &&
        boughtLevels.some(
          (b) => b.prefix === levelPrefix && sameGannLevel(b.level, trigger.level) && (crossedOn ? crossedOn <= b.at.slice(0, 10) : trigger.formedAt <= b.at),
        )
      ) {
        continue;
      }
      const planKey = `${date}|${pivotKey}`;
      armedKeys.add(planKey);

      // The breach test the live scan applies (`readStopBreach`), applied by
      // path: the scan that arms the session reads the last close, and every
      // closed candle of the session after that is read in turn. A candle that
      // traded through the stop breaks the plan, unless it, or a later candle,
      // closed back through the level by the allowance (a poke that reversed by
      // the close, or a failed break). The candle the entry fires on is not
      // read: what it did first cannot be told, so its stop is left to the
      // bracket walk as before.
      let planStop = sessionPlanStops.get(planKey);
      const firstRead = planStop === undefined;
      if (planStop === undefined) {
        const plan = priceTradeLevels({
          context: arm.context,
          gannTrigger: trigger,
          history,
          executionAtr: atr(history.slice(-30), 14),
          assetClass,
          largeCap: arm.largeCap,
        });
        planStop = plan?.stopLoss ?? null;
        sessionPlanStops.set(planKey, planStop);
        sessionPlanPaths.set(planKey, plan ? { entry: plan.entry, takeProfit1: plan.takeProfit1 } : null);
        // On daily bars the scan's last close is the session before; the
        // session's one closed bar is read by the bar test below.
        if (!closedSession && planStop !== null && isStopBreached(trigger.direction, planStop, lastClose)) {
          brokenPlans.add(planKey);
          retiredSessionPlans.add(planKey);
        }
      }
      if ((!firstRead || closedSession) && planStop !== null) {
        const closed = history[history.length - 1];
        if (closed.t.slice(0, 10) === date) {
          if (isStopBreachedByBar(trigger.direction, planStop, closed)) {
            brokenPlans.add(planKey);
            retiredSessionPlans.add(planKey);
          }
          if (brokenPlans.has(planKey) && isReclaimedByClose(trigger.direction, planStop, closed, reclaimPoints)) {
            brokenPlans.delete(planKey);
          }
        }
      }
      if (brokenPlans.has(planKey)) {
        // Not entered while it is broken; a confirmation in progress starts
        // over rather than carrying across the break.
        confirmation.delete(pivotKey);
        continue;
      }
      // A-VOLUME-03: no long is entered while a distribution breakdown stands,
      // as production refuses the placement (`entryConfirmationRefusal`).
      if (trigger.direction === "bullish" && arm.context.disclosedRules.distributionStanding) continue;
      // A-LEVELS-04 (fork FL3 a): nor a long with a failed double top between
      // its entry and TP1 (a short with a failed bottom), as production refuses it too.
      const path = sessionPlanPaths.get(planKey);
      if (failedTestInPath(arm.context.disclosedRules.multipleTops, trigger.direction, path?.entry, path?.takeProfit1)) continue;

      const long = trigger.direction === "bullish";
      const dir = long ? 1 : -1;
      let fired: boolean;
      if (entryRule === "reaction") {
        // A held trigger was already crossed on the completed daily chart
        // (PLAN.md item 5), the same reading the live scan prices from.
        const state = crossing.get(pivotKey) ?? { since: date, crossed: false, crossedAt: "", reacted: false };
        // An old-level buy is at the level, and a held bottom's buy at the
        // last close, with nothing to cross.
        if (trigger.held || restsWithoutCrossing(trigger.kind)) state.crossed = true;
        const closed = history[history.length - 1];
        const inSession = closed.t.slice(0, 10) >= state.since;
        if (state.crossed && inSession && closed.t > state.crossedAt) {
          // After the crossing close: a close through the stop calls the
          // entry off, as `confirmationFromBars` reads it; a candle into the
          // zone makes it a market order.
          if (long ? closed.c <= trigger.reactionStop : closed.c >= trigger.reactionStop) {
            consumedPivots.add(pivotKey);
            crossing.delete(pivotKey);
            continue;
          }
          if (tradedIntoBuyZone(closed, trigger.direction, trigger.reactionEntry)) state.reacted = true;
        } else if (!state.crossed && inSession && (long ? closed.c >= trigger.triggerPrice : closed.c <= trigger.triggerPrice)) {
          state.crossed = true;
          state.crossedAt = closed.t;
        }
        crossing.set(pivotKey, state);
        fired = state.crossed && state.reacted && breakawayVolume;
      } else if (entryRule === "confirmed") {
        // Advance the confirmation state machine on the last closed bar, if
        // it belongs to a session this pivot was armed on. Once the sequence
        // completes, the entry is this candle's open.
        const state = confirmation.get(pivotKey) ?? { since: date, evidence: freshEntryConfirmation() };
        const closed = history[history.length - 1];
        if (closed.t.slice(0, 10) >= state.since) {
          state.evidence = advanceEntryConfirmation(
            state.evidence,
            { direction: trigger.direction, entryTrigger: trigger.triggerPrice },
            closed,
          );
        }
        confirmation.set(pivotKey, state);
        // Read without a stop, as `readEntryConfirmationNow` reads an entry
        // with none, so the breakaway volume rule (which reads the line from
        // the entry and its stop) is not applied here either.
        fired = entryReady(state.evidence);
      } else {
        // The trigger is a stop order: it fills only if this candle reaches it.
        fired = long ? live.h >= trigger.triggerPrice : live.l <= trigger.triggerPrice;
      }
      if (!fired) continue;

      const executionAtr = atr(history.slice(-30), 14);
      const pattern =
        rankArmedPatterns({
          closedExecutionBars: history,
          currentPrice: lastClose,
          executionAtr,
          preferredDirection: trigger.direction,
          setupKind,
        })[0] ?? null;

      consumedPivots.add(pivotKey);
      if (trigger.kind === "crossing") boughtLevels.push({ prefix: levelPrefix, level: trigger.level, at: live.t });
      triggered++;

      // A stop entry fills at the trigger, or at the open when a candle opens
      // beyond it. A confirmed entry is a market order after the hold, and a
      // reaction entry a market order after a closed candle into the zone
      // (never-failing rule 9), both filled at this candle's open.
      const entry =
        entryRule === "reaction" || entryRule === "confirmed"
          ? live.o
          : long
            ? Math.max(trigger.triggerPrice, live.o)
            : Math.min(trigger.triggerPrice, live.o);
      const { largeCap } = arm;

      // The harness's original stop is the raw structural stop, untouched by
      // the leeway or large-cap widening `computeTradeLevels` applies for the
      // live scan and Guided Mode. `useProductionStop` swaps it for the widened
      // one. See the option's own comment for why this distinction exists.
      // The plan's bracket is fixed when the plan is priced, from the trigger,
      // and every production path attaches it unchanged: the ticket's
      // advised entry, Guided Mode, and automation's
      // `deriveOrderInputFromPlan`, which sizes from the trigger-to-stop risk
      // and attaches the plan's stop and TP1. So stop, risk and target are
      // fixed from the trigger here too, and R is measured on that plan risk.
      // A fill that lands away from the trigger (a gap past a resting stop,
      // or a confirmed entry's market order) changes the P&L in price terms,
      // not the bracket.
      //
      // The harness's original stop is the raw structural stop, untouched by
      // the leeway or large-cap cap `computeTradeLevels` applies for the live
      // scan and Guided Mode. `useProductionStop` swaps in the capped one,
      // priced against the trigger as the plan prices it.
      const scored = scoreSetup({
        context: arm.context,
        pattern,
        gannTrigger: trigger,
        history,
        executionAtr,
        assetClass,
        largeCap,
        setupKind,
        breakaway,
        monthlyWarning,
        weights,
      });
      const decision = scored.decision;

      if (
        roundNumberHold &&
        roundNumberEntryBlocked({ entry: entryRule === "reaction" ? trigger.reactionEntry : trigger.triggerPrice, direction: trigger.direction, crossedLevel: trigger.pivot.price }).blocked
      ) {
        dropped.roundNumberHold++;
        continue;
      }

      // The production plan (usePlanLevels): its own stop and TP1.
      if (usePlanLevels && !scored.levels) {
        dropped.noLevels++;
        continue;
      }
      const planLevels = usePlanLevels ? scored.levels : null;
      const planned = entryRule === "reaction" ? trigger.reactionEntry : trigger.triggerPrice;
      const stop = entryRule === "reaction"
        ? trigger.reactionStop
        : planLevels
        ? planLevels.stopLoss
        : useProductionStop && executionAtr > 0
          ? computeStopWithLeeway({
              side: long ? "long" : "short",
              entry: trigger.triggerPrice,
              structuralStop: trigger.stopPrice,
              atr15: executionAtr,
              largeCap,
            })
          : trigger.stopPrice;
      const risk = Math.abs(planned - stop);
      if (!(risk > 0) || (long ? stop >= planned : stop <= planned)) {
        dropped.invalidRisk++;
        continue;
      }
      const target = planLevels ? planLevels.takeProfit1 : planned + dir * targetR * risk;
      // Under `entryRule: "confirmed"` (and "stop") `planned` is the crossing
      // price, 2 points past the reaction entry the plan's TP1 was priced from,
      // so a TP1 inside those 2 points lands here. Under "reaction" both are
      // the reaction entry.
      if (planLevels && (long ? target <= planned : target >= planned)) {
        dropped.targetNotBeyondEntry++;
        continue;
      }

      // Production refuses a fill at or beyond its own stop or target
      // (`fill_outran_bracket`). The setup is spent either way.
      const outran = long ? entry <= stop || entry >= target : entry >= stop || entry <= target;
      if (outran) {
        refusedFills++;
        continue;
      }



      let outcome: ReplayTrade["outcome"] = "timeout";
      let barsHeld = 0;
      let ambiguous = false;
      // Reporting only: the old level this plan was priced from, when its kind has one.
      const planLevel = trigger.kind === "hold" ? null : trigger.level;

      if ((exitRule === "gann" || exitRule === "gann-runner") && !outran) {
        const walked = walkGannExit({
          bars, from: i, maxBarsHeld, long, entry, stop, dailyBars: dailyBars ?? [],
          // A double or triple bottom, or a bottom that held, crosses nothing:
          // its exit is the stop 3 points under the low, as the live exit
          // reads it (`entryCrossedLevel`).
          crossedLevel: restsWithoutCrossing(trigger.kind) ? null : trigger.pivot.price,
          scaleOut: exitRule === "gann-runner" ? { price: target, fraction: RUNNER_SCALE_OUT } : undefined,
          pyramid,
          isStock: assetClass === "us_equity",
          sharesOn: instrument ? (date) => splitAdjustedSharesAsOf(instrument.sharesHistory, date) : undefined,
          disabled,
          style: tradeStyle,
        });
        trades.push({
          symbol, openedAt: live.t, pattern: pattern?.name ?? null, setupKind, entryKind: trigger.kind, holdBasis: trigger.holdBasis, direction: trigger.direction,
          entry, stop, target,
          atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
          score: decision.score,
          outputState: decision.outputState,
          criteria: criteriaOf(decision),
          contextFactors: contextFactorsFor(arm.context.disclosedRules, trigger.direction, entry, path?.takeProfit1, {
            time: live.t,
            barMinutes: barMinutesAt(bars, i),
          }),
          largeCap,
          yearCycleHits: monthlyBars ? yearCycleHitsAt(monthlyBars, live.t, trigger.direction) : undefined,
          selectionStrength: selectionStrength(trigger.direction, arm.context.disclosedRules.leadership, arm.context.disclosedRules.weakStock, arm.context.pillarFacts.universeRank),
          barsHeld: walked.barsHeld,
          closedAt: bars[i + walked.barsHeld - 1].t,
          // A win is a trade that made money after costs, on the same net basis
          // as its R (review finding F-07).
          outcome: isTimeoutReason(walked.reason) ? "timeout" : dir * (walked.exit - entry) - costPerShare > 0 ? "win" : "loss",
          exitReason: walked.reason,
          crossedLevel: planLevel,
          exitPrice: walked.finalExit,
          ...(pyramid ? { lots: walked.lots } : {}),
          rMultiple: (dir * (walked.exit - entry) - costPerShare) / risk,
          ambiguous: false,
        });
        const caughtAt = i + walked.barsHeld - 1;
        const sharesOn = instrument ? (date: string) => splitAdjustedSharesAsOf(instrument.sharesHistory, date) : undefined;
        const rebuy = rebuyAfterStop ? rebuyPlanAt({ bars, dailyBars: dailyBars ?? [], caughtAt, side: long ? "long" : "short", cause: walked.reason, extreme: walked.best ?? entry, entryPrice: entry }) : null;
        if (reverseWhenCaught) {
          for (const r of walkReversals({
            bars, dailyBars: dailyBars ?? [], caughtAt, side: long ? "long" : "short",
            cause: walked.reason, brokenLevel: walked.finalExit, extreme: walked.best ?? entry, maxBarsHeld,
            costPerShare, runner: exitRule === "gann-runner", sharesOn, coverAt: rebuy?.entry, disabled, style: tradeStyle,
          })) {
            // Not scored: no verdict, score or criteria is inherited (see `derived`).
            trades.push({
              symbol, pattern: null, setupKind, entryKind: trigger.kind, holdBasis: trigger.holdBasis,
              largeCap, ambiguous: false, crossedLevel: null, derived: "reversal", ...r,
            });
          }
        }
        if (rebuy) {
          const r = walkRebuy({ bars, dailyBars: dailyBars ?? [], caughtAt, plan: rebuy, maxBarsHeld, costPerShare, runner: exitRule === "gann-runner", sharesOn, disabled, style: tradeStyle });
          if (r) {
            trades.push({
              symbol, pattern: null, setupKind, entryKind: trigger.kind, holdBasis: trigger.holdBasis,
              largeCap, ambiguous: false, crossedLevel: null, derived: "rebuy", ...r,
            });
          }
        }
        continue;
      }

      for (let j = i; j < Math.min(bars.length, i + maxBarsHeld); j++) {
        const b = bars[j];
        const hitStop = long ? b.l <= stop : b.h >= stop;
        const hitTarget = long ? b.h >= target : b.l <= target;
        if (!hitStop && !hitTarget) continue;
        barsHeld = j - i + 1;
        ambiguous = hitStop && hitTarget;
        // Both in one bar: no way to order them, so assume the loss.
        outcome = hitStop ? "loss" : "win";
        break;
      }

      const base = {
        symbol, openedAt: live.t, pattern: pattern?.name ?? null, setupKind, entryKind: trigger.kind, holdBasis: trigger.holdBasis, direction: trigger.direction,
        entry, stop, target,
        atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
        score: decision.score,
        outputState: decision.outputState,
        criteria: criteriaOf(decision),
        contextFactors: contextFactorsFor(arm.context.disclosedRules, trigger.direction, entry, path?.takeProfit1, {
            time: live.t,
            barMinutes: barMinutesAt(bars, i),
          }),
        largeCap,
        yearCycleHits: monthlyBars ? yearCycleHitsAt(monthlyBars, live.t, trigger.direction) : undefined,
        selectionStrength: selectionStrength(trigger.direction, arm.context.disclosedRules.leadership, arm.context.disclosedRules.weakStock, arm.context.pillarFacts.universeRank),
        crossedLevel: planLevel,
      };

      if (outcome === "timeout") {
        // Marked out at the last close rather than silently dropped.
        barsHeld = Math.min(maxBarsHeld, bars.length - i);
        const exitBar = bars[Math.min(bars.length - 1, i + barsHeld - 1)];
        const exit = exitBar.c;
        trades.push({
          ...base, barsHeld, closedAt: exitBar.t, outcome,
          exitReason: timeoutReasonAt(i, maxBarsHeld, bars.length),
          exitPrice: exit,
          rMultiple: (dir * (exit - entry) - costPerShare) / risk,
          ambiguous: false,
        });
        continue;
      }

      // Gross P&L is the actual price distance from the fill to the exit.
      const exitPrice = outcome === "win" ? target : stopFill(long, stop, bars[i + barsHeld - 1].o);
      const gross = dir * (exitPrice - entry);
      trades.push({
        ...base, barsHeld, closedAt: bars[i + barsHeld - 1].t, outcome, exitPrice,
        rMultiple: (gross - costPerShare) / risk,
        ambiguous,
      });
    }
  }

  return summarise(trades, armedKeys.size, triggered, refusedFills, retiredSessionPlans.size, dropped);
}

/**
 * Split a run by setup kind. Continuation results are best read inside the
 * Execute bucket, since that's the only score the market scan publishes a
 * continuation at.
 */
export function bySetupKind(result: ReplayResult): { reversion: ReplayResult; continuation: ReplayResult } {
  const armed = result.trades.filter((t) => !t.derived);
  return {
    reversion: summarise(armed.filter((t) => t.setupKind === "reversion")),
    continuation: summarise(armed.filter((t) => t.setupKind === "continuation")),
  };
}

/**
 * Split a run by the kind of buying point that priced each entry, so the
 * crossing, the double bottom and the held bottom can each be read on their own.
 * Reversals and re-entries carry their parent's kind but were priced by
 * neither, so these splits (and `bySetupKind`'s) read the armed trades only;
 * `byDerived` reports the rest.
 */
export function byEntryKind(result: ReplayResult): Record<GannEntryKind, ReplayResult> {
  const of = (kind: GannEntryKind) => summarise(result.trades.filter((t) => !t.derived && (t.entryKind ?? "crossing") === kind));
  return { crossing: of("crossing"), oldLevel: of("oldLevel"), hold: of("hold") };
}

/** The held entries split by the form of the hold that priced them. */
export function byHoldBasis(result: ReplayResult): Record<GannHoldBasis, ReplayResult> {
  const of = (basis: GannHoldBasis) => summarise(result.trades.filter((t) => !t.derived && t.entryKind === "hold" && t.holdBasis === basis));
  return { weeks: of("weeks"), days: of("days"), record: of("record"), rally: of("rally"), narrowWeek: of("narrowWeek") };
}

/**
 * Flatten a decision's breakdown into a pass map. Returns undefined for an
 * unscored setup so the trade carries no criteria at all, rather than an empty
 * object that would read as "every criterion failed".
 */
function criteriaOf(decision: ScanDecision | undefined): Record<string, boolean> | undefined {
  if (!decision) return undefined;
  const out: Record<string, boolean> = {};
  for (const item of decision.breakdown) out[item.key ?? item.criterion] = item.passed;
  return out;
}

export function summarise(
  trades: ReplayTrade[],
  armed = 0,
  triggered = 0,
  refusedFills = 0,
  retiredPlans = 0,
  droppedPlanReasons: DroppedPlanReasons = emptyDroppedPlanReasons(),
): ReplayResult {
  const droppedPlans = Object.values(droppedPlanReasons).reduce((s, n) => s + n, 0);
  if (trades.length === 0) return { trades, ...EMPTY, armed, triggered, refusedFills, droppedPlans, droppedPlanReasons, retiredPlans };
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  const timeouts = trades.filter((t) => t.outcome === "timeout").length;
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  return {
    trades,
    armed,
    triggered,
    refusedFills,
    droppedPlans,
    droppedPlanReasons,
    retiredPlans,
    wins,
    losses,
    timeouts,
    openAtEnd: trades.filter(isOpenAtEnd).length,
    ambiguous: trades.filter((t) => t.ambiguous).length,
    // Timeouts are neither wins nor losses, but they are still trades taken —
    // excluding them from the denominator would flatter the win rate.
    winRate: wins / trades.length,
    expectancyR: totalR / trades.length,
    totalR,
  };
}

/** Merge per-symbol runs into one portfolio-level view. */
export function combine(results: ReplayResult[]): ReplayResult {
  const trades = results.flatMap((r) => r.trades);
  const armed = results.reduce((s, r) => s + r.armed, 0);
  const triggered = results.reduce((s, r) => s + r.triggered, 0);
  const refusedFills = results.reduce((s, r) => s + (r.refusedFills ?? 0), 0);
  const retiredPlans = results.reduce((s, r) => s + (r.retiredPlans ?? 0), 0);
  const dropped = emptyDroppedPlanReasons();
  for (const r of results) {
    for (const k of Object.keys(dropped) as (keyof DroppedPlanReasons)[]) dropped[k] += r.droppedPlanReasons?.[k] ?? 0;
  }
  return summarise(trades, armed, triggered, refusedFills, retiredPlans, dropped);
}

/** How many reversals deep the replay follows a chain of caught trades. An engineering bound, not Gann's. */
export const MAX_REVERSALS = 3;

export type ReversalTrade = Pick<
  ReplayTrade,
  "openedAt" | "closedAt" | "direction" | "entry" | "stop" | "target" | "atrMultiple" | "barsHeld" | "outcome" | "exitReason" | "exitPrice" | "rMultiple" | "reversal" | "rebuy"
> & { contextFactors: Record<string, boolean> };

/** The re-entry a stopped trade rests (`rebuyAfterStop`), read on the completed sessions before the stop. */
export function rebuyPlanAt(input: {
  bars: Bar[];
  dailyBars: Bar[];
  caughtAt: number;
  side: "long" | "short";
  cause: ReversalCause | "covered" | TimeoutReason;
  extreme: number;
  entryPrice: number;
}): GannRebuy | null {
  if (!rebuysOn(input.cause)) return null;
  const date = input.bars[input.caughtAt]?.t.slice(0, 10);
  if (!date) return null;
  const prior = input.dailyBars.filter((d) => d.t.slice(0, 10) < date);
  if (prior.length < 10) return null;
  return gannRebuy({ side: input.side, extreme: input.extreme, trend: readGannTrend(prior).direction, entryPrice: input.entryPrice });
}

/**
 * Walk one re-entry after a stop. It fills on the first candle after the stop
 * that trades back to the resting level, at that level or the open if the
 * candle opened through it, within `maxBarsHeld` candles, and is cancelled by a
 * new extreme past the stopped trade's best price before the reaction comes. A
 * fill at or beyond its own stop is refused. Walked on the same exit rules.
 */
export function walkRebuy(input: {
  bars: Bar[];
  dailyBars: Bar[];
  caughtAt: number;
  plan: GannRebuy;
  maxBarsHeld: number;
  costPerShare: number;
  runner?: boolean;
  sharesOn?: (date: string) => number | null;
  /** `ReplayOptions.disableExits`, resolved. */
  disabled?: ReadonlySet<GannExitRuleName>;
  /** The trade style, carried to the derived trade (`walkGannExit`). */
  style?: TradeStyle;
}): ReversalTrade | null {
  const { bars, plan } = input;
  const long = plan.side === "long";
  const dir = long ? 1 : -1;
  const end = Math.min(bars.length, input.caughtAt + 1 + input.maxBarsHeld);
  for (let k = input.caughtAt + 1; k < end; k++) {
    const b = bars[k];
    if (long ? b.h > plan.extreme : b.l < plan.extreme) return null;
    if (!(long ? b.l <= plan.entry : b.h >= plan.entry)) continue;
    const entry = long ? Math.min(b.o, plan.entry) : Math.max(b.o, plan.entry);
    if (long ? entry <= plan.stop : entry >= plan.stop) return null;
    const risk = Math.abs(entry - plan.stop);
    const target = entry + dir * risk;
    const walked = walkGannExit({
      bars, from: k, maxBarsHeld: input.maxBarsHeld, long, entry, stop: plan.stop, dailyBars: input.dailyBars,
      crossedLevel: null,
      scaleOut: input.runner ? { price: target, fraction: RUNNER_SCALE_OUT } : undefined,
      sharesOn: input.sharesOn,
      disabled: input.disabled,
      style: input.style,
    });
    const executionAtr = atr(bars.slice(Math.max(0, k - 30), k), 14);
    return {
      openedAt: b.t,
      direction: long ? "bullish" : "bearish",
      entry, stop: plan.stop, target,
      atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
      barsHeld: walked.barsHeld,
      closedAt: bars[k + walked.barsHeld - 1].t,
      outcome: isTimeoutReason(walked.reason) ? "timeout" : dir * (walked.exit - entry) - input.costPerShare > 0 ? "win" : "loss",
      exitReason: walked.reason,
      exitPrice: walked.finalExit,
      rMultiple: (dir * (walked.exit - entry) - input.costPerShare) / risk,
      rebuy: true,
      contextFactors: {},
    };
  }
  return null;
}

/**
 * The reversals that follow one caught trade (`reverseWhenCaught`). The plan
 * is priced by `gannReversal` from the level that broke and the old trade's
 * best price; it confirms on the closed candles after the exit, within the
 * same session, through the same state machine placement uses for a reversal
 * plan (no stop passed: `isPivotSignal`), and fills at the open of the candle
 * after it confirms. A fill at or beyond its own stop is refused, as
 * production refuses it.
 */
export function walkReversals(input: {
  bars: Bar[];
  dailyBars: Bar[];
  /** Index of the candle the caught trade left on. */
  caughtAt: number;
  side: "long" | "short";
  cause: ReversalCause | "covered" | TimeoutReason;
  brokenLevel: number;
  extreme: number;
  maxBarsHeld: number;
  costPerShare: number;
  /** `"gann-runner"`: 60% leaves one risk out, the plan's TP1. */
  runner?: boolean;
  sharesOn?: (date: string) => number | null;
  /** A re-entry rests here (`rebuyAfterStop`): the first reversal is covered when price trades to it. */
  coverAt?: number;
  /** `ReplayOptions.disableExits`, resolved. */
  disabled?: ReadonlySet<GannExitRuleName>;
  /** The trade style, carried to the derived trade (`walkGannExit`). */
  style?: TradeStyle;
}): ReversalTrade[] {
  const out: ReversalTrade[] = [];
  const { bars, dailyBars } = input;
  let { caughtAt, side, cause, brokenLevel, extreme } = input;
  for (let depth = 1; depth <= MAX_REVERSALS; depth++) {
    if (!reversesOn(cause)) break;
    const plan = gannReversal({ side, brokenLevel, extreme });
    if (!plan) break;
    const long = plan.side === "long";
    const dir = long ? 1 : -1;
    const session = bars[caughtAt]?.t.slice(0, 10);
    let evidence = freshEntryConfirmation();
    let fillAt = -1;
    for (let k = caughtAt + 1; k < bars.length && bars[k].t.slice(0, 10) === session; k++) {
      evidence = advanceEntryConfirmation(evidence, { direction: long ? "bullish" : "bearish", entryTrigger: plan.entry }, bars[k - 1]);
      if (entryReady(evidence)) {
        fillAt = k;
        break;
      }
    }
    if (fillAt === -1) break;
    const entry = bars[fillAt].o;
    if (long ? entry <= plan.stop : entry >= plan.stop) break;
    const risk = Math.abs(entry - plan.stop);
    const target = entry + dir * risk;
    const walked = walkGannExit({
      bars, from: fillAt, maxBarsHeld: input.maxBarsHeld, long, entry, stop: plan.stop, dailyBars,
      crossedLevel: null,
      scaleOut: input.runner ? { price: target, fraction: RUNNER_SCALE_OUT } : undefined,
      sharesOn: input.sharesOn,
      coverAt: depth === 1 ? input.coverAt : undefined,
      disabled: input.disabled,
      style: input.style,
    });
    const executionAtr = atr(bars.slice(Math.max(0, fillAt - 30), fillAt), 14);
    out.push({
      openedAt: bars[fillAt].t,
      direction: long ? "bullish" : "bearish",
      entry, stop: plan.stop, target,
      atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
      barsHeld: walked.barsHeld,
      closedAt: bars[fillAt + walked.barsHeld - 1].t,
      outcome: isTimeoutReason(walked.reason) ? "timeout" : dir * (walked.exit - entry) - input.costPerShare > 0 ? "win" : "loss",
      exitReason: walked.reason,
      exitPrice: walked.finalExit,
      rMultiple: (dir * (walked.exit - entry) - input.costPerShare) / risk,
      reversal: depth,
      contextFactors: {},
    });
    if (isTimeoutReason(walked.reason)) break;
    caughtAt = fillAt + walked.barsHeld - 1;
    side = plan.side;
    cause = walked.reason;
    brokenLevel = walked.finalExit;
    extreme = walked.best ?? entry;
  }
  return out;
}

/**
 * Where a stop fills on the candle that reaches it: at the stop, or at the open
 * when the candle opens through it (a gap). A resting stop becomes a market
 * order once touched, so a gap fills it at the gap, as the paper exit manager
 * fills at the market (`closeSimPlanForSymbol`). Filling every gap at the stop
 * made the loss side of the measurement optimistic, against the header's rule
 * of being pessimistic wherever a bar is ambiguous.
 */
export function stopFill(long: boolean, stop: number, open: number): number {
  return long ? Math.min(stop, open) : Math.max(stop, open);
}

/** Share of the position that leaves at the target under `"gann-runner"` (mirrors `SCALE_OUT_PCT`). */
const RUNNER_SCALE_OUT = SCALE_OUT_PCT;

/**
 * Walk one filled trade forward under Gann's exit rules (`exitRule: "gann"`).
 *
 * The stop is checked on every execution bar. At the first bar of each new
 * session, Gann's rules are read from the completed daily sessions before it:
 * the stop moves if they tighten it, and an exit signal leaves at that bar's
 * open. A stop hit fills at the stop, the same convention as the bracket.
 */
export function walkGannExit(input: {
  bars: Bar[];
  from: number;
  maxBarsHeld: number;
  long: boolean;
  entry: number;
  stop: number;
  dailyBars: Bar[];
  crossedLevel: number | null;
  /** The stored share count as of a session (D2), or null. */
  sharesOn?: (date: string) => number | null;
  /** `"gann-runner"`: this fraction leaves at `price`; the rest runs. */
  scaleOut?: { price: number; fraction: number };
  /** Add to the winner on Gann's pyramiding rules (`lib/gann/pyramid.ts`). */
  pyramid?: boolean;
  /** A stock, so rule 21 reads its capital stock for an add; false for crypto. */
  isStock?: boolean;
  /** Cover the whole position when price trades to this level (a re-buy rests there). */
  coverAt?: number;
  /**
   * Gann rules switched off for a counterfactual cell (`ReplayOptions.disableExits`,
   * resolved): passed to `readGannExit`, so a disabled trail is never adopted
   * and a disabled signal never fires. Default none.
   */
  disabled?: ReadonlySet<GannExitRuleName>;
  /** The trade style (`ReplayOptions.tradeStyle`): "fast" adds the day trail. Default swing. */
  style?: TradeStyle;
}): {
  /** The single price that gives the whole exit's P&L per first-lot unit (scale-outs and adds blended in): for R only. */
  exit: number;
  /** Where the last of the position actually left: the stop, the signal's open, the cover or the timeout close. The level that broke, for a reversal. */
  finalExit: number;
  barsHeld: number;
  reason: GannStopReason | GannExitReason | "covered" | TimeoutReason;
  lots: number;
  best: number | null;
} {
  const { bars, from, maxBarsHeld, long, entry, dailyBars, crossedLevel, sharesOn, scaleOut, pyramid, isStock = false, coverAt, disabled } = input;
  const dir = long ? 1 : -1;
  // Position accounting in units of the first lot (1.0). The result is
  // reported as the single exit price that gives the same P&L per unit, so the
  // caller's R arithmetic is unchanged: the first lot's risk stays the unit.
  let openQty = 1;
  let cost = entry;
  let realized = 0;
  const lots: PyramidLot[] = [{ qty: 1, price: entry, date: bars[from].t.slice(0, 10) }];
  const close = (price: number) => realized + dir * (openQty * price - cost);
  const done = (price: number, j: number, reason: GannStopReason | GannExitReason | "covered" | TimeoutReason) => ({
    exit: entry + dir * close(price),
    finalExit: price,
    barsHeld: j,
    reason,
    lots: lots.length,
    best,
  });
  let scaled = false;
  let pendingAdd: { qty: number; trigger: number; newStop: number } | null = null;
  const entryDate = bars[from].t.slice(0, 10);
  const position = { side: long ? "long" : "short", entry, initialStop: input.stop, entryDate, crossedLevel, style: input.style ?? "swing" } as const;
  let stop = input.stop;
  let stopReason: GannStopReason = "initial";
  let best: number | null = null;
  const end = Math.min(bars.length, from + maxBarsHeld);
  for (let j = from; j < end; j++) {
    const b = bars[j];
    const date = b.t.slice(0, 10);
    if (j > from && date !== bars[j - 1].t.slice(0, 10)) {
      const prior = dailyBars.filter((d) => d.t.slice(0, 10) < date);
      const reading = readGannExit(position, prior, best, sharesOn?.(date) ?? null, disabled);
      if (reading.exit) return done(b.o, j - from + 1, reading.exit.reason);
      if (long ? reading.stop > stop : reading.stop < stop) {
        stop = reading.stop;
        stopReason = reading.stopReason;
      }
      pendingAdd = null;
      if (pyramid && prior.length > 0) {
        // Lots are fractions of the first lot here. Scale them to whole shares
        // for the reading (only the ratios matter), or "half of 1" would round
        // to zero and no add would ever be offered.
        const add = readPyramidAdd({
          side: long ? "long" : "short",
          lots: lots.map((l) => ({ ...l, qty: l.qty * PYRAMID_SHARE_SCALE })),
          stop,
          initialStop: input.stop,
          daily: prior,
          price: prior[prior.length - 1].c,
          // Rule 21, read as live reads it: the count public on this session.
          ...(isStock ? { capitalStock: sharesOn?.(date) ?? null } : {}),
        }).add;
        // Lots are fractions of the first here, so the size rule is applied directly.
        if (add) pendingAdd = { qty: lots[lots.length - 1].qty / 2, trigger: add.trigger, newStop: add.newStop };
      }
    }
    if (long ? b.l <= stop : b.h >= stop) return done(stopFill(long, stop, b.o), j - from + 1, stopReason);
    if (coverAt != null && (long ? b.h >= coverAt : b.l <= coverAt)) {
      return done(long ? Math.max(coverAt, b.o) : Math.min(coverAt, b.o), j - from + 1, "covered");
    }
    if (pendingAdd && (long ? b.h >= pendingAdd.trigger : b.l <= pendingAdd.trigger)) {
      const fill = long ? Math.max(pendingAdd.trigger, b.o) : Math.min(pendingAdd.trigger, b.o);
      openQty += pendingAdd.qty;
      cost += pendingAdd.qty * fill;
      lots.push({ qty: pendingAdd.qty, price: fill, date });
      const avg = cost / openQty;
      const floor = long ? Math.max(pendingAdd.newStop, avg) : Math.min(pendingAdd.newStop, avg);
      if (long ? floor > stop : floor < stop) {
        stop = floor;
        stopReason = "break_even";
      }
      pendingAdd = null;
    }
    if (scaleOut && !scaled && (long ? b.h >= scaleOut.price : b.l <= scaleOut.price)) {
      // Scale out the fraction of what is held now, at the target.
      const sold = openQty * scaleOut.fraction;
      const avg = cost / openQty;
      realized += dir * sold * (scaleOut.price - avg);
      cost -= sold * avg;
      openQty -= sold;
      scaled = true;
    }
    best = best === null ? (long ? b.h : b.l) : long ? Math.max(best, b.h) : Math.min(best, b.l);
  }
  return done(bars[end - 1].c, end - from, timeoutReasonAt(from, maxBarsHeld, bars.length));
}

/**
 * The trade plan the scan would price for one armed trigger. Priced exactly as
 * lib/scanTicker.ts prices it: from the swing-crossing trigger, labelled by
 * what it crossed. A setup with no valid plan is scored without one, exactly as
 * the scan does when `computeTradeLevels` rejects it. Shared by the verdict and
 * by the stop-breach check, so the stop retirement reads is the stop the plan
 * actually carries.
 */
function priceTradeLevels(input: {
  context: MacroContext;
  gannTrigger: GannEntryTrigger;
  history: Bar[];
  executionAtr: number;
  assetClass: AssetClass;
  largeCap: boolean;
}): TradeLevels | null {
  const { context, gannTrigger, history, executionAtr, assetClass, largeCap } = input;
  const entrySource: EntrySource = gannEntrySource(gannTrigger);
  try {
    return computeTradeLevels(
      entrySource,
      history[history.length - 2] ?? history[history.length - 1],
      gannTargetPool(context.gann),
      undefined,
      executionAtr,
      assetClass,
      largeCap,
      context.structuralLevels,
      context.atrPct,
    );
  } catch {
    return null;
  }
}

/**
 * The daily plan a session stands on, as the daily scan shows it: the
 * with-trend buying point when both armed, else the one that did
 * (`preferWithTrend`, as `chooseSessionEntry` picks it), its levels and its
 * verdict. A plan whose stop the price the session's scan read has already
 * reached is none: live, `applyStopBreachHold` makes it Reject, so the
 * intraday route never serves it (`loadDailyPlans`).
 *
 * Not modelled, labelled: live plans re-scored during market hours on the
 * delayed feed carry `applyDataLagHold` (Execute held to Watch), so the
 * Execute/Watch split read here is the verdict without that hold.
 */
function sessionDailyPlan(arm: SessionArm, history: Bar[], armPrice: number, assetClass: AssetClass, weights?: CriterionWeights): SessionDailyPlan | null {
  const chosen = preferWithTrend(arm.triggers);
  if (!chosen || history.length === 0) return null;
  const executionAtr = atr(history.slice(-30), 14);
  const { decision, levels } = scoreSetup({
    context: arm.context,
    pattern: null,
    gannTrigger: chosen.trigger,
    history,
    executionAtr,
    assetClass,
    largeCap: arm.largeCap,
    setupKind: chosen.setupKind,
    breakaway: chosen.breakaway,
    monthlyWarning: chosen.monthlyWarning,
    weights,
  });
  if (!levels || isStopBreached(chosen.trigger.direction, levels.stopLoss, armPrice)) return null;
  return {
    direction: chosen.trigger.direction === "bullish" ? "up" : "down",
    verdict: decision.outputState,
    entry: levels.entry,
    stop: levels.stopLoss,
    tp1: levels.takeProfit1,
    mtp: levels.masterProfit,
  };
}

/**
 * Rebuild the verdict the scanner would have shown for one armed setup.
 *
 * Reads only sessions strictly before the day being traded. That is stricter
 * than production, which sees the current day's partial bar, and the direction
 * of the difference is deliberate: a replay that peeks is worthless.
 */
function scoreSetup(input: {
  context: MacroContext;
  pattern: StratPattern | null;
  gannTrigger: GannEntryTrigger;
  history: Bar[];
  executionAtr: number;
  assetClass: AssetClass;
  /** Computed once per session by the caller (it also tags the trade record). */
  largeCap: boolean;
  setupKind: SetupKind;
  breakaway: BreakawayReading;
  monthlyWarning: MonthlyBreakWarning | null;
  weights?: CriterionWeights;
}): { decision: ScanDecision; levels: TradeLevels | null } {
  const { context, pattern, gannTrigger, history, executionAtr, assetClass, largeCap, setupKind, breakaway, monthlyWarning, weights } = input;

  // The last 400 candles is ~15 sessions of hourly context, which is more than
  // readTrend looks back over and keeps the roll-up cheap.
  const hourlyBars = rollUp(history.slice(-400), (b) => b.t.slice(0, 13));
  const hourlyTrend = readTrend(hourlyBars, "1Hour");

  const levels = priceTradeLevels({ context, gannTrigger, history, executionAtr, assetClass, largeCap });

  const decision = withDecisionState(applyFigureCrossingHold(applyWeakStockHold(applyRuleFollowingHold(applyTimeWindowHold(applyFailedTopHold(applyDistributionBreakdownHold(applyMonthlyBreakHold(applyBreakawayHold(
    computeScore({
      direction: gannTrigger.direction,
      macroTrends: context.macroTrends,
      hourlyTrend,
      swingChart: context.swingChart,
      campaignLeg: context.campaignLeg,
      ruleOfThree: context.ruleOfThree,
      ruleOfThreeWeekly: context.ruleOfThreeWeekly,
      ruleOfThreeMonthly: context.ruleOfThreeMonthly,
      timePriceSquare: context.timePriceSquare,
      volumeClimax: context.volumeClimax,
      boilingPoint: context.boilingPoint,
      gann: context.gann,
      nearSupportResistance: context.nearSupportResistance,
      srMatch: srMatchForSide(context.srMatches, gannTrigger.direction),
      pattern,
      gannTrigger,
      momentumElevated: context.momentumElevated,
      levels,
      stopAtrMultiple: levels && executionAtr > 0 ? levels.riskPerShare / executionAtr : null,
      assetClass,
      setupKind,
      atrPct: context.atrPct,
      pillarFacts: context.pillarFacts,
      ...(weights ? { weights } : {}),
    }), breakaway), monthlyWarning, gannTrigger.direction), context.disclosedRules.distributionStanding ?? null, gannTrigger.direction),
    context.disclosedRules.multipleTops, gannTrigger.direction, levels), setupKind, () => context.windowTurn(gannTrigger.direction)), context.disclosedRules.ruleFollowing),
    // A-SELECTION-04: a buy in a weak stock holds to Watch, as on the live scan.
    context.disclosedRules.weakStock, gannTrigger.direction),
    // A-LEVELS-08: the first and second times through a round number hold, as live.
    figureCrossingOf(context.dailyChart, gannTrigger)), gannTrigger.direction);
  return { decision, levels };
}

/**
 * Split a run by the verdict the scanner would have shown. Trades with no
 * verdict — too little daily history, or none supplied — are reported under
 * `unscored` rather than folded into a bucket they were never assigned to.
 * Reversals and re-entries (`derived`) were never scored and sit in none of
 * these; `byDerived` reports them.
 */
export function byOutputState(result: ReplayResult): {
  Execute: ReplayResult;
  Watch: ReplayResult;
  Reject: ReplayResult;
  unscored: ReplayResult;
} {
  const scored = result.trades.filter((t) => !t.derived);
  const pick = (state: ScanDecision["outputState"]) =>
    summarise(scored.filter((t) => t.outputState === state));
  return {
    Execute: pick("Execute"),
    Watch: pick("Watch"),
    Reject: pick("Reject"),
    unscored: summarise(scored.filter((t) => t.outputState === undefined)),
  };
}

/**
 * Split a run into the trades its armed setups opened and the ones the replay
 * opened from them (`ReplayTrade.derived`): reversals when caught and
 * re-entries after a stop. Each is its own scope; only `armed` carries a
 * verdict, a score and criteria.
 */
export function byDerived(result: ReplayResult): { armed: ReplayResult; reversal: ReplayResult; rebuy: ReplayResult } {
  return {
    armed: summarise(result.trades.filter((t) => !t.derived)),
    reversal: summarise(result.trades.filter((t) => t.derived === "reversal")),
    rebuy: summarise(result.trades.filter((t) => t.derived === "rebuy")),
  };
}

/**
 * Split a run's trades by whether the symbol read as large-cap at the time —
 * the comparison this session's stop-widening change asked for. Every trade
 * carries `largeCap` regardless of whether `dailyBars`/scoring were supplied,
 * so unlike `byOutputState` there is no "unknown" bucket to report.
 */
/** Hits in `direction` at `at`, from monthly bars that closed before `at`'s month. */
function yearCycleHitsAt(monthlyBars: Bar[], at: string, direction: "bullish" | "bearish"): number {
  // The live scan's months (`yearCycleMonths`): closed before the session's
  // month and reaching ten years back.
  const hits = yearCycleConvergence(yearCycleMonths(monthlyBars, at.slice(0, 10)), new Date(`${at.slice(0, 10)}T12:00:00Z`));
  return direction === "bullish" ? hits.bullishHits : hits.bearishHits;
}

/**
 * Split a run's trades by whether any yearly cycle landed on the trade's month
 * in its direction — the measurement the market scan's shortlist re-rank
 * (`rankShortlist`, lib/marketScan.ts) needs before its bonus values can be
 * trusted. Trades with no monthly read are in neither row.
 */
export function byYearCycle(result: ReplayResult): { withHits: ReplayResult; withoutHits: ReplayResult } {
  return {
    withHits: summarise(result.trades.filter((t) => (t.yearCycleHits ?? 0) > 0)),
    withoutHits: summarise(result.trades.filter((t) => t.yearCycleHits === 0)),
  };
}

export function byLargeCap(result: ReplayResult): { largeCap: ReplayResult; notLargeCap: ReplayResult } {
  return {
    largeCap: summarise(result.trades.filter((t) => t.largeCap === true)),
    notLargeCap: summarise(result.trades.filter((t) => t.largeCap !== true)),
  };
}

/**
 * Split a run to the trades whose score fell in `[min, max]` (inclusive) —
 * the band question `byOutputState` cannot answer, because "Watch" spans
 * every score from 4 to 6 at once. Asking "what's true of a 5–6, one point
 * short of Execute" needs this, not the Watch bucket.
 *
 * A trade with no score (too little daily history to compute one) never
 * matches any range, same as `byOutputState` puts it in `unscored` rather
 * than guessing.
 */
export function byScoreRange(result: ReplayResult, min: number, max: number): ReplayResult {
  return summarise(result.trades.filter((t) => !t.derived && t.score !== undefined && t.score >= min && t.score <= max));
}
