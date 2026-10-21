/**
 * The nine pillars of the score (owner, 2026-10-17: "the score stays out of 9",
 * "multiple criteria can count for one of the 9"; card pick "Stop required").
 * Each pillar is one point, awarded on the combination its checks state. The
 * checks are what Gann looked for when he chose a stock and a moment (Master
 * Course Ch. 7's pre-trade list and its selection rules); the design and the
 * citations are in `gann-feature-map/review/score-pillars-research.md` §3.
 *
 * Every reading here is one the live scan and the replay already make: both
 * build `PillarFacts` with `readPillarFacts` from the same disclosed-rules
 * reading, so the pillars cannot drift between the two surfaces.
 *
 * Three questions, as AGENTS.md asks:
 * 1. Sources: MC Ch. 7 C1-C14 and the selection rules S1-S27 (Tier A), with the
 *    trend, level, time and volume rules each module cites.
 * 2. Cycles: P1 reads counts and windows, and P7 the time square and the
 *    reaction clock, that the time modules already carry;
 *    no new periodicity is claimed here, so Dewey's checklist is not re-run.
 * 3. Hermetic: Correspondence, in that each pillar asks one question on every
 *    timeframe the rule reads (P2's monthly, weekly line and daily); and Polarity,
 *    in that every check has its short mirror (strongest for a long, weakest
 *    for a short; a reaction inside its limit with the trend, one outrunning
 *    it against the trend).
 *
 * Unknown is not a pass: a check that cannot be read fails, as the scored
 * criteria always have. The one exception is a warning (the capital-stock
 * warning in P8), where "no warning read" is literally true.
 */

import type { Bar } from "@/lib/types";
import type { DisclosedRulesContext } from "@/lib/gann/disclosedRules";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { yearCycleConvergence } from "@/lib/gann/timeCycles";
import { patternAngleLines } from "@/lib/gann/patternAngles";
import { gannPointForBars } from "@/lib/gann/pointScale";
import { QUIET } from "@/lib/gann/sevenZones";
import { readUniverseRank, type UniverseStrength } from "@/lib/gann/universeStrength";
import { majorRangeDivisions, heldRangeDivision, type RangeDivisionMatch } from "@/lib/gann/rangeDivisions";
import { readHeldLevel, type HeldLevelMatch } from "@/lib/gann/heldLevel";
import type { StructuralLevel } from "@/lib/scan/structuralLevels";

type Side = "bullish" | "bearish";

/** S18, A-PRICE-06: an active stock's yearly range is 20 points or more. */
export const MIN_ANNUAL_RANGE_POINTS = 20;
/** C14's "3-5-point range": two important angles closer than this leave no room to trade. */
export const SQUEEZE_POINTS = 5;
/** The important angles C14 reads: the 45° first, then the 2x1 and 1x2. */
const IMPORTANT_ANGLES = new Set(["1x1", "2x1", "1x2"]);
/** Engineering choice: the recent and baseline windows for "volume above its own norm" (S2). */
const RECENT_VOLUME_BARS = 20;
const BASELINE_VOLUME_BARS = 250;

