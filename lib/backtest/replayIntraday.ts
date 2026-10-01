/**
 * The intraday profile: Gann's method read at intraday scale, as a replay
 * option only (`BacktestRequest.profile: "intraday"`).
 *
 * This is the build step 1 of `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md`
 * Part 3.5, owner go-ahead 2026-10-01. It changes nothing a person sees. Its
 * rules are the "intraday form" column of Part 3.4 and nothing was searched: no
 * parameter below was chosen by looking at a result, and the run it is for is
 * pre-registered in Part 5 of that document. It exists to answer the one
 * question the six-year hourly run left open ("the hourly run lost money,
 * presumed a translation defect"): does the method, translated at intraday
 * scale with the 2026-09-28 fixes, have an edge over years? Nothing measures
 * that yet (Part 3.3).
 *
 * **What it is.** The daily replay (`replay.ts`) reads the trend and the old
 * tops and bottoms from daily bars and uses the intraday bars only to time the
 * fill. This reads all of it from the intraday bars themselves, with the same
 * rules, one scale finer (Hermetic Correspondence: one construction on every
 * timeframe):
 *
 * | Piece | Rule here | Gann source (Tier A) |
 * |---|---|---|
 * | Trend | The 3-bar swing chart's trend on the hourly roll-up of the bars: it turns only when the last completed swing top is crossed or bottom broken. The coarse chart says which way. | *Master Stock Market Course* Ch. 13 ("the hourly chart will give the first change in trend"); `lib/gann/swingChart.ts` |
 * | Entry | Cross of the last completed 3-bar swing top (bottom) of the bars, with a lost-motion allowance of one intraday point. Trades with the trend only. | A8 nine buying/selling points; `lib/gann/entryTrigger.ts` |
 * | Stop | One intraday point beyond the protective swing extreme. | *Master Course* Ch. 3 (1-point stops); NSTD stops of 1, 2, 3 points |
 * | Confirmation | The four-stage sequence, on the run's bars, as on every other path. | Owner decision 4, 2026-09-27; `lib/lifecycle/entryConfirmation.ts` |
 * | First target | `gannFirstTarget`, the very function the intraday alerts use: the nearest old top or bottom (the session's extreme, the prior close) or a round number just short of one, at least one intraday ATR away, or none. 60% leaves there. | *Truth of the Stock Tape*; `lib/gann/evenFigures.ts` |
 * | Master target | None. The stop trails one point under each higher completed bottom (above each lower top). | "Never fix a target price" (owner decision X4) |
 * | Exit on trend change | The hourly swing chart turns against the position: leave at the next bar's open. | *Master Course* Ch. 13 |
 * | Broken stop | The same test as the live scan and the daily replay (`lib/gann/stopBreach.ts`): a plan whose stop a candle traded through is not entered until a closed bar closes back through the broken level by his allowance, scaled to this chart; a different stop is a new plan. | NSTD p. 20; *Master Course* rules 4-5 |
 *
 * **The intraday point.** Gann's "3 points" are in the units of the chart he
 * wrote them for, and `lib/gann/pointScale.ts` already re-expresses them per
 * price level. The same move is made per chart scale here: one point is a third
 * of `gannThreePoints(price)` times the ratio of the bars' ATR to the daily ATR
 * (so the allowance is the same share of a typical swing at every scale), floored
 * at 0.05% of price so a quiet name does not get a zero allowance. The ratio and
 * the floor are **engineering choices, labelled as such**: Gann gives the rule,
 * not this magnitude at intraday scale (Part 3.4's own wording). They are fixed
 * here and are not tuned.
 *
 * **What it deliberately does not do.** No scorecard: the score and verdict
 * are daily-structure readings, so every trade here is `unscored`, and the
 * question it answers is whether the intraday arming rule has an edge on its
 * own, read from the overall figures and the halves. No STRAT pattern, no
 * session-VWAP or moving average, nothing outside Gann. Time counts (hourly
 * counts, the 144-hour period, the 4-minute rotation) stay research only, per
 * Part 3.4, until Dewey's items are met.
 *
 * **Three-question basis (AGENTS.md).**
 * 1. Gann, as tabled. The profile reads only disclosed rules.
 * 2. Cycles: it claims no periodicity, so Dewey's seven-item checklist does not
 *    gate it. Where the *result* is judged it is by his standard where it
 *    applies (Part 3.5 step 3): a hit rate against a base rate, persistence out
 *    of sample, the two halves agreeing; `byYear`/`halves` in the report carry
 *    those. Not cleared: nothing has been measured.
 * 3. Hermetic. Correspondence: one rule at every scale, in each scale's own
 *    units, which is why this is the same construction as the daily path and
 *    not a second method. Polarity: every rule has its mirror for the short
 *    side (`computeGannEntryTrigger` is the mirror). Rhythm: the trail follows
 *    each swing as it completes, and the exit is the turn of the hourly swing.
 *
 * The bars are never read past the candle a decision is made on: the history is
 * closed bars only, the fill is the candle's open, and where one candle covers
 * both the stop and the target the stop is counted first (the replay's
 * conservative order everywhere).
 */

