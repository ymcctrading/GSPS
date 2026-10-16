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

import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { etDateKey, etParts } from "@/lib/market/session";
import { meetsLiquidityFloor } from "@/lib/scan/liquidity";
import { MAG7 } from "@/lib/sectors";
import { APPROACH_WINDOW_PCT, targetCandidates } from "@/lib/gann/evenFigures";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { intradayPoint } from "@/lib/gann/pointScale";
import { walkSwingChart } from "@/lib/gann/swingChart";

/** ---- Configuration ----------------------------------------------------- */

export type SignalType =
  | "old_level_cross"
  | "trend_continuation"
  | "space_overbalance"
  | "unusual_volume"
  | "reversal_risk";

export type Direction = "up" | "down";

/** What a move is measured against. Always stated; never left to inference. */
export type MoveBasis = "prior_close" | "session_open" | "prior_session" | "midpoint";

export type AssetKind = "equity" | "etf" | "index" | "crypto";

export interface ScannerConfig {
  /** Cumulative volume vs. the same-time-of-day baseline to count as elevated. */
  relativeVolumeThreshold: number;
  /** Unusual-volume alerting threshold, which is stricter than confirmation. */
  unusualVolumeThreshold: number;
  /** Minimum move, in percent, before any directional signal is considered. */
  minMovePct: number;
  /** Seconds after which the newest bar is too old to alert on. */
  maxDataAgeSeconds: number;
  /** Minutes a symbol+signal+direction stays suppressed after alerting. */
  cooldownMinutes: number;
  /** Minimum cumulative share volume for the session. */
  minSessionVolume: number;
}

export const DEFAULT_CONFIG: ScannerConfig = {
  relativeVolumeThreshold: 1.2,
  unusualVolumeThreshold: 2,
  minMovePct: 0.5,
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

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  equity: "Stock",
  etf: "ETF",
  index: "Index",
  crypto: "Crypto",
};

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
  /** The 3-bar swing chart's trend on the session's bars; null before a swing completes. */
  swingTrend: Direction | null;
  /**
   * The same swing chart on hourly bars over recent sessions, and whether its
   * trend turned on the latest hour (Gann's "first change in trend"). Null
   * without enough history.
   */
  hourly: { trend: Direction | null; turned: boolean } | null;
  /** ATR of the intraday bars — the noise floor a real move has to clear. */
  intradayAtr: number;
  /** Null when no baseline was available. Never defaulted to 1. */
  relativeVolume: number | null;
  /** Timestamp of the newest bar. */
  dataTimestamp: string;
  barCount: number;
}

/** Fewest hourly bars the hourly chart is read from. */
export const MIN_HOURLY_BARS = 10;

const toDirection = (d: "bullish" | "bearish" | null): Direction | null =>
  d === "bullish" ? "up" : d === "bearish" ? "down" : null;

/**
 * The 3-bar swing chart on hourly bars rolled up from `recentBars`, the same
 * hourly chart the intraday replay trades on (`lib/backtest/replayIntraday.ts`).
 * Hours are bucketed by the bar's UTC hour, as there.
 */