export interface PillarFacts {
  /** The market's trend (SPY's swing chart), cut to the stock's last session. */
  marketTrend: Side | null;
  /** Yearly counts from major pivots landing on this month (closed months only). */
  yearCycle: { bullishHits: number; bearishHits: number } | null;
  /** The decade digit's character at this month (`DecadeCycleReading.currentBias`), not the year's label. */
  decadeBias: "bullish" | "bearish" | "mixed" | null;
  /**
   * Gann's weekly green/red trend line (Master Course Ch. 8, p. 239,
   * `weeklyOneBar.ts`): the weekly reading P2 asks for. Null before its first turn.
   */
  weeklyLine: "green" | "red" | null;
  /** The year's trend from its January (and July) ranges. */
  yearTrend: "up" | "down" | "inside" | null;
  leadership: {
    bottomedFirst: boolean;
    toppedFirst: boolean;
    crossedTopsFirst: boolean;
    brokeBottomsFirst: boolean;
    firstYearHighCrossed: boolean | null;
  } | null;
  /**
   * S6: the stock's rank among the scan universe by its year of monthly highs
   * and lows (`readUniverseRank`), for P3(c). Null when not read.
   */
  universeRank: {
    percentile: number;
    peers: number;
    strongest: boolean;
    weakest: boolean;
    /** The same rank within its industry group (S4); null without a group read. */
    group: { label: string; percentile: number; peers: number; strongest: boolean; weakest: boolean } | null;
  } | null;
  /** Q24's queer-acting stock; null when too few rules resolved to say. */
  queer: boolean | null;
  /** Median volume of the last 20 sessions over the year before them. */
  volumeActivity: number | null;
  /** The median yearly range, in points. */
  annualRangePoints: number | null;
  /** The seven zones' range activity (recent median range over the baseline). */
  zoneActivity: number | null;
  angles: { holds45: Record<Side, boolean>; squeezed: boolean } | null;
  /** A base of weeks: the current range's length and where the last close left it. */
  base: { long: boolean; breakout: "up" | "down" | null } | null;
  /** A capital-stock or shares-per-point warning at a top (against a long). */
  capitalWarning: boolean;
  counterMove: { trend: Side; inCounterMove: boolean; phase: "normal" | "extended" | "secondMonth" | "thirdMonth" | null } | null;
  reactionAbnormal: boolean;
  campaign: { trend: Side; spaceOverbalanced: boolean; timeOverbalanced: boolean } | null;
  /**
   * P5(b): the division of the extreme range, the highest price or the latest
   * campaign of a year or more (`lib/gann/rangeDivisions.ts`) that the last
   * reaction stopped at and held (`heldRangeDivision`, since 2026-10-21),
   * below price for a long (support) and above it for a short (resistance).
   * Null on a side with none.
   */
  rangeLevels: Record<Side, RangeDivisionMatch | null>;
  /**
   * P5(a), `historicalSR` since 2026-10-21: the old level the last reaction
   * stopped at and has held (`lib/gann/heldLevel.ts`), support for a long and
   * resistance for a short. Null on a side with none.
   */
  heldLevels: Record<Side, HeldLevelMatch | null>;
}

export interface PillarResult {
  passed: boolean;
  note: string;
}

const yes = (b: boolean) => (b ? "yes" : "no");
const twoOf = (...xs: boolean[]) => xs.filter(Boolean).length >= 2;

