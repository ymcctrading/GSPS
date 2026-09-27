/**
 * Stage A of the Gann parity roadmap (`docs/memory-bank/GANN_PARITY_ROADMAP.md`):
 * seven of Gann's disclosed rules that GSPS did not yet compute, added as
 * **context only**. Nothing here feeds a scored criterion, a gate, a plan, an
 * entry, a stop or a target. Each reading is shown on the confluence card and
 * in the explanation trace, so a trader sees the rule and the evidence, and
 * so the backtest can measure it before anything is allowed to gate (AGENTS.md
 * "Gann-derived AND measured").
 *
 * The rules, each with its source (all Tier A, Gann's own books or lessons):
 *
 * 1. **Close vs the bar's midpoint** (Master Course Ch. 13; master report
 *    Part I §3.2). A close above the half-way point of the bar's range reads
 *    up, below reads down, "at least temporarily". Gann's own per-bar trend
 *    read.
 * 2. **Percentages of the extreme price**, not only of the range (*How to
 *    Make Profits in Commodities*, pp. 32-34; *45 Years in Wall Street*,
 *    Rule 3). Divide the low by 8 and add the eighths above it (12½% to
 *    100%); divide the high by 8 and by 3. 50% and 100% of a bottom, and 50%
 *    of the high, are "the most important".
 * 3. **Day-count bands from a pivot** (*45 Years in Wall Street*, Rule 8):
 *    7-12, 18-21, 28-31, 42-49, 57-65, 85-92, 112-120, 150-157 and 175-185
 *    days from any important high or low.
 * 4. **The counter-move clock** (Master Course Ch. 11B, 14, 17; *Wall Street
 *    Stock Selector* Ch. IV; A09 Rule 4). Reactions in a bull market (rallies
 *    in a bear) usually run 2-3 weeks, 14 and 21 days most often; strong
 *    stocks seldom react into a second month; a counter-move reaching its
 *    third month signals a change in trend.
 * 5. **Tests of a level** (*Commodities* p. 43; A09 Rule 2). Double and
 *    triple tops and bottoms hold; the 4th test of a level usually breaks
 *    through.
 * 6. **Ranked fractions of the year** (Master Course Ch. 13-14). From a
 *    pivot: the anniversary first, then ½ year, then ¼ and ¾, then ⅓ and ⅔,
 *    then the eighths.
 * 7. **The Rule of Three on weekly and monthly bars** (*Wall Street Stock
 *    Selector*, p. 72, which applies the rule to the weekly and monthly
 *    charts as well as the daily). The daily form is already scored
 *    (`ruleOfThree.ts`); this adds the two coarser readings.
 *
 * Engineering choices, labelled as such rather than dressed as sourced:
 * - The percentage-of-price anchors are the lowest low and highest high of
 *   the bars supplied (about a year of daily bars in the scan). Gann ranks
 *   the all-time extremes first; this is the nearest the scan's history
 *   reaches.
 * - A level "test" is a completed 3-Day Chart swing extreme within 1% of the
 *   level, the same tolerance `combineNearbyLevels` uses. Gann's own band is
 *   1-3 points on 1920s-40s prices, which doesn't port literally.
 * - The weekly and monthly bars for rule 7 are built from the daily bars and
 *   include the week and month in progress, so their last close can still
 *   change until that period ends.
 * - Pivots for rules 3 and 6 are the scan's major pivots (`majorPivots`),
 *   the same anchors `timeCycles.ts` projects from, and the fraction windows
 *   use its ±2-day allowance.
 *
 * Three-question basis:
 * 1. Gann: as cited per rule above.
 * 2. Cycles: rules 3, 4 and 6 are periodicity or recurrence claims. None has
 *    been tested against a base rate, so no Dewey item is cleared yet
 *    (dominance, repetition count, cross-series clustering all untested).
 *    That is exactly why they are context only until measured (master
 *    report M4). Rules 1, 2, 5 and 7 make no periodicity claim.
 * 3. Hermetic: Correspondence (the Rule of Three and the swing rules read
 *    the same on daily, weekly and monthly bars; percentages of time mirror
 *    percentages of price) and Rhythm (the counter-move clock measures
 *    whether the market's pull-back rhythm is still normal).
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { computeRuleOfThree, type RuleOfThreeReading } from "@/lib/gann/ruleOfThree";
import { DAY_COUNT_BANDS } from "@/lib/gann/timeCycles";
import { buildCampaignLedger, describeCampaignLedger, type CampaignLedger } from "@/lib/gann/campaignLedger";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

// ---------------------------------------------------------------------------
// 1. Close vs the bar's midpoint

export interface BarMidpointReading {
  /** "up" when the last close is above (high + low) / 2, "down" below, "even" on it. */
  lastBar: "up" | "down" | "even";
  /** Of the last 5 bars, how many closed above their midpoint. */
  upOfLast5: number;
}

