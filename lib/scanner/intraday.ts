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

/** ---- Configuration ----------------------------------------------------- */

export type SignalType =
  | "opening_momentum"
  | "trend_continuation"
  | "volatility_expansion"
  | "unusual_volume"
  | "reversal_risk";

export type Direction = "up" | "down";

/** What a move is measured against. Always stated; never left to inference. */
export type MoveBasis = "prior_close" | "session_open" | "opening_range" | "vwap";

export type AssetKind = "equity" | "etf" | "index" | "crypto";

export interface ScannerConfig {
  /** Minutes after the open that define the opening range. */
  openingRangeMinutes: number;
  /** Cumulative volume vs. the same-time-of-day baseline to count as elevated. */
  relativeVolumeThreshold: number;
  /** Move size as a multiple of intraday ATR to count as an expansion. */
  atrExpansionMultiple: number;
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
  openingRangeMinutes: 15,
  relativeVolumeThreshold: 1.2,
  atrExpansionMultiple: 1.5,
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
  vwap: number;
  cumulativeVolume: number;
  /** Opening-range high/low, null until the range has completed. */
  openingRangeHigh: number | null;
  openingRangeLow: number | null;
  openingRangeComplete: boolean;
  /** ATR of the intraday bars — the noise floor a real move has to clear. */
  intradayAtr: number;
  /** Null when no baseline was available. Never defaulted to 1. */
  relativeVolume: number | null;
  /** Timestamp of the newest bar. */
  dataTimestamp: string;
  barCount: number;
}

/**
 * Fold the session's bars into the handful of numbers every signal reads.
 *
 * The opening range uses bar *timestamps* rather than bar count, so a feed with
 * a gap in it produces a shorter range instead of a range that silently runs
 * fifteen bars past the intended window.
 */
