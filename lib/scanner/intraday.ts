/**
 * Intraday movement detection.
 * -----------------------------------------------------------------------------
 * Why this module exists
 * ----------------------
 * The existing market scan (lib/marketScan.ts) is a daily-bar *reversion*
 * screen. Three properties of it, all deliberate, together make it structurally
 * incapable of noticing a large intraday move:
 *
 *   1. It runs twice a day on a cron — before the open and after the close.
 *      Nothing is scheduled during the session, so a move that happens between
 *      09:30 and 11:33 is not evaluated by anything.
 *   2. It is a reversion screen: it picks the direction *opposite* the trend
 *      (`direction = trend === "bearish" ? "bullish" : "bearish"`). A symbol
 *      running hard in one direction is the thing it filters out, not the thing
 *      it looks for.
 *   3. Its execution timeframe reads closed 15-minute bars and requires an
 *      armed reversal pattern. A three-dollar move over ninety minutes produces
 *      no such pattern, and even if it did, the first evaluation could not come
 *      before a 15-minute candle closed.
 *
 * So this is not a tuning problem in the existing scanner — there was no
 * detector for "this moved a lot today". This module is that detector, and it
 * is separate on purpose: reversion setups and momentum confirmation are
 * different questions with different maths, and merging them would make both
 * harder to reason about.
 *
 * The day's reference level is Gann's, not VWAP (2026-09-28, project owner:
 * VWAP "is not Gann methodology, so implement Gann's methods"). Direction,
 * invalidation and the first target read the 50% point of the session's
 * range so far: Gann's first-ranked retracement level (the halfway point is
 * "the most important", `docs/GANN_HISTORICAL_SOURCES.md`, and the same
 * `rangeMidpoint` rule the daily scan's gates use). Three-question basis:
 * 1. Gann, Tier A, as cited. 2. No periodicity claim. 3. Polarity: the
 * halfway point divides the day into its buying half and its selling half,
 * and which half price holds says whose day it is.
 *
 * Every detector is Gann's (2026-10-16, project owner: "fix all non Gann
 * gaps"). Three pieces had no source in his method and are replaced:
 *
 * | Was | Now | Gann source |
 * |---|---|---|
 * | Break of the first 15 minutes' range | A close beyond the prior session's top or bottom by one intraday point (`old_level_cross`) | Buy on crossing old tops, sell on breaking old bottoms (*New Stock Trend Detector* pp. 20-22); a close decides, since intraday pokes often reverse (*Master Course* rule 5) |
 * | Move larger than 1.5 daily ATRs | The day's counter-move exceeds the greatest reaction of the daily campaign (`space_overbalance`) | The Space Rule's over-balance of space (*Master Course* Ch. 7, 10A, 11A; *Commodities* p. 51), read by the same `buildCampaignLedger` the daily trend verdict uses |
 * | Higher highs and lows over six bars | The 3-bar swing chart's trend on the session's bars | The trend turns only when the last swing extreme breaks (NSTD pp. 19-20); "the hourly chart will give the first change in trend" (*Master Course* Ch. 13) |
 * | (new, 2026-10-16) | The same chart on hourly bars over recent sessions, a factor on the crossing and continuation alerts | "Keep an hourly High and Low Chart… the Hourly Chart will give the first change in trend" (*Master Course* Ch. 13) |
 *
 * The failed-break alert reads the same prior-session levels: a cross that
 * closes back one point inside the level is Gann's false break (NSTD p. 20,
 * a crossed top "should not react back 3 points under it"). The intraday point
 * is `intradayPoint` (`lib/gann/pointScale.ts`), the same scaling the intraday
 * replay profile uses, so the alerts and the replay read one allowance.
 * Three-question basis: 1. Gann, as tabled (Tier A; the *Master Course* and
 * *Commodities* rows are read in `docs/memory-bank/sources/`). 2. No
 * periodicity claim; Dewey's checklist does not apply. 3. Correspondence: the
 * daily method's own constructions (old levels, swing chart, campaign ledger)
 * read at the session's scale rather than a second method; Polarity: every
 * detector is one rule with its mirror for the downside.
 *
 * What it does and does not claim
 * -------------------------------
 * Every output is a *confirmation* of a move that has already happened, with
 * the evidence attached. Nothing here predicts. Each alert names its reference
 * price and the basis that reference came from, so "up $3.20" is never
 * ambiguous about $3.20 from what. Each one also carries the level that would
 * invalidate it, because a signal without an exit is not actionable.
 *
 * The audit trail is not a debugging aid, it is a product feature: for every
 * symbol in the universe the scan records whether it was evaluated, which
 * checks it passed and failed, and — when a move is detected after the fact —
 * why it did not alert earlier. "The scanner missed it" and "the scanner
 * evaluated it and the volume filter rejected it at 10:04" are different
 * problems, and until now there was no way to tell them apart.
 */

