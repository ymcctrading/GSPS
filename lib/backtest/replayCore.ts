/**
 * The bare core: Gann's method with nothing on top, as its own replay
 * strategy (`profile: "core"`), so each further rule can be added back and
 * kept only if it proves itself (owner, 2026-10-29: "let's rebuild from the
 * core"; the six-year daily run of the full rule stack showed no edge,
 * `/mnt/project-files/replay-diagnosis/2026-10-29-averages-trend-rerun/`).
 * The full stack (`replay.ts`) is untouched and stays the production method.
 *
 * Every rule here is from one chapter of Gann's own book, *New Stock Trend
 * Detector* (1936, W006), Tier A:
 *
 * 1. **The main trend is the stock's own monthly chart** (p.19): the monthly
 *    swing chart on completed months, turned by crossing its last swing top or
 *    breaking "the point from which the last run-up started" (pp.19-20). One
 *    reading with the live short hold (`readMonthlyMainTrend`, `mainTrend.ts`).
 *    Trade only with it: "a stock is never too high to buy so long as the
 *    trend is up" and any price is a short while it is down (p.22).
 * 2. **Buy the crossing** (p.20; Rule 3 pp.46-47): an old top crossed by 3
 *    points "should not react 3 points below the old high; buy a 1-2 point
 *    reaction, stop 3 points under the old top" (old top 50, advance to 53,
 *    buy the reaction to 51, stop 47). The old tops are the weekly chart's,
 *    "the best chart for trading purposes" (p.46): the 7-day swing chart read
 *    on the daily bars. The order rests at the top plus 1 point once a close is
 *    3 points over it.
 * 3. **Buy the reaction** (p.20, Rule 3 p.47): "in bull markets reactions last
 *    2-3 weeks, buy after a 2-3 week reaction once it holds 2-3 days", stop 3
 *    points under it (Rule 2's "never risk more than 5 points"; "a 3-points
 *    stop loss order is the safest"). Read on the same weekly chart: its line
 *    turned down off a top at least 14 calendar days before the reaction's low,
 *    and the low has held `HOLD_SESSIONS` completed sessions.
 * 4. **Shorts only in a monthly downtrend**, by the mirror rules (Rule 4 p.47):
 *    the break of an old bottom by 3 points sold on a small rally, stop 3 points
 *    over it; and the bear-market rally of 2-3 weeks sold once it fails, stop 3
 *    points over its high, which is the secondary rally after the first break
 *    ("the top of secondary rally is always an important point to watch",
 *    pp.13-14).
 * 5. **Let profits run**: no target. The stop trails 3 points under each new
 *    swing bottom of the weekly chart (over each swing top, short): Rule 3's
 *    "stop 3 points under the previous support" moved up as the supports rise
 *    (Rule 2 trails "1, 2, 3 or 5 points under each week's bottom"; the literal
 *    each-week trail is `trail: "eachWeek"`). The trade also leaves at the open
 *    after the main trend turns against it (Rule 6, p.48: "at a change in trend
 *    sell longs").
 * 6. **Pyramid** (Rule 5 p.47): add every `PYRAMID_STEP_POINTS` Gann points of
 *    profit (his 5 points at $20-50, 10 at $80-200), lots of 100, 50, 30, 20,
 *    10 (`PYRAMID_LOTS`), the stop moved so the whole line can't lose
 *    (`wholeLineStop`). "Never average a loss": adds only go on in profit.
 *
 * **Measured per campaign.** One trade per campaign (first lot and its adds),
 * its `rMultiple` the whole line's result in units of the first lot's risk,
 * so a pyramided winner counts at its real size. `rFirstLot` is the first lot
 * alone, so a run shows what the pyramid adds.
 *
 * **Adding rules back.** `rules` is read at each candidate first entry, from
 * completed bars only; in `ruleMode: "gate"` a refusal blocks the campaign, in
 * `"tag"` it is only recorded, so one run can test every rule offline.
 *
 * Engineering choices, labelled: "2-3 weeks" read as at least 14 calendar days
 * from the top to the reaction's low; "holds 2-3 days" as `HOLD_SESSIONS` (2)
 * completed sessions after the low; a reaction that broke the weekly chart's
 * previous bottom by 3 points is not bought (that is a break, not a reaction);
 * one campaign at a time per stock; a crossing is armed only on the first close
 * 3 points past a top (no late arming); the order is cancelled on a close 3
 * points back through the old top, or once the weekly chart makes a newer top
 * (its reaction is then the buy). Fills: decisions on completed sessions, a
 * market order at the next open, a resting order at its price or the open if
 * price gapped through it. A bar that reached both an add and the new stop is
 * read as stopped (the loss assumed, `ambiguous`).
 *
 * Three-question basis: 1. Gann, as cited. 2. Cycles: the 2-3 week reaction is
 * a duration, not a cycle claim; Dewey's checklist does not apply. 3. Hermetic:
 * Correspondence (the monthly chart governs, the weekly times, as above so
 * below), Polarity (every rule mirrored for shorts) and Rhythm (buy the
 * reaction, sell the rally). Law of Creation: trend ⊗ timing; neither alone is
 * the trade, the trade is what they create together.
 */