export function readBarMidpoint(bars: Bar[]): BarMidpointReading | null {
  if (bars.length === 0) return null;
  const side = (b: Bar): "up" | "down" | "even" => {
    const mid = (b.h + b.l) / 2;
    return b.c > mid ? "up" : b.c < mid ? "down" : "even";
  };
  const last5 = bars.slice(-5);
  return {
    lastBar: side(bars[bars.length - 1]),
    upOfLast5: last5.filter((b) => side(b) === "up").length,
  };
}

// ---------------------------------------------------------------------------
// 2. Percentages of the extreme price

export interface PricePercentageLevel {
  price: number;
  label: string;
  /** 1 = most important (50% and 100% of the low, 50% of the high), 2 = the rest. */
  importance: 1 | 2;
}

export interface PricePercentageReading {
  lowAnchor: number;
  highAnchor: number;
  nearestAbove: PricePercentageLevel | null;
  nearestBelow: PricePercentageLevel | null;
}

export function pricePercentageLevels(low: number, high: number): PricePercentageLevel[] {
  const levels: PricePercentageLevel[] = [];
  for (let k = 1; k <= 8; k++) {
    levels.push({
      price: low * (1 + k / 8),
      label: `${(k * 12.5).toFixed(1).replace(/\.0$/, "")}% above the low`,
      importance: k === 4 || k === 8 ? 1 : 2,
    });
  }
  for (let k = 1; k <= 7; k++) {
    levels.push({
      price: high * (k / 8),
      label: `${k}/8 of the high`,
      importance: k === 4 ? 1 : 2,
    });
  }
  levels.push({ price: high / 3, label: "1/3 of the high", importance: 2 });
  levels.push({ price: (high * 2) / 3, label: "2/3 of the high", importance: 2 });
  return levels.sort((a, b) => a.price - b.price);
}

/**
 * Gann's three "most important" percentage-of-price levels (50% and 100% above
 * the low, 50% of the high) from the lowest low and highest high of `bars`.
 * These join the scan's support and resistance list (added 2026-09-27, owner
 * direction to implement Gann's method throughout). The scan passes its
 * monthly history, so the anchors are the longest-range extremes it holds,
 * which Gann ranks first (*Commodities* p. 34).
 */
export function majorPricePercentageLevels(bars: Bar[]): number[] {
  if (bars.length === 0) return [];
  const low = Math.min(...bars.map((b) => b.l));
  const high = Math.max(...bars.map((b) => b.h));
  if (!(low > 0) || !(high > low)) return [];
  return pricePercentageLevels(low, high)
    .filter((l) => l.importance === 1)
    .map((l) => l.price);
}