import { combineNearbyLevels } from "@/lib/gann/nearbyLevels";
import { priceText, roundPrice } from "@/lib/strat/priceText";
import {
  ASSET_KIND_LABELS,
  NOTICE_SIGNALS,
  MOVE_BASIS_LABELS,
  SIGNAL_DESCRIPTIONS,
  SIGNAL_LABELS,
  formatAge,
  formatRvol,
  formatVolume,
} from "@/lib/scanner/intradayDisplay";
import type { Bar } from "@/lib/types";
import { decisionLag } from "@/lib/data/latency";
import {
  availability,
  availableBars,
  barCloseAt,
  seriesSpacingMinutes,
  observationAgeMs,
  timeframeForMinutes,
  usableBy,
  type FeedEntitlement,
  newerBarUsable,
} from "@/lib/data/timeliness";
import { atr } from "@/lib/analysis/pivots";
import { equitySession, etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { meetsLiquidityFloor } from "@/lib/scan/liquidity";
import { MAG7 } from "@/lib/sectors";
import { APPROACH_WINDOW_PCT, targetCandidates } from "@/lib/gann/evenFigures";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { intradayPoint } from "@/lib/gann/pointScale";
import { readOvernightChart } from "@/lib/gann/overnightChart";
import { THREE_DAY_CHART, swingPivots, walkSwingChart } from "@/lib/gann/swingChart";
import { hourlyBars, isRegularSessionBar } from "@/lib/gann/intradayExit";
import { APPROACH_LEAD_MAX_MINUTES, SCAN_CADENCE_MINUTES, readEntryApproach } from "@/lib/scanner/entryApproach";

/** ---- Configuration ----------------------------------------------------- */

export type SignalType =
  | "old_level_cross"
  | "trend_continuation"
  | "space_overbalance"
  | "overnight_turn"
  | "hourly_turn"
  | "plan_level_held"
  | "reversal_risk"
  | "entry_approach"
  | "entry_reached";

export type Direction = "up" | "down";

/** What a move is measured against. Always stated; never left to inference. */
export type MoveBasis = "prior_close" | "session_open" | "prior_session" | "midpoint" | "plan_entry";

export type AssetKind = "equity" | "etf" | "index" | "crypto";

export interface ScannerConfig {
  /** Cumulative volume vs. the same-time-of-day baseline to count as elevated. */
  relativeVolumeThreshold: number;
  /** Seconds after which the newest bar is too old to alert on. */
  maxDataAgeSeconds: number;
  /** Minutes a symbol+signal+direction stays suppressed after alerting. */
  cooldownMinutes: number;
  /** Minimum cumulative share volume for the session. */
  minSessionVolume: number;
}

/**
 * Engineering figures, labelled as such (audit 2026-10-28): Gann reads volume
 * against the market's own past (*New Stock Trend Detector* Ch. VI pp. 39-40)
 * but gives no intraday ratio, no session-volume floor and no repeat interval,
 * so 1.2, 50,000 shares and 30 minutes are GSPS's. The data-age limit follows
 * the feed's own delay.
 */
export const DEFAULT_CONFIG: ScannerConfig = {
  relativeVolumeThreshold: 1.2,
  // Alpaca's free IEX feed is delayed ~15 minutes by contract, so anything
  // beyond twenty minutes means the feed itself has stalled on top of that.
  maxDataAgeSeconds: 20 * 60,
  cooldownMinutes: 30,
  minSessionVolume: 50_000,
};

/**
 * Named instruments the scan always covers, whatever the configured universe
 * does. Each one carries its asset kind, because an ETF, a single stock and a
 * 24/7 crypto pair are not the same thing and the UI must not present them as
 * interchangeable rows.
 */
/**
 * Broadened from the original 8 mega-cap tech names + 2 index ETFs, which
 * never covered healthcare, financials, energy, or industrials — a $30+
 * intraday move in a name like Eli Lilly (LLY) was invisible to this list
 * simply because nothing here checked it, not because it failed to qualify.
 * One or two representative names per sector in lib/sectors.ts, bounded to
 * stay well inside this route's 120s ceiling (see `maxDuration` in
 * app/api/intraday-scan/route.ts) — breadth here trades against per-symbol
 * latency, so this is representative coverage, not exhaustive; a caller that
 * wants a specific sector in full already has the `?symbols=` override.
 *
 * BTC/USD and ETH/USD (2026-08-21): the scanner, its provider plumbing, and
 * its own tests have supported `kind: "crypto"` since this file was written
 * (see `sessionMetrics`'s crypto-has-no-session-boundary branch), but no
 * crypto symbol was ever actually placed in this list — so the system scan
 * that runs every 15 minutes and emails users never once evaluated one. A
 * ~6% BTC move that a novice user watched happen live went uncaught not
 * because the detectors couldn't see it, but because nothing pointed them at
 * it. This is the minimal fix: the two crypto assets large enough to call
 * "big cap" in the same sense the equity side of this list means it. It is
 * deliberately narrower than the Q2 "Crypto scanner" roadmap item (a separate
 * scan queue for BTC/ETH/major alts on adapted 4h/1d timeframes over Binance
 * data) — this only wires existing large-cap names into the existing
 * intraday engine, on the same timeframe as everything else here.
 *
 * One gap this does not close: `.github/workflows/intraday-scan.yml` only
 * fires Mon–Fri during the equity session (13-21 UTC), because until now
 * nothing in this list ever traded outside that window. Crypto trades 24/7,
 * so a large weekend or overnight BTC move still won't be caught until that
 * schedule is widened — a follow-up, not part of this change.
 */
export const WATCHLIST: { symbol: string; kind: AssetKind }[] = [
  { symbol: "SPY", kind: "etf" },
  { symbol: "QQQ", kind: "etf" },
  { symbol: "IWM", kind: "etf" },
  ...MAG7.map((symbol) => ({ symbol, kind: "equity" as const })),
  { symbol: "AMD", kind: "equity" },
  { symbol: "AVGO", kind: "equity" },
  { symbol: "JPM", kind: "equity" },
  { symbol: "V", kind: "equity" },
  { symbol: "CAT", kind: "equity" },
  { symbol: "XOM", kind: "equity" },
  { symbol: "UNH", kind: "equity" },
  { symbol: "LLY", kind: "equity" },
  { symbol: "JNJ", kind: "equity" },
  { symbol: "BTC/USD", kind: "crypto" },
  { symbol: "ETH/USD", kind: "crypto" },
];


/** ---- Inputs ------------------------------------------------------------ */

export interface SymbolInput {
  symbol: string;
  kind: AssetKind;
  /**
   * Intraday bars for the current session, oldest → newest. Minute bars are
   * expected; coarser bars work but lower the resolution of everything derived
   * from them, and `barIntervalMinutes` must say which.
   */
  bars: Bar[];
  barIntervalMinutes: number;
  /** Previous regular-session close. The default reference for a day's move. */
  prevClose: number | null;
  /** Most recent trade price, and when it printed. */
  quote: { price: number; at: string } | null;
  /**
   * Cumulative session volume by this time of day, averaged over recent
   * sessions. Null when there isn't enough history — relative volume is then
   * reported as unavailable rather than as 1.0, which would read as "normal".
   */
  volumeBaseline: number | null;
  /** Daily ATR, for sizing a move against the symbol's usual range. */
  dailyAtr: number | null;
  /**
   * Completed daily bars before this session, oldest first. The prior
   * session's high and low are the old top and bottom the crossing and
   * failed-break detectors read, and the campaign ledger behind the
   * over-balance detector is built from them plus today's session. Without
   * them those three detectors report "no data" rather than guessing.
   */
  priorDailyBars?: Bar[];
  /**
   * Bars over the last several sessions (five-minute bars from the route),
   * oldest first, rolled up into Gann's hourly High and Low chart: "when
   * markets are very active… the Hourly Chart will give the first change in
   * trend" (*Master Stock Market Course* Ch. 13). Without them the hourly
   * factor is left out rather than counted as failed.
   */
  recentBars?: Bar[];
  /**
   * Average daily volume over the recent sessions, for the platform-wide
   * liquidity floor (see lib/scan/liquidity.ts). Null when no daily history
   * came back, which fails the floor rather than passing it silently — a
   * symbol whose turnover cannot be read is not one to alert a novice onto.
   */
  avgDailyVolume?: number | null;
  /**
   * The symbol's standing daily plan (the daily scan's entry, stop, TP1 and
   * MTP), when one exists. `plan_level_held` reads it: the daily plan entered
   * on the session's chart. Without it that alert reports "no daily plan".
   */
  dailyPlan?: DailyPlanLevels | null;
  /** Last time this symbol+signal+direction alerted, for cooldown suppression. */
  lastAlerts?: { type: SignalType; direction: Direction; at: string }[];
  /**
   * True when the instrument's market is currently closed (after hours,
   * overnight, or a weekend/holiday for equities; crypto is never closed).
   * The only market data that exists in that state is stale by definition, so
   * the freshness gate is not applied — the scan runs on the most recent
   * session's data instead of refusing to run at all. Every alert produced
   * this way says so, in `whyNotEarlier`.
   */
  marketClosed?: boolean;
  /**
   * The feed's contractual delay for this instrument (`resolveFeedPolicy`,
   * DATA-DELAY-001, 2026-10-28). When set, the scan reads only the bars and
   * quote usable at its evaluation time: a bar's close plus this delay, and
   * not before `receivedAt`. The live route and the alerts replay set it.
   */
  feedDelayMs?: number;
  /** The feed's entitlement, for the alert's provenance. Absent reads as unknown. */
  feed?: FeedEntitlement;
  /** When GSPS received these bars, where recorded. */
  receivedAt?: string | null;
}

/** A daily plan's levels, as the daily scan priced them. */
export interface DailyPlanLevels {
  direction: Direction;
  entry: number;
  stop: number;
  tp1: number | null;
  mtp: number | null;
  /** The daily verdict the plan carried: Execute or Watch. */
  verdict: "Execute" | "Watch";
  /**
   * The plan's crossing still waits on its daily close 3 points past the
   * level (`TradeLevels.entryAwaitsCrossing`). Null or absent when the stored
   * plan does not say (rows before 2026-10-22).
   */
  awaitsCrossing?: boolean | null;
}

/** ---- Derived session metrics ------------------------------------------- */

export interface SessionMetrics {
  sessionOpen: number;
  high: number;
  low: number;
  last: number;
  /** Gann's 50% point of the session's range so far. */
  midpoint: number;
  cumulativeVolume: number;
  /** Close of the newest bar. Gann's rules act on a close, not an intraday poke. */
  lastClose: number;
  /** The prior session's high and low: the old top and bottom of the day. Null without daily history. */
  priorHigh: number | null;
  priorLow: number | null;
  /**
   * Gann's allowance at this chart's scale (`intradayPoint`): his 3 points
   * price-scaled, a third of it, times the bars' ATR over the daily ATR.
   * Zero when either ATR is unknown.
   */
  point: number;
  /**
   * The old tops and bottoms the first target is read from (`gannOldLevels`):
   * the session's completed swings, the prior session's high and low, and the
   * 3-Day Chart's swing tops and bottoms on the prior daily bars.
   */
  oldLevels: number[];
  /** The 3-bar swing chart's trend on the session's bars; null before a swing completes. */
  swingTrend: Direction | null;
  /**
   * The same swing chart on hourly bars over recent sessions, and whether its
   * trend turned on the latest hour (Gann's "first change in trend"). Null
   * without enough history.
   */
  hourly: { trend: Direction | null; turned: boolean } | null;
  /**
   * The daily trend: the 3-Day Chart on the prior daily bars, the chart the
   * daily plans read (`THREE_DAY_CHART`). Null without enough daily history.
   */
  dailyTrend: Direction | null;
  /** The session's completed swing bottoms and tops (3-bar chart), oldest first. */
  sessionPivots: { price: number; kind: "top" | "bottom" }[];
  /** ATR of the intraday bars — the noise floor a real move has to clear. */
  intradayAtr: number;
  /** Null when no baseline was available. Never defaulted to 1. */
  relativeVolume: number | null;
  /** Timestamp of the newest bar. */
  dataTimestamp: string;
  barCount: number;
}

/**
 * Fewest hourly bars the hourly chart is read from. An engineering figure:
 * Gann reads the hourly chart (Master Course Ch. 13) but names no minimum.
 */
export const MIN_HOURLY_BARS = 10;

const toDirection = (d: "bullish" | "bearish" | null): Direction | null =>
  d === "bullish" ? "up" : d === "bearish" ? "down" : null;

/**
 * The 3-bar swing chart on hourly bars rolled up from `recentBars`, the same
 * hourly chart the intraday replay trades on (`lib/backtest/replayIntraday.ts`).
 * Hours are read on exchange hours, as there (`exchangeHourKey`: a US equity's
 * from the 9:30 ET open, crypto's on the clock).
 */
export function hourlyChart(
  input: Pick<SymbolInput, "recentBars">,
  asOf: string,
  regularOnly: boolean,
): { trend: Direction | null; turned: boolean } | null {
  const recent = (input.recentBars ?? [])
    .filter(isUsableBar)
    // The exits' and the replay's regular session, early closes included.
    .filter((b) => b.t <= asOf && (!regularOnly || isRegularSessionBar(b)));
  // `regularOnly` is the equity case; crypto keeps every bar and the clock's hours.
  const hours = hourlyBars(recent, !regularOnly);
  if (hours.length < MIN_HOURLY_BARS) return null;
  const walk = walkSwingChart(hours, SWING_BARS);
  return { trend: toDirection(walk.trend), turned: walk.trendChanges.includes(hours.length - 1) };
}

/**
 * Fold the session's bars into the handful of numbers every signal reads.
 */
export function sessionMetrics(input: SymbolInput, _config: ScannerConfig): SessionMetrics | null {
  // Equities are measured over the regular session only. The feed returns
  // pre-market bars from 04:00 ET, and anchoring on "the first bar of the day"
  // put the session's high, low and 50% point in the pre-market, where a
  // handful of thin prints set a range two cents wide. The session is a
  // statement about the auction, so it has to start at the auction.
  //
  // Crypto has no session boundary; its whole day is the session.
  const regularOnly = input.kind !== "crypto";
  const bars = input.bars
    .filter(isUsableBar)
    .filter((b) => !regularOnly || isRegularSession(new Date(b.t)));
  if (bars.length === 0) return null;

  const first = bars[0];

  let high = -Infinity;
  let low = Infinity;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    high = Math.max(high, bar.h);
    low = Math.min(low, bar.l);
    cumulativeVolume += bar.v;
  }

  const last = input.quote?.price ?? bars[bars.length - 1].c;
  const lastClose = bars[bars.length - 1].c;
  const intradayAtr = atr(bars.slice(-30), 14);
  const prior = lastPriorBar(input.priorDailyBars);
  const sessionWalk = walkSwingChart(bars, SWING_BARS);
  const swing = sessionWalk.trend;
  const hourly = hourlyChart(input, bars[bars.length - 1].t, regularOnly);
  const priorDaily = (input.priorDailyBars ?? []).filter(isUsableBar);
  const dailyTrend = priorDaily.length >= 10 ? toDirection(walkSwingChart(priorDaily, THREE_DAY_CHART).trend) : null;

  return {
    sessionOpen: first.o,
    high,
    low,
    last,
    // Gann's 50% point of the session's range (2026-09-28: replaces VWAP, which
    // is not Gann's; see AGENTS.md and `lib/gann/retracement.ts#rangeMidpoint`).
    midpoint: high > low ? (high + low) / 2 : last,
    cumulativeVolume,
    lastClose,
    priorHigh: prior?.h ?? null,
    priorLow: prior?.l ?? null,
    point: input.dailyAtr != null ? intradayPoint(lastClose, intradayAtr, input.dailyAtr) : 0,
    oldLevels: gannOldLevels(bars, input.priorDailyBars),
    swingTrend: swing === "bullish" ? "up" : swing === "bearish" ? "down" : null,
    hourly,
    dailyTrend,
    sessionPivots: sessionWalk.pivots.map((p) => ({ price: p.price, kind: p.kind })),
    intradayAtr,
    relativeVolume:
      input.volumeBaseline && input.volumeBaseline > 0
        ? cumulativeVolume / input.volumeBaseline
        : null,
    // The newest bar's close, never its open: the provider stamps a bar with
    // its open, and the bar was not complete then (DATA-DELAY-001).
    dataTimestamp: input.quote?.at ?? sessionBarClose(bars[bars.length - 1], input),
    barCount: bars.length,
  };
}

/** Gann's 3-bar swing chart, read on the session's own bars (`lib/gann/swingChart.ts`). */
const SWING_BARS = 3;

/**
 * The old tops and bottoms behind a session's first target: where the market
 * has turned before, so where it is expected to meet orders again ("old tops
 * become bottoms", *New Stock Trend Detector* p. 13). Read three ways, each a
 * completed turn rather than any bar's high or low:
 * - the session's own completed swings (the 3-bar swing chart on its bars).
 *   Gann's swing chart records the tops and bottoms of each reverse move, and
 *   those are the "old tops" and "old bottoms" his Buying and Selling Points
 *   are stated against (*How to Make Profits in Commodities*, 1951 New Rules,
 *   p. 316; A8). Reading it on the session's bars is the hourly-chart use he
 *   gives for active markets (*Master Stock Market Course* Ch. 13).
 * - the prior session's high and low: the old top and bottom of the day, the
 *   levels the crossing alert already reads ("buy on crossing old tops, sell on
 *   breaking old bottoms", *New Stock Trend Detector* pp. 20-22).
 * - the 3-Day Chart's swing tops and bottoms on the prior daily bars
 *   (`THREE_DAY_CHART`: reverse moves of 2 to 3 days, A8 p. 316; *45 Years in
 *   Wall Street* Ch. VII p. 62), the same chart the daily plans read structure
 *   from, so an intraday target and a daily plan name the same old levels.
 * Both kinds are returned: a top or a bottom above the price resists a rise,
 * and either below it supports a fall. The caller keeps the ones beyond the
 * price. The session's still-open extreme is not here; `gannFirstTarget`
 * takes it separately.
 */
export function gannOldLevels(sessionBars: Bar[], priorDailyBars: Bar[] | undefined): number[] {
  const levels = walkSwingChart(sessionBars, SWING_BARS).pivots.map((p) => p.price);
  const daily = (priorDailyBars ?? []).filter(isUsableBar);
  const prior = daily[daily.length - 1];
  if (prior) levels.push(prior.h, prior.l);
  for (const p of swingPivots(daily, THREE_DAY_CHART)) levels.push(p.price);
  return levels.filter((p) => Number.isFinite(p) && p > 0);
}

/** The newest usable completed daily bar, or null. */
function lastPriorBar(daily: Bar[] | undefined): Bar | null {
  if (!daily) return null;
  for (let i = daily.length - 1; i >= 0; i--) if (isUsableBar(daily[i])) return daily[i];
  return null;
}

/** 09:30 and 16:00 ET (1:00 PM on an NYSE early close), as minutes since midnight. */
const REGULAR_OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTE = 16 * 60;
const EARLY_CLOSE_MINUTE = 13 * 60;

/** True when a bar printed inside the US equity regular session, early closes included. */
function isRegularSession(at: Date): boolean {
  const { minutes } = etParts(at);
  const close = isEarlyClose(etDateKey(at)) ? EARLY_CLOSE_MINUTE : REGULAR_CLOSE_MINUTE;
  return minutes >= REGULAR_OPEN_MINUTE && minutes < close;
}

/**
 * A bar with a zero or negative price, or a high below its low, is a bad print.
 * Feeding one into a range calculation produces a move that never happened,
 * which is exactly the kind of phantom alert that destroys trust in a scanner.
 */
function isUsableBar(bar: Bar): boolean {
  return (
    Number.isFinite(bar.o) &&
    Number.isFinite(bar.h) &&
    Number.isFinite(bar.l) &&
    Number.isFinite(bar.c) &&
    bar.l > 0 &&
    bar.h >= bar.l &&
    bar.c > 0 &&
    !Number.isNaN(Date.parse(bar.t))
  );
}

/** ---- Move measurement -------------------------------------------------- */

export interface Move {
  basis: MoveBasis;
  reference: number;
  current: number;
  absolute: number;
  percent: number;
  direction: Direction;
}

/**
 * Measure a move against an explicit reference.
 *
 * The reference is a parameter, never a default buried in the caller: a $3 move
 * "from the open" and "from yesterday's close" are different claims, and a
 * scanner that reports one while the user assumes the other is worse than one
 * that reports nothing.
 */
export function measureMove(current: number, reference: number, basis: MoveBasis): Move | null {
  if (!(reference > 0) || !Number.isFinite(current)) return null;
  const absolute = current - reference;
  return {
    basis,
    reference,
    current,
    absolute,
    percent: (absolute / reference) * 100,
    direction: absolute >= 0 ? "up" : "down",
  };
}


/** ---- Alerts ------------------------------------------------------------ */

export interface ConfidenceFactor {
  label: string;
  passed: boolean;
  detail: string;
}