export function hourlyChart(
  input: Pick<SymbolInput, "recentBars">,
  asOf: string,
  regularOnly: boolean,
): { trend: Direction | null; turned: boolean } | null {
  const recent = (input.recentBars ?? [])
    .filter(isUsableBar)
    .filter((b) => b.t <= asOf && (!regularOnly || isRegularSession(new Date(b.t))));
  const hours: Bar[] = [];
  let key = "";
  for (const b of recent) {
    const k = b.t.slice(0, 13);
    const cur = hours[hours.length - 1];
    if (k !== key || !cur) {
      hours.push({ ...b });
      key = k;
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
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
  const swing = walkSwingChart(bars, SWING_BARS).trend;
  const hourly = hourlyChart(input, bars[bars.length - 1].t, regularOnly);

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
    swingTrend: swing === "bullish" ? "up" : swing === "bearish" ? "down" : null,
    hourly,
    intradayAtr,
    relativeVolume:
      input.volumeBaseline && input.volumeBaseline > 0
        ? cumulativeVolume / input.volumeBaseline
        : null,
    dataTimestamp: input.quote?.at ?? bars[bars.length - 1].t,
    barCount: bars.length,
  };
}

/** Gann's 3-bar swing chart, read on the session's own bars (`lib/gann/swingChart.ts`). */
const SWING_BARS = 3;

/** The newest usable completed daily bar, or null. */
function lastPriorBar(daily: Bar[] | undefined): Bar | null {
  if (!daily) return null;
  for (let i = daily.length - 1; i >= 0; i--) if (isUsableBar(daily[i])) return daily[i];
  return null;
}

/** 09:30 and 16:00 ET, as minutes since midnight. */
const REGULAR_OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTE = 16 * 60;

/** True when a bar printed inside the US equity regular session. */
function isRegularSession(at: Date): boolean {
  const { minutes } = etParts(at);
  return minutes >= REGULAR_OPEN_MINUTE && minutes < REGULAR_CLOSE_MINUTE;
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

export const MOVE_BASIS_LABELS: Record<MoveBasis, string> = {
  prior_close: "yesterday's close",
  session_open: "today's open",
  prior_session: "the prior session's high or low",
  midpoint: "the middle of today's range",
};

/** ---- Alerts ------------------------------------------------------------ */

export interface ConfidenceFactor {
  label: string;
  passed: boolean;
  /** Points contributed. Negative factors subtract. */
  weight: number;
  detail: string;
}

export interface TradePlan {
  /** What has to happen before the plan is live. */
  confirmation: string;
  /** The price that says the thesis is wrong. */
  invalidation: number | null;
  /**
   * First place to take something off: the nearest old top or bottom, or a
   * round number just short of one (`gannFirstTarget`). Null when the method
   * names none and the stop trails the move instead.
   */
  firstTarget: number | null;
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
}

export const SIGNAL_LABELS: Record<SignalType, string> = {
  old_level_cross: "Old top or bottom crossed",
  trend_continuation: "Trend continuation",
  space_overbalance: "Over-balance of space",
  unusual_volume: "Unusual volume",
  reversal_risk: "Reversal risk",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalType, string> = {
  old_level_cross:
    "A bar closed beyond yesterday's high or low by the method's allowance. An old top that is crossed tends to become support, and an old bottom that is broken tends to become resistance.",
  trend_continuation:
    "The swing chart on today's bars is running one way, and price is on that side of the middle of the day's range.",
  space_overbalance:
    "Today's move against the trend is bigger than any pullback since the trend began. In this method that says the trend has changed or soon will.",
  unusual_volume:
    "Far more shares have traded by this point in the day than is normal for this symbol, whichever way price ends up going.",
  reversal_risk:
    "A cross of yesterday's high or low failed, or price lost the middle of the day's range. The move that was running may be ending — a reason to stand aside, not a reason to trade the other way on its own.",
};

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
}

/** ---- The scan ---------------------------------------------------------- */

export function scanIntraday(
  inputs: SymbolInput[],
  config: ScannerConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): ScanOutput {
  const alerts: Alert[] = [];
  const audit: SymbolAudit[] = [];
  const staleSymbols: string[] = [];

  for (const input of inputs) {
    const result = scanSymbol(input, config, now);
    audit.push(result.audit);
    alerts.push(...result.alerts);
    if (result.audit.outcome === "stale_data") staleSymbols.push(input.symbol);
  }

  // Strongest first, so a page that shows five rows shows the five that matter.
  alerts.sort((a, b) => b.confidence - a.confidence || a.symbol.localeCompare(b.symbol));

  return { scannedAt: now.toISOString(), alerts, audit, config, staleSymbols };
}

interface SymbolResult {
  alerts: Alert[];
  audit: SymbolAudit;
}

function scanSymbol(input: SymbolInput, config: ScannerConfig, now: Date): SymbolResult {
  const checks: AuditCheck[] = [];
  const bail = (outcome: AuditOutcome, reason: string, metrics: SessionMetrics | null = null): SymbolResult => ({
    alerts: [],
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
        ? `Trades at ${metrics.last.toFixed(2)} on ${formatVolume(avgVolume, volumeUnit)} a day.`
        : `Trades at ${metrics.last.toFixed(2)}; no daily-volume history was supplied, so only the price floor was applied.`
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
    detail: `Measured from ${MOVE_BASIS_LABELS[dayMove.basis]} at ${dayMove.reference.toFixed(2)}.`,
  });

  const candidates = [
    detectOldLevelCross(input, metrics, dayMove, config, checks, now),
    detectTrendContinuation(input, metrics, dayMove, config, checks, now),
    detectSpaceOverbalance(input, metrics, dayMove, config, checks, now),
    detectUnusualVolume(input, metrics, dayMove, config, checks, now),
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
  const kept: Alert[] = [];
  for (const alert of candidates) {
    const suppressedUntil = cooldownUntil(input, alert, config);
    if (suppressedUntil && suppressedUntil > now) {
      checks.push({
        name: `${SIGNAL_LABELS[alert.type]} suppression`,
        passed: false,
        detail: `Already alerted on this symbol and direction; suppressed until ${suppressedUntil.toISOString()}.`,
      });
      continue;
    }
    kept.push(alert);
  }

  if (kept.length === 0) {
    return bail(
      "suppressed",
      "A signal qualified, but this symbol already alerted recently and is inside its cooldown.",
      metrics,
    );
  }

  return {
    alerts: kept,
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
      detail: `No bar has closed beyond yesterday's range (${m.priorLow.toFixed(2)}–${m.priorHigh.toFixed(2)}) by the allowance of ${m.point.toFixed(2)}.`,
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
    detail: `Closed ${Math.abs(move.absolute).toFixed(2)} ${direction === "up" ? "above yesterday's high" : "below yesterday's low"} at ${level.toFixed(2)}; relative volume ${formatRvol(m.relativeVolume)}.`,
  });

  const factors: ConfidenceFactor[] = [
    {
      label: direction === "up" ? "Yesterday's high crossed on a close" : "Yesterday's low broken on a close",
      passed: true,
      weight: 30,
      detail: `The last bar closed at ${m.lastClose.toFixed(2)}, beyond ${level.toFixed(2)} by more than the allowance of ${m.point.toFixed(2)}.`,
    },
    {
      label: "Volume confirms",
      passed: volumeConfirmed,
      weight: 25,
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
    whyThisAppeared: `${input.symbol} closed ${direction === "up" ? "above yesterday's high" : "below yesterday's low"} at ${level.toFixed(2)}, by more than the method's allowance. An old top that is crossed tends to become a floor, and an old bottom that is broken tends to become a ceiling, so the level that would say this is wrong is a close back ${direction === "up" ? "under" : "over"} it by the same allowance — ${volumeConfirmed ? "and the extra volume behind it says the move has participation" : "though volume has not confirmed it, which makes the cross less reliable"}.`,
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
      : `The swing chart is ${direction === "up" ? "up" : "down"}, but price is not ${direction === "up" ? "above" : "below"} the day's 50% point (${m.midpoint.toFixed(2)}).`,
  });
  if (!beyondMidpoint) return null;

  const move = measureMove(m.last, m.midpoint, "midpoint");
  if (!move) return null;

  const factors: ConfidenceFactor[] = [
    { ...swingFactor(m, direction), weight: 30 },
    ...hourlyFactors(m, direction),
    { label: "On the right side of the day's 50% point", passed: true, weight: 20, detail: `The middle of today's range is ${m.midpoint.toFixed(2)}.` },
    {
      label: direction === "up" ? "Above yesterday's high" : "Below yesterday's low",
      passed:
        direction === "up"
          ? m.priorHigh !== null && m.lastClose > m.priorHigh
          : m.priorLow !== null && m.lastClose < m.priorLow,
      weight: 15,
      detail:
        m.priorHigh === null || m.priorLow === null
          ? "No prior session to compare with."
          : `Yesterday's range was ${m.priorLow.toFixed(2)}–${m.priorHigh.toFixed(2)}.`,
    },
    {
      label: "Volume sustained",
      passed: volumeSustained,
      weight: 20,
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
    whyThisAppeared: `${input.symbol}'s swing chart on today's bars is ${direction === "up" ? "up: it has crossed its last swing top" : "down: it has broken its last swing bottom"}, and price is ${direction === "up" ? "above" : "below"} the middle of today's range. In this method the trend stands until the last swing extreme breaks. It is not a promise that it continues — the level that would say otherwise is that halfway point, at ${m.midpoint.toFixed(2)}.`,
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
      name: "Over-balance of space",
      passed: false,
      detail: "Not enough daily history to read the campaign and its greatest reaction.",
    });
    return null;
  }
  const against: Direction = ledger.trend === "bullish" ? "down" : "up";
  const current = ledger.currentCounterMove?.pct ?? 0;
  const greatest = ledger.greatestCounterMove.pct;
  const qualifies = ledger.spaceOverbalanced && dayMove.direction === against;
  checks.push({
    name: "Over-balance of space",
    passed: qualifies,
    detail: `The ${ledger.trend} campaign's current reaction is ${current.toFixed(1)}% against its greatest of ${greatest.toFixed(1)}%${qualifies ? ", and today's move made the difference" : ""}.`,
  });
  if (!qualifies) return null;

  const factors: ConfidenceFactor[] = [
    {
      label: "Greatest reaction of the campaign exceeded",
      passed: true,
      weight: 35,
      detail: `${current.toFixed(1)}% against the trend, more than any reaction since the campaign began on ${ledger.campaignStartDate.slice(0, 10)} (largest ${greatest.toFixed(1)}%).`,
    },
    {
      label: "Volume supports it",
      passed: m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold,
      weight: 25,
      detail:
        m.relativeVolume === null
          ? "No volume baseline available."
          : `${formatRvol(m.relativeVolume)} of normal for this time of day.`,
    },
    {
      label: "Over-balance of time too",
      passed: ledger.timeOverbalanced,
      weight: 15,
      detail: "Time ranks ahead of price here: a reaction that has also run longer than any before it carries more weight.",
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
    whyThisAppeared: `${input.symbol} has been in a ${ledger.trend === "bullish" ? "rising" : "falling"} campaign, and today's move ${against === "down" ? "down" : "up"} has made the current reaction (${current.toFixed(1)}%) larger than any reaction since it began (${greatest.toFixed(1)}%). In this method that over-balance says the trend has changed or soon will. It is a warning about the old trend, not by itself an entry the other way.`,
  });
}

function detectUnusualVolume(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  if (m.relativeVolume === null) {
    checks.push({
      name: "Unusual volume",
      passed: false,
      detail: "No same-time-of-day baseline, so relative volume can't be computed.",
    });
    return null;
  }

  const qualifies = m.relativeVolume >= config.unusualVolumeThreshold;
  checks.push({
    name: "Unusual volume",
    passed: qualifies,
    detail: `${formatRvol(m.relativeVolume)} of normal (needs ${config.unusualVolumeThreshold.toFixed(1)}×).`,
  });
  if (!qualifies) return null;

  const factors: ConfidenceFactor[] = [
    {
      label: "Volume far above normal",
      passed: true,
      weight: 40,
      detail: `${formatRvol(m.relativeVolume)} of what this symbol normally trades by this time.`,
    },
    {
      label: "Price is moving with it",
      passed: Math.abs(dayMove.percent) >= config.minMovePct,
      weight: 20,
      detail: `${dayMove.percent.toFixed(2)}% from ${MOVE_BASIS_LABELS[dayMove.basis]}.`,
    },
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "unusual_volume",
    direction: dayMove.direction,
    move: dayMove,
    factors,
    invalidation: m.midpoint,
    whyThisAppeared: `${formatVolume(m.cumulativeVolume, input.kind === "crypto" ? "coins" : "shares")} of ${input.symbol} has traded today — ${formatRvol(m.relativeVolume)} what it normally does by this point. Volume like that usually means news or a large participant. It says something is happening; it does not say which way it resolves.`,
  });
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
    ? `Price traded up through yesterday's high at ${m.priorHigh!.toFixed(2)} and has closed back below it by more than the allowance.`
    : failedDown
      ? `Price traded down through yesterday's low at ${m.priorLow!.toFixed(2)} and has closed back above it by more than the allowance.`
      : `The day was ${dayMove.direction === "up" ? "up" : "down"} but price has crossed back through the middle of today's range at ${m.midpoint.toFixed(2)}.`;

  checks.push({ name: "Reversal risk", passed: true, detail: cause });

  const factors: ConfidenceFactor[] = [
    { label: "Cross failed or the 50% point lost", passed: true, weight: 30, detail: cause },
    {
      label: "Volume behind the reversal",
      passed: m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold,
      weight: 20,
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
    weight: 15,
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
      weight: 15,
      detail:
        m.hourly.trend === null
          ? "The hourly swing chart has no trend yet."
          : `The hourly swing chart is ${m.hourly.trend}${m.hourly.turned ? ", and turned on the latest hour: the first change in trend" : ""}.`,
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
    weight: 15,
    detail: `Last ${m.last.toFixed(2)} against the day's 50% point ${m.midpoint.toFixed(2)}.`,
  };
}

function dayDirectionFactor(dayMove: Move, direction: Direction): ConfidenceFactor {
  const agrees = dayMove.direction === direction;
  return {
    label: "Agrees with the day's direction",
    passed: agrees,
    weight: 10,
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
  whyThisAppeared: string;
}): Alert {
  const { now, input, metrics: m, type, direction, move, factors, invalidation } = args;

  const confidence = scoreConfidence(factors);
  const dataAge = ageSeconds(m.dataTimestamp, now);

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
    continuationPlan: continuationPlan(m, direction, invalidation, input.prevClose, input.dailyAtr),
    pivotPlan: pivotPlan(m, direction, invalidation),
    whyThisAppeared: args.whyThisAppeared,
    whyNotEarlier: explainLateness(dataAge, type, input.marketClosed === true),
  };
}