import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { threePoints, pricePoint } from "@/lib/gann/pointScale";
import { WEEKLY_SWING_CHART, walkSwingChart, type SwingDirection } from "@/lib/gann/swingChart";
import { PYRAMID_STEP_POINTS, nextLotFraction, wholeLineStop } from "@/lib/gann/pyramid";
import { readMonthlyMainTrend } from "@/lib/gann/mainTrend";
import { toMonthlyBars, toWeeklyBars } from "@/lib/gann/disclosedRules";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import { summarise, type ReplayResult, type ReplayTrade } from "./replay";

/** "2-3 weeks": the reaction's low at least this many calendar days after the top. */
export const REACTION_MIN_DAYS = 14;
/** "holds 2-3 days": completed sessions after the reaction's low with none lower. */
export const HOLD_SESSIONS = 2;
/** A work bound on adds filled on one bar (a gap through several steps). */
const MAX_ADDS_PER_BAR = 20;

export type CoreSide = "long" | "short";
export type CoreEntryKind = "crossing" | "reaction";

/** What a rule added back sees at a candidate first entry: completed bars only. */
export interface CoreEntryContext {
  symbol: string;
  side: CoreSide;
  entryKind: CoreEntryKind;
  /** The ET date ("YYYY-MM-DD") of the session the order goes in on. */
  asOf: string;
  /** The last completed session's close. */
  price: number;
  /** The planned initial stop. */
  stop: number;
  /** Completed daily sessions, oldest first (none from `asOf` on). */
  sessions: Bar[];
  /** Weeks rolled from `sessions` (the last one may be the week in progress). */
  weeks: Bar[];
  /** Completed months before `asOf`'s month. */
  months: Bar[];
}

export interface CoreRule {
  name: string;
  allows(ctx: CoreEntryContext): boolean;
}

export interface CoreReplayOptions {
  /** The whole daily record: context before the first traded session as well. */
  dailyBars: Bar[];
  /** The stock's own monthly bars; rolled from `dailyBars` when absent. */
  monthlyBars?: Bar[];
  costPerShare?: number;
  /** Add to winners (Rule 5). Default true. */
  pyramid?: boolean;
  /** Take shorts in a monthly downtrend. Default true. */
  shorts?: boolean;
  /** How the stop trails: the weekly chart's swing bottoms (default) or each completed week's. */
  trail?: "weeklySwing" | "eachWeek";
  rules?: CoreRule[];
  /** "gate" (default): a refusing rule blocks the campaign. "tag": every rule is only recorded. */
  ruleMode?: "gate" | "tag";
}

export interface CoreLot {
  fraction: number;
  fill: number;
  at: string;
}

/** One campaign, as a replay trade: `rMultiple` is the whole line's. */
export interface CoreTrade extends ReplayTrade {
  side: CoreSide;
  coreEntryKind: CoreEntryKind;
  /** The first lot alone, in its own risk. */
  rFirstLot: number;
  /** The whole line's result in dollars per share of the first lot (after costs). */
  pnlPerUnitShare: number;
  lotFills: CoreLot[];
  rulesPassed?: string[];
  rulesRefused?: string[];
}

export interface CoreResult extends ReplayResult {
  trades: CoreTrade[];
}

export function isCoreTrade(t: ReplayTrade): t is CoreTrade {
  return typeof (t as CoreTrade).rFirstLot === "number" && Array.isArray((t as CoreTrade).lotFills);
}

interface Position {
  side: CoreSide;
  kind: CoreEntryKind;
  openIndex: number;
  firstFill: number;
  initialStop: number;
  stop: number;
  stopReason: "initial" | "prior_week" | "break_even";
  lots: CoreLot[];
  ambiguous: boolean;
  rules?: { passed: string[]; refused: string[] };
}

interface Pivot {
  index: number;
  price: number;
}