export interface TradePlan {
  /** What has to happen before the plan is live. */
  confirmation: string;
  /**
   * The entry, when it is a set price rather than the alert's price: the daily
   * plan's entry on a notice (`NOTICE_SIGNALS`). Absent on every other signal,
   * whose entry is the price it was flagged at (`move.current`).
   */
  entry?: number | null;
  /** The price that says the thesis is wrong. */
  invalidation: number | null;
  /**
   * First place to take something off: the nearest old top or bottom, or a
   * round number just short of one (`gannFirstTarget`). Null when the method
   * names none and the stop trails the move instead.
   */
  firstTarget: number | null;
  /**
   * Whether `firstTarget` pays more than the risk to `invalidation`
   * (`targetPaysRisk`). False means the method takes no trade here: no
   * "Trade this" is offered. Null when no target is fixed or no stop is set.
   */
  paysRisk?: boolean | null;
  /**
   * The master target (MTP): the daily plan's where the alert carries one
   * (`plan_level_held`), else the next level beyond the first target
   * (`gannMasterTarget`). Shown and recorded; nothing sells there.
   */
  masterTarget?: number | null;
  /** Conditions that cancel the setup before it triggers. */
  cancelIf: string;
}

export interface Alert {
  symbol: string;
  kind: AssetKind;
  type: SignalType;
  direction: Direction;
  /** When the scan ran. */
  triggerTime: string;
  /** When the data it ran on was printed. These differ, and both are shown. */
  dataTimestamp: string;
  dataAgeSeconds: number;
  move: Move;
  /** Gann's 50% point of the session's range so far. */
  midpoint: number;
  relativeVolume: number | null;
  sessionVolume: number;
  /** 0–100, with the factors that produced it. Never a bare number. */
  confidence: number;
  confidenceFactors: ConfidenceFactor[];
  invalidation: number | null;
  continuationPlan: TradePlan;
  pivotPlan: TradePlan;
  /** Plain-language explanation aimed at someone reading their first scanner. */
  whyThisAppeared: string;
  /** Why an already-completed move is only being reported now. */
  whyNotEarlier: string | null;
  /**
   * Set only on a held alert (`ScanOutput.heldAlerts`): when this same signal,
   * symbol and direction first fired inside the cooldown. The signal still
   * qualifies on this scan; only the repeat notice is held back.
   */
  firstFlaggedAt?: string | null;
  /**
   * On `entry_approach`: how far off the daily plan's entry is and how soon,
   * at the reaction's pace (`lib/scanner/entryApproach.ts`). Delivery reads
   * `etaMinutes` against each member's lead.
   */
  approach?: { entry: number; distance: number; ratePerBar: number; etaMinutes: number; expectedAt: string } | null;
  /**
   * True when the alert's direction runs against the daily swing chart's
   * trend. Shown for study, never offered as a trade, belled or replayed:
   * "never buck the trend" (never-failing rule 5, *Commodities* pp. 43-45, 55;
   * audit I-02, 2026-10-28). Never set on a reversal-risk warning, the daily
   * plan's own timing or a notice, which read the daily plan's direction.
   */
  againstDailyTrend?: boolean;
  /**
   * When the data behind the alert could be read, and whether it may be acted
   * on (DATA-DELAY-001 and NOTIFY-FRESHNESS-001, 2026-10-28). Notifications
   * read it (`lib/notifications/freshness.ts`); they never decide it.
   */
  timeliness?: AlertTimeliness;
}

/** The provenance every alert carries: as-of, availability, evaluation and authorization. */
export interface AlertTimeliness {
  feed: FeedEntitlement;
  /** The contractual delay applied, in ms. */
  delayMs: number;
  /** Close of the newest bar read, or the quote's own time. */
  dataAsOf: string;
  /** dataAsOf plus the delay (and receipt, where recorded). */
  usableAt: string;
  receivedAt: string | null;
  /** When the scan computed the alert. */
  evaluatedAt: string;
  /** How old the data was at evaluation, in seconds; null when unknown. */
  dataAgeSeconds: number | null;
  /** The delay is a whole bar or more while prices move (`decisionLag`), so the alert cannot be acted on. */
  heldForDelay: boolean;
  /** True only when nothing in the data's timing stops a person acting on it now. */
  actionable: boolean;
  /** Identifies this decision (symbol, signal, side, plan, evaluation); present only when actionable. */
  authorizationId: string | null;
  /** The daily plan the alert read, as entry/stop, so a dispatch can tell a superseded plan. */
  planKey: string | null;
  /** The bar length the alert read, in minutes. */
  barMinutes: number;
  /**
   * Close of the newest session bar the decision's structure read (swings,
   * levels, volume). Kept apart from `dataAsOf`, which a fresher quote may set,
   * so a current quote cannot pass stale bars off as current. Optional for
   * alerts stored before 2026-10-28.
   */
  structureAsOf?: string | null;
}



/** One signal today's scheduled scans flagged, as stored (not the full alert). */
export interface RecentSystemAlert {
  symbol: string;
  type: SignalType;
  direction: Direction;
  entry: number | null;
  stop: number | null;
  firstTarget: number | null;
  masterTarget: number | null;
  confidence: number | null;
  at: string;
  /** As on `Alert`: the stored signal ran against the daily trend. */
  againstDailyTrend?: boolean;
}

/** ---- Audit trail ------------------------------------------------------- */

export type AuditOutcome =
  | "alerted"
  | "no_signal"
  | "suppressed"
  | "stale_data"
  | "insufficient_data"
  | "filtered";

export interface AuditCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SymbolAudit {
  symbol: string;
  kind: AssetKind;
  outcome: AuditOutcome;
  /** One sentence a non-engineer can read. */
  reason: string;
  checks: AuditCheck[];
  dataTimestamp: string | null;
  dataAgeSeconds: number | null;
  metrics: SessionMetrics | null;
}

export interface ScanOutput {
  scannedAt: string;
  alerts: Alert[];
  audit: SymbolAudit[];
  config: ScannerConfig;
  /** Symbols whose data was too old to alert on. Surfaced, not swallowed. */
  staleSymbols: string[];
  /**
   * Signals that still qualify on this scan but fired inside the cooldown
   * (2026-10-21, TSLA: a 6-of-6 signal read "Suppressed" minutes after it was
   * first shown). They stay on screen, marked with when they first fired;
   * only the repeat is held back, so callers must not persist or notify them
   * as new.
   */
  heldAlerts: Alert[];
}

/** ---- The scan ---------------------------------------------------------- */

export function scanIntraday(
  inputs: SymbolInput[],
  config: ScannerConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): ScanOutput {
  const alerts: Alert[] = [];
  const heldAlerts: Alert[] = [];
  const audit: SymbolAudit[] = [];
  const staleSymbols: string[] = [];

  for (const raw of inputs) {
    const input = usableInput(raw, now);
    const result = scanSymbol(input, config, now);
    audit.push(result.audit);
    // An alert whose price is already through its own exit is retired before
    // it is shown, the same rule as a daily plan whose stop broke
    // (`lib/gann/stopBreach.ts`).
    alerts.push(...result.alerts.filter((a) => !isThroughInvalidation(a)));
    heldAlerts.push(...result.held.filter((a) => !isThroughInvalidation(a)));
    if (result.audit.outcome === "stale_data") staleSymbols.push(input.symbol);
  }

  // Strongest first, so a page that shows five rows shows the five that matter.
  alerts.sort((a, b) => b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));
  heldAlerts.sort((a, b) => b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));

  return { scannedAt: now.toISOString(), alerts, heldAlerts, audit, config, staleSymbols };
}

/**
 * The input as a decision made at `now` may read it (DATA-DELAY-001): the
 * session's and recent bars whose close plus the feed's delay (and receipt,
 * where recorded) is at or before `now`, and the quote only once it is usable.
 * A still-forming bar is never read. An input with no `feedDelayMs` is read as
 * given (tests that build their own bars). A bar spacing the contract does not
 * know reads no bars, rather than guessing.
 */
export function usableInput(input: SymbolInput, now: Date): SymbolInput {
  if (input.feedDelayMs == null) return input;
  const delayMs = input.feedDelayMs;
  const assetClass = input.kind === "crypto" ? "crypto" : "us_equity";
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
  const filter = (bars: Bar[], minutes: number) => {
    const timeframe = timeframeForMinutes(minutes);
    return timeframe && timeframe !== "1Day" ? availableBars(bars, { timeframe, assetClass, delayMs, evaluatedAt: now, receivedAt }) : [];
  };
  const recent = input.recentBars;
  const quoteUsable = input.quote != null && usableBy(availability(input.quote.at, delayMs, receivedAt), now);
  return {
    ...input,
    bars: filter(input.bars, input.barIntervalMinutes),
    recentBars: recent ? filter(recent, seriesSpacingMinutes(recent)) : recent,
    quote: quoteUsable ? input.quote : null,
  };
}

/** The close of a session bar, from its open and the input's bar length. */
function sessionBarClose(bar: Bar, input: Pick<SymbolInput, "barIntervalMinutes" | "kind">): string {
  const timeframe = timeframeForMinutes(input.barIntervalMinutes);
  const close = timeframe ? barCloseAt(bar.t, timeframe, input.kind === "crypto" ? "crypto" : "us_equity") : null;
  return close ? close.toISOString() : new Date(Date.parse(bar.t) + input.barIntervalMinutes * 60_000).toISOString();
}

/** True when the alert's current price has already reached its own exit level. */
export function isThroughInvalidation(alert: Pick<Alert, "direction" | "invalidation" | "move">): boolean {
  const { invalidation, direction, move } = alert;
  if (invalidation == null || !Number.isFinite(invalidation)) return false;
  return direction === "up" ? move.current <= invalidation : move.current >= invalidation;
}

interface SymbolResult {
  alerts: Alert[];
  /** Still qualifying, inside the cooldown: shown, not re-sent. */
  held: Alert[];
  audit: SymbolAudit;
}