import type { Bar } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { atr } from "@/lib/analysis/pivots";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
import { gannFirstTarget } from "@/lib/scanner/intraday";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { RECLAIM_POINTS, isReclaimedByClose, isStopBreached, isStopBreachedByBar } from "@/lib/gann/stopBreach";
import { swingPivots, walkSwingChart } from "@/lib/gann/swingChart";
import { advanceEntryConfirmation, entryReady, freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import type { EntryConfirmationEvidence } from "@/lib/lifecycle/types";
import { isLargeCapStock } from "@/lib/strat/large-cap";
import { readLiquidity } from "@/lib/scan/liquidity";
import { SCALE_OUT_PCT } from "@/lib/trade/protocol-exit";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import { BARS_PER_SESSION, rollUp, summarise, type IntradayExitReason, type ReplayResult, type ReplayTrade } from "./replay";

/** Closed bars read for the swing charts and the trail. Bounds the work per bar; two completed swings fit in far less. */
export const INTRADAY_WINDOW_BARS = 400;
/** The 3-bar swing chart, Gann's own, at the bars' scale. */
const SWING_BARS = 3;
/**
 * How long an armed plan is carried, in bars. The lifecycle's own default
 * (`lib/lifecycle/fromScanResult.ts`, `DEFAULT_EXPIRES_AFTER_BARS`: 20 bars of
 * the 15-minute execution timeframe, five hours). Not tuned.
 */
export const PLAN_LIFETIME_BARS = 20;
/** Floor on one point, as a share of price. Engineering choice: keeps a quiet name from getting no allowance. */
export const MIN_POINT_PCT = 0.05;

export interface IntradayReplayOptions {
  /** Round-trip friction per share. */
  costPerShare?: number;
  /** Abandon a position that has not resolved within this many bars. */
  maxBarsHeld?: number;
  /** Bars of history before a setup may be taken. */
  warmupBars?: number;
  /** Daily bars for the same symbol: the daily ATR the point is scaled by, the prior close, large-cap. Required. */
  dailyBars: Bar[];
  /** Points a close must clear a broken stop by (`ReplayOptions.reclaimPoints`). */
  reclaimPoints?: number;
}

/** One armed crossing and its stop, carried across bars until it fires, breaks, is replaced or expires. */
interface Plan {
  pivotKey: string;
  direction: "bullish" | "bearish";
  triggerPrice: number;
  stop: number;
  armedAt: number;
  /** Only closed bars at or after this stamp count toward the plan's confirmation and breach reads. */
  since: string;
  evidence: EntryConfirmationEvidence;
  broken: boolean;
  bufferPct: number;
}

const hourKey = (b: Bar) => b.t.slice(0, 13);
const dateOf = (b: Bar) => b.t.slice(0, 10);

/**
 * One intraday point at this price: a third of Gann's price-scaled 3 points
 * times how large these bars' swings are against a day's. Zero when either
 * ATR is unknown.
 */
export function intradayPoint(price: number, barAtr: number, dailyAtr: number): number {
  if (!(price > 0) || !(barAtr > 0) || !(dailyAtr > 0)) return 0;
  const scale = Math.min(1, barAtr / dailyAtr);
  return Math.max((gannThreePoints(price) / 3) * scale, (price * MIN_POINT_PCT) / 100);
}

/** The scale the stop-breach allowance takes on these bars: one point against the daily 3-point allowance's third. */
function allowanceScale(price: number, point: number): number {
  const daily = gannThreePoints(price) / 3;
  return daily > 0 ? point / daily : 1;
}

export function replayIntraday(symbol: string, bars: Bar[], options: IntradayReplayOptions): ReplayResult {
  const {
    costPerShare = DEFAULT_COST_PER_SHARE_USD,
    maxBarsHeld = BARS_PER_SESSION * 10,
    warmupBars = 100,
    dailyBars,
    reclaimPoints = RECLAIM_POINTS,
  } = options;
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";

  const trades: ReplayTrade[] = [];
  const armedKeys = new Set<string>();
  const consumedPivots = new Set<string>();
  const retiredPlans = new Set<string>();
  let triggered = 0;
  let refusedFills = 0;
  // A plan is a crossing pivot with its stop, armed on the bar it first appeared
  // and carried until it fires, breaks, is replaced or expires, the way a stored
  // plan is (`lib/lifecycle/advanceConfirmation.ts` advances every open plan
  // each scan, not only the one the scan prices now). The four confirmation
  // stages take several bars, and the swing chart completes a new swing, and so
  // moves the current trigger, in about that time.
  const plans = new Map<string, Plan>();
  // One position per symbol at a time, as the position limits enforce (the
  // same-symbol group, `lib/risk/position-limits.ts`): a plan that confirms
  // while one is open waits out its own lifetime.
  let busyUntil = 0;

  // Per session reads from the daily bars, before that session only.
  const sessionFacts = new Map<string, { dailyAtr: number; prevClose: number | null; largeCap: boolean }>();
  const factsFor = (date: string) => {
    const cached = sessionFacts.get(date);
    if (cached) return cached;
    const prior = dailyBars.filter((d) => dateOf(d) < date);
    const facts = {
      dailyAtr: prior.length >= 15 ? atr(prior.slice(-30), 14) : 0,
      prevClose: prior.length > 0 ? prior[prior.length - 1].c : null,
      largeCap: isLargeCapStock(symbol, assetClass, readLiquidity(prior)),
    };
    sessionFacts.set(date, facts);
    return facts;
  };

  for (let i = warmupBars; i < bars.length - 1; i++) {
    const history = bars.slice(Math.max(0, i - INTRADAY_WINDOW_BARS), i);
    const live = bars[i];
    const date = dateOf(live);
    const closed = history[history.length - 1];

    const direction = walkSwingChart(rollUp(history, hourKey), SWING_BARS).trend;
    const { dailyAtr, prevClose, largeCap } = factsFor(date);
    const executionAtr = atr(history.slice(-30), 14);
    const point = intradayPoint(closed.c, executionAtr, dailyAtr);
    const bufferPct = point > 0 ? (point / closed.c) * 100 : 0;
    const scale = allowanceScale(closed.c, point);

    // Arm the plan the swing chart prices now, with the trend only.
    if (direction && point > 0) {
      const trigger = computeGannEntryTrigger(history, direction, SWING_BARS, bufferPct);
      if (trigger) {
        const pivotKey = `${trigger.direction}:${trigger.pivot.kind}:${history[trigger.pivot.index].t}`;
        const planKey = `${pivotKey}|${trigger.stopPrice.toFixed(4)}`;
        if (!consumedPivots.has(pivotKey) && !plans.has(planKey)) {
          // A new stop on the same crossing is a new plan: Gann's "replaced", a new
          // trade from new structure, and the older read is dropped.
          for (const [key, p] of plans) if (p.pivotKey === pivotKey) plans.delete(key);
          armedKeys.add(planKey);
          const plan: Plan = {
            pivotKey,
            direction: trigger.direction,
            triggerPrice: trigger.triggerPrice,
            stop: trigger.stopPrice,
            armedAt: i,
            since: live.t,
            evidence: freshEntryConfirmation(),
            broken: isStopBreached(trigger.direction, trigger.stopPrice, closed.c),
            bufferPct,
          };
          if (plan.broken) retiredPlans.add(planKey);
          plans.set(planKey, plan);
        }
      }
    }

    for (const [planKey, plan] of plans) {
      // A plan that has run out its life, or whose trend has turned, is gone.
      if (i - plan.armedAt > PLAN_LIFETIME_BARS || direction !== plan.direction || consumedPivots.has(plan.pivotKey)) {
        plans.delete(planKey);
        continue;
      }
      // The live scan's breach test, applied by path (see replay.ts): every
      // closed bar after the one the plan armed on is read in turn.
      if (closed.t >= plan.since) {
        if (isStopBreachedByBar(plan.direction, plan.stop, closed)) {
          plan.broken = true;
          retiredPlans.add(planKey);
        }
        if (plan.broken && isReclaimedByClose(plan.direction, plan.stop, closed, reclaimPoints, scale)) {
          plan.broken = false;
        }
      }
      if (plan.broken) {
        plan.evidence = freshEntryConfirmation();
        continue;
      }

      // Entry confirmation, the four stages, on closed bars after the plan armed.
      if (closed.t >= plan.since) {
        plan.evidence = advanceEntryConfirmation(
          plan.evidence,
          { direction: plan.direction, entryTrigger: plan.triggerPrice, confirmationBufferPct: plan.bufferPct },
          closed,
        );
      }
      if (!entryReady(plan.evidence) || i < busyUntil) continue;

      const long = plan.direction === "bullish";
      const dir = long ? 1 : -1;
      consumedPivots.add(plan.pivotKey);
      plans.delete(planKey);
      triggered++;

      // A confirmed entry is a market order after the hold, filled at this candle's open.
      const entry = live.o;
      const stop = plan.stop;
      const risk = Math.abs(plan.triggerPrice - stop);
      if (!(risk > 0) || (long ? entry <= stop : entry >= stop)) {
        refusedFills++;
        continue;
      }

      const sessionBars = history.filter((b) => dateOf(b) === date);
      const firstTarget = gannFirstTarget({
        direction: long ? "up" : "down",
        last: entry,
        sessionHigh: sessionBars.length > 0 ? Math.max(...sessionBars.map((b) => b.h)) : entry,
        sessionLow: sessionBars.length > 0 ? Math.min(...sessionBars.map((b) => b.l)) : entry,
        prevClose,
        dailyAtr: dailyAtr > 0 ? dailyAtr : null,
        intradayAtr: executionAtr,
      });

      const walked = walkIntradayExit({ bars, from: i, maxBarsHeld, long, entry, stop, point, firstTarget });
      busyUntil = i + walked.barsHeld;
      trades.push({
        symbol,
        openedAt: live.t,
        pattern: null,
        setupKind: "continuation",
        direction: plan.direction,
        entry,
        stop,
        target: firstTarget ?? NaN,
        atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
        largeCap,
        barsHeld: walked.barsHeld,
        outcome: walked.reason === "timeout" ? "timeout" : dir * (walked.exit - entry) > 0 ? "win" : "loss",
        exitReason: walked.reason,
        rMultiple: (dir * (walked.exit - entry) - costPerShare) / risk,
        ambiguous: false,
      });
    }
  }

  return summarise(trades, armedKeys.size, triggered, refusedFills, retiredPlans.size);
}

/**
 * Walk one filled trade forward on Gann's intraday exits. The stop is checked
 * on every bar first (the conservative order). 60% leaves at the first target
 * when there is one; the rest runs. After each bar the stop is lifted to one
 * point beyond the last completed swing bottom (top, short) when that tightens
 * it. If the hourly swing chart has turned against the position by a bar's
 * close, the position leaves at the next bar's open.
 */
function walkIntradayExit(input: {
  bars: Bar[];
  from: number;
  maxBarsHeld: number;
  long: boolean;
  entry: number;
  stop: number;
  point: number;
  firstTarget: number | null;
}): { exit: number; barsHeld: number; reason: IntradayExitReason | "timeout" } {
  const { bars, from, maxBarsHeld, long, entry, point, firstTarget } = input;
  const dir = long ? 1 : -1;
  let stop = input.stop;
  let trailed = false;
  // Position in units of the first lot: the result is reported as the single
  // exit price that gives the same P&L per unit, so R arithmetic is unchanged.
  let openQty = 1;
  let realized = 0;
  let scaled = false;
  const equivalent = (price: number) => entry + dir * (realized + openQty * dir * (price - entry));
  const done = (price: number, held: number, reason: IntradayExitReason | "timeout") => ({
    exit: equivalent(price),
    barsHeld: held,
    reason,
  });
  const end = Math.min(bars.length, from + maxBarsHeld);
  let leaveAtOpen = false;
  for (let j = from; j < end; j++) {
    const b = bars[j];
    if (leaveAtOpen) return done(b.o, j - from + 1, "intraday_trend_change");
    if (long ? b.l <= stop : b.h >= stop) {
      return done(stop, j - from + 1, trailed ? "intraday_trailing_stop" : "intraday_initial_stop");
    }
    if (firstTarget !== null && !scaled && (long ? b.h >= firstTarget : b.l <= firstTarget)) {
      realized += dir * SCALE_OUT_PCT * (firstTarget - entry);
      openQty -= SCALE_OUT_PCT;
      scaled = true;
    }
    const window = bars.slice(Math.max(0, j + 1 - INTRADAY_WINDOW_BARS), j + 1);
    const pivots = swingPivots(window, SWING_BARS);
    const last = [...pivots].reverse().find((p) => p.kind === (long ? "bottom" : "top"));
    if (last) {
      const candidate = long ? last.price - point : last.price + point;
      if ((long ? candidate > stop : candidate < stop) && (long ? candidate < b.c : candidate > b.c)) {
        stop = candidate;
        trailed = true;
      }
    }
    const trend = walkSwingChart(rollUp(window, hourKey), SWING_BARS).trend;
    if (trend !== null && trend !== (long ? "bullish" : "bearish")) leaveAtOpen = true;
  }
  return done(bars[end - 1].c, end - from, "timeout");
}
