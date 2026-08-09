/**
 * Bar-by-bar replay of the protocol's own entry logic.
 *
 * This exists because win rate and expectancy were being quoted from ad-hoc
 * scripts. It replays the same functions the live scan uses — detectPatterns,
 * the gap rule, the risk floor — so a number quoted from here describes the
 * shipped system rather than a re-implementation of it.
 *
 * Deliberately pessimistic wherever a bar is ambiguous:
 *   - A setup arms on a closed bar and may only trigger on the very next one,
 *     as the protocol requires. It is not carried forward.
 *   - When a single bar's range covers both the stop and the target there is
 *     no way to know which came first, so it counts as a loss.
 *   - Round-trip friction is charged against every trade, widening losses and
 *     narrowing wins.
 *
 * What it cannot see: the true intra-bar path, the real bid/ask at the moment
 * of the fill, and overnight gaps beyond the session data supplied. Treat the
 * output as an upper bound on a strategy's quality, never a promise.
 */

import type { AssetClass, Bar, GannLevels, ScanDecision, StratPattern, TrendReading } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { detectPatterns, gapRuleViolated, riskFloorViolated } from "@/lib/strat/patterns";
import { computeTradeLevels } from "@/lib/strat/levels";
import { applyReversionConfirmation, computeScore } from "@/lib/scoring/score";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";

/** 6.5 hours of 15-minute candles. */
export const BARS_PER_SESSION = 26;

/**
 * Daily history needed before a confluence score is worth computing. Below
 * this the macro trends and structural levels are being read off too little
 * data to mean anything, and a fabricated score is worse than none.
 */
export const MIN_DAILY_BARS_FOR_SCORE = 120;

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
  dailyBars?: Bar[];
}

export interface ReplayTrade {
  symbol: string;
  pattern: StratPattern["name"];
  direction: "bullish" | "bearish";
  entry: number;
  stop: number;
  target: number;
  barsHeld: number;
  outcome: "win" | "loss" | "timeout";
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
   * Which of the score's criteria passed on this setup, keyed by the criterion
   * text verbatim from the breakdown.
   *
   * Keyed by the label rather than a short code on purpose: any mapping table
   * would silently mis-attribute the moment someone reworded a criterion in
   * lib/scoring/score.ts, and a factor study that quietly attributes results to
   * the wrong factor is worse than no study. Verbatim keys can only ever
   * *split* a factor across a rename, which shows up immediately as two
   * half-sized samples.
   *
   * Partial by construction. Two criteria are appended only in the situations
   * that trigger them (the trade-plan check, the bare-2-2 downgrade), so an
   * absent key means "not evaluated on this setup", never "failed". Consumers
   * must not read absence as false — see `attribution.ts`.
   */
  criteria?: Record<string, boolean>;
}

export interface ReplayResult {
  trades: ReplayTrade[];
  armed: number;
  triggered: number;
  wins: number;
  losses: number;
  timeouts: number;
  ambiguous: number;
  winRate: number;
  /** Mean result per trade, in R, after costs. */
  expectancyR: number;
  /** Sum of all results, in R. */
  totalR: number;
}