function scanSymbol(input: SymbolInput, config: ScannerConfig, now: Date): SymbolResult {
  const checks: AuditCheck[] = [];
  const bail = (outcome: AuditOutcome, reason: string, metrics: SessionMetrics | null = null): SymbolResult => ({
    alerts: [],
    held: [],
    audit: {
      symbol: input.symbol,
      kind: input.kind,
      outcome,
      reason,
      checks,
      dataTimestamp: metrics?.dataTimestamp ?? null,
      dataAgeSeconds: metrics ? ageSeconds(metrics.dataTimestamp, now) : null,
      metrics,
    },
  });

  const metrics = sessionMetrics(input, config);
  if (!metrics) {
    checks.push({ name: "Session bars", passed: false, detail: "No usable bars for today." });
    return bail("insufficient_data", "No intraday data arrived for this symbol.");
  }
  checks.push({
    name: "Session bars",
    passed: true,
    detail: `${metrics.barCount} bar${metrics.barCount === 1 ? "" : "s"} at ${input.barIntervalMinutes}-minute resolution.`,
  });

  // Freshness is checked before anything is computed from the data, because an
  // alert on a stale feed is worse than no alert: it looks live. The one
  // exception is a closed market: there, stale data isn't a feed problem, it's
  // the only data that exists, and refusing to run leaves the panel empty for
  // as long as the market stays closed. The gate is skipped in that case, not
  // widened — a live-market feed that goes quiet still gets caught.
  const age = ageSeconds(metrics.dataTimestamp, now);
  const marketClosed = input.marketClosed === true;
  const fresh = age <= config.maxDataAgeSeconds || marketClosed;
  checks.push({
    name: "Data freshness",
    passed: fresh,
    detail: marketClosed
      ? `Market is closed; running on the most recent available data, from ${formatAge(age)} ago.`
      : `Newest print is ${formatAge(age)} old (limit ${formatAge(config.maxDataAgeSeconds)}).`,
  });
  if (!fresh) {
    return bail(
      "stale_data",
      `The most recent price for this symbol is ${formatAge(age)} old, so nothing is being called on it.`,
      metrics,
    );
  }

  // `minSessionVolume` is a share count, and a crypto pair's volume is
  // denominated in coins — a fraction to a few hundred BTC in a session is
  // routine and would fail a 50,000-share floor every time despite the pair
  // being one of the most liquid instruments in this list. The average daily
  // *dollar* turnover floor below (`meetsLiquidityFloor`, crypto branch)
  // already does this gate's job in units that mean something for a coin, so
  // this check is skipped for crypto rather than converted — converting it
  // would just duplicate that gate with a second, differently-tuned dollar
  // threshold.
  const volumeUnit = input.kind === "crypto" ? "coins" : "shares";
  const liquid = input.kind === "crypto" || metrics.cumulativeVolume >= config.minSessionVolume;
  checks.push({
    name: "Liquidity",
    passed: liquid,
    detail:
      input.kind === "crypto"
        ? `${formatVolume(metrics.cumulativeVolume, volumeUnit)} traded today; session-volume floor is skipped for crypto (see the tradeable-instrument check below).`
        : `${formatVolume(metrics.cumulativeVolume, volumeUnit)} traded today (minimum ${formatVolume(config.minSessionVolume, volumeUnit)}).`,
  });
  if (!liquid) {
    return bail(
      "filtered",
      "Too little has traded today for a move here to mean much, so it was skipped.",
      metrics,
    );
  }

  // The platform-wide floor, on top of the session-volume gate above: today's
  // turnover says whether this session is active, the floor says whether the
  // instrument is one to put in front of a user at all. Applied here so a
  // sub-$5, thinly-traded name cannot alert out of the intraday scan while the
  // daily scan and Guided Mode both refuse it — see lib/scan/liquidity.ts.
  //
  // `avgDailyVolume` is optional on the input: the API route always supplies it
  // from the daily bars it already fetches, but a caller that has not measured
  // it (fixtures, an embedder with minute bars only) is judged on price alone
  // rather than being failed for a number nobody asked them for.
  const floorAssetClass = input.kind === "crypto" ? ("crypto" as const) : ("us_equity" as const);
  const avgVolume = input.avgDailyVolume ?? null;
  const floor = meetsLiquidityFloor(
    {
      price: metrics.last,
      avgVolume: avgVolume ?? Number.POSITIVE_INFINITY,
      avgDollarVolume: avgVolume != null ? avgVolume * metrics.last : Number.POSITIVE_INFINITY,
    },
    floorAssetClass,
  );
  checks.push({
    name: "Tradeable instrument",
    passed: floor.ok,
    detail: floor.ok
      ? avgVolume != null
        ? `Trades at ${priceText(metrics.last)} on ${formatVolume(avgVolume, volumeUnit)} a day.`
        : `Trades at ${priceText(metrics.last)}; no daily-volume history was supplied, so only the price floor was applied.`
      : floor.reason!,
  });
  if (!floor.ok) {
    return bail("filtered", floor.reason!, metrics);
  }

  // The day's move, against the reference that exists. Prior close is the
  // primary basis; without one (a newly listed name, or a feed that didn't
  // return yesterday) the session open is used and the alert says so.
  const dayMove =
    (input.prevClose != null
      ? measureMove(metrics.last, input.prevClose, "prior_close")
      : null) ?? measureMove(metrics.last, metrics.sessionOpen, "session_open");

  if (!dayMove) {
    checks.push({ name: "Reference price", passed: false, detail: "No usable reference price." });
    return bail("insufficient_data", "No reference price to measure today's move against.", metrics);
  }
  checks.push({
    name: "Reference price",
    passed: true,
    detail: `Measured from ${MOVE_BASIS_LABELS[dayMove.basis]} at ${priceText(dayMove.reference)}.`,
  });

  const candidates = [
    detectOldLevelCross(input, metrics, dayMove, config, checks, now),
    detectTrendContinuation(input, metrics, dayMove, config, checks, now),
    detectSpaceOverbalance(input, metrics, dayMove, config, checks, now),
    detectOvernightTurn(input, metrics, dayMove, checks, now),
    detectHourlyTurn(input, metrics, checks, now),
    detectPlanLevelHeld(input, metrics, checks, now),
    detectEntryApproach(input, metrics, checks, now),
    detectReversalRisk(input, metrics, dayMove, config, checks, now),
  ].filter((a): a is Alert => a !== null);

  if (candidates.length === 0) {
    return bail(
      "no_signal",
      "Evaluated with current data; nothing crossed a detection threshold.",
      metrics,
    );
  }

  // Suppression runs last so the audit shows what *would* have fired. A signal
  // silenced by a cooldown is not the same as a signal that never qualified,
  // and collapsing the two is how a scanner appears to have missed a move it
  // actually caught thirty minutes earlier.
  //
  // A signal inside its cooldown still qualifies, so it stays on screen with
  // the time it first fired (`held`); only the repeat notice is held back.
  const kept: Alert[] = [];
  const held: Alert[] = [];
  for (const alert of candidates) {
    // A notice is a live reading, not stored (the route keeps it out of the
    // alert tables): an approach carries a new time left each scan, and
    // delivery dedupes both kinds on its own, so neither is held back here.
    const suppressedUntil = NOTICE_SIGNALS.has(alert.type) ? null : cooldownUntil(input, alert, config);
    if (suppressedUntil && suppressedUntil > now) {
      const firstFlaggedAt = firstFlaggedWithin(input, alert, config, now);
      checks.push({
        name: `${SIGNAL_LABELS[alert.type]} repeat held`,
        passed: false,
        detail: `Still qualifies; first flagged ${firstFlaggedAt ?? "earlier"}. Shown, not re-sent, until ${suppressedUntil.toISOString()}.`,
      });
      held.push({ ...alert, firstFlaggedAt });
      continue;
    }
    kept.push(alert);
  }

  if (kept.length === 0) {
    return {
      ...bail(
        "suppressed",
        "A signal still qualifies; it was first flagged earlier, so it is shown again without a new notice until its cooldown ends.",
        metrics,
      ),
      held,
    };
  }

  return {
    alerts: kept,
    held,
    audit: {
      symbol: input.symbol,
      kind: input.kind,
      outcome: "alerted",
      reason: `${kept.length} signal${kept.length === 1 ? "" : "s"} qualified.`,
      checks,
      dataTimestamp: metrics.dataTimestamp,
      dataAgeSeconds: age,
      metrics,
    },
  };
}

/** ---- Detectors --------------------------------------------------------- */

/**
 * Gann's buying and selling point at the session's scale: a bar has closed
 * beyond yesterday's high (low) by one intraday point. Old tops crossed become
 * support, so the alert is invalidated if price falls back a point under the
 * crossed level (NSTD p. 20: a crossed top "should not react back 3 points
 * under it"). Replaces the 15-minute opening-range break (2026-10-16).
 */
function detectOldLevelCross(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  if (m.priorHigh === null || m.priorLow === null || !(m.point > 0)) {
    checks.push({
      name: "Old top or bottom crossed",
      passed: false,
      detail: "No prior session or no range history, so there is no old top or bottom to measure a cross against.",
    });
    return null;
  }

  const crossedUp = m.lastClose > m.priorHigh + m.point;
  const crossedDown = m.lastClose < m.priorLow - m.point;
  if (!crossedUp && !crossedDown) {
    checks.push({
      name: "Old top or bottom crossed",
      passed: false,
      detail: `No bar has closed beyond yesterday's range (${priceText(m.priorLow)}–${priceText(m.priorHigh)}) by the allowance of ${priceText(m.point)}.`,
    });
    return null;
  }

  const direction: Direction = crossedUp ? "up" : "down";
  const level = crossedUp ? m.priorHigh : m.priorLow;
  const move = measureMove(m.lastClose, level, "prior_session");
  if (!move) return null;

  const volumeConfirmed =
    m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold;
  checks.push({
    name: "Old top or bottom crossed",
    passed: true,
    detail: `Closed ${priceText(Math.abs(move.absolute))} ${direction === "up" ? "above yesterday's high" : "below yesterday's low"} at ${priceText(level)}; relative volume ${formatRvol(m.relativeVolume)}.`,
  });

  const factors: ConfidenceFactor[] = [
    {
      label: direction === "up" ? "Yesterday's high crossed on a close" : "Yesterday's low broken on a close",
      passed: true,
      detail: `The last bar closed at ${priceText(m.lastClose)}, beyond ${priceText(level)} by more than the allowance of ${priceText(m.point)}.`,
    },
    {
      label: "Volume confirms",
      passed: volumeConfirmed,
      detail:
        m.relativeVolume === null
          ? "No volume baseline for this symbol, so the cross is unconfirmed."
          : `${formatRvol(m.relativeVolume)} of the volume this symbol normally has by now.`,
    },
    swingFactor(m, direction),
    ...hourlyFactors(m, direction),
    midpointFactor(m, direction),
    dayDirectionFactor(dayMove, direction),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "old_level_cross",
    direction,
    move,
    factors,
    invalidation: direction === "up" ? level - m.point : level + m.point,
    whyThisAppeared: `${input.symbol} closed ${direction === "up" ? "above yesterday's high" : "below yesterday's low"} at ${priceText(level)}, by more than the method's allowance. An old top that is crossed tends to become a floor, and an old bottom that is broken tends to become a ceiling, so the level that would say this is wrong is a close back ${direction === "up" ? "under" : "over"} it by the same allowance — ${volumeConfirmed ? "and the extra volume behind it says the move has participation" : "though volume has not confirmed it, which makes the cross less reliable"}.`,
  });
}

/**
 * The trend is still working: Gann's 3-bar swing chart on the session's bars
 * runs this way (it turns only when the last swing extreme breaks), and price
 * holds that side of the day's 50% point. Replaces "beyond the opening range
 * with higher highs and lows over six bars" (2026-10-16).
 */
function detectTrendContinuation(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  const direction = m.swingTrend;
  if (direction === null) {
    checks.push({
      name: "Trend continuation",
      passed: false,
      detail: "The swing chart on today's bars has not completed a swing yet, so it has no trend to continue.",
    });
    return null;
  }
  const beyondMidpoint = direction === "up" ? m.last > m.midpoint : m.last < m.midpoint;
  const volumeSustained =
    m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold;

  checks.push({
    name: "Trend continuation",
    passed: beyondMidpoint,
    detail: beyondMidpoint
      ? `The swing chart is ${direction === "up" ? "up" : "down"} and price is on that side of the day's 50% point.`
      : `The swing chart is ${direction === "up" ? "up" : "down"}, but price is not ${direction === "up" ? "above" : "below"} the day's 50% point (${priceText(m.midpoint)}).`,
  });
  if (!beyondMidpoint) return null;

  const move = measureMove(m.last, m.midpoint, "midpoint");
  if (!move) return null;

  const factors: ConfidenceFactor[] = [
    swingFactor(m, direction),
    ...hourlyFactors(m, direction),
    { label: "On the right side of the day's 50% point", passed: true, detail: `The middle of today's range is ${priceText(m.midpoint)}.` },
    {
      label: direction === "up" ? "Above yesterday's high" : "Below yesterday's low",
      passed:
        direction === "up"
          ? m.priorHigh !== null && m.lastClose > m.priorHigh
          : m.priorLow !== null && m.lastClose < m.priorLow,
      detail:
        m.priorHigh === null || m.priorLow === null
          ? "No prior session to compare with."
          : `Yesterday's range was ${priceText(m.priorLow)}–${priceText(m.priorHigh)}.`,
    },
    {
      label: "Volume sustained",
      passed: volumeSustained,
      detail:
        m.relativeVolume === null
          ? "No volume baseline available."
          : `${formatRvol(m.relativeVolume)} of normal for this time of day.`,
    },
    dayDirectionFactor(dayMove, direction),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "trend_continuation",
    direction,
    move,
    factors,
    invalidation: m.midpoint,
    whyThisAppeared: `${input.symbol}'s swing chart on today's bars is ${direction === "up" ? "up: it has crossed its last swing top" : "down: it has broken its last swing bottom"}, and price is ${direction === "up" ? "above" : "below"} the middle of today's range. In this method the trend stands until the last swing extreme breaks. It is not a promise that it continues — the level that would say otherwise is that halfway point, at ${priceText(m.midpoint)}.`,
  });
}

/**
 * Gann's over-balance of space: today's move against the daily campaign's
 * trend has made the current reaction larger than the greatest reaction since
 * the campaign began, which in his rules means the trend has changed or soon
 * will. Read by `buildCampaignLedger`, the module the daily trend verdict
 * uses, over the prior daily bars plus today's session as the newest bar.
 * Replaces "moved more than 1.5 daily ATRs" (2026-10-16).
 */
