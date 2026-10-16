/**
 * Stage A of the Gann parity roadmap (`docs/memory-bank/GANN_PARITY_ROADMAP.md`):
 * seven of Gann's disclosed rules that GSPS did not yet compute, added as
 * **context only**. Nothing here feeds a scored criterion, a gate, a plan, an
 * entry, a stop or a target. Each reading is shown on the confluence card and
 * in the explanation trace, so a trader sees the rule and the evidence, and
 * so the backtest can measure it before anything is allowed to gate (AGENTS.md
 * "Gann-derived AND measured").
 *
 * The rules, each with its source (Tier A, Gann's own books or lessons,
 * except rule 1):
 *
 * 1. **Close vs the bar's midpoint** — **class C, relabelled 2026-10-16
 *    (M-R7).** A close above the half-way point of the bar's range reads up,
 *    below reads down. The finished reading of the Master Course did not find
 *    this up/down reading in Gann's text: Ch. 13 (PDF 377, 1953) lists "high,
 *    low, half-way, open, close" as five factors but gives no reading of the
 *    close against the half-way point, and Ch. 3 (PDF 72) uses the half-way
 *    point of the last *move*, not of a bar. It is this repo's own reading,
 *    so it stays context only: it feeds one measured factor
 *    (`closeVsMidpointAgrees`) and a card tile, and never a score, gate,
 *    plan or order.
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
 * Stage D adds two readings that need per-symbol facts from filings rather
 * than bars (the `instrument` argument): volume against shares outstanding
 * (D2, `capitalStock.ts`) and time from the company's inception date (D3,
 * `incorporationCycle.ts`). Each carries its own sources and choices.
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

import { readHalfwayRetest, type HalfwayRetestReading } from "@/lib/gann/halfwayRetest";
import { readNarrowRangeBreak, type NarrowRangeBreakReading } from "@/lib/gann/narrowRange";
import { readNarrowWeekBreak, type NarrowWeekBreakReading } from "@/lib/gann/narrowWeek";
import { readSuccessiveSwings, type SuccessiveSwings } from "@/lib/gann/trendStrength";
import { readFalseBreakout, type FalseBreakoutReading } from "@/lib/gann/falseBreakout";
import { readTimeRules, type TimeRulesReading } from "@/lib/gann/timeRules";
import { etDateKey } from "@/lib/market/session";
import { computeMidpointFan, readMonthlySquareFromHigh, type MonthlySquareReading, type MidpointFan } from "@/lib/gann/midpointFan";
import { readCampaignBottoms, type CampaignBottomLadder } from "@/lib/gann/campaignBottoms";
import {
  annualRange,
  integerSquareLevels,
  monthlyAngle,
  priceZone,
  readFirstFallFromHigh,
  STOCK_POINTS_PER_MONTH,
  type AnnualRangeReading,
  type FirstFallReading,
  type PriceZone,
} from "@/lib/gann/priceZone";
import { beyondByThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";
import { readMultipleTops, type MultipleTopsReading } from "@/lib/gann/multipleTops";
import { readRuleFollowing, type RuleFollowingReading } from "@/lib/gann/ruleFollowing";
import { readSeasonalCount, type SeasonalCountReading } from "@/lib/gann/seasonalCounts";
import { describeSecondaryTime, readSecondaryTime, type SecondaryTimeReading } from "@/lib/gann/secondaryTime";
import { describeTimeCounts, readTimeCounts, type TimeCountsReading } from "@/lib/gann/timeCounts";
import { readAccumulation, type AccumulationReading } from "@/lib/gann/accumulation";
import { readSharesPerPoint, type SharesPerPointReading } from "@/lib/gann/sharesPerPoint";
import { monthlyWithCurrent, readLeadership, readWeakStock, type LeadershipReading, type WeakStockReading } from "@/lib/gann/leadership";
import { describeSevenZones, readSevenZones, type ZoneReading } from "@/lib/gann/sevenZones";
import { approachingFigure, type ApproachReading } from "@/lib/gann/evenFigures";
import { describePriceGrids, readPriceGrids, type PriceGridReading } from "@/lib/gann/priceGrids";
import { describePriceAsTime, readPriceAsTime, type PriceAsTimeReading } from "@/lib/gann/priceAsTime";
import { describeAngleCrossings, readAngleCrossings, type AngleCrossingsReading } from "@/lib/gann/angleCrossings";
import { describeYearRanges, readYearRanges, type YearRangesReading } from "@/lib/gann/yearRanges";
import { describeDecadeAnalogue, readDecadeAnalogue, type DecadeAnalogueReading } from "@/lib/gann/decadeAnalogue";
import { squareOf52Windows, type SquareOf52Result } from "@/lib/gann/squareOf52";
import { computeDecadeCycle, type DecadeCycleReading } from "@/lib/gann/decadeCycle";
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { closesAfter } from "@/lib/analysis/trend";
import { computeRuleOfThree, type RuleOfThreeReading } from "@/lib/gann/ruleOfThree";
import { DAY_COUNT_BANDS } from "@/lib/gann/timeCycles";
import { buildCampaignLedger, describeCampaignLedger, SECOND_MONTH_END_DAYS, type CampaignLedger } from "@/lib/gann/campaignLedger";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { readExtremeRules, type ExtremeRulesReading } from "@/lib/gann/extremeRules";
import { readTiming, type TimingReading } from "@/lib/gann/timeConvergence";
import { describeOvernightChart, readOvernightChart, type OvernightReading } from "@/lib/gann/overnightChart";
import { describeCloseCluster, readCloseCluster, type CloseClusterReading } from "@/lib/gann/closeCluster";
import { describeAstroRules, readAstroRules, type AstroReading } from "@/lib/gann/astroRules";
import { describeCapitalStock, readCapitalStock, type CapitalStockReading } from "@/lib/gann/capitalStock";
import { computeVolumeClimax } from "@/lib/gann/volumeClimax";
import { readDistributionBreakdown, readDistributionStanding, type DistributionReading, type DistributionStanding } from "@/lib/gann/distribution";
import { readBreakawayVolume, type BreakawayVolumeReading } from "@/lib/gann/breakaway";
import { describeTopVolumeWarning, readTopVolumeWarning, type TopVolumeWarningReading } from "@/lib/gann/topVolume";
import { readMonthCounts, readSwingMonthCounts, type PivotMonthCount } from "@/lib/gann/angleMonthCounts";
import { describeBearDuration, readBearDuration, type BearDurationReading } from "@/lib/gann/bearDuration";
import { gannPointForBars } from "@/lib/gann/pointScale";
import { describeMasterCalculator, readMasterCalculator, type MasterCalculatorReading } from "@/lib/gann/masterCalculator";
import {
  describeCircle,
  describeTimeAngle,
  readCircle,
  readTimeAngle,
  type CircleReading,
  type TimeAngleReading,
} from "@/lib/gann/circleOf360";
import { describePlanetaryAverages, readPlanetaryAverages, type PlanetaryReading } from "@/lib/gann/planetaryAverages";
import { describeSquareOfNineTime, readSquareOfNineTime, type SquareOfNineTimeHit } from "@/lib/gann/squareOfNineTime";
import { describeHexagonTime, readHexagonTime, type HexagonTimeHit } from "@/lib/gann/hexagonTime";
import { describeMasterChartTime, readMasterChartTime, type MasterChartHit } from "@/lib/gann/masterChartTime";
import { describeCampaignLength, readCampaignLength, type CampaignLengthReading } from "@/lib/gann/campaignLength";
import { describeFoundingCounts, readFoundingCounts, type FoundingCountReading } from "@/lib/gann/incorporationCycle";
import { describeOutbreakCounts, readOutbreakCounts, type OutbreakCountHit } from "@/lib/gann/outbreakCounts";
import { describeOneByOneBreak, readOneByOneBreak, type OneByOneBreak } from "@/lib/gann/fans";
import { describePatternAngles, readPatternAngles, type PatternAngleReading } from "@/lib/gann/patternAngles";
import { describeDayCircle, readDayCircle, type DayCircleReading } from "@/lib/gann/dayCircle";
import {
  describeIncorporationCycle,
  readIncorporationCycle,
  type Inception,
  type IncorporationCycleReading,
} from "@/lib/gann/incorporationCycle";

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

// ---------------------------------------------------------------------------
// 1. Close vs the bar's midpoint (class C, the repo's own reading; M-R7)

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
  /** 1 = most important (50% and 100% of the low and its multiples, 50% of the high), 2 = the rest. */
  importance: 1 | 2;
  /** For a multiple of the low past 100%: how many times the low it is above it (2 = 200% above). */
  multiple?: number;
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
  // "100% of the low and multiples", second only to 50% (45 Years Ch. IV
  // p. 30, class A, page-checked 2026-10-16; the rye table runs to 700%,
  // Commodities pp. 161-162): 200%, 300% ... above the low, projected up to
  // 12 times the low (the compiler's 1-12 times, C-PRICE-02, W003 p.21) and
  // past the record's high to the first multiple over it, so a market at a
  // new high still has one ahead (batch review C1; the reach is an
  // engineering choice, labelled).
  const reach = Math.max(12 * low, high);
  for (let m = 2; low > 0; m++) {
    levels.push({ price: low * (1 + m), label: `${m * 100}% above the low`, importance: 1, multiple: m });
    if (low * (1 + m) >= reach) break;
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
  // The multiples of the low past 100% stay on the card until a replay
  // measures them in the pool (fork FL8, item 9 step 5).
  return pricePercentageLevels(low, high)
    .filter((l) => l.importance === 1 && l.multiple === undefined)
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
  /** 61+ days: a 3rd month. The trend changes only when the reaction is still making new extremes there (`CampaignLedger.counterMoveThirdMonth`). */
  | "thirdMonth";

export interface CounterMoveReading {
  /** The weekly chart's trend the counter-move runs against. */
  trend: "bullish" | "bearish";
  /** True when the 3-Day Chart's line is moving against that trend. */
  inCounterMove: boolean;
  /** Calendar days since the swing extreme the counter-move started from (0 when not in one). */
  days: number;
  /** Trading days (bars) since that extreme (0 when not in one). */
  tradingDays?: number;
  phase: CounterMovePhase | null;
}

export function counterMovePhase(days: number): CounterMovePhase {
  if (days <= 21) return "normal";
  if (days <= 30) return "extended";
  if (days <= SECOND_MONTH_END_DAYS) return "secondMonth";
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
  if (!against || !start || resumed) return { trend: weekly.trend, inCounterMove: false, days: 0, tradingDays: 0, phase: null };
  const days = daysBetween(bars[start.index].t, bars[bars.length - 1].t);
  return { trend: weekly.trend, inCounterMove: true, days, tradingDays: bars.length - 1 - start.index, phase: counterMovePhase(days) };
}

// ---------------------------------------------------------------------------
// 5. Tests of a level

/**
 * Swing extremes within Gann's 3 points of each other test the same level
 * (A-LEVELS-06, W006 pp.11, 24), price-scaled by `pointScale.ts`; 1% until
 * 2026-10-16.
 */

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
  const cluster = prices.filter((p) => (Math.abs(p - nearest) / nearest) * 100 <= gannThreePointsPct(nearest));
  const level = cluster.reduce((s, p) => s + p, 0) / cluster.length;
  return { level, tests: cluster.length };
}