export function readPricePercentages(bars: Bar[], currentPrice: number): PricePercentageReading | null {
  if (bars.length === 0 || !(currentPrice > 0)) return null;
  const low = Math.min(...bars.map((b) => b.l));
  const high = Math.max(...bars.map((b) => b.h));
  if (!(low > 0) || !(high > low)) return null;
  const levels = pricePercentageLevels(low, high);
  const above = levels.filter((l) => l.price > currentPrice);
  const below = levels.filter((l) => l.price < currentPrice);
  return {
    lowAnchor: low,
    highAnchor: high,
    nearestAbove: above.length > 0 ? above[0] : null,
    nearestBelow: below.length > 0 ? below[below.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// 3. Day-count bands, and 6. ranked fractions of the year

export { DAY_COUNT_BANDS };

/** Fractions of the 360-day year from a pivot, with Gann's ranking (1 = most important). */
export const YEAR_FRACTIONS: readonly { days: number; label: string; rank: number }[] = [
  { days: 45, label: "1/8 year", rank: 5 },
  { days: 90, label: "1/4 year", rank: 3 },
  { days: 120, label: "1/3 year", rank: 4 },
  { days: 135, label: "3/8 year", rank: 5 },
  { days: 180, label: "1/2 year", rank: 2 },
  { days: 225, label: "5/8 year", rank: 5 },
  { days: 240, label: "2/3 year", rank: 4 },
  { days: 270, label: "3/4 year", rank: 3 },
  { days: 315, label: "7/8 year", rank: 5 },
  { days: 360, label: "anniversary", rank: 1 },
];

const FRACTION_WINDOW_DAYS = 2;

export interface PivotTimeReading {
  pivotDate: string;
  pivotKind: "high" | "low";
  daysSincePivot: number;
}

export interface DayCountBandReading extends PivotTimeReading {
  band: [number, number];
}

export interface YearFractionReading extends PivotTimeReading {
  fraction: string;
  rank: number;
}

function recentMajorPivots(bars: Bar[]) {
  return majorPivots(findPivots(bars, 5)).slice(-8);
}

/** Day-count bands currently active from any recent major pivot, most recent pivot first. */
export function readDayCountBands(bars: Bar[]): DayCountBandReading[] {
  if (bars.length === 0) return [];
  const last = bars[bars.length - 1].t;
  const out: DayCountBandReading[] = [];
  for (const p of recentMajorPivots(bars).reverse()) {
    const days = daysBetween(p.bar.t, last);
    const band = DAY_COUNT_BANDS.find(([lo, hi]) => days >= lo && days <= hi);
    if (band) out.push({ pivotDate: p.bar.t.slice(0, 10), pivotKind: p.kind, daysSincePivot: days, band: [band[0], band[1]] });
  }
  return out;
}

/** The highest-ranked fraction of the year active from any recent major pivot, or null. */
export function readYearFraction(bars: Bar[]): YearFractionReading | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1].t;
  let best: YearFractionReading | null = null;
  for (const p of recentMajorPivots(bars)) {
    const days = daysBetween(p.bar.t, last);
    for (const f of YEAR_FRACTIONS) {
      if (Math.abs(days - f.days) > FRACTION_WINDOW_DAYS) continue;
      if (!best || f.rank < best.rank) {
        best = { pivotDate: p.bar.t.slice(0, 10), pivotKind: p.kind, daysSincePivot: days, fraction: f.label, rank: f.rank };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 4. The counter-move clock

export type CounterMovePhase =
  /** Up to 3 weeks: Gann's normal reaction (14 and 21 days most common). */
  | "normal"
  /** 22-30 days: longer than the usual 2-3 weeks. */
  | "extended"
  /** 31-60 days: into a 2nd month, which strong trends seldom reach. */
  | "secondMonth"
  /** 61+ days: a 3rd month, which signals a change in trend. */
  | "thirdMonth";

export interface CounterMoveReading {
  /** The weekly chart's trend the counter-move runs against. */
  trend: "bullish" | "bearish";
  /** True when the 3-Day Chart's line is moving against that trend. */
  inCounterMove: boolean;
  /** Calendar days since the swing extreme the counter-move started from (0 when not in one). */
  days: number;
  phase: CounterMovePhase | null;
}

export function counterMovePhase(days: number): CounterMovePhase {
  if (days <= 21) return "normal";
  if (days <= 30) return "extended";
  if (days <= 60) return "secondMonth";
  return "thirdMonth";
}

export function readCounterMove(bars: Bar[]): CounterMoveReading | null {
  const weekly = walkSwingChart(bars, WEEKLY_SWING_CHART);
  if (weekly.trend === null) return null;
  const daily = walkSwingChart(bars, THREE_DAY_CHART);
  const against = daily.swingDirection !== null && daily.swingDirection !== weekly.trend;
  const start = daily.pivots[daily.pivots.length - 1];
  // Crossing the swing extreme the counter-move started from ends it.
  const resumed =
    start !== undefined &&
    bars.slice(start.index + 1).some((b) => (weekly.trend === "bullish" ? b.h > start.price : b.l < start.price));
  if (!against || !start || resumed) return { trend: weekly.trend, inCounterMove: false, days: 0, phase: null };
  const days = daysBetween(bars[start.index].t, bars[bars.length - 1].t);
  return { trend: weekly.trend, inCounterMove: true, days, phase: counterMovePhase(days) };
}

// ---------------------------------------------------------------------------
// 5. Tests of a level

export const LEVEL_TEST_TOLERANCE_PCT = 1.0;

export interface LevelTestReading {
  level: number;
  /** How many completed swing extremes have tested this level. */
  tests: number;
}

export interface LevelTestsReading {
  support: LevelTestReading | null;
  resistance: LevelTestReading | null;
}

function nearestTestedLevel(prices: number[], currentPrice: number, side: "below" | "above"): LevelTestReading | null {
  const candidates = prices.filter((p) => (side === "below" ? p < currentPrice : p > currentPrice));
  if (candidates.length === 0) return null;
  const nearest = candidates.reduce((a, b) => (Math.abs(b - currentPrice) < Math.abs(a - currentPrice) ? b : a));
  const cluster = prices.filter((p) => (Math.abs(p - nearest) / nearest) * 100 <= LEVEL_TEST_TOLERANCE_PCT);
  const level = cluster.reduce((s, p) => s + p, 0) / cluster.length;
  return { level, tests: cluster.length };
}

export function readLevelTests(bars: Bar[], currentPrice: number): LevelTestsReading {
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;
  const bottoms = pivots.filter((p) => p.kind === "bottom").map((p) => p.price);
  const tops = pivots.filter((p) => p.kind === "top").map((p) => p.price);
  return {
    support: nearestTestedLevel(bottoms, currentPrice, "below"),
    resistance: nearestTestedLevel(tops, currentPrice, "above"),
  };
}

// ---------------------------------------------------------------------------
// 7. The Rule of Three on weekly and monthly bars

function resample(bars: Bar[], key: (d: Date) => string): Bar[] {
  const out: Bar[] = [];
  let currentKey: string | null = null;
  for (const b of bars) {
    const k = key(new Date(b.t));
    if (k !== currentKey) {
      out.push({ ...b });
      currentKey = k;
    } else {
      const agg = out[out.length - 1];
      agg.h = Math.max(agg.h, b.h);
      agg.l = Math.min(agg.l, b.l);
      agg.c = b.c;
      agg.v += b.v;
    }
  }
  return out;
}

/** Weeks start on Monday (UTC). */
function weekKey(d: Date): string {
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function toWeeklyBars(daily: Bar[]): Bar[] {
  return resample(daily, weekKey);
}

export function toMonthlyBars(daily: Bar[]): Bar[] {
  return resample(daily, monthKey);
}

export interface RuleOfThreeTimeframes {
  weekly: RuleOfThreeReading | null;
  monthly: RuleOfThreeReading | null;
}

export function readRuleOfThreeTimeframes(daily: Bar[]): RuleOfThreeTimeframes {
  const weekly = toWeeklyBars(daily);
  const monthly = toMonthlyBars(daily);
  return {
    weekly: weekly.length >= 4 ? computeRuleOfThree(weekly) : null,
    monthly: monthly.length >= 4 ? computeRuleOfThree(monthly) : null,
  };
}

// ---------------------------------------------------------------------------

export interface DisclosedRulesContext {
  barMidpoint: BarMidpointReading | null;
  pricePercentages: PricePercentageReading | null;
  dayCountBands: DayCountBandReading[];
  yearFraction: YearFractionReading | null;
  counterMove: CounterMoveReading | null;
  levelTests: LevelTestsReading;
  ruleOfThree: RuleOfThreeTimeframes;
  /** The campaign counter-move ledger (Stage B2). See `campaignLedger.ts`. */
  campaign: CampaignLedger | null;
}

export const EMPTY_DISCLOSED_RULES: DisclosedRulesContext = {
  barMidpoint: null,
  pricePercentages: null,
  dayCountBands: [],
  yearFraction: null,
  counterMove: null,
  levelTests: { support: null, resistance: null },
  ruleOfThree: { weekly: null, monthly: null },
  campaign: null,
};

export function readDisclosedRules(dailyBars: Bar[], currentPrice: number): DisclosedRulesContext {
  return {
    barMidpoint: readBarMidpoint(dailyBars),
    pricePercentages: readPricePercentages(dailyBars, currentPrice),
    dayCountBands: readDayCountBands(dailyBars),
    yearFraction: readYearFraction(dailyBars),
    counterMove: readCounterMove(dailyBars),
    levelTests: readLevelTests(dailyBars, currentPrice),
    ruleOfThree: readRuleOfThreeTimeframes(dailyBars),
    campaign: buildCampaignLedger(dailyBars),
  };
}

/** Plain-language lines for the explanation trace. */
export function describeDisclosedRules(ctx: DisclosedRulesContext): string[] {
  const lines: string[] = ctx.campaign ? describeCampaignLedger(ctx.campaign) : [];
  if (ctx.barMidpoint) {
    lines.push(
      `Close vs bar midpoint: last bar ${ctx.barMidpoint.lastBar}; ${ctx.barMidpoint.upOfLast5} of the last 5 closed above their midpoint.`,
    );
  }
  if (ctx.pricePercentages) {
    const { nearestAbove: a, nearestBelow: b } = ctx.pricePercentages;
    lines.push(
      `Percentage-of-price levels: above ${a ? `${a.price.toFixed(2)} (${a.label}${a.importance === 1 ? ", major" : ""})` : "none"}; below ${b ? `${b.price.toFixed(2)} (${b.label}${b.importance === 1 ? ", major" : ""})` : "none"}.`,
    );
  }
  for (const d of ctx.dayCountBands.slice(0, 2)) {
    lines.push(`${d.daysSincePivot} days from the ${d.pivotKind} of ${d.pivotDate}: inside the ${d.band[0]}-${d.band[1]} day band.`);
  }
  if (ctx.yearFraction) {
    lines.push(
      `${ctx.yearFraction.fraction} (${ctx.yearFraction.daysSincePivot} days) from the ${ctx.yearFraction.pivotKind} of ${ctx.yearFraction.pivotDate}; rank ${ctx.yearFraction.rank} of 5 (1 = anniversary).`,
    );
  }
  if (ctx.counterMove?.inCounterMove && ctx.counterMove.phase) {
    const note = {
      normal: "within the usual 2-3 weeks",
      extended: "longer than the usual 3 weeks",
      secondMonth: "into a second month, which strong trends seldom reach",
      thirdMonth: "in its third month, which signals a change in trend",
    }[ctx.counterMove.phase];
    lines.push(`Counter-move against the ${ctx.counterMove.trend} trend: ${ctx.counterMove.days} days, ${note}.`);
  }
  for (const [name, t] of [["support", ctx.levelTests.support], ["resistance", ctx.levelTests.resistance]] as const) {
    if (t && t.tests >= 2) {
      lines.push(
        `Nearest ${name} ${t.level.toFixed(2)} tested ${t.tests} times${t.tests >= 3 ? "; a 4th test usually breaks through" : ""}.`,
      );
    }
  }
  for (const [name, r] of [["Weekly", ctx.ruleOfThree.weekly], ["Monthly", ctx.ruleOfThree.monthly]] as const) {
    if (r?.bearishSignal) lines.push(`${name} Rule of Three: ${r.consecutiveLowerCloses} lower closes in a row.`);
    else if (r?.bullishSignal) lines.push(`${name} Rule of Three: ${r.consecutiveHigherCloses} higher closes in a row.`);
  }
  return lines;
}