function detectSpaceOverbalance(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  const ledger = sessionCampaign(input, m);
  if (!ledger || !ledger.greatestCounterMove) {
    checks.push({
      name: "Largest pullback of the trend",
      passed: false,
      detail: "Not enough daily history to read the campaign and its greatest reaction.",
    });
    return null;
  }
  const against: Direction = ledger.trend === "bullish" ? "down" : "up";
  // In points, as the ledger reads it (Gann's "a decline in points", Master
  // Course Ch. 8, PDF 249; 2026-10-21). The alert is for the reaction in
  // progress, the session that made the difference: a completed reaction's
  // over-balance that still stands (`overbalance.standing`) was alerted on
  // the day it happened, so it does not alert again here.
  const current = ledger.currentCounterMove?.points ?? 0;
  const currentPct = ledger.currentCounterMove?.pct ?? 0;
  const greatest = ledger.greatestCounterMove.points;
  const inProgress = ledger.currentCounterMove !== null && current > greatest;
  const qualifies = inProgress && dayMove.direction === against;
  checks.push({
    name: "Largest pullback of the trend",
    passed: qualifies,
    detail: `The ${ledger.trend} campaign's current reaction is ${priceText(current)} points (${currentPct.toFixed(1)}%) against its greatest of ${priceText(greatest)} points${qualifies ? ", and today's move made the difference" : ""}.`,
  });
  if (!qualifies) return null;

  const factors: ConfidenceFactor[] = [
    {
      label: "Greatest reaction of the campaign exceeded",
      passed: true,
      detail: `${priceText(current)} points (${currentPct.toFixed(1)}%) against the trend, more than any reaction since the campaign began on ${ledger.campaignStartDate.slice(0, 10)} (largest ${priceText(greatest)} points).`,
    },
    {
      label: "Volume supports it",
      passed: m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold,
      detail:
        m.relativeVolume === null
          ? "No volume baseline available."
          : `${formatRvol(m.relativeVolume)} of normal for this time of day.`,
    },
    {
      label: "Longest pullback in time too",
      passed: ledger.timeOverbalanced,
      detail: "The reaction has also run longer than any before it in this campaign.",
    },
    midpointFactor(m, against),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "space_overbalance",
    direction: against,
    move: dayMove,
    factors,
    invalidation: m.midpoint,
    whyThisAppeared: `${input.symbol} has been in a ${ledger.trend === "bullish" ? "rising" : "falling"} campaign, and today's move ${against === "down" ? "down" : "up"} has made the current reaction (${priceText(current)} points) larger than any reaction since it began (${priceText(greatest)} points). A pullback larger than any before it often means the trend has changed or soon will. It is a warning about the old trend, not by itself an entry the other way.`,
  });
}

/**
 * Gann's Overnight Chart turning on today's session (*Master Stock Market
 * Course* Ch. 3, pp. 68-71; Q29, owner 2026-10-16, "Switch all nine": the
 * volume-only alert this replaced had no Gann source). The chart is read on the
 * daily bars with today's session as the newest bar. A turn up is a higher
 * bottom after the line was down; a turn down is a low that breaks the prior
 * day's bottom by ¼ point. The stop is 1 point beyond the last Overnight bottom
 * (top), the method's own stop (`lib/gann/overnightChart.ts`).
 */
function detectOvernightTurn(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  const daily = input.priorDailyBars;
  if (!daily || daily.length < 3) {
    checks.push({ name: "Daily swing at the lows", passed: false, detail: "Not enough daily history to read the daily swing." });
    return null;
  }
  const today: Bar = { t: m.dataTimestamp, o: m.sessionOpen, h: m.high, l: m.low, c: m.last, v: m.cumulativeVolume };
  const r = readOvernightChart([...daily, today]);
  if (!r || !r.turnedToday) {
    checks.push({
      name: "Daily swing at the lows",
      passed: false,
      detail: r ? `The daily swing at the lows is ${r.line} and did not turn today.` : "The daily swing at the lows has not turned yet.",
    });
    return null;
  }
  const direction: Direction = r.line;
  const stop = direction === "up" ? r.longStop : r.shortStop;
  const anchor = direction === "up" ? r.lastBottom : r.lastTop;
  const cause =
    direction === "up"
      ? `Today's low held above yesterday's bottom: the daily swing turned up${anchor !== null ? ` from its last bottom at ${priceText(anchor)}` : ""}.`
      : `Today's low broke yesterday's bottom clearly: the daily swing turned down${anchor !== null ? ` from its last top at ${priceText(anchor)}` : ""}.`;
  checks.push({ name: "Daily swing at the lows", passed: true, detail: cause });
  const factors: ConfidenceFactor[] = [
    { label: "The daily swing turned today", passed: true, detail: cause },
    midpointFactor(m, direction),
    ...hourlyFactors(m, direction),
    dayDirectionFactor(dayMove, direction),
  ];
  return buildAlert({
    now,
    input,
    metrics: m,
    type: "overnight_turn",
    direction,
    move: dayMove,
    factors,
    invalidation: stop ?? m.midpoint,
    whyThisAppeared: `${cause} The method trades with the line and keeps its stop just beyond the last swing ${direction === "up" ? "bottom" : "top"}${stop !== null ? `, ${priceText(stop)}` : ""}; when that stop is caught the line has reversed.`,
  });
}

/**
 * The first change in trend on Gann's hourly chart (*Master Stock Market
 * Course* Ch. 13: in very active markets an hourly chart shows the first
 * change in trend; Q29). Fires only on the hour the chart turned. The stop is
 * the session's 50% point, the intraday alerts' Gann invalidation.
 */
function detectHourlyTurn(input: SymbolInput, m: SessionMetrics, checks: AuditCheck[], now: Date): Alert | null {
  if (!m.hourly || !m.hourly.turned || !m.hourly.trend) {
    checks.push({
      name: "Hourly chart",
      passed: false,
      detail: !m.hourly ? "Not enough hourly history to read the hourly chart." : "The hourly chart did not change trend on the latest hour.",
    });
    return null;
  }
  const direction = m.hourly.trend;
  const move = measureMove(m.last, m.midpoint, "midpoint");
  if (!move) return null;
  const cause = `The hourly swing chart turned ${direction} on the latest hour: the first change in trend.`;
  checks.push({ name: "Hourly chart", passed: true, detail: cause });
  const factors: ConfidenceFactor[] = [
    { label: "The hourly chart turned", passed: true, detail: cause },
    midpointFactor(m, direction),
    swingFactor(m, direction),
  ];
  return buildAlert({
    now,
    input,
    metrics: m,
    type: "hourly_turn",
    direction,
    move,
    factors,
    invalidation: m.midpoint,
    whyThisAppeared: `${cause} In a very active market the hourly chart shows a change before the daily chart does. A close back through the day's 50% point at ${priceText(m.midpoint)} undoes it.`,
  });
}

/**
 * The daily plan entered on the session's chart: Gann's intraday use, the
 * main trend's plan timed on the shortest chart (2026-10-21, project owner: an
 * intraday plan for a symbol whose daily plan filled in the first 45 minutes).
 *
 * The rule, from Gann's text:
 * - Buy on the reaction back to the planned level (a crossed old top "nearly
 *   always" holds the first time, *Truth of the Stock Tape*; the reaction buy,
 *   *New Stock Trend Detector* p. 20), and act on a definite turn on a closed
 *   bar, never ahead of it ("don't try to get ahead of the market", *Master
 *   Stock Market Course* Ch. 8 p. 251). In very active markets the shortest
 *   chart shows the turn first (*Master Course* Ch. 13, the hourly chart).
 *   So: price has traded into the plan's entry this session (within one
 *   intraday point), the session's 3-bar swing chart runs the plan's way, and
 *   the last bar closed back beyond the entry.
 * - The stop at entry is the daily plan's own (W006 Rule 3, pp. 46-47): the
 *   intraday chart times the entry, the daily rule places the stop. Once
 *   filled, the trade's style moves it (Fast trails 3 points under each
 *   completed day's low, `readGannExit`'s "day_low"; #411, 2026-10-21). Not
 *   a stop under the session swing or today's low: the six-year intraday
 *   replay (2026-10-21) lost all of its expectancy on stops that tight, and
 *   the review of #405 found a day stop at entry misreads Rule 3.
 * - The targets are the daily plan's TP1 and MTP: "the big money in the
 *   markets is made on the long swings and not by day to day trading"
 *   (*Annual Forecasts 1919-1922* p. 24).
 * - Missed it? The next higher bottom is the next buying point while the plan
 *   stands (re-buy on the reaction, *Tunnel Thru the Air* p. 198): the alert
 *   fires again on a later higher bottom once the cooldown clears, with the
 *   daily plan's stop.
 * Not fired when the plan's stop broke this session (the plan is retired,
 * `lib/gann/stopBreach.ts`) or price is already at the plan's TP1.
 *
 * Three-question basis: 1. Gann, as cited (Tier A; the *Master Course* is read
 * in `docs/memory-bank/sources/`). 2. No periodicity claim; Dewey does not
 * apply. 3. Correspondence: one plan read at two scales, the daily chart for
 * what and where, the session's chart for when. Law of Creation: daily plan ⊗
 * session turn creates the third neither holds alone, an entry with the daily
 * targets and a session-sized risk.
 */
function detectPlanLevelHeld(input: SymbolInput, m: SessionMetrics, checks: AuditCheck[], now: Date): Alert | null {
  const plan = input.dailyPlan;
  const name = "Daily plan's level";
  if (!plan) {
    checks.push({ name, passed: false, detail: "No standing daily plan for this symbol." });
    return null;
  }
  const up = plan.direction === "up";
  const broke = up ? m.low <= plan.stop : m.high >= plan.stop;
  if (broke) {
    checks.push({ name, passed: false, detail: `The daily plan's stop (${priceText(plan.stop)}) traded this session, so the plan is retired.` });
    return null;
  }
  // A reaction comes back to the level from the plan's side: the prior
  // session closed at or beyond the entry, and today traded back to it. A
  // crossing's entry is the reaction buy 1 point past the old top (bottom),
  // and the crossing is made by a daily close 3 points past it (W006 Rule
  // 3(b)-(c), pp. 46-47; NSTD p. 20). With price still under the entry, the
  // crossing is not made, and Gann's buy is never the first intraday bar
  // through it ("don't try to get ahead of the market", Master Course Ch. 8
  // p. 251). Until 2026-10-22 the touch test passed all session on such a
  // plan, so the alert bought the first poke into resistance as a held level
  // (run 80 measured the signal losing,
  // replay-diagnosis/2026-10-22-intraday-alerts-replay.md). A held bottom's
  // entry is the prior close itself, so the prior close may equal it.
  // A crossing closed past the entry but not yet 3 points past the level is
  // not made either: the stored plan says so (`awaitsCrossing`, carried from
  // `GannEntryTrigger.held` since 2026-10-22). A plan stored before then
  // carries no flag and is read on the prior close alone.
  if (plan.awaitsCrossing === true) {
    checks.push({
      name,
      passed: false,
      detail: `The daily plan's crossing is not made yet: it waits on a daily close clearly past the level, and the reaction to ${priceText(plan.entry)} is bought after that.`,
    });
    return null;
  }
  const prev = input.prevClose;
  const fromPlanSide = prev != null && (up ? prev >= plan.entry : prev <= plan.entry);
  if (!fromPlanSide) {
    checks.push({
      name,
      passed: false,
      detail:
        prev == null
          ? "No prior close to read, so a reaction to the plan's entry cannot be told from a first crossing."
          : `The prior session closed ${up ? "under" : "over"} the plan's entry (${priceText(plan.entry)}), so there is no reaction to it yet: the level is crossed on a daily close first.`,
    });
    return null;
  }
  const touched = up ? m.low <= plan.entry + m.point : m.high >= plan.entry - m.point;
  if (!touched) {
    checks.push({
      name,
      passed: false,
      detail: `Price has not reacted to the plan's entry (${priceText(plan.entry)}) this session; the session's ${up ? "low" : "high"} is ${priceText(up ? m.low : m.high)}.`,
    });
    return null;
  }
  if (plan.tp1 != null && (up ? m.last >= plan.tp1 : m.last <= plan.tp1)) {
    checks.push({ name, passed: false, detail: `Price is already at the plan's first target (${priceText(plan.tp1)}).` });
    return null;
  }
  const turned = m.swingTrend === plan.direction && (up ? m.lastClose > plan.entry : m.lastClose < plan.entry);
  if (!turned) {
    checks.push({
      name,
      passed: false,
      detail: `Price reacted to the plan's entry (${priceText(plan.entry)}), but the session's swing chart has not turned ${plan.direction} with a close back ${up ? "above" : "below"} it yet.`,
    });
    return null;
  }

  // The reaction's extreme: the latest completed swing bottom (top), or the
  // session's own low (high) before one completes.
  const pivots = m.sessionPivots.filter((p) => p.kind === (up ? "bottom" : "top"));
  const extreme = pivots.length > 0 ? pivots[pivots.length - 1].price : up ? m.low : m.high;
  const allowance = m.point > 0 ? m.point : m.intradayAtr;
  // The stop at entry is the daily plan's own (Rule 3), the same stop the
  // Swing and Fast styles open on (#411); the style trails it after the fill.
  const stop = plan.stop;
  const entry = m.lastClose;
  const rebuy = up ? extreme > m.low + allowance : extreme < m.high - allowance;
  const cause = rebuy
    ? `${input.symbol} reacted to its daily plan's entry at ${priceText(plan.entry)} earlier, and has now made a ${up ? "higher bottom" : "lower top"} at ${priceText(extreme)} and turned ${plan.direction} again: the next buying point while the plan stands.`
    : `${input.symbol} reacted to its daily plan's entry at ${priceText(plan.entry)}, held, and the session's swing chart turned ${plan.direction} with a close back ${up ? "above" : "below"} it.`;
  checks.push({ name, passed: true, detail: cause });

  // Measured from the closed bar, as the plan's entry and its pays-the-risk
  // test are: Gann's rules act on a close, not an intraday poke.
  const move = measureMove(entry, plan.entry, "plan_entry");
  if (!move) return null;
  const factors: ConfidenceFactor[] = [
    {
      label: "The daily plan's level held",
      passed: true,
      detail: `Daily plan (${plan.verdict}): entry ${priceText(plan.entry)}, stop ${priceText(plan.stop)}.`,
    },
    {
      label: "The daily verdict is Execute",
      passed: plan.verdict === "Execute",
      detail: plan.verdict === "Execute" ? "The daily scan reads this plan Execute." : "The daily scan reads this plan Watch, not Execute.",
    },
    swingFactor(m, plan.direction),
    ...hourlyFactors(m, plan.direction),
    midpointFactor(m, plan.direction),
  ];
  const sessionPlan: TradePlan = {
    confirmation: `Done: a bar closed back ${up ? "above" : "below"} the plan's entry after the reaction. Enter near ${priceText(entry)}; don't chase a bar that has run away from the stop.`,
    invalidation: stop,
    firstTarget: plan.tp1,
    masterTarget: plan.mtp,
    paysRisk: targetPaysRisk(entry, stop, plan.tp1),
    cancelIf: `The daily plan's stop at ${priceText(stop)} trades.`,
  };
  return buildAlert({
    now,
    input,
    metrics: m,
    type: "plan_level_held",
    direction: plan.direction,
    move,
    factors,
    invalidation: stop,
    plan: sessionPlan,
    whyThisAppeared: `${cause} The stop is the daily plan's own, at ${priceText(stop)}, and your trade style moves it once filled; the targets stay the daily plan's${plan.tp1 != null ? `, ${priceText(plan.tp1)}` : ""}${plan.mtp != null ? ` and ${priceText(plan.mtp)}` : ""}, because the money is made on the swing, not the day.`,
  });
}