const EMPTY: Omit<ReplayResult, "trades"> = {
  armed: 0, triggered: 0, wins: 0, losses: 0, timeouts: 0, ambiguous: 0,
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

/** Whole weeks since the start of the bar's year. Buckets, not ISO weeks. */
const weekKey = (b: Bar) => {
  const t = new Date(b.t);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-${Math.floor((t.getTime() - yearStart) / 604_800_000)}`;
};

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
  macroTrends: TrendReading[];
  gann: GannLevels;
  nearSupportResistance: boolean;
  momentumElevated: boolean;
  /**
   * Recent volume against its own trailing baseline, on the same windows as
   * the momentum read. The score treats this as a hard liquidity gate, so the
   * replay has to supply it — left out, it defaults open and the gate silently
   * never fires here while rejecting setups in production.
   */
  volumeRatio: number;
}

export function buildMacroContext(daily: Bar[], price: number): MacroContext {
  const weekly = rollUp(daily, weekKey);
  const monthly = rollUp(daily, (b) => b.t.slice(0, 7));
  const monthlyTrend = readTrend(monthly, "1Month");
  const weeklyTrend = readTrend(weekly, "1Week");
  const dailyTrend = readTrend(daily, "1Day");

  const fanLines = computeFanLines(daily, price);
  const majorLow = Math.min(...daily.map((b) => b.l));
  const s9 = squareOf9Levels(majorLow, price).slice(0, 12);
  const cycles = timeCycles(daily);

  const allLevels = [
    ...dailyTrend.support, ...dailyTrend.resistance,
    ...weeklyTrend.support, ...weeklyTrend.resistance,
    ...monthlyTrend.support, ...monthlyTrend.resistance,
  ];
  const recentAtr = atr(daily.slice(-20), 14);
  const baselineAtr = atr(daily.slice(-100, -20), 14);

  // Same windows and the same open-on-missing-data default as lib/scanTicker.ts.
  // If that calculation moves, this has to move with it, or the replay stops
  // describing the shipped system.
  const mean = (bars: Bar[]) =>
    bars.length > 0 ? bars.reduce((sum, b) => sum + b.v, 0) / bars.length : 0;
  const baselineVolume = mean(daily.slice(-100, -20));

  return {
    macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
    gann: {
      fanLines: fanLines.slice(0, 6).map(({ angle, price: p, distancePct }) => ({
        angle, price: Math.round(p * 100) / 100, distancePct,
      })),
      squareOf9: s9.slice(0, 6).map(({ degree, price: p, distancePct }) => ({
        degree, price: Math.round(p * 100) / 100, distancePct,
      })),
      timeCycleActive: cycles.active,
      timeCycleDates: cycles.dates,
    },
    nearSupportResistance: allLevels.some((l) => Math.abs(price - l) / price <= 0.015),
    momentumElevated: baselineAtr > 0 && recentAtr / baselineAtr >= 1.2,
    volumeRatio: baselineVolume > 0 ? mean(daily.slice(-20)) / baselineVolume : 1,
  };
}

export function replay(symbol: string, bars: Bar[], options: ReplayOptions): ReplayResult {
  const {
    targetR,
    costPerShare = 0.02,
    maxBarsHeld = BARS_PER_SESSION * 10,
    warmupBars = 40,
    dailyBars,
  } = options;

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  const trades: ReplayTrade[] = [];
  let armed = 0;
  let triggered = 0;
  // Macro context only moves once a session, so it is built per date, not per
  // bar. Without this the replay recomputes trends and fan lines thousands of
  // times over identical inputs.
  const contextByDate = new Map<string, MacroContext | null>();

  for (let i = warmupBars; i < bars.length - 1; i++) {
    const history = bars.slice(0, i);
    const live = bars[i]; // the candle the setup is armed for
    const executionAtr = atr(history.slice(-30), 14);
    const lastClose = history[history.length - 1].c;

    for (const pattern of detectPatterns(history)) {
      if (gapRuleViolated(pattern, lastClose)) continue;
      if (riskFloorViolated(pattern, executionAtr)) continue;
      armed++;

      const long = pattern.direction === "bullish";
      const dir = long ? 1 : -1;
      // The trigger is a stop order: it fills only if this candle reaches it.
      const fired = long ? live.h >= pattern.triggerPrice : live.l <= pattern.triggerPrice;
      if (!fired) continue;
      triggered++;

      const entry = pattern.triggerPrice;
      const stop = pattern.stopPrice;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const target = entry + dir * targetR * risk;

      const decision = dailyBars
        ? scoreSetup({
            pattern,
            dailyBars,
            contextByDate,
            date: live.t.slice(0, 10),
            history,
            price: lastClose,
            executionAtr,
            assetClass,
          })
        : undefined;

      let outcome: ReplayTrade["outcome"] = "timeout";
      let barsHeld = 0;
      let ambiguous = false;

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

      if (outcome === "timeout") {
        // Marked out at the last close rather than silently dropped.
        barsHeld = Math.min(maxBarsHeld, bars.length - i);
        const exit = bars[Math.min(bars.length - 1, i + barsHeld - 1)].c;
        trades.push({
          symbol, pattern: pattern.name, direction: pattern.direction,
          entry, stop, target, barsHeld, outcome,
          rMultiple: (dir * (exit - entry) - costPerShare) / risk,
          ambiguous: false,
          atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
          score: decision?.score,
          outputState: decision?.outputState,
          criteria: criteriaOf(decision),
        });
        continue;
      }

      const gross = outcome === "win" ? targetR * risk : -risk;
      trades.push({
        symbol, pattern: pattern.name, direction: pattern.direction,
        entry, stop, target, barsHeld, outcome,
        rMultiple: (gross - costPerShare) / risk,
        ambiguous,
        atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
        score: decision?.score,
        outputState: decision?.outputState,
        criteria: criteriaOf(decision),
      });
    }
  }

  return summarise(trades, armed, triggered);
}

/**
 * Flatten a decision's breakdown into a pass map. Returns undefined for an
 * unscored setup so the trade carries no criteria at all, rather than an empty
 * object that would read as "every criterion failed".
 */
function criteriaOf(decision: ScanDecision | undefined): Record<string, boolean> | undefined {
  if (!decision) return undefined;
  const out: Record<string, boolean> = {};
  for (const item of decision.breakdown) out[item.criterion] = item.passed;
  return out;
}

export function summarise(trades: ReplayTrade[], armed = 0, triggered = 0): ReplayResult {
  if (trades.length === 0) return { trades, ...EMPTY, armed, triggered };
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  const timeouts = trades.filter((t) => t.outcome === "timeout").length;
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  return {
    trades,
    armed,
    triggered,
    wins,
    losses,
    timeouts,
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
  return summarise(trades, armed, triggered);
}

/**
 * Rebuild the verdict the scanner would have shown for one armed setup.
 *
 * Reads only sessions strictly before the day being traded. That is stricter
 * than production, which sees the current day's partial bar, and the direction
 * of the difference is deliberate: a replay that peeks is worthless.
 */
function scoreSetup(input: {
  pattern: StratPattern;
  dailyBars: Bar[];
  contextByDate: Map<string, MacroContext | null>;
  date: string;
  history: Bar[];
  price: number;
  executionAtr: number;
  assetClass: AssetClass;
}): ScanDecision | undefined {
  const { pattern, dailyBars, contextByDate, date, history, price, executionAtr, assetClass } = input;

  let context = contextByDate.get(date);
  if (context === undefined) {
    const priorSessions = dailyBars.filter((b) => b.t.slice(0, 10) < date);
    context =
      priorSessions.length >= MIN_DAILY_BARS_FOR_SCORE
        ? buildMacroContext(priorSessions, price)
        : null;
    contextByDate.set(date, context);
  }
  if (!context) return undefined;

  // The last 400 candles is ~15 sessions of hourly context, which is more than
  // readTrend looks back over and keeps the roll-up cheap.
  const hourlyTrend = readTrend(rollUp(history.slice(-400), (b) => b.t.slice(0, 13)), "1Hour");

  let levels = null;
  try {
    levels = computeTradeLevels(
      pattern,
      history[history.length - 2] ?? history[history.length - 1],
      [...context.gann.fanLines.map((f) => f.price), ...context.gann.squareOf9.map((s) => s.price)],
      undefined,
      executionAtr,
      assetClass,
    );
  } catch {
    // A setup with no valid plan is scored without one, exactly as the scan
    // does when computeTradeLevels rejects it.
  }

  return applyReversionConfirmation(
    computeScore({
      direction: pattern.direction,
      macroTrends: context.macroTrends,
      hourlyTrend,
      gann: context.gann,
      nearSupportResistance: context.nearSupportResistance,
      pattern,
      momentumElevated: context.momentumElevated,
      levels,
      volumeRatio: context.volumeRatio,
    }),
    pattern,
    context.momentumElevated,
    context.nearSupportResistance,
  );
}

/**
 * Split a run by the verdict the scanner would have shown. Trades with no
 * verdict — too little daily history, or none supplied — are reported under
 * `unscored` rather than folded into a bucket they were never assigned to.
 */
export function byOutputState(result: ReplayResult): {
  Execute: ReplayResult;
  Watch: ReplayResult;
  Reject: ReplayResult;
  unscored: ReplayResult;
} {
  const pick = (state: ScanDecision["outputState"]) =>
    summarise(result.trades.filter((t) => t.outputState === state));
  return {
    Execute: pick("Execute"),
    Watch: pick("Watch"),
    Reject: pick("Reject"),
    unscored: summarise(result.trades.filter((t) => t.outputState === undefined)),
  };
}