interface PendingCrossing {
  side: CoreSide;
  /** Index of the old top (bottom) crossed. */
  pivotIndex: number;
  level: number;
  limit: number;
  stop: number;
  rules?: { passed: string[]; refused: string[] };
}

const DAY_MS = 86_400_000;
const sign = (side: CoreSide): 1 | -1 => (side === "long" ? 1 : -1);
const days = (a: Bar, b: Bar) => Math.round((Date.parse(b.t) - Date.parse(a.t)) / DAY_MS);

export function replayCore(symbol: string, bars: Bar[], options: CoreReplayOptions): CoreResult {
  const {
    dailyBars,
    costPerShare = DEFAULT_COST_PER_SHARE_USD,
    pyramid = true,
    shorts = true,
    trail = "weeklySwing",
    rules = [],
    ruleMode = "gate",
  } = options;
  const daily = dailyBars.length > 0 ? dailyBars : bars;
  const empty = (): CoreResult => ({ ...summarise([]), trades: [] });
  if (bars.length === 0 || daily.length < 2) return empty();
  const firstTraded = daily.findIndex((b) => b.t >= bars[0].t);
  if (firstTraded < 0) return empty();

  const months = options.monthlyBars && options.monthlyBars.length > 0 ? options.monthlyBars : toMonthlyBars(daily);
  // The main trend changes only when a month closes: read once per session month.
  const mainByMonth = new Map<string, SwingDirection>();
  const etDate = daily.map((b) => etDateKey(new Date(b.t)));

  // The weekly chart on the daily bars, walked once: it is causal, so a pivot
  // is known from the bar that completed it.
  const walk = walkSwingChart(daily, WEEKLY_SWING_CHART);
  const knownAt = walk.pivots.map((_, k) => (k === 0 ? walk.trendChanges[0] ?? daily.length : walk.reversals[k - 1]));
  const firstDirAt = walk.trendChanges[0] ?? daily.length;
  const firstDir: SwingDirection = walk.pivots[0]?.kind === "bottom" ? "bullish" : walk.pivots[0] ? "bearish" : null;
  const weeks = trail === "eachWeek" ? toWeeklyBars(daily) : [];
  const weekOf = trail === "eachWeek" ? weekIndexer(daily, weeks) : null;

  const trades: CoreTrade[] = [];
  let armed = 0;
  let triggered = 0;
  let refusedFills = 0;

  // Reading state after the last completed session (index `i - 1`).
  let p = 0; // pivots known so far
  let r = 0; // reversals seen so far
  let line: SwingDirection = null;
  // Held on an object: they change inside `absorb`, which flow narrowing can't see.
  const sw: { lastTop: Pivot | null; lastBottom: Pivot | null } = { lastTop: null, lastBottom: null };
  const crossedTops = new Set<number>();
  const crossedBottoms = new Set<number>();
  const usedReactions = new Set<string>();
  let pending: PendingCrossing | null = null;
  let pos: Position | null = null;

  const absorb = (j: number) => {
    // Take in session j as completed.
    while (p < walk.pivots.length && knownAt[p] <= j) {
      const pv = walk.pivots[p];
      if (pv.kind === "top") sw.lastTop = { index: pv.index, price: pv.price };
      else sw.lastBottom = { index: pv.index, price: pv.price };
      p++;
    }
    if (j >= firstDirAt && line === null) line = firstDir;
    while (r < walk.reversals.length && walk.reversals[r] <= j) {
      line = line === "bullish" ? "bearish" : "bullish";
      r++;
    }
  };

  const mainTrendFor = (i: number): SwingDirection => {
    const m = etDate[i].slice(0, 7);
    let main = mainByMonth.get(m);
    if (main === undefined) {
      main = readMonthlyMainTrend(months.filter((b) => b.t.slice(0, 7) < m));
      mainByMonth.set(m, main);
    }
    return main;
  };

  const readRules = (i: number, side: CoreSide, kind: CoreEntryKind, stop: number): { passed: string[]; refused: string[] } | null => {
    if (rules.length === 0) return null;
    const sessions = daily.slice(0, i);
    const m = etDate[i].slice(0, 7);
    const ctx: CoreEntryContext = {
      symbol,
      side,
      entryKind: kind,
      asOf: etDate[i],
      price: daily[i - 1].c,
      stop,
      sessions,
      weeks: toWeeklyBars(sessions),
      months: months.filter((b) => b.t.slice(0, 7) < m),
    };
    const passed: string[] = [];
    const refused: string[] = [];
    for (const rule of rules) (rule.allows(ctx) ? passed : refused).push(rule.name);
    return { passed, refused };
  };
  const blocks = (verdict: { refused: string[] } | null) => ruleMode === "gate" && verdict !== null && verdict.refused.length > 0;

  const close = (i: number, exit: number, reason: NonNullable<ReplayTrade["exitReason"]>, openAtEnd = false) => {
    const position = pos as Position;
    const dir = sign(position.side);
    const risk = Math.abs(position.firstFill - position.initialStop);
    const perLot = position.lots.map((l) => l.fraction * (dir * (exit - l.fill) - costPerShare));
    const pnl = perLot.reduce((s, x) => s + x, 0);
    const first = position.lots[0];
    trades.push({
      symbol,
      openedAt: daily[position.openIndex].t,
      closedAt: daily[i].t,
      pattern: null,
      setupKind: "continuation",
      entryKind: position.kind === "crossing" ? "crossing" : "hold",
      holdBasis: position.kind === "reaction" ? (position.side === "long" ? "weeks" : "rally") : undefined,
      direction: position.side === "long" ? "bullish" : "bearish",
      entry: position.firstFill,
      stop: position.initialStop,
      target: Number.NaN,
      barsHeld: i - position.openIndex,
      outcome: openAtEnd ? "timeout" : pnl > 0 ? "win" : "loss",
      lots: position.lots.length,
      exitReason: reason,
      exitPrice: exit,
      rMultiple: pnl / risk,
      ambiguous: position.ambiguous,
      atrMultiple: Number.NaN,
      side: position.side,
      coreEntryKind: position.kind,
      rFirstLot: (dir * (exit - first.fill) - costPerShare) / risk,
      pnlPerUnitShare: pnl,
      lotFills: position.lots,
      ...(position.rules ? { rulesPassed: position.rules.passed, rulesRefused: position.rules.refused } : {}),
    });
    pos = null;
  };

  const start = Math.max(firstTraded, 1);
  for (let j = 0; j < start; j++) absorb(j);

  for (let i = start; i < daily.length; i++) {
    const bar = daily[i];
    const main = mainTrendFor(i);
    const withMain = (side: CoreSide) => main === (side === "long" ? "bullish" : "bearish");
    let closedThisBar = false;

    // 1. The open position, against this session.
    if (pos) {
      const position: Position = pos;
      const dir = sign(position.side);
      if (!withMain(position.side)) {
        close(i, bar.o, "trend_change");
        closedThisBar = true;
      } else if (dir * (bar.o - position.stop) <= 0) {
        close(i, bar.o, position.stopReason);
        closedThisBar = true;
      } else if (dir * ((dir === 1 ? bar.l : bar.h) - position.stop) <= 0) {
        close(i, position.stop, position.stopReason);
        closedThisBar = true;
      } else if (pyramid) {
        let added = 0;
        while (added < MAX_ADDS_PER_BAR) {
          const last = position.lots[position.lots.length - 1];
          const trigger = last.fill + dir * PYRAMID_STEP_POINTS * pricePoint(last.fill);
          if (dir * ((dir === 1 ? bar.h : bar.l) - trigger) < 0) break;
          const fraction = nextLotFraction(position.lots.length);
          if (fraction === null) break;
          const fill = dir === 1 ? Math.max(bar.o, trigger) : Math.min(bar.o, trigger);
          position.lots.push({ fraction, fill, at: bar.t });
          const size = position.lots.reduce((s, l) => s + l.fraction, 0);
          const avg = position.lots.reduce((s, l) => s + l.fraction * l.fill, 0) / size;
          const next = wholeLineStop(position.side, avg, fill, position.stop);
          if (next !== position.stop) {
            position.stop = next;
            position.stopReason = "break_even";
          }
          added++;
        }
        // The add and the new stop on one bar: order unknown, the loss assumed.
        if (added > 0 && dir * ((dir === 1 ? bar.l : bar.h) - position.stop) <= 0) {
          position.ambiguous = true;
          close(i, position.stop, position.stopReason);
          closedThisBar = true;
        }
      }
    }

    // 2. A resting crossing order fills on the reaction to it.
    if (!pos && !closedThisBar && pending) {
      const order: PendingCrossing = pending;
      const dir = sign(order.side);
      if (!withMain(order.side)) pending = null;
      else if (dir * ((dir === 1 ? bar.l : bar.h) - order.limit) <= 0) {
        triggered++;
        pending = null;
        const fill = dir === 1 ? Math.min(bar.o, order.limit) : Math.max(bar.o, order.limit);
        if (dir * (fill - order.stop) <= 0) refusedFills++;
        else {
          pos = {
            side: order.side, kind: "crossing", openIndex: i, firstFill: fill, initialStop: order.stop, stop: order.stop,
            stopReason: "initial", lots: [{ fraction: 1, fill, at: bar.t }], ambiguous: false, rules: order.rules,
          };
          if (dir * ((dir === 1 ? bar.l : bar.h) - order.stop) <= 0) {
            (pos as Position).ambiguous = true;
            close(i, order.stop, "initial");
            closedThisBar = true;
          }
        }
      }
    }

    // 3. A reaction (rally) bought (sold) at this open, decided on the sessions before it.
    if (!pos && !closedThisBar) {
      for (const side of ["long", "short"] as const) {
        if (side === "short" && !shorts) continue;
        if (!withMain(side)) continue;
        const reaction = readReaction(side, i);
        if (!reaction) continue;
        const key = `${side}:${reaction.pivotIndex}`;
        if (usedReactions.has(key)) continue;
        usedReactions.add(key);
        armed++;
        const verdict = readRules(i, side, "reaction", reaction.stop);
        if (blocks(verdict)) continue;
        triggered++;
        const dir = sign(side);
        if (dir * (bar.o - reaction.stop) <= 0) {
          refusedFills++;
          continue;
        }
        pending = null;
        pos = {
          side, kind: "reaction", openIndex: i, firstFill: bar.o, initialStop: reaction.stop, stop: reaction.stop,
          stopReason: "initial", lots: [{ fraction: 1, fill: bar.o, at: bar.t }], ambiguous: false, rules: verdict ?? undefined,
        };
        if (dir * ((dir === 1 ? bar.l : bar.h) - reaction.stop) <= 0) close(i, reaction.stop, "initial");
        break;
      }
    }

    // Session i is now complete.
    absorb(i);

    // 4. Trail the open position's stop for the next session.
    if (pos) {
      const position: Position = pos;
      const dir = sign(position.side);
      let level: number | null = null;
      if (trail === "eachWeek" && weekOf) {
        const w = weekOf(i);
        // The last completed week: the week before session i's, or session i's
        // own when i is the week's last session (the next session opens a new week).
        const done = i + 1 < daily.length && weekOf(i + 1) !== w ? w : w - 1;
        if (done >= 0) level = position.side === "long" ? weeks[done].l : weeks[done].h;
      } else {
        const pivot = position.side === "long" ? sw.lastBottom : sw.lastTop;
        if (pivot && pivot.index >= position.openIndex) level = pivot.price;
      }
      if (level !== null) {
        const trailed = level - dir * threePoints(level);
        if (dir * (trailed - position.stop) > 0) {
          position.stop = trailed;
          position.stopReason = "prior_week";
        }
      }
    }

    // 5. Arm a crossing on this close: the first close 3 points past the old
    // top (bottom). Each level is read once, so a crossing made while a trade
    // was open is never armed late.
    if (i + 1 < daily.length) {
      for (const side of ["long", "short"] as const) {
        if (side === "short" && !shorts) continue;
        const pivot = side === "long" ? sw.lastTop : sw.lastBottom;
        if (!pivot) continue;
        const seen = side === "long" ? crossedTops : crossedBottoms;
        if (seen.has(pivot.index)) continue;
        const dir = sign(side);
        const allowance = threePoints(pivot.price);
        if (dir * (bar.c - (pivot.price + dir * allowance)) < 0) continue;
        seen.add(pivot.index);
        if (pos) continue;
        // The decision is for the next session, read on the trend it opens on.
        if (mainTrendFor(i + 1) !== (side === "long" ? "bullish" : "bearish")) continue;
        armed++;
        const stop = pivot.price - dir * allowance;
        const verdict = readRules(i + 1, side, "crossing", stop);
        if (blocks(verdict)) continue;
        pending = { side, pivotIndex: pivot.index, level: pivot.price, limit: pivot.price + dir * (allowance / 3), stop, rules: verdict ?? undefined };
      }
    }
    // A crossing that closes 3 points back through its old level has failed.
    // One the market ran away from, making a newer swing top (bottom) on the
    // weekly chart, is withdrawn: the reaction from that top is the next buy.
    if (pending) {
      const order: PendingCrossing = pending;
      const dir = sign(order.side);
      const newer = order.side === "long" ? sw.lastTop : sw.lastBottom;
      if (dir * (bar.c - order.stop) < 0 || (newer !== null && newer.index > order.pivotIndex)) pending = null;
    }
  }

  if (pos) {
    const last = daily.length - 1;
    close(last, daily[last].c, "open_at_end", true);
  }

  const result = summarise(trades, armed, triggered, refusedFills) as CoreResult;
  return result;

  /**
   * A 2-3 week reaction against `side` that has held, read on the sessions
   * completed before `i`: the weekly chart's line turned against the side off
   * its last top (bottom, short), the reaction's extreme at least
   * `REACTION_MIN_DAYS` after it and `HOLD_SESSIONS` sessions old, and not 3
   * points through the previous bottom (top).
   */
  function readReaction(side: CoreSide, i: number): { pivotIndex: number; stop: number } | null {
    const dir = sign(side);
    const against: SwingDirection = side === "long" ? "bearish" : "bullish";
    if (line !== against) return null;
    const pivot = side === "long" ? sw.lastTop : sw.lastBottom;
    if (!pivot) return null;
    let ext = -1;
    for (let k = pivot.index + 1; k < i; k++) {
      if (ext < 0 || (dir === 1 ? daily[k].l < daily[ext].l : daily[k].h > daily[ext].h)) ext = k;
    }
    if (ext < 0) return null;
    if (days(daily[pivot.index], daily[ext]) < REACTION_MIN_DAYS) return null;
    if (i - 1 - ext < HOLD_SESSIONS) return null;
    const extreme = dir === 1 ? daily[ext].l : daily[ext].h;
    // The support the reaction came down to: the weekly chart's bottom before the top (top before the bottom, short).
    const prior = side === "long" ? sw.lastBottom : sw.lastTop;
    if (prior && prior.index < pivot.index && dir * (extreme - (prior.price - dir * threePoints(prior.price))) < 0) return null;
    return { pivotIndex: pivot.index, stop: extreme - dir * threePoints(extreme) };
  }
}