export function sessionMetrics(input: SymbolInput, config: ScannerConfig): SessionMetrics | null {
  // Equities are measured over the regular session only. The feed returns
  // pre-market bars from 04:00 ET, and anchoring on "the first bar of the day"
  // put the opening range in the pre-market — where a handful of thin prints
  // set a range two cents wide that essentially every symbol then "broke out"
  // of the moment real trading started. The opening range is a statement about
  // the auction, so it has to start at the auction.
  //
  // Crypto has no session boundary; its whole day is the session.
  const regularOnly = input.kind !== "crypto";
  const bars = input.bars
    .filter(isUsableBar)
    .filter((b) => !regularOnly || isRegularSession(new Date(b.t)));
  if (bars.length === 0) return null;

  const first = bars[0];
  // Anchor on the session open rather than on whichever bar arrived first, so a
  // feed that drops the 09:30 bar doesn't slide the whole range later.
  const openMinutes = regularOnly
    ? REGULAR_OPEN_MINUTE
    : etParts(new Date(first.t)).minutes;
  const rangeEnd = openMinutes + config.openingRangeMinutes;

  let high = -Infinity;
  let low = Infinity;
  let cumulativeVolume = 0;
  let pvSum = 0;
  let orHigh: number | null = null;
  let orLow: number | null = null;
  let lastMinute = openMinutes;

  for (const bar of bars) {
    high = Math.max(high, bar.h);
    low = Math.min(low, bar.l);
    cumulativeVolume += bar.v;
    // Typical price × volume is the standard VWAP numerator; using the close
    // alone overweights a bar that closed at an extreme of its own range.
    pvSum += ((bar.h + bar.l + bar.c) / 3) * bar.v;

    const minute = etParts(new Date(bar.t)).minutes;
    lastMinute = minute;
    if (minute < rangeEnd) {
      orHigh = orHigh === null ? bar.h : Math.max(orHigh, bar.h);
      orLow = orLow === null ? bar.l : Math.min(orLow, bar.l);
    }
  }

  const last = input.quote?.price ?? bars[bars.length - 1].c;

  return {
    sessionOpen: first.o,
    high,
    low,
    last,
    vwap: cumulativeVolume > 0 ? pvSum / cumulativeVolume : last,
    cumulativeVolume,
    openingRangeHigh: orHigh,
    openingRangeLow: orLow,
    openingRangeComplete: lastMinute >= rangeEnd && orHigh !== null && orLow !== null,
    intradayAtr: atr(bars.slice(-30), 14),
    relativeVolume:
      input.volumeBaseline && input.volumeBaseline > 0
        ? cumulativeVolume / input.volumeBaseline
        : null,
    dataTimestamp: input.quote?.at ?? bars[bars.length - 1].t,
    barCount: bars.length,
  };
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
  opening_range: "the opening range",
  vwap: "the volume-weighted average price",
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
  /** First place to take something off. */
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
  vwap: number;
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
  opening_momentum: "Opening momentum",
  trend_continuation: "Trend continuation",
  volatility_expansion: "Volatility expansion",
  unusual_volume: "Unusual volume",
  reversal_risk: "Reversal risk",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalType, string> = {
  opening_momentum:
    "Price broke out of the range it set in the first minutes of trading, with more volume than this symbol usually has by now.",
  trend_continuation:
    "Price is extended past both the opening range and the average price of the day, and is still making progress in the same direction.",
  volatility_expansion:
    "Today's move is large compared with how far this symbol normally travels, so the usual sense of what a big move looks like doesn't apply.",
  unusual_volume:
    "Far more shares have traded by this point in the day than is normal for this symbol, whichever way price ends up going.",
  reversal_risk:
    "A breakout failed, or price lost the average price of the day. The move that was running may be ending — a reason to stand aside, not a reason to trade the other way on its own.",
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

  const liquid = metrics.cumulativeVolume >= config.minSessionVolume;
  checks.push({
    name: "Liquidity",
    passed: liquid,
    detail: `${formatVolume(metrics.cumulativeVolume)} traded today (minimum ${formatVolume(config.minSessionVolume)}).`,
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
        ? `Trades at ${metrics.last.toFixed(2)} on ${formatVolume(avgVolume)} shares a day.`
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
    detectOpeningMomentum(input, metrics, dayMove, config, checks, now),
    detectTrendContinuation(input, metrics, dayMove, config, checks, now),
    detectVolatilityExpansion(input, metrics, dayMove, config, checks, now),
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

function detectOpeningMomentum(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  if (!m.openingRangeComplete || m.openingRangeHigh === null || m.openingRangeLow === null) {
    checks.push({
      name: "Opening momentum",
      passed: false,
      detail: `The first ${config.openingRangeMinutes} minutes haven't completed yet, so there is no opening range to break.`,
    });
    return null;
  }

  const brokeUp = m.last > m.openingRangeHigh;
  const brokeDown = m.last < m.openingRangeLow;
  if (!brokeUp && !brokeDown) {
    checks.push({
      name: "Opening momentum",
      passed: false,
      detail: `Price is inside the opening range (${m.openingRangeLow.toFixed(2)}–${m.openingRangeHigh.toFixed(2)}).`,
    });
    return null;
  }

  const direction: Direction = brokeUp ? "up" : "down";
  const reference = brokeUp ? m.openingRangeHigh : m.openingRangeLow;
  const move = measureMove(m.last, reference, "opening_range");
  if (!move) return null;

  const volumeConfirmed =
    m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold;
  checks.push({
    name: "Opening momentum",
    passed: true,
    detail: `Broke the opening range ${direction === "up" ? "high" : "low"} at ${reference.toFixed(2)}; relative volume ${formatRvol(m.relativeVolume)}.`,
  });

  const factors: ConfidenceFactor[] = [
    {
      label: "Opening range broken",
      passed: true,
      weight: 30,
      detail: `Price is ${Math.abs(move.absolute).toFixed(2)} beyond the ${direction === "up" ? "high" : "low"} of the first ${config.openingRangeMinutes} minutes.`,
    },
    {
      label: "Volume confirms",
      passed: volumeConfirmed,
      weight: 25,
      detail:
        m.relativeVolume === null
          ? "No volume baseline for this symbol, so the break is unconfirmed."
          : `${formatRvol(m.relativeVolume)} of the volume this symbol normally has by now.`,
    },
    vwapFactor(m, direction),
    dayDirectionFactor(dayMove, direction),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "opening_momentum",
    direction,
    move,
    factors,
    invalidation: direction === "up" ? m.openingRangeLow : m.openingRangeHigh,
    whyThisAppeared: `${input.symbol} traded ${direction === "up" ? "above" : "below"} the range it set in the first ${config.openingRangeMinutes} minutes of the day. That range is where buyers and sellers first agreed on a price, so leaving it says one side has taken control — ${volumeConfirmed ? "and the extra volume behind it says the move has participation" : "though volume has not confirmed it, which makes the break less reliable"}.`,
  });
}

function detectTrendContinuation(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  if (!m.openingRangeComplete || m.openingRangeHigh === null || m.openingRangeLow === null) {
    return null;
  }

  const direction: Direction = m.last >= m.vwap ? "up" : "down";
  const beyondRange =
    direction === "up" ? m.last > m.openingRangeHigh : m.last < m.openingRangeLow;
  const beyondVwap = direction === "up" ? m.last > m.vwap : m.last < m.vwap;
  const structure = readStructure(input.bars, direction);
  const volumeSustained =
    m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold;

  const qualifies = beyondRange && beyondVwap && structure.aligned;
  checks.push({
    name: "Trend continuation",
    passed: qualifies,
    detail: qualifies
      ? `Extended past both the opening range and VWAP with ${structure.label}.`
      : `Needs price past the opening range (${beyondRange ? "yes" : "no"}), past VWAP (${beyondVwap ? "yes" : "no"}) and ${direction === "up" ? "higher highs and lows" : "lower highs and lows"} (${structure.aligned ? "yes" : "no"}).`,
  });
  if (!qualifies) return null;

  const move = measureMove(m.last, m.vwap, "vwap");
  if (!move) return null;

  const factors: ConfidenceFactor[] = [
    {
      label: "Past the opening range",
      passed: true,
      weight: 20,
      detail: `Trading beyond the first ${config.openingRangeMinutes} minutes' ${direction === "up" ? "high" : "low"}.`,
    },
    { label: "On the right side of VWAP", passed: true, weight: 20, detail: `VWAP is ${m.vwap.toFixed(2)}.` },
    { label: "Structure agrees", passed: true, weight: 20, detail: structure.label },
    {
      label: "Volume sustained",
      passed: volumeSustained,
      weight: 15,
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
    invalidation: m.vwap,
    whyThisAppeared: `${input.symbol} is ${direction === "up" ? "above" : "below"} both its opening range and the average price everyone has paid today, and it is still making ${direction === "up" ? "higher highs and higher lows" : "lower highs and lower lows"}. That combination is what a trend that is still working looks like. It is not a promise that it continues — the level that would say otherwise is the average price itself, at ${m.vwap.toFixed(2)}.`,
  });
}

function detectVolatilityExpansion(
  input: SymbolInput,
  m: SessionMetrics,
  dayMove: Move,
  config: ScannerConfig,
  checks: AuditCheck[],
  now: Date,
): Alert | null {
  // Sizing against the symbol's own range is the whole point: a $3 move in a
  // $600 name is noise and a $3 move in a $40 name is not, and a fixed dollar
  // threshold cannot tell them apart. A percent threshold is better but still
  // ignores how volatile the symbol usually is, which is what ATR measures.
  const reference = input.dailyAtr ?? m.intradayAtr;
  if (!reference || reference <= 0) {
    checks.push({
      name: "Volatility expansion",
      passed: false,
      detail: "No usable range history to size today's move against.",
    });
    return null;
  }

  const travelled = Math.abs(dayMove.absolute);
  const multiple = travelled / reference;
  const qualifies =
    multiple >= config.atrExpansionMultiple && Math.abs(dayMove.percent) >= config.minMovePct;

  checks.push({
    name: "Volatility expansion",
    passed: qualifies,
    detail: `Moved ${travelled.toFixed(2)} against a typical range of ${reference.toFixed(2)} (${multiple.toFixed(2)}×; needs ${config.atrExpansionMultiple}×).`,
  });
  if (!qualifies) return null;

  const factors: ConfidenceFactor[] = [
    {
      label: "Move is large for this symbol",
      passed: true,
      weight: 35,
      detail: `${multiple.toFixed(2)}× the range this symbol usually covers in a whole day.`,
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
    vwapFactor(m, dayMove.direction),
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "volatility_expansion",
    direction: dayMove.direction,
    move: dayMove,
    factors,
    invalidation: m.vwap,
    whyThisAppeared: `${input.symbol} has moved ${formatMoney(travelled)} from ${MOVE_BASIS_LABELS[dayMove.basis]}, which is ${multiple.toFixed(1)} times the distance it normally covers in an entire day. Ranges this wide cut both ways: stops that would be sensible on a normal day are inside the noise today, so position size matters more than direction.`,
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
    invalidation: m.vwap,
    whyThisAppeared: `${formatVolume(m.cumulativeVolume)} of ${input.symbol} has traded today — ${formatRvol(m.relativeVolume)} what it normally does by this point. Volume like that usually means news or a large participant. It says something is happening; it does not say which way it resolves.`,
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
  if (!m.openingRangeComplete || m.openingRangeHigh === null || m.openingRangeLow === null) {
    return null;
  }

  // A failed breakout: the session traded beyond the opening range and price is
  // now back inside it. The move that people entered on has been given back.
  const failedUp = m.high > m.openingRangeHigh && m.last < m.openingRangeHigh;
  const failedDown = m.low < m.openingRangeLow && m.last > m.openingRangeLow;
  // A VWAP rejection: the day ran one way but price has lost the average price.
  const lostVwap =
    (dayMove.direction === "up" && m.last < m.vwap) ||
    (dayMove.direction === "down" && m.last > m.vwap);

  if (!failedUp && !failedDown && !lostVwap) {
    checks.push({
      name: "Reversal risk",
      passed: false,
      detail: "No failed breakout and price is still on its side of VWAP.",
    });
    return null;
  }

  // The risk points against the move that was running.
  const direction: Direction = failedUp ? "down" : failedDown ? "up" : dayMove.direction === "up" ? "down" : "up";
  const move = measureMove(m.last, m.vwap, "vwap");
  if (!move) return null;

  const cause = failedUp
    ? `Price traded up through the opening-range high at ${m.openingRangeHigh.toFixed(2)} and has come back below it.`
    : failedDown
      ? `Price traded down through the opening-range low at ${m.openingRangeLow.toFixed(2)} and has come back above it.`
      : `The day was ${dayMove.direction === "up" ? "up" : "down"} but price has crossed back through VWAP at ${m.vwap.toFixed(2)}.`;

  checks.push({ name: "Reversal risk", passed: true, detail: cause });

  const factors: ConfidenceFactor[] = [
    { label: "Breakout failed or VWAP lost", passed: true, weight: 30, detail: cause },
    {
      label: "Volume behind the reversal",
      passed: m.relativeVolume !== null && m.relativeVolume >= config.relativeVolumeThreshold,
      weight: 20,
      detail:
        m.relativeVolume === null
          ? "No volume baseline available."
          : `${formatRvol(m.relativeVolume)} of normal for this time of day.`,
    },
  ];

  return buildAlert({
    now,
    input,
    metrics: m,
    type: "reversal_risk",
    direction,
    move,
    factors,
    invalidation: failedUp ? m.high : failedDown ? m.low : m.vwap,
    whyThisAppeared: `${cause} A move that gets given back like this is the most common way a breakout turns into a loss. The useful response is usually to stand aside rather than to flip: a failed move in one direction is not, on its own, a signal in the other.`,
  });
}

/** ---- Shared factors ---------------------------------------------------- */

function vwapFactor(m: SessionMetrics, direction: Direction): ConfidenceFactor {
  const onside = direction === "up" ? m.last > m.vwap : m.last < m.vwap;
  return {
    label: "Price on the right side of VWAP",
    passed: onside,
    weight: 15,
    detail: `Last ${m.last.toFixed(2)} against VWAP ${m.vwap.toFixed(2)}.`,
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

/**
 * Higher highs and higher lows, or the mirror image.
 *
 * Read over the last six bars rather than the whole session: structure is a
 * statement about what is happening now, and a session-long read would still
 * call a trend intact an hour after it stopped.
 */
function readStructure(bars: Bar[], direction: Direction): { aligned: boolean; label: string } {
  const recent = bars.filter(isUsableBar).slice(-6);
  if (recent.length < 4) return { aligned: false, label: "Not enough bars to read structure." };

  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);
  const highRising = Math.max(...secondHalf.map((b) => b.h)) > Math.max(...firstHalf.map((b) => b.h));
  const lowRising = Math.min(...secondHalf.map((b) => b.l)) > Math.min(...firstHalf.map((b) => b.l));

  if (direction === "up") {
    return {
      aligned: highRising && lowRising,
      label: highRising && lowRising ? "higher highs and higher lows" : "no higher highs and lows",
    };
  }
  return {
    aligned: !highRising && !lowRising,
    label: !highRising && !lowRising ? "lower highs and lower lows" : "no lower highs and lows",
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
  const risk = invalidation != null ? Math.abs(m.last - invalidation) : null;
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
    vwap: m.vwap,
    relativeVolume: m.relativeVolume,
    sessionVolume: m.cumulativeVolume,
    confidence,
    confidenceFactors: factors,
    invalidation,
    continuationPlan: continuationPlan(m, direction, invalidation, risk),
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

function continuationPlan(
  m: SessionMetrics,
  direction: Direction,
  invalidation: number | null,
  risk: number | null,
): TradePlan {
  const target =
    risk != null ? (direction === "up" ? m.last + risk * 2 : m.last - risk * 2) : null;
  return {
    confirmation: `Wait for a bar to close ${direction === "up" ? "above" : "below"} ${m.last.toFixed(2)} rather than entering into the move. Chasing an extended price is how a good read becomes a bad fill.`,
    invalidation,
    firstTarget: target,
    cancelIf: `Price closes back ${direction === "up" ? "below" : "above"} VWAP at ${m.vwap.toFixed(2)}, or the move stalls without a new ${direction === "up" ? "high" : "low"} for several bars.`,
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
    confirmation: `The continuation thesis fails if price closes back ${direction === "up" ? "below" : "above"} ${invalidation != null ? invalidation.toFixed(2) : m.vwap.toFixed(2)}. Even then, a ${opposite === "up" ? "long" : "short"} needs its own evidence: a close through VWAP in the new direction and a failure to reclaim the level that broke.`,
    invalidation: direction === "up" ? m.high : m.low,
    firstTarget: m.vwap,
    cancelIf: `Price chops around VWAP without holding either side, or volume drops off. Neither direction is worth trading in that state — standing aside is a position.`,
  };
}

/**
 * The "why did this only appear now" answer.
 *
 * Two honest reasons dominate, and both are properties of the data rather than
 * of the thresholds: an opening range cannot be broken before it has formed,
 * and a delayed feed means every evaluation is running against prices that are
 * already minutes old.
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
  if (type === "opening_momentum" || type === "trend_continuation") {
    reasons.push(
      "signals built on the opening range can't be evaluated until that range has finished forming",
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

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M shares`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K shares`;
  return `${Math.round(volume)} shares`;
}

export function formatRvol(rvol: number | null): string {
  return rvol === null ? "no baseline" : `${rvol.toFixed(1)}×`;
}

function formatMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}