/**
 * Price nearing, or at, a standing daily plan's entry: the notice that lets a
 * person sign in and open the plan before price gets there (owner,
 * 2026-10-28). No order rests at a fixed price: "never limit your orders or
 * fix a buying or selling price. Trade at the market" (never-failing rule 9,
 * *Commodities* pp. 43-45, p. 19). Once a closed bar trades into the plan's
 * buy zone, its entry goes at the market (`gannBuyZone`, `confirmEntry`); the
 * session only says how soon that is likely (`lib/scanner/entryApproach.ts`,
 * his angle: price covered per bar since the reaction's top).
 *
 * The same plans `plan_level_held` times, on the same gates: the stop has not
 * traded, the crossing is made (`awaitsCrossing` not true), and the prior
 * session closed on the plan's side of the entry, so price comes back to it as
 * a reaction. A first crossing from the far side is not bought intraday (W006
 * Rule 3(b)-(c)), so it gets no notice either.
 *
 * - `entry_approach`: not yet traded to the entry; at the reaction's pace it
 *   arrives within `APPROACH_LEAD_MAX_MINUTES` plus one scan. Push reads the
 *   time left against each member's lead.
 * - `entry_reached`: the latest bar traded to the entry (within the session's
 *   unit) and the stop held. Once it turns back the plan's way,
 *   `plan_level_held` reads it.
 * A stock's notices are read in the regular session only, and an approach
 * only when it would arrive before the close. Neither is stored or held by the
 * cooldown; the bell and push dedupe them.
 *
 * Notices, not trades (`NOTICE_SIGNALS`): no session entry, stop or target of
 * their own. They carry the daily plan's levels, and the action they offer is
 * the plan itself. Unmeasured: nothing replays a notice.
 */
function detectEntryApproach(input: SymbolInput, m: SessionMetrics, checks: AuditCheck[], now: Date): Alert | null {
  const plan = input.dailyPlan;
  const name = "Nearing the plan's entry";
  if (!plan) return null;
  const up = plan.direction === "up";
  if (up ? m.low <= plan.stop : m.high >= plan.stop) return null;
  if (plan.awaitsCrossing === true) return null;
  const prev = input.prevClose;
  if (prev == null || !(up ? prev >= plan.entry : prev <= plan.entry)) return null;
  // A stock's notice is for the regular session only: after the close the
  // pace is read off bars that ended at 4 PM, and no regular bar can reach the
  // entry until the next session (review, 2026-10-28).
  const regularOnly = input.kind !== "crypto";
  if (regularOnly && (equitySession(now) !== "regular" || etParts(now).minutes >= sessionCloseMinute(now))) {
    checks.push({ name, passed: false, detail: "Outside the regular session, so nothing is timed." });
    return null;
  }
  const bars = input.bars.filter(isUsableBar).filter((b) => !regularOnly || isRegularSession(new Date(b.t)));
  if (bars.length === 0) return null;
  const lastBar = bars[bars.length - 1];
  const unit = m.point > 0 ? m.point : 0;
  const dataAge = ageSeconds(m.dataTimestamp, now);
  const reachedNow = up ? lastBar.l <= plan.entry + unit : lastBar.h >= plan.entry - unit;
  const tradedThrough = up ? m.low <= plan.entry + unit : m.high >= plan.entry - unit;

  const factors: ConfidenceFactor[] = [
    {
      label: "The daily verdict is Execute",
      passed: plan.verdict === "Execute",
      detail: plan.verdict === "Execute" ? "The daily scan reads this plan Execute." : "The daily scan reads this plan Watch, not Execute.",
    },
  ];
  const levels: TradePlan = {
    confirmation: `Once a bar closes back at the plan's entry, ${priceText(plan.entry)}, the plan's entry goes at the market. Open the plan to be ready before price gets there.`,
    entry: plan.entry,
    invalidation: plan.stop,
    firstTarget: plan.tp1,
    masterTarget: plan.mtp,
    paysRisk: targetPaysRisk(plan.entry, plan.stop, plan.tp1),
    cancelIf: `The daily plan's stop at ${priceText(plan.stop)} trades.`,
  };
  const move = measureMove(m.last, plan.entry, "plan_entry");
  if (!move) return null;

  // On delayed data the panel says what the data showed and when, never that
  // price is there now (NOTIFY-FRESHNESS-001's wording, the same on the panel).
  const delayedFeed = (input.feed ?? (input.kind === "crypto" ? "realtime" : "delayed")) !== "realtime";
  const asOfClock = etClock(m.dataTimestamp);
  if (reachedNow) {
    checks.push({ name, passed: true, detail: `The latest bar traded to the plan's entry (${priceText(plan.entry)}) and the stop held.` });
    return buildAlert({
      now,
      input,
      metrics: m,
      type: "entry_reached",
      direction: plan.direction,
      move,
      factors,
      invalidation: plan.stop,
      plan: {
        ...levels,
        confirmation: delayedFeed
          ? `Price traded to the plan's entry, ${priceText(plan.entry)}, in data through ${asOfClock} ET. The data is delayed, so where price is now has not been verified. Once a bar closes there, the plan's entry goes at the market.`
          : `Price is at the plan's entry, ${priceText(plan.entry)}. Once a bar closes there, the plan's entry goes at the market.`,
      },
      whyThisAppeared: `${input.symbol} has come back to its daily plan's entry at ${priceText(plan.entry)} and has not traded the stop at ${priceText(plan.stop)}.`,
    });
  }
  if (tradedThrough) {
    // Touched earlier and moved off: the reaction is under way, and
    // `plan_level_held` reads the turn back the plan's way.
    checks.push({ name, passed: false, detail: `Price traded to the plan's entry earlier this session; the turn back is read by "${SIGNAL_LABELS.plan_level_held}".` });
    return null;
  }

  const pivots = walkSwingChart(bars, SWING_BARS).pivots.filter((p) => p.kind === (up ? "top" : "bottom"));
  const reading = readEntryApproach({
    bars,
    intervalMinutes: input.barIntervalMinutes,
    direction: plan.direction,
    entry: plan.entry,
    unit,
    pivotIndex: pivots.length > 0 ? pivots[pivots.length - 1].index : -1,
    dataAgeSeconds: input.marketClosed === true ? 0 : dataAge,
    now,
  });
  if (!reading) {
    checks.push({ name, passed: false, detail: `Price is not moving toward the plan's entry (${priceText(plan.entry)}) right now.` });
    return null;
  }
  const window = APPROACH_LEAD_MAX_MINUTES + SCAN_CADENCE_MINUTES;
  if (regularOnly && etParts(new Date(reading.expectedAt)).minutes >= sessionCloseMinute(now)) {
    checks.push({ name, passed: false, detail: `At the current pace the plan's entry (${priceText(plan.entry)}) would not be reached before the close.` });
    return null;
  }
  if (input.marketClosed === true || reading.etaMinutes > window) {
    checks.push({
      name,
      passed: false,
      detail:
        input.marketClosed === true
          ? "The market is closed, so there is no pace to read."
          : `At the current pace the plan's entry (${priceText(plan.entry)}) is about ${Math.round(reading.etaMinutes)} minutes away, more than ${window}.`,
    });
    return null;
  }

  const fast = reading.unitsPerBar != null && reading.unitsPerBar >= 1;
  factors.push({
    label: "Moving quickly toward the entry",
    passed: fast,
    detail: `${priceText(reading.ratePerBar)} a ${input.barIntervalMinutes}-minute bar since the ${up ? "high" : "low"} of ${priceText(reading.extreme)}.`,
  });
  const minutes = Math.round(reading.etaMinutes);
  const when = delayedFeed
    ? `estimated from data through ${asOfClock} ET, when price was moving toward it; an estimate from delayed observations, not a live arrival time`
    : minutes <= 0
      ? "it may be there already"
      : `about ${minutes} minute${minutes === 1 ? "" : "s"} away, around ${etClock(reading.expectedAt)} ET`;
  checks.push({ name, passed: true, detail: `The plan's entry is ${when}.` });
  return buildAlert({
    now,
    input,
    metrics: m,
    type: "entry_approach",
    direction: plan.direction,
    move,
    factors,
    invalidation: plan.stop,
    plan: levels,
    approach: {
      entry: plan.entry,
      distance: reading.distance,
      ratePerBar: reading.ratePerBar,
      etaMinutes: reading.etaMinutes,
      expectedAt: reading.expectedAt,
    },
    whyThisAppeared: `${input.symbol} is ${priceText(reading.distance)} ${up ? "above" : "below"} its daily plan's entry at ${priceText(plan.entry)} and has moved ${up ? "down" : "up"} about ${priceText(reading.ratePerBar)} a ${input.barIntervalMinutes}-minute bar since its ${up ? "high" : "low"} of ${priceText(reading.extreme)}. The entry is ${when}. The pace can change; this is a heads-up, not a fill. Open the plan to be ready: once a bar closes at the entry, its entry goes at the market, with its stop at ${priceText(plan.stop)}.`,
  });
}

/** The regular session's close in New York minutes: 1 PM on an early close, else 4 PM. */
function sessionCloseMinute(now: Date): number {
  return isEarlyClose(etDateKey(now)) ? 13 * 60 : REGULAR_CLOSE_MINUTE;
}

/** "10:42 AM" in New York time. */
function etClock(iso: string): string {
  const { minutes } = etParts(new Date(iso));
  const h = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

function detectReversalRisk(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  // Gann's false break: the session crossed yesterday's high (low) and has
  // closed back a point inside it (NSTD p. 20). The move people entered on has
  // been given back.
  const levels = m.priorHigh !== null && m.priorLow !== null && m.point > 0;
  const failedUp = levels && m.high > m.priorHigh! && m.lastClose < m.priorHigh! - m.point;
  const failedDown = levels && m.low < m.priorLow! && m.lastClose > m.priorLow! + m.point;
  // A 50% rejection: the day ran one way but price has lost the middle of its range.
  const lostMidpoint =
    (dayMove.direction === "up" && m.last < m.midpoint) ||
    (dayMove.direction === "down" && m.last > m.midpoint);

  if (!failedUp && !failedDown && !lostMidpoint) {
    checks.push({
      name: "Reversal risk",
      passed: false,
      detail: "No failed cross of yesterday's high or low, and price is still on its side of the day's 50% point.",
    });
    return null;
  }

  // The risk points against the move that was running.
  const direction: Direction = failedUp ? "down" : failedDown ? "up" : dayMove.direction === "up" ? "down" : "up";
  const move = measureMove(m.last, m.midpoint, "midpoint");
  if (!move) return null;

  const cause = failedUp
    ? `Price traded up through yesterday's high at ${priceText(m.priorHigh!)} and has closed back below it by more than the allowance.`
    : failedDown
      ? `Price traded down through yesterday's low at ${priceText(m.priorLow!)} and has closed back above it by more than the allowance.`
      : `The day was ${dayMove.direction === "up" ? "up" : "down"} but price has crossed back through the middle of today's range at ${priceText(m.midpoint)}.`;

  checks.push({ name: "Reversal risk", passed: true, detail: cause });

  const factors: ConfidenceFactor[] = [
    { label: "Cross failed or the 50% point lost", passed: true, detail: cause },
    {
      label: "Volume behind the reversal",
      passed: m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold,
      detail:
        m.relativeVolume === null
          ? "No volume baseline available."
          : `${formatRvol(m.relativeVolume)} of normal for this time of day.`,
    },
    swingFactor(m, direction),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "reversal_risk",
    direction,
    move,
    factors,
    invalidation: failedUp ? m.high : failedDown ? m.low : m.midpoint,
    whyThisAppeared: `${cause} A move that gets given back like this is the most common way a breakout turns into a loss. The useful response is usually to stand aside rather than to flip: a failed move in one direction is not, on its own, a signal in the other.`,
  });
}