/** Maps a daily index to its week's index in `weeks` (both rolled the same way). */
function weekIndexer(daily: Bar[], weeks: Bar[]): (i: number) => number {
  const index: number[] = [];
  let w = -1;
  let lastKey = "";
  for (const b of daily) {
    const d = new Date(b.t);
    const key = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    if (key !== lastKey) {
      w++;
      lastKey = key;
    }
    index.push(Math.min(w, weeks.length - 1));
  }
  return (i: number) => index[i];
}

/** Campaign figures for a core run: the whole line against the first lot alone, by side. */
export interface CoreSummary {
  campaigns: number;
  lineR: number;
  firstLotR: number;
  lineExpectancyR: number;
  firstLotExpectancyR: number;
  pyramided: number;
  meanLots: number;
  closed: { campaigns: number; lineExpectancyR: number };
  bySide: Record<CoreSide, { campaigns: number; lineExpectancyR: number; firstLotExpectancyR: number }>;
  byEntry: Record<CoreEntryKind, { campaigns: number; lineExpectancyR: number }>;
}

export function summariseCore(trades: ReplayTrade[]): CoreSummary {
  const core = trades.filter(isCoreTrade);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const side = (s: CoreSide) => {
    const t = core.filter((c) => c.side === s);
    return { campaigns: t.length, lineExpectancyR: mean(t.map((c) => c.rMultiple)), firstLotExpectancyR: mean(t.map((c) => c.rFirstLot)) };
  };
  const entry = (k: CoreEntryKind) => {
    const t = core.filter((c) => c.coreEntryKind === k);
    return { campaigns: t.length, lineExpectancyR: mean(t.map((c) => c.rMultiple)) };
  };
  const closed = core.filter((c) => c.exitReason !== "open_at_end");
  return {
    campaigns: core.length,
    lineR: sum(core.map((c) => c.rMultiple)),
    firstLotR: sum(core.map((c) => c.rFirstLot)),
    lineExpectancyR: mean(core.map((c) => c.rMultiple)),
    firstLotExpectancyR: mean(core.map((c) => c.rFirstLot)),
    pyramided: core.filter((c) => c.lotFills.length > 1).length,
    meanLots: mean(core.map((c) => c.lotFills.length)),
    closed: { campaigns: closed.length, lineExpectancyR: mean(closed.map((c) => c.rMultiple)) },
    bySide: { long: side("long"), short: side("short") },
    byEntry: { crossing: entry("crossing"), reaction: entry("reaction") },
  };
}
