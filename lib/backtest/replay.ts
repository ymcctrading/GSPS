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
 * bars, in the direction `preferredEntryDirection` derives from the macro
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
 * Coverage differences from the live scan that remain, stated rather than
 * hidden:
 *   - Only the reversion direction is replayed. `runMarketScan`'s
 *     continuation fills pass their own direction to `scanTicker`, and that
 *     secondary pool is not modelled here.
 *   - A session needs `MIN_DAILY_BARS_FOR_SCORE` prior daily bars before it
 *     can arm. The live scan needs 30. That excludes early history rather
 *     than scoring it on a fabricated macro read.
 *
 * Deliberately pessimistic wherever a bar is ambiguous:
 *   - The trigger is a resting stop order. If a candle opens already beyond
 *     it, the fill is that open, not the trigger price.
 *   - When a single bar's range covers both the stop and the target there is
 *     no way to know which came first, so it counts as a loss.
 *   - Round-trip friction is charged against every trade, widening losses and
 *     narrowing wins.
 *
 * What it cannot see: the true intra-bar path, the real bid/ask at the moment
 * of the fill, and overnight gaps beyond the session data supplied. Treat the
 * output as an upper bound on a strategy's quality, never a promise.
 */

import type { AssetClass, Bar, GannLevels, ScanDecision, StratPattern, Timeframe, TrendReading } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { computeStopWithLeeway, computeTradeLevels, type EntrySource } from "@/lib/strat/levels";
import { preferredEntryDirection, rankArmedPatterns } from "@/lib/scan/entrySelection";
import { isLargeCapStock } from "@/lib/strat/large-cap";
import { readLiquidity } from "@/lib/scan/liquidity";
import { applyReversionConfirmation, computeScore } from "@/lib/scoring/score";
import {
  FALLBACK_SR_PCT,
  SR_PROXIMITY_ATR,
  atrPercentOfPrice,
  nearestLevelMatch,
  proximityBandPct,
} from "@/lib/scoring/proximity";
import type { CriterionWeights } from "@/lib/scoring/weights";
import { computeGannEntryTrigger, type GannEntryTrigger } from "@/lib/gann/entryTrigger";
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
import { computeRuleOfThree, type RuleOfThreeReading } from "@/lib/gann/ruleOfThree";
import { computeTimePriceSquare, type TimePriceSquareReading } from "@/lib/gann/timePriceSquare";
import { computeVolumeClimax, type VolumeClimaxReading } from "@/lib/gann/volumeClimax";
import { computeBoilingPoint, type BoilingPointReading } from "@/lib/gann/boilingPoint";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";

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
  dailyBars: Bar[];
  /**
   * Monthly bars for the same symbol (up to ten years). Supplying them tags
   * each trade with `yearCycleHits`. Only months that closed before the
   * trade's month are read, and a monthly pivot needs three later months to
   * confirm, so no future bar can reach the tag.
   */
  monthlyBars?: Bar[];
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
  swingChart: SwingChartReading;
  /** How many 3-day swing-chart legs since the last 9-day trend change, and Gann's "sections of a campaign" confidence read on that count. Confluence/context only — see lib/gann/swingChart.ts#computeCampaignLeg. */
  campaignLeg: CampaignLegReading;
  ruleOfThree: RuleOfThreeReading;
  timePriceSquare: TimePriceSquareReading[];
  volumeClimax: VolumeClimaxReading[];
  boilingPoint: BoilingPointReading[];
  gann: GannLevels;
  nearSupportResistance: boolean;
  /** The matched level and its role, when one is in range — see lib/scanTicker.ts's srMatch. */
  srMatch: { price: number; timeframe: Timeframe; role: LevelRole; testCount: number } | null;
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
): MacroContext {
  const weekly = rollUp(daily, weekKey);
  const monthly = rollUp(daily, (b) => b.t.slice(0, 7));
  const monthlyTrend = readTrend(monthly, "1Month");
  const weeklyTrend = readTrend(weekly, "1Week");
  const dailyTrend = readTrend(daily, "1Day");
  const swingChart = computeSwingChart(daily);
  const campaignLeg = computeCampaignLeg(daily);
  const ruleOfThree = computeRuleOfThree(daily);

  const fanLines = computeFanLines(daily, price);
  const s9 = recentSquareOf9Levels(daily, price).slice(0, 12);
  const cycles = timeCycles(daily, asOf);
  const angleSlopes = computeAngleSlopes(daily, price);
  const timePriceSquare = computeTimePriceSquare(daily, price);
  const volumeClimax = computeVolumeClimax(daily);
  const boilingPoint = computeBoilingPoint(daily, volumeClimax);
  const retracementLevels = computeRetracementLevels(daily, price);
  const digitalRootConfluences = angleSlopes
    .map((r) => {
      const confluence = priceTimeConfluence(price, r.anchorPrice, r.barsSinceAnchor);
      return confluence && { anchorKind: r.anchorKind, ...confluence };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const allLevels = [
    ...dailyTrend.support.map((p) => ({ price: p, timeframe: dailyTrend.timeframe })),
    ...dailyTrend.resistance.map((p) => ({ price: p, timeframe: dailyTrend.timeframe })),
    ...weeklyTrend.support.map((p) => ({ price: p, timeframe: weeklyTrend.timeframe })),
    ...weeklyTrend.resistance.map((p) => ({ price: p, timeframe: weeklyTrend.timeframe })),
    ...monthlyTrend.support.map((p) => ({ price: p, timeframe: monthlyTrend.timeframe })),
    ...monthlyTrend.resistance.map((p) => ({ price: p, timeframe: monthlyTrend.timeframe })),
  ];
  const recentAtr = atr(daily.slice(-20), 14);
  const baselineAtr = atr(daily.slice(-100, -20), 14);
  const atrPct = atrPercentOfPrice(recentAtr, price);

  // Mirrors lib/scanTicker.ts: keep the matched level (and its role at
  // current price) rather than just a boolean, so the score can tell whether
  // it's on the trade's side or not.
  const srBandPct = proximityBandPct(SR_PROXIMITY_ATR, FALLBACK_SR_PCT, atrPct);
  const srMatch = nearestLevelMatch(price, allLevels, srBandPct);

  return {
    macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
    swingChart,
    campaignLeg,
    ruleOfThree,
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
    nearSupportResistance: srMatch !== null,
    srMatch: srMatch && {
      ...srMatch,
      role: levelRole(price, srMatch.price),
      testCount: countLevelTests(daily, srMatch.price, srBandPct),
    },
    momentumElevated: baselineAtr > 0 && recentAtr / baselineAtr >= 1.2,
    atrPct,
    structuralLevels: allLevels.map((l) => l.price),
  };
}

/** One session's arming state: read once per date from prior sessions only. */
interface SessionArm {
  context: MacroContext;
  trigger: GannEntryTrigger | null;
  largeCap: boolean;
}

export function replay(symbol: string, bars: Bar[], options: ReplayOptions): ReplayResult {
  const {
    targetR,
    costPerShare = DEFAULT_COST_PER_SHARE_USD,
    maxBarsHeld = BARS_PER_SESSION * 10,
    warmupBars = 40,
    dailyBars,
    monthlyBars,
    weights,
    useProductionStop = false,
  } = options;

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  const trades: ReplayTrade[] = [];
  // Counted once per session a pivot is armed on, and once per fill.
  const armedKeys = new Set<string>();
  let triggered = 0;
  // A swing top/bottom is crossed once. Pivot indices are stable across
  // sessions because each session's daily history is a prefix of the next.
  const consumedPivots = new Set<string>();
  // Macro context and the daily trigger only move once a session, so they are
  // built per date, not per bar.
  const armByDate = new Map<string, SessionArm | null>();

  const sessionArm = (date: string, price: number): SessionArm | null => {
    const cached = armByDate.get(date);
    if (cached !== undefined) return cached;
    const priorSessions = dailyBars.filter((b) => b.t.slice(0, 10) < date);
    let arm: SessionArm | null = null;
    if (priorSessions.length >= MIN_DAILY_BARS_FOR_SCORE) {
      const context = buildMacroContext(priorSessions, price, new Date(`${date}T12:00:00Z`));
      const direction = preferredEntryDirection(context.macroTrends);
      arm = {
        context,
        trigger: computeGannEntryTrigger(priorSessions, direction),
        largeCap: isLargeCapStock(symbol, assetClass, readLiquidity(priorSessions)),
      };
    }
    armByDate.set(date, arm);
    return arm;
  };

  for (let i = warmupBars; i < bars.length - 1; i++) {
    const history = bars.slice(0, i);
    const live = bars[i]; // the candle the resting order may fill on
    const date = live.t.slice(0, 10);
    const lastClose = history[history.length - 1].c;

    const arm = sessionArm(date, lastClose);
    const trigger = arm?.trigger;
    if (!arm || !trigger) continue;

    const pivotKey = `${trigger.direction}:${trigger.pivot.kind}:${trigger.pivot.index}`;
    if (consumedPivots.has(pivotKey)) continue;
    armedKeys.add(`${date}|${pivotKey}`);

    const long = trigger.direction === "bullish";
    const dir = long ? 1 : -1;
    // The trigger is a stop order: it fills only if this candle reaches it.
    const fired = long ? live.h >= trigger.triggerPrice : live.l <= trigger.triggerPrice;
    if (!fired) continue;
    consumedPivots.add(pivotKey);
    triggered++;

    // A candle that opens beyond the resting stop fills at its open.
    const entry = long ? Math.max(trigger.triggerPrice, live.o) : Math.min(trigger.triggerPrice, live.o);
    const executionAtr = atr(history.slice(-30), 14);
    const { largeCap } = arm;

    // The harness's original stop is the raw structural stop, untouched by the
    // leeway or large-cap widening `computeTradeLevels` applies for the live
    // scan and Guided Mode. `useProductionStop` swaps it for the widened one.
    // See the option's own comment for why this distinction has to exist.
    const stop =
      useProductionStop && executionAtr > 0
        ? computeStopWithLeeway({
            side: long ? "long" : "short",
            entry,
            structuralStop: trigger.stopPrice,
            atr15: executionAtr,
            largeCap,
          })
        : trigger.stopPrice;
    const risk = Math.abs(entry - stop);
    if (!(risk > 0) || (long ? stop >= entry : stop <= entry)) continue;
    const target = entry + dir * targetR * risk;

    const pattern =
      rankArmedPatterns({
        closedExecutionBars: history,
        currentPrice: lastClose,
        executionAtr,
        preferredDirection: trigger.direction,
        setupKind: "reversion",
      })[0] ?? null;

    const decision = scoreSetup({
      context: arm.context,
      pattern,
      gannTrigger: trigger,
      history,
      executionAtr,
      assetClass,
      largeCap,
      weights,
    });

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

    const base = {
      symbol, openedAt: live.t, pattern: pattern?.name ?? null, direction: trigger.direction,
      entry, stop, target,
      atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
      score: decision.score,
      outputState: decision.outputState,
      criteria: criteriaOf(decision),
      largeCap,
      yearCycleHits: monthlyBars ? yearCycleHitsAt(monthlyBars, live.t, trigger.direction) : undefined,
    };

    if (outcome === "timeout") {
      // Marked out at the last close rather than silently dropped.
      barsHeld = Math.min(maxBarsHeld, bars.length - i);
      const exit = bars[Math.min(bars.length - 1, i + barsHeld - 1)].c;
      trades.push({
        ...base, barsHeld, outcome,
        rMultiple: (dir * (exit - entry) - costPerShare) / risk,
        ambiguous: false,
      });
      continue;
    }

    const gross = outcome === "win" ? targetR * risk : -risk;
    trades.push({
      ...base, barsHeld, outcome,
      rMultiple: (gross - costPerShare) / risk,
      ambiguous,
    });
  }

  return summarise(trades, armedKeys.size, triggered);
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
  context: MacroContext;
  pattern: StratPattern | null;
  gannTrigger: GannEntryTrigger;
  history: Bar[];
  executionAtr: number;
  assetClass: AssetClass;
  /** Computed once per session by the caller (it also tags the trade record). */
  largeCap: boolean;
  weights?: CriterionWeights;
}): ScanDecision {
  const { context, pattern, gannTrigger, history, executionAtr, assetClass, largeCap, weights } = input;

  // The last 400 candles is ~15 sessions of hourly context, which is more than
  // readTrend looks back over and keeps the roll-up cheap.
  const hourlyBars = rollUp(history.slice(-400), (b) => b.t.slice(0, 13));
  const hourlyTrend = readTrend(hourlyBars, "1Hour");

  // Priced exactly as lib/scanTicker.ts prices it: from the swing-crossing
  // trigger, labelled by what it crossed.
  const entrySource: EntrySource = {
    direction: gannTrigger.direction,
    triggerPrice: gannTrigger.triggerPrice,
    stopPrice: gannTrigger.stopPrice,
    setupLabel: gannTrigger.direction === "bullish" ? "swing-top crossing" : "swing-bottom break",
  };

  let levels = null;
  try {
    levels = computeTradeLevels(
      entrySource,
      history[history.length - 2] ?? history[history.length - 1],
      [...context.gann.fanLines.map((f) => f.price), ...context.gann.squareOf9.map((s) => s.price)],
      undefined,
      executionAtr,
      assetClass,
      largeCap,
      context.structuralLevels,
      context.atrPct,
    );
  } catch {
    // A setup with no valid plan is scored without one, exactly as the scan
    // does when computeTradeLevels rejects it.
  }

  return applyReversionConfirmation(
    computeScore({
      direction: gannTrigger.direction,
      macroTrends: context.macroTrends,
      hourlyTrend,
      swingChart: context.swingChart,
      campaignLeg: context.campaignLeg,
      ruleOfThree: context.ruleOfThree,
      timePriceSquare: context.timePriceSquare,
      volumeClimax: context.volumeClimax,
      boilingPoint: context.boilingPoint,
      gann: context.gann,
      nearSupportResistance: context.nearSupportResistance,
      srMatch: context.srMatch,
      pattern,
      gannTrigger,
      momentumElevated: context.momentumElevated,
      levels,
      stopAtrMultiple: levels && executionAtr > 0 ? levels.riskPerShare / executionAtr : null,
      assetClass,
      atrPct: context.atrPct,
      ...(weights ? { weights } : {}),
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

/**
 * Split a run's trades by whether the symbol read as large-cap at the time —
 * the comparison this session's stop-widening change asked for. Every trade
 * carries `largeCap` regardless of whether `dailyBars`/scoring were supplied,
 * so unlike `byOutputState` there is no "unknown" bucket to report.
 */
/** Hits in `direction` at `at`, from monthly bars that closed before `at`'s month. */
function yearCycleHitsAt(monthlyBars: Bar[], at: string, direction: "bullish" | "bearish"): number {
  const month = at.slice(0, 7);
  const closed = monthlyBars.filter((b) => b.t.slice(0, 7) < month);
  const hits = yearCycleConvergence(closed, new Date(`${at.slice(0, 10)}T12:00:00Z`));
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
  return summarise(result.trades.filter((t) => t.score !== undefined && t.score >= min && t.score <= max));
}