/** Is price on or above the 45° from the latest major bottom (on or below it from the top), and squeezed between two important angles? */
export function readAngleFacts(bars: Bar[], price: number, unit: number): PillarFacts["angles"] {
  if (!(price > 0) || !(unit > 0) || bars.length < 2) return null;
  const lines = patternAngleLines(bars, unit);
  const latest = (kind: "bottom" | "top") =>
    lines
      .filter((l) => l.angle === "1x1" && l.parallelFrom === null && l.from.kind === kind)
      .reduce<(typeof lines)[number] | null>((best, l) => (!best || l.from.index > best.from.index ? l : best), null);
  const fromBottom = latest("bottom");
  const fromTop = latest("top");
  let above = Infinity;
  let below = -Infinity;
  for (const l of lines) {
    if (!IMPORTANT_ANGLES.has(l.angle)) continue;
    if (l.price > price) above = Math.min(above, l.price);
    else below = Math.max(below, l.price);
  }
  return {
    holds45: {
      bullish: fromBottom !== null && price >= fromBottom.price - unit,
      bearish: fromTop !== null && price <= fromTop.price + unit,
    },
    squeezed: Number.isFinite(above) && Number.isFinite(below) && above - below <= SQUEEZE_POINTS * unit,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** S2: the last 20 sessions' median volume over the median of the year before them. */
export function volumeActivity(daily: Bar[]): number | null {
  if (daily.length < RECENT_VOLUME_BARS * 2) return null;
  const recent = median(daily.slice(-RECENT_VOLUME_BARS).map((b) => b.v));
  const base = median(daily.slice(-(RECENT_VOLUME_BARS + BASELINE_VOLUME_BARS), -RECENT_VOLUME_BARS).map((b) => b.v));
  return recent !== null && base !== null && base > 0 ? recent / base : null;
}

/** The facts the nine pillars read, from readings both surfaces already make. */
export function readPillarFacts(input: {
  rules: DisclosedRulesContext;
  daily: Bar[];
  monthly: Bar[];
  marketDaily: Bar[] | null;
  /**
   * The scan universe's monthly positions and the stock's symbol, for the S6
   * rank. Read on completed months only, so the month in progress in `monthly`
   * (live) or its absence (replay) changes nothing.
   */
  universe: { symbol: string; strength: UniverseStrength | null } | null;
  /** The old levels of the S/R list (`buildStructuralLevels(...).old`), for `heldLevels`. */
  oldLevels: StructuralLevel[];
  price: number;
  asOf: Date;
}): PillarFacts {
  const { rules, daily, monthly, marketDaily, universe, oldLevels, price, asOf } = input;
  const last = daily[daily.length - 1]?.t ?? "";
  const market = (marketDaily ?? []).filter((b) => b.t <= last);
  const month = asOf.toISOString().slice(0, 7);
  const closedMonths = monthly.filter((b) => b.t.slice(0, 7) < month);
  const unit = gannPointForBars(daily);
  const leadership = rules.leadership;
  const counterMove = rules.counterMove;
  const campaign = rules.campaign;
  // The record both surfaces hold: the monthly level chart and the sessions,
  // as Gann's percentage-of-price levels read it (`majorPricePercentageLevels`).
  const divisions = majorRangeDivisions([...monthly, ...daily], monthly);
  return {
    marketTrend: market.length >= 10 ? readGannTrend(market).direction : null,
    yearCycle: closedMonths.length >= 12 ? yearCycleConvergence(closedMonths, asOf) : null,
    weeklyLine: rules.weeklyOneBar?.colour ?? null,
    decadeBias: rules.decadeCycle?.currentBias ?? null,
    yearTrend: rules.yearRanges?.yearTrend ?? null,
    leadership: leadership
      ? {
          bottomedFirst: leadership.bottomedFirst,
          toppedFirst: leadership.toppedFirst,
          crossedTopsFirst: leadership.crossedTopsFirst,
          brokeBottomsFirst: leadership.brokeBottomsFirst,
          firstYearHighCrossed: leadership.firstYearHighCrossed,
        }
      : null,
    universeRank: (() => {
      const r = universe ? readUniverseRank(universe.symbol, monthly, asOf, universe.strength) : null;
      return r
        ? {
            percentile: r.percentile,
            peers: r.peers,
            strongest: r.strongest,
            weakest: r.weakest,
            group: r.group
              ? { label: r.group.label, percentile: r.group.percentile, peers: r.group.peers, strongest: r.group.strongest, weakest: r.group.weakest }
              : null,
          }
        : null;
    })(),
    queer: rules.ruleFollowing ? rules.ruleFollowing.queer : null,
    volumeActivity: volumeActivity(daily),
    annualRangePoints: rules.annualRange && unit > 0 ? rules.annualRange.medianPoints / unit : null,
    zoneActivity: rules.zone?.activity ?? null,
    angles: readAngleFacts(daily, price, unit),
    base: rules.accumulation ? { long: rules.accumulation.long, breakout: rules.accumulation.breakout } : null,
    capitalWarning: rules.capitalStock?.distributionSignal === true || rules.sharesPerPoint?.topWarning === true,
    counterMove: counterMove ? { trend: counterMove.trend, inCounterMove: counterMove.inCounterMove, phase: counterMove.phase } : null,
    reactionAbnormal: rules.timeRules?.reactionAbnormal === true,
    campaign: campaign
      ? { trend: campaign.trend, spaceOverbalanced: campaign.spaceOverbalanced, timeOverbalanced: campaign.timeOverbalanced }
      : null,
    rangeLevels: {
      // Held, not near (heldRangeDivision): `daily` is the completed sessions.
      bullish: heldRangeDivision(daily, divisions, price, "bullish"),
      bearish: heldRangeDivision(daily, divisions, price, "bearish"),
    },
    // `daily` is the level chart's completed sessions on both surfaces.
    heldLevels: {
      bullish: readHeldLevel(daily, oldLevels, price, "bullish"),
      bearish: readHeldLevel(daily, oldLevels, price, "bearish"),
    },
  };
}

/** P1 (C1, C2, S22, S23): two of the market's trend, the stock's own cycle and the year's character. */
export function marketCyclePillar(f: PillarFacts | null | undefined, side: Side): PillarResult {
  const market = f?.marketTrend === side;
  const against = side === "bullish" ? f?.yearCycle?.bearishHits : f?.yearCycle?.bullishHits;
  const cycle = against === 0;
  const year = f != null && (f.decadeBias === side || f.yearTrend === (side === "bullish" ? "up" : "down"));
  const passed = twoOf(market, cycle, year);
  return {
    passed,
    note: `Market trend with the setup: ${yes(market)}. No yearly count due against it: ${yes(cycle)}. The year's character with it: ${yes(year)}. Two of three are needed${market && cycle && year ? "; all three agree" : ""}.`,
  };
}

/**
 * P2 (C13, T1, T7): Gann's weekly trend line, and the 3-day swing or the Rule
 * of Three; the monthly makes it a cinch.
 *
 * The weekly reading is the Master Course's green/red trend line (Ch. 8,
 * p. 239: "buy when the red trend line changes to green"; `weeklyOneBar.ts`),
 * the chart T1 cites and the design named (score-pillars-research.md §3, "the
 * weekly swing (green/red line)"). Until 2026-10-21 it read the 1951
 * Commodities 7-day chart's trend instead (`swingChart.ts`), a slower
 * reading: the line turns on the first week with a higher top and a higher
 * bottom (a lower bottom, short), the 7-day trend only once the last completed
 * weekly swing top is crossed (bottom broken). That reading inverted on every
 * replay since the pillars were built (2026-10-17, -20, -21: trades passing it
 * did worse than trades failing it in 10 of 11 measured cells), while the
 * green/red line, a measured context factor all along, came out ahead in 7.
 */
export function trendPillar(input: {
  side: Side;
  weeklyLine: "green" | "red" | null | undefined;
  threeDay: Side | null | undefined;
  ruleOfThree: boolean;
  monthly: string | null | undefined;
}): PillarResult {
  const { side, weeklyLine, threeDay, ruleOfThree, monthly } = input;
  const weeklyWith = weeklyLine === (side === "bullish" ? "green" : "red");
  const shortTerm = threeDay === side || ruleOfThree;
  const passed = weeklyWith && shortTerm;
  return {
    passed,
    note: `Weekly trend line ${side === "bullish" ? "green" : "red"}: ${yes(weeklyWith)}. 3-day swing or three closes with it: ${yes(shortTerm)}.${passed && monthly === side ? " The monthly trend agrees too: every timeframe is in line." : ""}`,
  };
}

/**
 * P3 (S4-S12): two of leading the market, crossing the campaign's first-year
 * high (failing to, short), and ranking among the strongest of the scan
 * universe by monthly highs and lows (the weakest, short; S6,
 * `lib/gann/universeStrength.ts`), or of its industry group (S4,
 * `lib/gann/industryGroups.ts`). (c) was a stand-in from 2026-10-20 to
 * 2026-10-21, the stock against SPY alone; it is now the rank Gann describes.
 */
export function relativeStrengthPillar(f: PillarFacts | null | undefined, side: Side): PillarResult {
  const l = f?.leadership;
  const long = side === "bullish";
  const led = l != null && (long ? l.bottomedFirst || l.crossedTopsFirst : l.toppedFirst || l.brokeBottomsFirst);
  const firstYear = l?.firstYearHighCrossed === long;
  const r = f?.universeRank;
  const ofUniverse = long ? r?.strongest === true : r?.weakest === true;
  const ofGroup = long ? r?.group?.strongest === true : r?.group?.weakest === true;
  const strength = ofUniverse || ofGroup;
  const passed = twoOf(led, firstYear, strength);
  return {
    passed,
    note: `${long ? "Bottomed or crossed old tops before the market" : "Topped or broke old bottoms before the market"}: ${yes(led)}. ${long ? "Crossed" : "Failed to cross"} the campaign's first-year high: ${yes(firstYear)}. Among the ${long ? "strongest" : "weakest"} quarter of its group or of the universe by its year of monthly highs and lows: ${yes(strength)}${r ? ` (universe rank ${Math.round(r.percentile * 100)} of 100 among ${r.peers}${r.group ? `; group rank ${Math.round(r.group.percentile * 100)} of 100 among ${r.group.peers} in ${r.group.label}` : ""})` : ""}. Two of three are needed.`,
  };
}

/** P4 (S1-S3, S18, S23, S27): follows the rules, and two of active volume, a yearly range worth trading, and not slow. */
export function activityPillar(f: PillarFacts | null | undefined): PillarResult {
  const follows = f != null && f.queer !== true;
  const volume = (f?.volumeActivity ?? 0) >= 1;
  const range = (f?.annualRangePoints ?? 0) >= MIN_ANNUAL_RANGE_POINTS;
  const lively = (f?.zoneActivity ?? 0) >= QUIET;
  const passed = follows && twoOf(volume, range, lively);
  return {
    passed,
    note: `Follows the rules: ${yes(follows)}. Volume at or above its own norm: ${yes(volume)}. A yearly range of ${MIN_ANNUAL_RANGE_POINTS} points or more: ${yes(range)}. Ranges not quieter than usual: ${yes(lively)}. Needs the first and two of the other three.`,
  };
}

/**
 * P5 (C6, T2, T4): an old top or bottom in the right role that the last
 * reaction stopped at and held (`PillarFacts.heldLevels`), or a percentage
 * level in the right role: a division of the extreme range, the highest price
 * or the latest campaign of a year or more (Master Course Ch. 9, PDF 263-264;
 * `PillarFacts.rangeLevels`).
 */
export function priceLevelsPillar(oldLevel: boolean, percentage: boolean): PillarResult {
  return {
    passed: oldLevel || percentage,
    note: `An old top or bottom in the right role: ${yes(oldLevel)}. A percentage or halfway level: ${yes(percentage)}.${oldLevel && percentage ? " Both together: the levels agree." : ""}`,
  };
}

/** P6 (C10, C14): holding the 45° from the last major bottom (top, short) and not squeezed between two important angles. */
export function anglesPillar(f: PillarFacts | null | undefined, side: Side, steepTrend: boolean): PillarResult {
  const holds = f?.angles?.holds45[side] === true;
  const free = f?.angles != null && !f.angles.squeezed;
  const passed = holds && free;
  return {
    passed,
    note: `${side === "bullish" ? "On or above the 45° from the last major bottom" : "On or below the 45° from the last major top"}: ${yes(holds)}. Not squeezed between two important angles: ${yes(free)}.${passed && steepTrend ? " The trend runs at the 1x2 or steeper." : ""}`,
  };
}

/**
 * P7's (c): the reaction is inside its time limit with the trend (not into a
 * 2nd month, nor abnormally long), or a move against the trend has outrun it.
 */
export function reactionInTimeLimit(side: Side, f: PillarFacts | null | undefined): boolean {
  const cm = f?.counterMove;
  const late = cm?.phase === "secondMonth" || cm?.phase === "thirdMonth" || f?.reactionAbnormal === true;
  return cm != null && (cm.trend === side ? !cm.inCounterMove || !late : cm.inCounterMove && late);
}

/**
 * How P7 combines its two remaining checks: "and" (both) or "or" (either).
 *
 * The spec (`score-pillars-research.md` §3 P7) bundles (a) price and time
 * squared, (b) a dated time window and (c) the reaction inside its time limit,
 * "2 of 3". (b) was dropped on 2026-10-20 (`STRATEGY_VERSION`
 * `2026-10-20-gann-time-pillar-no-window`), pending the owner's choice: the
 * window was open on 100% of random-walk turns, and neither excluding the
 * square's 22.5° lines and the Hexagon (99.2%) nor requiring two families to
 * converge (93.0%; 70.8% for three) made it selective. "2 of 3" with one gone
 * is 2 of 2, so the spec's own reading is "and", and it is the spec's §3
 * preference too (all-of wherever the checks ask one question, Gann's "all of
 * the parts make up the whole").
 *
 * Measured on random walks (`lib/scoring/__tests__/timePillarRule.test.ts`,
 * 400 walks of 300 weekday sessions, every 5th session from the 60th, both
 * sides; 38,400 readings): squared 21.1%, the reaction in its limit 50.0%,
 * "and" 9.5%, "or" 61.6% (since 2026-10-21 the square reads the move against
 * the trade; with the trade's own anchor they were 11.6% and 59.5%). Neither is saturated (above 95%) or near-empty
 * (below 5%), so the measurement does not decide between them, and the spec
 * does: "and" is its "2 of 3" with one check gone. "Or" would pass on the
 * reaction clock alone half the time (50.0% of the 61.6%), so time squared,
 * the pillar's first check, would decide little.
 *
 * Revert: put the window back as a third check in `timePillar` (the turn is
 * still read for `applyTimeWindowHold`, which is unchanged).
 */
export const TIME_PILLAR_COMBINE: "and" | "or" = "and";

/**
 * P7 (C3-C5, C9 time): price and time squared and the reaction inside its time
 * limit. The dated window is no longer one of its checks (see
 * `TIME_PILLAR_COMBINE`); it still holds a counter-trend Execute through
 * `applyTimeWindowHold`.
 */
export function timePillar(input: { side: Side; squared: boolean; facts: PillarFacts | null | undefined }): PillarResult {
  const { side, squared, facts: f } = input;
  const inLimit = reactionInTimeLimit(side, f);
  const passed = TIME_PILLAR_COMBINE === "and" ? squared && inLimit : squared || inLimit;
  const withTrend = f?.counterMove?.trend === side;
  return {
    passed,
    note: `Price and time squared: ${yes(squared)}. ${withTrend ? "The reaction is inside its time limit" : "The move against the trend has outrun its time limit"}: ${yes(inLimit)}. ${TIME_PILLAR_COMBINE === "and" ? "Both are needed" : "Either one is enough"}.`,
  };
}

/** P8 (C7, C8, S14, S21): volume at the turn or a base of weeks, with no capital-stock warning against the side. */
export function volumePillar(f: PillarFacts | null | undefined, side: Side, climax: boolean): PillarResult {
  const base = f?.base != null && f.base.long && f.base.breakout !== (side === "bullish" ? "down" : "up");
  const noWarning = side === "bearish" || f?.capitalWarning !== true;
  const passed = (climax || base) && noWarning;
  return {
    passed,
    note: `Volume at the turn: ${yes(climax)}. A base of ${side === "bullish" ? "accumulation" : "distribution"} over weeks: ${yes(base)}. No warning from the turnover of the stock: ${yes(noWarning)}.`,
  };
}

/** P9 (C9, C11, C12): the trigger armed, the stop behind an old level, and the counter-move against the greatest reaction. */
export function definiteIndicationPillar(f: PillarFacts | null | undefined, side: Side, armed: boolean, stopPlaced: boolean): PillarResult {
  const c = f?.campaign;
  const overbalanced = c != null && (c.spaceOverbalanced || c.timeOverbalanced);
  const reaction = c != null && (c.trend === side ? !overbalanced : overbalanced);
  const passed = armed && stopPlaced && reaction;
  const withTrend = c?.trend === side;
  return {
    passed,
    note: `Trigger armed: ${yes(armed)}. Stop 3 points behind an old level: ${yes(stopPlaced)}. ${withTrend ? "The reaction is within the campaign's greatest" : "The move against the trend has exceeded the campaign's greatest reaction"}: ${yes(reaction)}. All three are needed.`,
  };
}