/** ---- Shared factors ---------------------------------------------------- */

function swingFactor(m: SessionMetrics, direction: Direction): ConfidenceFactor {
  return {
    label: "Today's swing chart agrees",
    passed: m.swingTrend === direction,
    detail:
      m.swingTrend === null
        ? "The 3-bar swing chart on today's bars has not turned yet."
        : `The 3-bar swing chart on today's bars is ${m.swingTrend}.`,
  };
}

/** Gann's hourly chart, when there is enough history to read it. */
function hourlyFactors(m: SessionMetrics, direction: Direction): ConfidenceFactor[] {
  if (!m.hourly) return [];
  return [
    {
      label: "The hourly chart agrees",
      passed: m.hourly.trend === direction,
      detail:
        m.hourly.trend === null
          ? "The hourly swing chart has no trend yet."
          : `The hourly swing chart is ${m.hourly.trend}${m.hourly.turned ? ", and turned on the latest hour: the first change in trend" : ""}.`,
    },
  ];
}

/** The daily 3-Day Chart's trend, when there is enough daily history to read it. */
function dailyTrendFactors(m: SessionMetrics, direction: Direction): ConfidenceFactor[] {
  if (m.dailyTrend === null) return [];
  return [
    {
      label: "With the daily trend",
      passed: m.dailyTrend === direction,
      detail: `The daily swing trend is ${m.dailyTrend}${m.dailyTrend === direction ? "" : ": this alert runs against it"}.`,
    },
  ];
}

/**
 * The daily campaign ledger with today's session as the newest bar, so a
 * reaction that is happening now counts. Null without enough daily history.
 */
export function sessionCampaign(input: SymbolInput, m: SessionMetrics) {
  const daily = input.priorDailyBars;
  if (!daily || daily.length < 10) return null;
  const today: Bar = { t: m.dataTimestamp, o: m.sessionOpen, h: m.high, l: m.low, c: m.last, v: m.cumulativeVolume };
  return buildCampaignLedger([...daily, today]);
}

function midpointFactor(m: SessionMetrics, direction: Direction): ConfidenceFactor {
  const onside = direction === "up" ? m.last > m.midpoint : m.last < m.midpoint;
  return {
    label: "Price on the right side of the day's 50% point",
    passed: onside,
    detail: `Last ${priceText(m.last)} against the day's 50% point ${priceText(m.midpoint)}.`,
  };
}

function dayDirectionFactor(dayMove: Move, direction: Direction): ConfidenceFactor {
  const agrees = dayMove.direction === direction;
  return {
    label: "Agrees with the day's direction",
    passed: agrees,
    detail: `Day is ${dayMove.percent >= 0 ? "+" : ""}${dayMove.percent.toFixed(2)}% from ${MOVE_BASIS_LABELS[dayMove.basis]}.`,
  };
}

/** ---- Alert assembly ---------------------------------------------------- */

function buildAlert(args: {
  now: Date;
  input: SymbolInput;
  metrics: SessionMetrics;
  type: SignalType;
  direction: Direction;
  move: Move;
  factors: ConfidenceFactor[];
  invalidation: number | null;
  /** The continuation plan, when the detector prices its own (`plan_level_held`). */
  plan?: TradePlan;
  approach?: Alert["approach"];
  whyThisAppeared: string;
}): Alert {
  const { now, input, metrics: m, type, direction, move, invalidation } = args;
  // Every trade alert is read against the daily trend: "never buck the trend"
  // (never-failing rule 5, *Commodities* pp. 43-45). A reversal-risk alert is a
  // warning to stand aside, not a trade, so it carries no such check.
  const factors = type === "reversal_risk" ? args.factors : [...args.factors, ...dailyTrendFactors(m, direction)];

  const confidence = scoreConfidence(factors);
  const dataAge = ageSeconds(m.dataTimestamp, now);
  const againstDailyTrend =
    type !== "reversal_risk" &&
    type !== "plan_level_held" &&
    !NOTICE_SIGNALS.has(type) &&
    m.dailyTrend !== null &&
    m.dailyTrend !== direction;

  return {
    symbol: input.symbol,
    kind: input.kind,
    type,
    direction,
    triggerTime: now.toISOString(),
    dataTimestamp: m.dataTimestamp,
    dataAgeSeconds: dataAge,
    move,
    midpoint: m.midpoint,
    relativeVolume: m.relativeVolume,
    sessionVolume: m.cumulativeVolume,
    confidence,
    confidenceFactors: factors,
    invalidation,
    continuationPlan: args.plan ?? continuationPlan(m, direction, invalidation, input.prevClose, input.dailyAtr),
    pivotPlan: pivotPlan(m, direction, invalidation),
    whyThisAppeared: args.whyThisAppeared,
    whyNotEarlier: explainLateness(dataAge, type, input.marketClosed === true),
    ...(args.approach ? { approach: args.approach } : {}),
    ...(againstDailyTrend ? { againstDailyTrend: true } : {}),
    timeliness: alertTimeliness(input, m, type, direction, now),
  };
}

/**
 * The alert's timing provenance. Actionable only when the market is open,
 * the data's delay is under a bar of the session's chart (`decisionLag`), and
 * the data was usable when the scan ran. Under the 15-minute equity delay on
 * minute bars the lag is 15 bars, so a stock's alert is never actionable
 * while the delay stands: it is an observation, not an instruction.
 */
export function alertTimeliness(
  input: SymbolInput,
  m: Pick<SessionMetrics, "dataTimestamp">,
  type: SignalType,
  direction: Direction,
  now: Date,
): AlertTimeliness {
  const delayMs = input.feedDelayMs ?? (input.kind === "crypto" ? 0 : 15 * 60_000);
  const a = availability(m.dataTimestamp, delayMs, input.receivedAt ?? null);
  const timeframe = timeframeForMinutes(input.barIntervalMinutes) ?? "1Min";
  const marketOpen = input.marketClosed !== true;
  const lag = decisionLag(timeframe, delayMs, marketOpen);
  const usable = usableBy(a, now);
  const age = observationAgeMs(m.dataTimestamp, now);
  const plan = input.dailyPlan;
  const planKey = plan ? `${plan.direction}:${plan.verdict}:${plan.entry}:${plan.stop}` : null;
  // The quote may be newer than the bars; the structure is as old as its last
  // bar. A decision is acted on only while no newer bar was usable that it did
  // not read (`newerBarUsable`), so a fresh quote never launders stale bars.
  const lastBar = input.bars[input.bars.length - 1];
  const structureAsOf = lastBar ? sessionBarClose(lastBar, input) : null;
  // Judged at the fetch (receipt) clock where recorded: bars complete when
  // fetched are not demoted by a scan that runs a few seconds past a boundary.
  const fetchedAt = input.receivedAt && Number.isFinite(Date.parse(input.receivedAt)) ? new Date(input.receivedAt) : now;
  const structureCurrent =
    structureAsOf != null && !newerBarUsable(structureAsOf, input.barIntervalMinutes, delayMs, fetchedAt < now ? fetchedAt : now);
  const actionable = marketOpen && usable && structureCurrent && !lag.holdsExecute && input.feed === "realtime";
  return {
    feed: input.feed ?? "unknown",
    delayMs,
    dataAsOf: m.dataTimestamp,
    usableAt: a ? a.usableAt.toISOString() : m.dataTimestamp,
    receivedAt: input.receivedAt ?? null,
    evaluatedAt: now.toISOString(),
    dataAgeSeconds: age == null ? null : Math.round(age / 1000),
    heldForDelay: lag.holdsExecute,
    actionable,
    authorizationId: actionable ? `${input.symbol}:${type}:${direction}:${planKey ?? "session"}:${now.toISOString()}` : null,
    planKey,
    barMinutes: input.barIntervalMinutes,
    structureAsOf,
  };
}

/**
 * The share of the alert's checks that passed, out of 100. Every factor is
 * returned alongside the number so a user can see what produced it.
 *
 * Each check counts the same (audit I-01, 2026-10-28): the factors had
 * unequal weights (15 to 35 points) that no source gives, and Gann ranks none
 * of his conditions above another (AGENTS.md, "The scorecard's role"), so a
 * weight here would be a ranking claim he never made.
 */
export function scoreConfidence(factors: ConfidenceFactor[]): number {
  if (factors.length === 0) return 0;
  const met = factors.filter((f) => f.passed).length;
  return Math.round((met / factors.length) * 100);
}

/**
 * The first target of an intraday continuation: the nearest old top (for a move
 * up) or old bottom (for a move down) beyond the price the move had reached, or
 * a round number just short of one. Null when there is none: no target is fixed,
 * and the stop trails instead.
 *
 * It replaces "twice the distance to the stop" (2026-09-30, owner: "everything
 * must align with Gann"). That was a multiple of the risk, a number with no
 * source in his method; the intraday scanner was the one component that failed
 * the Gann-grounded standard (docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md,
 * Part 3.4).
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann, Tier A. Sell at old tops and buy at old bottoms: they are where the
 *    market has turned before, and a crossed top becomes the floor (*New Stock
 *    Trend Detector*, p. 13: "old tops become bottoms"). Even figures attract
 *    orders, so markets turn just short of them (*How to Make Profits in
 *    Commodities* p. 19; `lib/gann/evenFigures.ts`, the same rule the daily
 *    plans use for equity targets). And "never fix a target price" (*Truth of
 *    the Stock Tape*, owner decision X4): where the market has no old top ahead
 *    of it, the method names no target and the stop follows the move.
 * 2. Cycles: no periodicity claim, so Dewey's checklist does not apply.
 * 3. Hermetic: Polarity. A level is the place where buyers and sellers have
 *    met before, and the target is the far pole of the move the alert describes.
 *    Correspondence: the same rule the daily plan prices from, read on the
 *    session's own tops and bottoms.
 *
 * Engineering choices, labelled as such (Gann gives the rule, not these
 * magnitudes at intraday scale): a level must sit at least one intraday ATR
 * beyond the price to count, since anything nearer is inside the noise a real
 * move has to clear (`SessionMetrics.intradayAtr`); and a round number counts
 * only within one daily ATR of the price (2% of it when the daily ATR is not
 * known, `APPROACH_WINDOW_PCT`), because one farther off is not a *first*
 * target. The old tops and bottoms read are the session's own extreme, the
 * prior close and `oldLevels` (`gannOldLevels`: the session's completed
 * swings, the prior session's high and low, and the 3-Day Chart's swings on
 * the daily bars). Until 2026-10-16 only the first two were read, which left
 * many alerts with no target where an old level did lie ahead.
 *
 * The target must pay more than the risk (2026-10-21, the daily plan's rule
 * carried to the session's scale): "profits must exceed losses" (*Wall Street
 * Stock Selector* Ch. II), never risk 3-5 points to make 3-5, and no trade
 * whose first target is no farther than its risk (M-K5). Given `risk`, the
 * target is the nearest candidate that pays more than it; with none, the
 * nearest stays and the plan says it does not pay (`targetPaysRisk`). Every
 * SPY alert on 2026-10-21 named a first target nearer than its stop (0.30
 * against 2.64 at 1:45 PM), because the nearest level was taken whatever it paid.
 *
 * Old levels within 1% of each other are one resistance point, averaged before
 * the target is read (M-P4, 2026-10-22; *Commodities*, "resistance points near
 * same levels"; `lib/gann/nearbyLevels.ts`), the daily plan's rule: there the
 * S/R levels are averaged and the even figures kept apart, and so here. The
 * intraday replays call this function, so they read the same targets.
 */
export function gannFirstTarget(input: {
  direction: Direction;
  last: number;
  sessionHigh: number;
  sessionLow: number;
  prevClose: number | null;
  dailyAtr: number | null;
  intradayAtr: number;
  /** Old tops and bottoms from `gannOldLevels`; only those beyond the price count. */
  oldLevels?: number[];
  /** Distance from the entry to the stop; when given, the first level that pays more than it is taken. */
  risk?: number | null;
}): number | null {
  const { direction, last, sessionHigh, sessionLow, prevClose, dailyAtr, intradayAtr, oldLevels = [], risk = null } = input;
  const up = direction === "up";
  const floor = Math.max(0, intradayAtr);
  const beyond = (p: number) => (up ? p - last : last - p) >= floor && (up ? p > last : p < last);

  const window = dailyAtr != null && dailyAtr > 0 ? dailyAtr : last * (APPROACH_WINDOW_PCT / 100);
  const limit = up ? last + window : last - window;
  // M-P4: old levels within 1% of each other are one resistance point, averaged
  // before the target is read, as the daily plan averages its levels and keeps
  // the even figures apart (`lib/strat/levels.ts`, `combineNearbyLevels`).
  const structural = combineNearbyLevels(
    [up ? sessionHigh : sessionLow, ...(prevClose != null && prevClose > 0 ? [prevClose] : []), ...oldLevels].filter(
      (p) => Number.isFinite(p) && beyond(p),
    ),
  );
  const candidates = [...structural, ...targetCandidates(last, limit, up ? "bullish" : "bearish")].filter(
    (p) => Number.isFinite(p) && beyond(p),
  );

  if (candidates.length === 0) return null;
  const nearestOf = (ps: number[]) => ps.reduce((nearest, p) => (Math.abs(p - last) < Math.abs(nearest - last) ? p : nearest));
  const paying = risk != null && risk > 0 ? candidates.filter((p) => Math.abs(p - last) > risk) : [];
  return nearestOf(paying.length > 0 ? paying : candidates);
}