export function readLevelTests(bars: Bar[], currentPrice: number): LevelTestsReading {
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;
  // "Old tops become bottoms, old bottoms later become tops" (A-LEVELS-01,
  // W006 p.13, pp.40-41): a top a later close has cleared by Gann's 3 points
  // tests as support, and a bottom a later close has broken by them as
  // resistance (fork FL1 a, 2026-10-16), the same rule `readTrend` applies.
  const { maxAfter, minAfter } = closesAfter(bars);
  const crossed = (p: (typeof pivots)[number]) =>
    p.kind === "top" ? maxAfter[p.index] > beyondByThreePoints(p.price, 1) : minAfter[p.index] < beyondByThreePoints(p.price, -1);
  const supports = pivots.filter((p) => p.kind === "bottom" || crossed(p)).map((p) => p.price);
  const resistances = pivots.filter((p) => p.kind === "top" || crossed(p)).map((p) => p.price);
  return {
    support: nearestTestedLevel(supports, currentPrice, "below"),
    resistance: nearestTestedLevel(resistances, currentPrice, "above"),
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
// The 5th unit of a run: Ascension (C-TREND-08)
//
// "The 5th is the day, week, month, or year of Ascension and always marks
// fast moves" (Master Course Ch. 7, PDF 223); "the 5th week is also very
// important" (*Commodities* p. 59). Read here as the 5th consecutive close in
// one direction on daily, weekly and monthly bars, an engineering reading of
// what the 5th unit counts from (Gann does not say), mirrored for lower
// closes (an engineering symmetry). The "4th consecutive higher week" rule is
// not in Gann's text and is not built. Context only, never gating.

export interface AscensionCount {
  direction: "up" | "down";
  /** Consecutive closes in that direction, ending at the last bar. */
  count: number;
  /** The last bar is the 5th: the unit of Ascension. */
  fifth: boolean;
}

export interface AscensionReading {
  daily: AscensionCount | null;
  weekly: AscensionCount | null;
  monthly: AscensionCount | null;
}

export const ASCENSION_UNIT = 5;

export function readAscensionCount(bars: Bar[]): AscensionCount | null {
  const n = bars.length;
  if (n < 2 || bars[n - 1].c === bars[n - 2].c) return null;
  const direction = bars[n - 1].c > bars[n - 2].c ? "up" : "down";
  let count = 0;
  for (let i = n - 1; i >= 1; i--) {
    const d = bars[i].c - bars[i - 1].c;
    if (direction === "up" ? d > 0 : d < 0) count++;
    else break;
  }
  return { direction, count, fifth: count === ASCENSION_UNIT };
}

export function readAscension(daily: Bar[]): AscensionReading {
  return {
    daily: readAscensionCount(daily),
    weekly: readAscensionCount(toWeeklyBars(daily)),
    monthly: readAscensionCount(toMonthlyBars(daily)),
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
  /** Reverse signal day, 7-10 Day Rule and gaps (Stage F1). See `extremeRules.ts`. */
  extremes: ExtremeRulesReading;
  /** 7/14-day alternation, Square of 144 convergence, projection dispersion (Stage F1). See `timeConvergence.ts`. */
  timing: TimingReading;
  /** Volume against shares outstanding (Stage D2). Null without a stored share count. See `capitalStock.ts`. */
  capitalStock: CapitalStockReading | null;
  /** Time from the company's inception date (Stage D3). Null without a stored date. See `incorporationCycle.ts`. */
  incorporation: IncorporationCycleReading | null;
  /** A round number within reach overhead and underneath (Gann's even figures). See `evenFigures.ts`. */
  evenFigures: { overhead: ApproachReading | null; underneath: ApproachReading | null };
  /** Gann's Seven Zones of Activity, read from behaviour. See `sevenZones.ts`. */
  zone: ZoneReading | null;
  /** The seasonal point (counted from March 21) today sits on. See `seasonalCounts.ts`. */
  seasonal: SeasonalCountReading | null;
  /** Time spent in the range price is in or leaving. See `accumulation.ts`. */
  accumulation: AccumulationReading | null;
  /** Volume per point of gain, current up leg against the prior one. See `sharesPerPoint.ts`. */
  sharesPerPoint: SharesPerPointReading | null;
  /** Early and late leaders, and the first-year high. See `leadership.ts`. */
  leadership: LeadershipReading | null;
  /** Gann's weak stocks in a bull market (A-TREND-07/-08, context only). See `readWeakStock`. */
  weakStock?: WeakStockReading | null;
  /** The 2–3-day halt and the reaction-week rules. See `timeRules.ts`. */
  timeRules: TimeRulesReading | null;
  /** Double and triple tops and bottoms. See `multipleTops.ts`. */
  multipleTops: MultipleTopsReading | null;
  /** Whether the stock's own buying and selling points worked (A-SELECTION-01, Q24). See `ruleFollowing.ts`. */
  ruleFollowing?: RuleFollowingReading | null;
  /** The first return to a broken 50% point (class C, context only). See `halfwayRetest.ts`. */
  halfwayRetest?: HalfwayRetestReading | null;
  /** A narrow 3-4 day range breaking (class C, context only). See `narrowRange.ts`. */
  narrowRangeBreak?: NarrowRangeBreakReading | null;
  /** A narrow week, then a sharp move on heavy volume (A-ENTRY-19, context only). See `narrowWeek.ts`. */
  narrowWeekBreak?: NarrowWeekBreakReading | null;
  /** Which higher bottom or lower top the market stands on (C-ENTRY-03, context only). See `readSuccessiveSwings`. */
  successiveSwings?: SuccessiveSwings | null;
  /** A move out of the 13-week range by under 3 points that failed the next week (C-STOP-01, context only). See `falseBreakout.ts`. */
  falseBreakout?: FalseBreakoutReading | null;
  /** The heaviest completed week since the last major top (A-VOLUME-12, context only). See `topVolume.ts`. */
  topVolume?: TopVolumeWarningReading | null;
  /** A second top at the first's level: its week's volume over the first top's week (A-VOLUME-13, context only). See `volumeClimax.ts`. */
  secondTopVolumeRatio?: number | null;
  /** After a lower weekly top, a narrow range broken down on volume, on the last completed session (A-VOLUME-03). See `distribution.ts`. */
  distribution?: DistributionReading | null;
  /** The breakdown, while it stands: it holds a new long to Watch and exits an open one (FV7 b). */
  distributionStanding?: DistributionStanding | null;
  /** Old campaign bottoms, newest first, and the one to look to next (A-LEVELS-03, context only). See `campaignBottoms.ts`. */
  campaignBottoms?: CampaignBottomLadder | null;
  /** Angles from the 50% point of the latest pivot high and low (C-LEVELS-10, card only). See `midpointFan.ts`. */
  midpointFan?: MidpointFan | null;
  /** Gann's price zone in his literal dollars (A-PRICE-01, context only). See `priceZone.ts`. */
  priceZone?: PriceZone | null;
  /** The fall from the 52-week high, and whether it is in the first 100 points (A-PRICE-01, context only). */
  firstFall?: FirstFallReading | null;
  /** The symbol's own median calendar-year range (A-PRICE-06, context only). */
  annualRange?: AnnualRangeReading | null;
  /** Squares of whole numbers either side of the price and the point between (C-LEVELS-01, card only). */
  integerSquares?: [number, number, number] | null;
  /** The 1-point-a-month line from the last campaign bottom, at the session's month (A-PRICE-05, context only). */
  monthlyAngle?: { from: number; fromMonth: string; price: number } | null;
  /** The 1x1 down from the latest monthly top at 1 point a month (C-LEVELS-08, context only). */
  monthlySquareFromHigh?: MonthlySquareReading | null;
  /** The last completed session left a narrow range: its volume over the range's average (A-VOLUME-10, context only). See `breakaway.ts`. */
  breakawayVolume?: BreakawayVolumeReading | null;
  /** The class C day, week, month, circle and seasonal counts (context only). See `secondaryTime.ts`. */
  secondaryTime?: SecondaryTimeReading | null;
  /** The class A time counts read as context only (2026-10-16). See `timeCounts.ts`. */
  timeCounts?: TimeCountsReading | null;
  /** Months from the monthly chart's major tops and bottoms (A-TIME-05, context only). See `angleMonthCounts.ts`. */
  monthCounts?: PivotMonthCount[] | null;
  /** Months from the weekly swing chart's tops and bottoms, dated to the day, to the month in hand (A-TIME-21, W046 p.2). Context only. */
  swingMonthCounts?: PivotMonthCount[] | null;
  /** Months into the market's bear market from its top (A-TIME-06, context only). See `bearDuration.ts`. */
  bearDuration?: BearDurationReading | null;
  /** The Overnight Chart and Gann's mechanical method on it (Master Course Ch. 3). See `overnightChart.ts`. */
  overnight: OvernightReading | null;
  /** Rule 8: three closes around one price, on days, weeks and months. See `closeCluster.ts`. */
  closeClusters: { daily: CloseClusterReading | null; weekly: CloseClusterReading | null; monthly: CloseClusterReading | null };
  /** The Square of 144 Master Calculator, price and time (1953). See `masterCalculator.ts`. */
  masterCalculator?: MasterCalculatorReading | null;
  /** The circle of 360° in price and time (1953). See `circleOf360.ts`. */
  circle?: CircleReading | null;
  /** Price on the degree of its time angle from inception (GA-32). Null without an inception month. */
  timeAngle?: TimeAngleReading | null;
  /** The planetary averages, including the COE and MOF (1954 letter). See `planetaryAverages.ts`. */
  planetary?: PlanetaryReading | null;
  /** Days, weeks and months from the extreme high and low on the time square's lines (Gann's plate). See `squareOfNineTime.ts`. */
  squareOfNineTime?: SquareOfNineTimeHit[];
  /** Days, weeks and months from the extreme high and low on the Hexagon Chart's lines (Gann's plate, G26). See `hexagonTime.ts`. */
  hexagonTime?: HexagonTimeHit[];
  /** The Master Chart of 360°'s 48ths and sevenths in time (G28). See `masterChartTime.ts`. */
  masterChartTime?: MasterChartHit[];
  /** Price on one of Gann's full angle set from the major pivots, or a parallel (G27). See `patternAngles.ts`. */
  patternAngles?: PatternAngleReading | null;
  /** Gann's day clock at the time of the read (live scan only). See `dayCircle.ts`. */
  dayCircle?: DayCircleReading | null;
  /** Gann's planetary rules beyond the averages, and Jensen's square of 90: research context. See `astroRules.ts`. */
  astro?: AstroReading | null;
  /** The 5th consecutive close in one direction on days, weeks and months (C-TREND-08, context only). */
  ascension?: AscensionReading | null;
  /** Odd/even squares, the 9 and 12 grid, and the range against 144 (C-NUMEROLOGY-01, C-TIME-15/-16, context only). See `priceGrids.ts`. */
  priceGrids?: PriceGridReading | null;
  /** Price read as time and the long counts (M-P9, C-TIME-04/-07/-14/-17/-20/-22, M-T18; context only). See `priceAsTime.ts`. */
  priceAsTime?: PriceAsTimeReading | null;
  /** Angles from zero, from a double or triple bottom's tests, and in the square of the range; the 1x1's rank (C-LEVELS-04/-05/-09, context only). See `angleCrossings.ts`. */
  angleCrossings?: AngleCrossingsReading | null;
  /** The Jan 2-7 / Jan 15-21 (and July) ranges that set the year's trend (A-TIME-20, context only). See `yearRanges.ts`. */
  yearRanges?: YearRangesReading | null;
  /** The month ahead in the years 10, 20, 30 and 60 back (A-TIME-14, context only). See `decadeAnalogue.ts`. */
  decadeAnalogue?: DecadeAnalogueReading | null;
  /** The square of 52's disclosed fractions from the major pivots (M-T6, C-TIME-46, context only). See `squareOf52.ts`; the card reads the same. */
  squareOf52?: SquareOf52Result | null;
  /** The decade digit's character and the 90th month (M-T17, C-TIME-24, context only). See `decadeCycle.ts`; the card reads the same. */
  decadeCycle?: DecadeCycleReading | null;
  /** The prior bull campaign's length projected on the current one (A-TIME-07, context only). See `campaignLength.ts`. */
  campaignLength?: CampaignLengthReading | null;
  /** Fixed year and month counts from the founding date (A-TIME-32, context only). See `incorporationCycle.ts`. */
  foundingCounts?: FoundingCountReading | null;
  /** 490, 1,290 and 1,335 days from the long monthly chart's major turns (A-TIME-33, context only). See `outbreakCounts.ts`. */
  outbreakCounts?: OutbreakCountHit[];
  /** A close through the 1x1 from a fan anchor, and the 1x2 it points to (C-STOP-02, class C, context only). See `fans.ts`. */
  oneByOneBreak?: OneByOneBreak[];
  /** The session this was read for (YYYY-MM-DD). */
  asOf: string;
}

/**
 * The per-symbol facts D2 and D3 need, from `lib/data/instrumentReference.ts`.
 * `sharesOutstanding` must be the count that was public on the session read
 * (the replay passes its as-of, split-adjusted count).
 */
export interface InstrumentFacts {
  sharesOutstanding: number | null;
  inception: Inception | null;
  /** The market's daily bars (SPY), for early and late leaders (G25). See `leadership.ts`. */
  marketDaily?: Bar[] | null;
  /** The stock's monthly bars, for the weak-stock readings (`readWeakStock`). */
  monthly?: Bar[] | null;
  /**
   * The stock's monthly bars over `LONG_MONTHLY_YEARS`, for the long month
   * counts (C-TIME-09/-12, A-TIME-05/-21) only. Falls back to `monthly`.
   */
  monthlyLong?: Bar[] | null;
  /** The market's monthly bars (SPY), to date its bull market (`readWeakStock`). */
  marketMonthly?: Bar[] | null;
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
  extremes: {
    reverseSignal: { signal: null, rule: null, runDays: null },
    gaps: { exhaustGap: null, gapsInNewTerritory: null, filledGapReversal: null },
  },
  timing: { alternation: null, square144: null, projection: null },
  capitalStock: null,
  incorporation: null,
  evenFigures: { overhead: null, underneath: null },
  zone: null,
  seasonal: null,
  accumulation: null,
  sharesPerPoint: null,
  leadership: null,
  timeRules: null,
  multipleTops: null,
  ruleFollowing: null,
  overnight: null,
  closeClusters: { daily: null, weekly: null, monthly: null },
  masterCalculator: null,
  circle: null,
  timeAngle: null,
  planetary: null,
  squareOfNineTime: [],
  hexagonTime: [],
  masterChartTime: [],
  patternAngles: null,
  dayCircle: null,
  astro: null,
  asOf: "",
};

export function readDisclosedRules(
  dailyBars: Bar[],
  currentPrice: number,
  instrument: InstrumentFacts | null = null,
  /** The session being read. Defaults to now (the live scan); the replay passes the replayed session. */
  asOf: Date = new Date(),
  /**
   * The instant to read Gann's day clock at: the live scan passes now; the
   * replay passes null and records the clock at each trade's entry instead
   * (`contextFactors.ts`).
   */
  clock: Date | null = null,
): DisclosedRulesContext {
  const campaign = buildCampaignLedger(dailyBars);
  const counterMove = readCounterMove(dailyBars);
  // The market's months with the month so far from its daily bars, as the
  // live scan's monthly bars have it; the replay passes closed months only.
  const longMonthly = instrument?.monthlyLong ?? instrument?.monthly ?? null;
  const campaignBottoms = readCampaignBottoms(longMonthly, dailyBars, asOf);
  const marketMonthly = instrument?.marketMonthly
    ? monthlyWithCurrent(instrument.marketMonthly, (instrument.marketDaily ?? []).filter((b) => b.t <= dailyBars[dailyBars.length - 1].t))
    : null;
  // One Gann point for the whole read (`pointScale.ts#gannPointForBars`), as the S/R levels use.
  const unit = gannPointForBars(dailyBars);
  const inception = instrument?.inception;
  return {
    barMidpoint: readBarMidpoint(dailyBars),
    pricePercentages: readPricePercentages(dailyBars, currentPrice),
    dayCountBands: readDayCountBands(dailyBars),
    yearFraction: readYearFraction(dailyBars),
    counterMove,
    levelTests: readLevelTests(dailyBars, currentPrice),
    ruleOfThree: readRuleOfThreeTimeframes(dailyBars),
    campaign,
    extremes: readExtremeRules(dailyBars),
    timing: readTiming(dailyBars),
    capitalStock: readCapitalStock(dailyBars, toWeeklyBars(dailyBars), instrument?.sharesOutstanding),
    incorporation: readIncorporationCycle(instrument?.inception, asOf),
    evenFigures: {
      overhead: approachingFigure(currentPrice, "bullish"),
      underneath: approachingFigure(currentPrice, "bearish"),
    },
    zone: readSevenZones(dailyBars),
    seasonal: readSeasonalCount(asOf),
    accumulation: readAccumulation(dailyBars),
    sharesPerPoint: readSharesPerPoint(dailyBars, campaign, asOf),
    leadership: readLeadership(dailyBars, instrument?.marketDaily ?? null, campaign),
    weakStock:
      instrument?.monthly && marketMonthly ? readWeakStock(monthlyWithCurrent(instrument.monthly, dailyBars), marketMonthly) : null,
    timeRules: readTimeRules(dailyBars, counterMove),
    multipleTops: readMultipleTops(dailyBars),
    ruleFollowing: readRuleFollowing(dailyBars),
    halfwayRetest: readHalfwayRetest(dailyBars),
    narrowRangeBreak: readNarrowRangeBreak(dailyBars),
    narrowWeekBreak: readNarrowWeekBreak(toWeeklyBars(dailyBars)),
    successiveSwings: readSuccessiveSwings(dailyBars),
    falseBreakout: readFalseBreakout(dailyBars, asOf),
    topVolume: readTopVolumeWarning(toWeeklyBars(dailyBars), asOf),
    distribution: readDistributionBreakdown(dailyBars, asOf),
    distributionStanding: readDistributionStanding(dailyBars, asOf),
    campaignBottoms,
    midpointFan: computeMidpointFan(dailyBars),
    priceZone: priceZone(currentPrice),
    firstFall: readFirstFallFromHigh(dailyBars, asOf),
    annualRange: longMonthly ? annualRange(longMonthly, asOf) : null,
    integerSquares: integerSquareLevels(currentPrice),
    monthlyAngle: campaignBottoms?.bottoms[0]
      ? {
          from: campaignBottoms.bottoms[0].price,
          fromMonth: campaignBottoms.bottoms[0].month,
          price: monthlyAngle(campaignBottoms.bottoms[0].price, campaignBottoms.bottoms[0].month, STOCK_POINTS_PER_MONTH * unit, etDateKey(asOf).slice(0, 7)),
        }
      : null,
    monthlySquareFromHigh: readMonthlySquareFromHigh(longMonthly, asOf, STOCK_POINTS_PER_MONTH * unit),
    breakawayVolume: readBreakawayVolume(dailyBars, asOf),
    secondTopVolumeRatio: computeVolumeClimax(dailyBars, undefined, { asOf }).find((r) => r.anchorKind === "high")?.retestWeekVolumeRatio ?? null,
    secondaryTime: readSecondaryTime(dailyBars, longMonthly, asOf, counterMove),
    timeCounts: readTimeCounts(dailyBars, longMonthly, asOf),
    monthCounts: longMonthly ? readMonthCounts(monthlyWithCurrent(longMonthly, dailyBars), asOf) : null,
    swingMonthCounts: readSwingMonthCounts(dailyBars, asOf),
    bearDuration: marketMonthly ? readBearDuration(marketMonthly, asOf) : null,
    overnight: readOvernightChart(dailyBars),
    closeClusters: {
      daily: readCloseCluster(dailyBars, "daily"),
      weekly: readCloseCluster(toWeeklyBars(dailyBars), "weekly"),
      monthly: readCloseCluster(toMonthlyBars(dailyBars), "monthly"),
    },
    masterCalculator: readMasterCalculator(dailyBars, currentPrice, unit),
    circle: readCircle(dailyBars, currentPrice, unit),
    timeAngle:
      inception && inception.precision !== "year" ? readTimeAngle(currentPrice, unit, inception.date, asOf) : null,
    planetary: readPlanetaryAverages(asOf, currentPrice, unit),
    squareOfNineTime: readSquareOfNineTime(dailyBars),
    hexagonTime: readHexagonTime(dailyBars),
    masterChartTime: readMasterChartTime(dailyBars),
    patternAngles: readPatternAngles(dailyBars, currentPrice, unit),
    dayCircle: clock ? readDayCircle(clock, 0, currentPrice, unit) : null,
    astro: readAstroRules(dailyBars, asOf, unit),
    ascension: readAscension(dailyBars),
    priceGrids: readPriceGrids(dailyBars, currentPrice, unit),
    priceAsTime: readPriceAsTime(dailyBars, currentPrice, unit, inception, asOf),
    angleCrossings: readAngleCrossings(dailyBars, currentPrice),
    yearRanges: readYearRanges(dailyBars, asOf),
    decadeAnalogue: readDecadeAnalogue(longMonthly, asOf),
    squareOf52: squareOf52Windows(dailyBars, asOf),
    decadeCycle: computeDecadeCycle(asOf),
    campaignLength: marketMonthly ? readCampaignLength(marketMonthly, asOf) : null,
    foundingCounts: readFoundingCounts(inception, asOf),
    outbreakCounts: readOutbreakCounts(longMonthly, asOf),
    oneByOneBreak: readOneByOneBreak(dailyBars),
    asOf: asOf.toISOString().slice(0, 10),
  };
}

/** Plain-language lines for the explanation trace. */
export function describeDisclosedRules(ctx: DisclosedRulesContext): string[] {
  const lines: string[] = ctx.campaign ? describeCampaignLedger(ctx.campaign) : [];
  if (ctx.capitalStock) lines.push(...describeCapitalStock(ctx.capitalStock));
  if (ctx.incorporation) lines.push(...describeIncorporationCycle(ctx.incorporation));
  if (ctx.zone) lines.push(describeSevenZones(ctx.zone));
  if (ctx.secondaryTime) lines.push(...describeSecondaryTime(ctx.secondaryTime));
  if (ctx.timeCounts) lines.push(...describeTimeCounts(ctx.timeCounts));
  if (ctx.monthCounts && ctx.monthCounts.length > 0) {
    const list = ctx.monthCounts.map((c) => `${c.months}${c.watched ? " (a watched count)" : ""} from the ${c.pivotMonth} ${c.kind === "high" ? "top" : "bottom"}`);
    lines.push(`Months from the major tops and bottoms: ${list.join(", ")}. Shown for context; it does not change the setup.`);
  }
  if (ctx.swingMonthCounts && ctx.swingMonthCounts.length > 0) {
    const list = ctx.swingMonthCounts.map((c) => `${c.months}${c.watched ? " (a watched count)" : ""} from the ${c.pivotMonth} ${c.kind === "high" ? "top" : "bottom"}`);
    lines.push(`Months from the recent swing tops and bottoms: ${list.join(", ")}. Shown for context; it does not change the setup.`);
  }
  if (ctx.bearDuration) lines.push(describeBearDuration(ctx.bearDuration));
  if (ctx.topVolume?.warning) lines.push(describeTopVolumeWarning(ctx.topVolume));
  if (ctx.secondTopVolumeRatio != null && ctx.secondTopVolumeRatio <= 2 / 3) {
    lines.push(`A second top at the first top's level on ${Math.round(ctx.secondTopVolumeRatio * 100)}% of its week's volume. Shown for context; it does not change the setup.`);
  }
  if (ctx.breakawayVolume) {
    const b = ctx.breakawayVolume;
    lines.push(`The last session ${b.direction === "bullish" ? "crossed the top" : "broke the bottom"} of a narrow range on ${b.ratio.toFixed(1)}× the range's average volume${b.ratio > 1 ? "." : ": a breakout without volume, so an entry out of this range waits for a session that closes past the line on volume."}`);
  }
  if (ctx.campaignBottoms?.bottoms[0]?.broken) {
    const next = ctx.campaignBottoms.nextSupport;
    lines.push(`The last campaign bottom (${ctx.campaignBottoms.bottoms[0].price.toFixed(2)}, ${ctx.campaignBottoms.bottoms[0].month}) is broken by 3 points: ${next ? `the next older campaign bottom, ${next.price.toFixed(2)} (${next.month}), is the support to watch` : "no older campaign bottom below it is in the record"}.`);
  }
  if (ctx.priceZone) {
    const fall = ctx.firstFall?.inFirstFall ? `, ${ctx.firstFall.pointsDown.toFixed(2)} points under the 52-week high (${ctx.firstFall.high.toFixed(2)}): the first 100 points down from a high fall fastest` : "";
    lines.push(`Price zone ${ctx.priceZone} (moves speed up above 50, faster above 100, widest above 150-200)${fall}. Shown for context; it does not change the setup.`);
  }
  if (ctx.annualRange) {
    lines.push(`Its usual yearly range is ${ctx.annualRange.medianPoints.toFixed(2)} points (the median of ${ctx.annualRange.years} completed year${ctx.annualRange.years === 1 ? "" : "s"}). Watch the dates more than the points. Shown for context.`);
  }
  if (ctx.midpointFan) {
    const at = (d: "up" | "down") => ctx.midpointFan!.lines.find((l) => l.angle === "1x1" && l.direction === d)?.price;
    const up = at("up");
    const down = at("down");
    lines.push(`From the 50% point (${ctx.midpointFan.midpoint.toFixed(2)}), the 1x1 angles stand at ${up?.toFixed(2) ?? "n/a"} up and ${down?.toFixed(2) ?? "n/a"} down. Not a level to trade on alone.`);
  }
  if (ctx.integerSquares) {
    const [lo, mid, hi] = ctx.integerSquares;
    lines.push(`Squares of whole numbers around the price: ${lo}, ${mid} (halfway) and ${hi}. Not a level to trade on alone.`);
  }
  if (ctx.monthlyAngle) {
    const m = ctx.monthlyAngle;
    lines.push(`The 45-degree line from the ${m.fromMonth} bottom (${m.from.toFixed(2)}) at 1 point a month stands at ${m.price.toFixed(2)}. Shown for context; it does not change the setup.`);
  }
  if (ctx.monthlySquareFromHigh) {
    const q = ctx.monthlySquareFromHigh;
    lines.push(`The square of price and time down from the ${q.fromMonth} top (${q.from.toFixed(2)}) at 1 point a month stands at ${q.price.toFixed(2)}. Not a level to trade on alone.`);
  }
  if (ctx.distributionStanding) {
    lines.push(`After a lower top, the narrow range broke down on ${ctx.distributionStanding.breakoutVolumeRatio.toFixed(1)}× its average volume: a sign of a further decline. A buy is held to Watch, and an open buy is closed, while price stays under the range, for up to 20 sessions after the break.`);
  }
  if (ctx.seasonal) lines.push(`Seasonal count: ${ctx.seasonal.point.label} of the year from March 21 (${ctx.seasonal.offsetDays === 0 ? "today" : `${Math.abs(ctx.seasonal.offsetDays)}d ${ctx.seasonal.offsetDays > 0 ? "after" : "before"}`}).`);
  if (ctx.accumulation) {
    const a = ctx.accumulation;
    lines.push(`Range ${a.rangeLow.toFixed(2)}–${a.rangeHigh.toFixed(2)} held ${a.weeks.toFixed(1)} weeks${a.breakout ? `, broken ${a.breakout}` : ""}. The longer the time in a range, the bigger the move out of it.`);
  }
  if (ctx.sharesPerPoint?.topWarning) {
    lines.push(`Volume per point of gain is ${ctx.sharesPerPoint.ratio.toFixed(1)}× the prior up leg near the high: more effort for less gain, a sign of a top.`);
  }
  if (ctx.timeRules) {
    const t = ctx.timeRules;
    if (t.halt) lines.push(`${t.halt.days}-day halt at a ${t.halt.at} of ${t.halt.extreme.toFixed(2)}; a stop beyond it belongs at ${t.halt.stop.toFixed(2)}.`);
    if (t.reactionWeek !== null) {
      lines.push(`Reaction in its week ${t.reactionWeek}${t.reactionInZone ? " (the 2–3 week zone)" : ""}${t.thirdWeek ? ", the third week, when reactions usually end" : ""}${t.reactionAbnormal ? ": longer than an active stock's normal reaction" : ""}.`);
    }
  }
  for (const m of [ctx.multipleTops?.top, ctx.multipleTops?.bottom]) {
    if (!m) continue;
    const name = m.tests >= 3 ? `Triple ${m.kind}` : `Double ${m.kind}`;
    lines.push(`${name} at ${m.level.toFixed(2)}: ${m.state === "crossed" ? "crossed, a strong breakout" : m.state === "failed" ? `failed on its ${m.tests >= 3 ? "third" : "second"} test, a ${m.kind}` : "being tested"}.`);
  }
  if (ctx.ruleFollowing && ctx.ruleFollowing.resolved > 0) {
    const r = ctx.ruleFollowing;
    lines.push(`Over the year, ${r.followed} of this stock's ${r.resolved} buying and selling points carried on and ${r.failed} failed${r.queer ? ": it is not following the rules, so it is left alone" : ""}.`);
  }
  if (ctx.leadership) {
    const l = ctx.leadership;
    if (l.bottomedFirst) lines.push("Bottomed before the market: an early leader (stocks that bottom first top first).");
    if (l.bottomedLate) lines.push("Bottomed after the market: a late mover.");
    if (l.toppedFirst) lines.push("Topped before the market: watch for early weakness.");
    if (l.firstYearHighCrossed !== null) lines.push(`First-year high of the campaign ${l.firstYearHighCrossed ? "crossed" : "not yet crossed"}.`);
  }
  if (ctx.weakStock?.earlyTopFailed) {
    const w = ctx.weakStock.earlyTopFailed;
    lines.push(`Weak in this bull market: its ${w.month} top (${w.top.toFixed(2)}), made in the market's first two years up, has not been exceeded in two years.`);
  }
  if (ctx.weakStock?.firstRallyNotExceeded) {
    const w = ctx.weakStock.firstRallyNotExceeded;
    lines.push(`Weak in this bull market: its first rally ran only ${w.months} month${w.months === 1 ? "" : "s"}, to ${w.top.toFixed(2)} in ${w.month}, and has not been exceeded since.`);
  }
  if (ctx.narrowWeekBreak) {
    const n = ctx.narrowWeekBreak;
    lines.push(
      n.direction === "bearish"
        ? `A narrow week, then a sharp drop on heavy volume: closed ${n.breakClose.toFixed(2)}, 3 points under that week's low (${n.narrowLow.toFixed(2)}) on ${n.volumeRatio.toFixed(1)}x the usual weekly volume. The rule reads this as a sign the trend is turning down, even while the market rises; it does not change the trend read here.`
        : `A narrow week, then a sharp rise on heavy volume: closed ${n.breakClose.toFixed(2)}, 3 points over that week's high (${n.narrowHigh.toFixed(2)}) on ${n.volumeRatio.toFixed(1)}x the usual weekly volume.`,
    );
  }
  if (ctx.falseBreakout) {
    const b = ctx.falseBreakout;
    lines.push(
      b.direction === "bearish"
        ? `A false breakout over the range top: the week of ${b.breakWeek} reached ${b.extreme.toFixed(2)}, no more than 3 points over the 13-week top (${b.level.toFixed(2)}), and the next week closed back under it.`
        : `A false breakout under the range bottom: the week of ${b.breakWeek} reached ${b.extreme.toFixed(2)}, no more than 3 points under the 13-week bottom (${b.level.toFixed(2)}), and the next week closed back over it.`,
    );
  }
  const ss = ctx.successiveSwings;
  const nth = (n: number) => (n === 2 ? "second" : n === 3 ? "third" : "fourth");
  // Master Course p.248 names both: the advance is strongest after the second
  // or third higher bottom, and fast moves start from the third or fourth
  // (also W003 p.17).
  if (ss && ss.higherBottoms >= 2 && ss.higherBottoms <= 4) {
    lines.push(
      ss.higherBottoms === 4
        ? "Standing on the fourth higher bottom of the 3-Day Chart: the rule says fast moves start from the third or fourth."
        : `Standing on the ${nth(ss.higherBottoms)} higher bottom of the 3-Day Chart: the rule reads the advance as strongest after the second or third${ss.higherBottoms === 3 ? ", and fast moves start from the third or fourth" : ""}.`,
    );
  }
  if (ss && ss.lowerTops >= 2 && ss.lowerTops <= 4) {
    lines.push(`Under the ${nth(ss.lowerTops)} lower top of the 3-Day Chart, a top the rule says to watch.`);
  }
  if (ctx.overnight) lines.push(...describeOvernightChart(ctx.overnight));
  if (ctx.astro) lines.push(...describeAstroRules(ctx.astro));
  for (const c of [ctx.closeClusters.daily, ctx.closeClusters.weekly, ctx.closeClusters.monthly]) {
    if (c) lines.push(describeCloseCluster(c));
  }
  if (ctx.evenFigures.overhead) lines.push(ctx.evenFigures.overhead.note);
  if (ctx.evenFigures.underneath) lines.push(ctx.evenFigures.underneath.note);
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
    // The change of trend is the ledger's call (new extremes after day 60 from
    // the section's top), so this line only says so when the ledger agrees.
    const note = {
      normal: "within the usual 2-3 weeks",
      extended: "longer than the usual 3 weeks",
      secondMonth: "into a second month, which strong trends seldom reach",
      thirdMonth: ctx.campaign?.counterMoveThirdMonth
        ? "in its third month, which signals a change in trend"
        : ctx.campaign
          ? "past two months, though it has made no new extreme in its third month"
          : "past two months",
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
  for (const [unitName, a] of [["day", ctx.ascension?.daily], ["week", ctx.ascension?.weekly], ["month", ctx.ascension?.monthly]] as const) {
    if (a?.fifth) lines.push(`The 5th ${a.direction === "up" ? "higher" : "lower"} close in a row on the ${unitName}: the 5th ${unitName} marks fast moves.`);
  }
  const rs = ctx.extremes.reverseSignal;
  if (rs.signal) {
    lines.push(
      rs.rule === "reverseDay"
        ? `Reverse signal day at a ${rs.signal}: opened beyond the prior day's extreme and closed near the other end.`
        : `After ${rs.runDays} days without breaking the prior day's ${rs.signal === "top" ? "low" : "high"}, the last day broke it and closed near its ${rs.signal === "top" ? "low" : "high"} (7-10 Day Rule, ${rs.signal}).`,
    );
  }
  const g = ctx.extremes.gaps;
  if (g.exhaustGap) lines.push(`Exhaust gap at a ${g.exhaustGap}: a one-day gap to a new extreme with a reverse signal day.`);
  if (g.gapsInNewTerritory && g.gapsInNewTerritory.count >= 3) {
    lines.push(
      `${g.gapsInNewTerritory.count} ${g.gapsInNewTerritory.direction} gaps in new territory this swing: ${g.gapsInNewTerritory.extended ? "an extended run past the usual 3-4, which in extreme cases reaches 10 before a culmination" : "a culmination is near"}.`,
    );
  }
  if (g.filledGapReversal) lines.push(`A recent gap has been filled: the minor trend turns ${g.filledGapReversal}.`);
  const t = ctx.timing;
  if (t.alternation?.mark) lines.push(`${t.alternation.daysSincePivot} days from the last swing pivot: on the ${t.alternation.mark}-day turn count.`);
  if (t.square144 && t.square144.units.length >= 2) {
    lines.push(`Time from the ${t.square144.pivotDate} extreme is on a multiple of 12 in ${t.square144.units.join(" and ")}: time counts converge.`);
  }
  if (ctx.priceGrids) lines.push(...describePriceGrids(ctx.priceGrids));
  if (ctx.priceAsTime) lines.push(...describePriceAsTime(ctx.priceAsTime));
  if (ctx.masterCalculator) lines.push(...describeMasterCalculator(ctx.masterCalculator));
  if (ctx.circle) lines.push(...describeCircle(ctx.circle));
  if (ctx.timeAngle) lines.push(describeTimeAngle(ctx.timeAngle));
  if (ctx.planetary) lines.push(...describePlanetaryAverages(ctx.planetary));
  if (ctx.squareOfNineTime) lines.push(...describeSquareOfNineTime(ctx.squareOfNineTime));
  if (ctx.hexagonTime) lines.push(...describeHexagonTime(ctx.hexagonTime));
  if (ctx.masterChartTime) lines.push(...describeMasterChartTime(ctx.masterChartTime));
  if (ctx.patternAngles) lines.push(...describePatternAngles(ctx.patternAngles));
  if (ctx.dayCircle) lines.push(describeDayCircle(ctx.dayCircle));
  if (ctx.angleCrossings) lines.push(...describeAngleCrossings(ctx.angleCrossings));
  if (ctx.yearRanges) lines.push(...describeYearRanges(ctx.yearRanges));
  if (ctx.decadeAnalogue) lines.push(...describeDecadeAnalogue(ctx.decadeAnalogue));
  if (t.projection) {
    lines.push(
      `Next swing ${t.projection.kind} projected around ${t.projection.medianDate} from ${t.projection.count} earlier cycles (spread ${t.projection.spreadDays} days${t.projection.spreadDays <= 5 ? ", tight" : ""}).`,
    );
  }
  const cl = ctx.campaignLength ? describeCampaignLength(ctx.campaignLength) : null;
  if (cl) lines.push(cl);
  if (ctx.foundingCounts) lines.push(...describeFoundingCounts(ctx.foundingCounts));
  if (ctx.outbreakCounts) lines.push(...describeOutbreakCounts(ctx.outbreakCounts));
  for (const b of ctx.oneByOneBreak ?? []) lines.push(describeOneByOneBreak(b));
  return lines;
}