/**
 * Weighted, and capped at 100. Every factor is returned alongside the number so
 * a user can see what produced it — a bare "confidence: 72" is a black box, and
 * a black box in a trading tool is something people either over-trust or ignore.
 */
export function scoreConfidence(factors: ConfidenceFactor[]): number {
  const total = factors.reduce((s, f) => s + Math.abs(f.weight), 0);
  if (total === 0) return 0;
  const earned = factors.reduce((s, f) => s + (f.passed ? f.weight : 0), 0);
  return Math.max(0, Math.min(100, Math.round((earned / total) * 100)));
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
 * target. The old tops and bottoms read are the session's own extreme and the
 * prior close; the session's earlier swings and the prior sessions' highs and
 * lows are not passed in yet, so this can only under-name a level, never
 * invent one.
 */
export function gannFirstTarget(input: {
  direction: Direction;
  last: number;
  sessionHigh: number;
  sessionLow: number;
  prevClose: number | null;
  dailyAtr: number | null;
  intradayAtr: number;
}): number | null {
  const { direction, last, sessionHigh, sessionLow, prevClose, dailyAtr, intradayAtr } = input;
  const up = direction === "up";
  const floor = Math.max(0, intradayAtr);
  const beyond = (p: number) => (up ? p - last : last - p) >= floor && (up ? p > last : p < last);

  const window = dailyAtr != null && dailyAtr > 0 ? dailyAtr : last * (APPROACH_WINDOW_PCT / 100);
  const limit = up ? last + window : last - window;
  const candidates = [
    up ? sessionHigh : sessionLow,
    ...(prevClose != null && prevClose > 0 ? [prevClose] : []),
    ...targetCandidates(last, limit, up ? "bullish" : "bearish"),
  ].filter((p) => Number.isFinite(p) && beyond(p));

  if (candidates.length === 0) return null;
  return candidates.reduce((nearest, p) => (Math.abs(p - last) < Math.abs(nearest - last) ? p : nearest));
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
  });
  return {
    confirmation: `Wait for a bar to close ${direction === "up" ? "above" : "below"} ${m.last.toFixed(2)} rather than entering into the move. Chasing an extended price is how a good read becomes a bad fill.`,
    invalidation,
    firstTarget: target,
    cancelIf: `Price closes back ${direction === "up" ? "below" : "above"} the day's 50% point at ${m.midpoint.toFixed(2)}, or the move stalls without a new ${direction === "up" ? "high" : "low"} for several bars.`,
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
    confirmation: `The continuation thesis fails if price closes back ${direction === "up" ? "below" : "above"} ${invalidation != null ? invalidation.toFixed(2) : m.midpoint.toFixed(2)}. Even then, a ${opposite === "up" ? "long" : "short"} needs its own evidence: a close through the day's 50% point in the new direction and a failure to reclaim the level that broke.`,
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
 */
export function volumeBaseline(
  bars: Bar[],
  throughEtMinute: number,
  todayEtDate: string,
  minSessions = 2,
): number | null {
  const bySession = new Map<string, number>();

  for (const bar of bars) {
    if (!isUsableBar(bar)) continue;
    const at = new Date(bar.t);
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

/** ---- Formatting helpers ------------------------------------------------ */

function ageSeconds(timestamp: string, now: Date): number {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, Math.round((now.getTime() - t) / 1000));
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