/**
 * The master target (MTP) of a session alert: the next old top or bottom, or
 * round number just short of one, beyond the first target (owner, 2026-10-22:
 * "Include a mtp for intraday trades"). The daily plan's rule read at the
 * session's scale (`lib/strat/levels.ts`, "the next level beyond TP1, so the
 * two are not the same resistance"): Gann's next resistance after the first
 * (*Truth of the Stock Tape*; W006 pp.19-24, a level is resistance above price
 * and support below it). It is where the move is measured to, never an order:
 * nothing sells there (Q14, "never fix a target price"), so the trade still
 * exits on the session's stop, the hourly turn or the close, as the daily plan's
 * MTP sells nothing either.
 *
 * Engineering choices, labelled as such: the master must lie at least one
 * intraday ATR beyond the first target (the first target's own floor, so the
 * two are different levels), and a round number counts within two daily ATRs
 * of the price (the first target's window doubled), since a session rarely
 * travels farther. Null with no first target, or with no level beyond it.
 */
export function gannMasterTarget(input: {
  direction: Direction;
  last: number;
  firstTarget: number | null;
  sessionHigh: number;
  sessionLow: number;
  prevClose: number | null;
  dailyAtr: number | null;
  intradayAtr: number;
  oldLevels?: number[];
}): number | null {
  const { direction, last, firstTarget, sessionHigh, sessionLow, prevClose, dailyAtr, intradayAtr, oldLevels = [] } = input;
  if (firstTarget == null || !Number.isFinite(firstTarget)) return null;
  const up = direction === "up";
  const floor = Math.max(0, intradayAtr);
  const beyond = (p: number) => (up ? p - firstTarget : firstTarget - p) >= floor && (up ? p > firstTarget : p < firstTarget);
  const window = 2 * (dailyAtr != null && dailyAtr > 0 ? dailyAtr : last * (APPROACH_WINDOW_PCT / 100));
  const limit = up ? last + window : last - window;
  // M-P4: the same averaged resistance points the first target is read from
  // (the levels beyond the price by an intraday ATR, within 1% averaged into
  // one), so the master is never a level already averaged into TP1.
  const pastPrice = (p: number) => (up ? p - last : last - p) >= floor && (up ? p > last : p < last);
  const structural = combineNearbyLevels(
    [up ? sessionHigh : sessionLow, ...(prevClose != null && prevClose > 0 ? [prevClose] : []), ...oldLevels].filter(
      (p) => Number.isFinite(p) && pastPrice(p),
    ),
  );
  const candidates = [...structural, ...targetCandidates(firstTarget, limit, up ? "bullish" : "bearish")].filter(
    (p) => Number.isFinite(p) && beyond(p),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((nearest, p) => (Math.abs(p - firstTarget) < Math.abs(nearest - firstTarget) ? p : nearest));
}

/**
 * Whether a first target pays more than the risk taken to reach it (M-K5;
 * *Wall Street Stock Selector* Ch. II, "profits must exceed losses"). Null when
 * either is missing: no fixed target (the stop trails) or no stop to measure.
 */
export function targetPaysRisk(entry: number, stop: number | null, target: number | null): boolean | null {
  if (stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  return Math.abs(target - entry) > risk;
}

function continuationPlan(
  m: SessionMetrics,
  direction: Direction,
  invalidation: number | null,
  prevClose: number | null,
  dailyAtr: number | null,
): TradePlan {
  const target = gannFirstTarget({
    direction,
    last: m.last,
    sessionHigh: m.high,
    sessionLow: m.low,
    prevClose,
    dailyAtr,
    intradayAtr: m.intradayAtr,
    oldLevels: m.oldLevels,
    risk: invalidation != null ? Math.abs(m.last - invalidation) : null,
  });
  const masterTarget = gannMasterTarget({
    direction,
    last: m.last,
    firstTarget: target,
    sessionHigh: m.high,
    sessionLow: m.low,
    prevClose,
    dailyAtr,
    intradayAtr: m.intradayAtr,
    oldLevels: m.oldLevels,
  });
  // Rounded to the places the price needs (F-02); a master that rounds onto
  // or inside TP1 (an intraday ATR of 0 on a sub-dollar pair) is no second level.
  const roundedMaster =
    masterTarget != null && target != null &&
    (direction === "up" ? roundPrice(masterTarget) > roundPrice(target) : roundPrice(masterTarget) < roundPrice(target))
      ? roundPrice(masterTarget)
      : null;
  return {
    confirmation: `Wait for a bar to close ${direction === "up" ? "above" : "below"} ${priceText(m.last)} rather than entering into the move. Chasing an extended price is how a good read becomes a bad fill.`,
    invalidation,
    firstTarget: target,
    paysRisk: targetPaysRisk(m.last, invalidation, target),
    masterTarget: roundedMaster,
    cancelIf: `Price closes back ${direction === "up" ? "below" : "above"} the day's 50% point at ${priceText(m.midpoint)}, or the move stalls without a new ${direction === "up" ? "high" : "low"} for several bars.`,
  };
}

/**
 * The opposite-direction plan. Deliberately harder to satisfy than the
 * continuation plan: catching a reversal requires more evidence than following
 * a move, and the honest answer for most of these is "no trade".
 */
function pivotPlan(m: SessionMetrics, direction: Direction, invalidation: number | null): TradePlan {
  const opposite: Direction = direction === "up" ? "down" : "up";
  return {
    confirmation: `The continuation thesis fails if price closes back ${direction === "up" ? "below" : "above"} ${invalidation != null ? priceText(invalidation) : priceText(m.midpoint)}. Even then, a ${opposite === "up" ? "long" : "short"} needs its own evidence: a close through the day's 50% point in the new direction and a failure to reclaim the level that broke.`,
    invalidation: direction === "up" ? m.high : m.low,
    firstTarget: m.midpoint,
    cancelIf: `Price chops around the day's 50% point without holding either side, or volume drops off. Neither direction is worth trading in that state — standing aside is a position.`,
  };
}

/**
 * The "why did this only appear now" answer.
 *
 * Two honest reasons dominate, and both are properties of the data rather than
 * of the thresholds: Gann's rules act on a closed bar, so a cross is reported
 * only once a bar has closed beyond the level, and a delayed feed means every
 * evaluation is running against prices that are already minutes old.
 */
function explainLateness(dataAge: number, type: SignalType, marketClosed: boolean): string | null {
  const reasons: string[] = [];
  if (marketClosed) {
    reasons.push(
      `the market is closed right now, so this confirms the most recent session's move rather than something happening live`,
    );
  } else if (dataAge > 60) {
    reasons.push(
      `the price feed for this symbol runs about ${formatAge(dataAge)} behind, so every check is made against a print that has already happened`,
    );
  }
  if (type === "old_level_cross" || type === "trend_continuation") {
    reasons.push(
      "the rules act on a close, so a cross or a swing only counts once a bar has closed beyond the level",
    );
  }
  if (reasons.length === 0) return null;
  return `This is reported now rather than earlier because ${reasons.join(", and ")}.`;
}

/** ---- Suppression ------------------------------------------------------- */

/**
 * When a repeat of this exact signal stops being suppressed.
 *
 * Keyed on symbol + type + direction, so a reversal-risk alert is never
 * silenced by an earlier momentum alert on the same name — they say opposite
 * things and the second one is the one that matters.
 */
export function cooldownUntil(
  input: SymbolInput,
  alert: Pick<Alert, "type" | "direction">,
  config: ScannerConfig,
): Date | null {
  const previous = (input.lastAlerts ?? []).filter(
    (a) => a.type === alert.type && a.direction === alert.direction,
  );
  if (previous.length === 0) return null;

  const latest = previous.reduce((max, a) => {
    const t = Date.parse(a.at);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, -Infinity);
  if (latest === -Infinity) return null;

  return new Date(latest + config.cooldownMinutes * 60_000);
}

/**
 * When this signal first fired in the run of alerts its cooldown belongs to:
 * the earliest prior alert of the same type and direction from which each
 * later one came inside the cooldown, so a signal that has held for an hour
 * reads as first flagged an hour ago, not at its latest repeat.
 */
export function firstFlaggedWithin(
  input: SymbolInput,
  alert: Pick<Alert, "type" | "direction">,
  config: ScannerConfig,
  now: Date,
): string | null {
  const times = (input.lastAlerts ?? [])
    .filter((a) => a.type === alert.type && a.direction === alert.direction)
    .map((a) => Date.parse(a.at))
    .filter((t) => !Number.isNaN(t) && t <= now.getTime())
    .sort((a, b) => b - a);
  if (times.length === 0) return null;
  const gap = config.cooldownMinutes * 60_000;
  let first = times[0];
  for (const t of times.slice(1)) {
    if (first - t > gap) break;
    first = t;
  }
  return new Date(first).toISOString();
}

/** ---- Volume baseline --------------------------------------------------- */

/**
 * Average cumulative volume by this time of day, over recent sessions.
 *
 * Relative volume only means something against a same-time-of-day baseline. A
 * whole-day average would make every symbol look quiet at 10:00 and busy at
 * 15:55, which turns the filter into a clock rather than a measure of
 * participation — and a clock that suppresses every morning alert is one way a
 * scanner ends up silent through the exact window a move happens in.
 *
 * Bars are grouped by Eastern calendar date, today is excluded, and each prior
 * session contributes the volume it had traded by `throughEtMinute`.
 *
 * Returns null rather than a number when fewer than two prior sessions are
 * available: a baseline drawn from one day is noise, and callers must be able
 * to tell "unavailable" from "normal".
 *
 * `regularOnly` (equities): only regular-session bars count, as in the
 * numerator (`sessionMetrics` sums the session from the open). The feed's
 * pre-market prints are not part of the auction the session measures, and
 * counting them in the baseline alone read every equity's relative volume low
 * (found 2026-10-21 by the PR #408 review).
 */
export function volumeBaseline(
  bars: Bar[],
  throughEtMinute: number,
  todayEtDate: string,
  minSessions = 2,
  regularOnly = false,
): number | null {
  const bySession = new Map<string, number>();

  for (const bar of bars) {
    if (!isUsableBar(bar)) continue;
    const at = new Date(bar.t);
    if (regularOnly && !isRegularSession(at)) continue;
    const date = etDateKey(at);
    if (date === todayEtDate) continue;
    if (etParts(at).minutes > throughEtMinute) continue;
    bySession.set(date, (bySession.get(date) ?? 0) + bar.v);
  }

  const sessions = [...bySession.values()].filter((v) => v > 0);
  if (sessions.length < minSessions) return null;
  return sessions.reduce((s, v) => s + v, 0) / sessions.length;
}

/**
 * `YYYY-MM-DD` in America/New_York — the key a trading session groups under.
 * Re-exported from the module that owns Eastern-time reasoning so the daily
 * scan and the intraday scan cannot drift on what day it is.
 */
export { etDateKey };

/** Bars belonging to the given Eastern calendar date, oldest first. */
export function barsForSession(bars: Bar[], etDate: string): Bar[] {
  return bars
    .filter((b) => !Number.isNaN(Date.parse(b.t)) && etDateKey(new Date(b.t)) === etDate)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/**
 * Calendar days of daily history the intraday scan reads per symbol: a year,
 * so the campaign ledger behind the over-balance-of-space alert can find the
 * weekly trend's start, the same year of daily bars the daily scan reads
 * (2026-10-16). The ATR and the liquidity floor still read only their own
 * trailing windows of it. The route fetches it, and the alert replay
 * (`lib/backtest/replayIntradayAlerts.ts`) windows each session to it.
 */
export const INTRADAY_DAILY_HISTORY_DAYS = 400;

/** ---- Formatting helpers ------------------------------------------------ */

function ageSeconds(timestamp: string, now: Date): number {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, Math.round((now.getTime() - t) / 1000));
}

// The display labels live in `intradayDisplay.ts` so the alerts panel can read
// them without bundling this scanner (review finding R-033).
export { ASSET_KIND_LABELS, MOVE_BASIS_LABELS, NOTICE_SIGNALS, SIGNAL_DESCRIPTIONS, SIGNAL_LABELS, formatAge, formatRvol, formatVolume };
