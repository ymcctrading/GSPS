/**
 * Gann's swing charts: the 3-Day Chart and the 7-day (weekly) swing chart.
 *
 * **Rebuilt 2026-09-27 to Gann's own construction** (project-owner decision:
 * "Gann's method supersedes my own", conflict X3 in
 * `docs/memory-bank/GANN_PARITY_ROADMAP.md`). The earlier version flipped a
 * direction after 3 or 9 consecutive opposing *closes*, and its "9-day"
 * chart had no source. Four of Gann's texts define the charts differently,
 * and all agree on three points:
 *
 * 1. **Highs and lows, not closes.** *45 Years in Wall Street* (1949,
 *    Ch. VII, p. 62): when the market makes higher tops for 3 consecutive
 *    days the line follows it up; after 3 days of lower bottoms the line
 *    moves down to the low of the third day.
 * 2. **The line records counter-moves by their duration.** *How to Make
 *    Profits in Commodities* (1951 New Rules, p. 316): the daily chart
 *    "records all reverse moves or reactions that run 2 to 3 days". Pp.
 *    316-317: the weekly chart records "reverse moves of 7 calendar days or
 *    more", which Gann calls "one of the most valuable trend indicators".
 * 3. **The trend changes when the last swing extreme breaks**, not when a
 *    counter-move ends. The counter-move only moves the line. Crossing the
 *    last swing top means higher; breaking the last swing bottom means lower
 *    (A09 p. 62; A8 p. 316). *Wall Street Stock Selector* (1930, Ch. IV) and
 *    *Truth of the Stock Tape* (1923, p. 82) give the same time-based charts
 *    ("moves of from three days to one week").
 *
 * So this module keeps two things separate: the **line** (which way the
 * swing is currently moving, reversed by a counter-move of the chart's
 * length) and the **trend** (set only by crossing the last completed swing
 * top or breaking the last completed swing bottom).
 *
 * **The two charts.**
 * - `THREE_DAY_CHART`: a counter-move of 3 consecutive bars making lower lows
 *   (against an up-swing) or higher highs (against a down-swing). A09's
 *   literal rule. Bars that neither extend the swing nor continue the
 *   counter-run reset the count, so it must be consecutive.
 * - `WEEKLY_SWING_CHART`: a counter-move whose extreme comes 7 or more
 *   calendar days after the swing's own extreme. A8's literal rule, measured
 *   on calendar dates, so weekends and holidays count, as Gann counted them.
 *
 * **Correspondence across timeframes.** The same two rules applied to coarser
 * bars reproduce Gann's other disclosed charts rather than inventing new
 * ones. On weekly bars, the 7-calendar-day rule reverses on a one-bar
 * counter-move: the Master Course's weekly 1-bar swing chart (Ch. 18). On
 * monthly bars it reverses on a one-month reaction, and the trend turns on
 * breaking the prior swing's monthly low: A05's monthly-low break. On weekly
 * bars the 3-bar chart is the "3-week" reaction rule (A09 Rule 4).
 *
 * **Not built here: the 9-point swing chart** (A09 Ch. VII). Its threshold is
 * 9 Dow points, a price magnitude that needs scaling to each instrument
 * before it means anything. It stays a candidate, not a silent substitute.
 *
 * ---
 *
 * **Three-question basis:**
 * 1. Gann: A09 Ch. VII (1949), A8 pp. 316-317 (1951), A04 Ch. IV (1930),
 *    A02 p. 82 (1923). All Tier A, Gann's own published books.
 * 2. Cycles: no periodicity claim. The 3 and 7 are counter-move lengths
 *    Gann uses to filter noise, not cycle periods, so Dewey's checklist does
 *    not gate this. Stated because the mandate asks for an answer.
 * 3. Hermetic: Rhythm (the line only turns when the market's own swing
 *    rhythm turns) and Correspondence (one construction, every timeframe, as
 *    above). Polarity: every rule has its exact mirror for the down side.
 */

import type { Bar } from "@/lib/types";

export type SwingDirection = "bullish" | "bearish" | null;

/** How a chart decides that a counter-move is long enough to move the line. */
export type SwingChartSpec =
  /** N consecutive bars against the swing (lower lows in an up-swing, higher highs in a down-swing). */
  | { kind: "bars"; count: number }
  /** The counter-move's extreme is at least N calendar days after the swing's own extreme. */
  | { kind: "calendarDays"; days: number };

/** Gann's 3-Day Chart (A09 Ch. VII, p. 62). */
export const THREE_DAY_CHART: SwingChartSpec = { kind: "bars", count: 3 };

/** Gann's 7-day weekly swing chart (A8 1951, pp. 316-317). */
export const WEEKLY_SWING_CHART: SwingChartSpec = { kind: "calendarDays", days: 7 };

/**
 * The two charts' counter-move lengths, for callers that size history
 * windows. `threeDay` is in bars and `weekly` in calendar days.
 */
export const SWING_CHART_DAYS = { threeDay: 3, weekly: 7 } as const;

/**
 * A completed swing's extreme: the "old top" or "old bottom" Gann's Buying
 * and Selling Points are stated against (A8: "crossing old tops/bottoms").
 */
export interface SwingPivot {
  /** Bar index where the extreme printed. */
  index: number;
  price: number;
  kind: "top" | "bottom";
}

export interface SwingChartWalk {
  /**
   * Gann's trend: the line's first direction until a swing completes, then
   * changed only by crossing the last completed swing top (bullish) or
   * breaking the last completed swing bottom (bearish). Null only when the
   * bars never move out of their opening range.
   */
  trend: SwingDirection;
  /** Which way the swing line is currently moving. Null before the first swing. */
  swingDirection: SwingDirection;
  /**
   * Every completed swing extreme, oldest first, starting with the chart's
   * origin (the extreme the first swing started from). The swing still in
   * progress is excluded.
   */
  pivots: SwingPivot[];
  /** Bar indices where `trend` changed. */
  trendChanges: number[];
  /** Bar indices where the line reversed (a swing completed). */
  reversals: number[];
}

const DAY_MS = 24 * 3600 * 1000;

function calendarDaysBetween(a: Bar, b: Bar): number {
  return Math.round((Date.parse(b.t) - Date.parse(a.t)) / DAY_MS);
}

function toSpec(chart: SwingChartSpec | number): SwingChartSpec {
  return typeof chart === "number" ? { kind: "bars", count: chart } : chart;
}

/**
 * Walks the bars once and returns the chart's line, its completed swings and
 * Gann's trend. A plain number is read as a consecutive-bar count, so
 * `walkSwingChart(bars, 3)` is the 3-Day Chart.
 */
export function walkSwingChart(bars: Bar[], chart: SwingChartSpec | number): SwingChartWalk {
  const spec = toSpec(chart);
  const walk: SwingChartWalk = {
    trend: null,
    swingDirection: null,
    pivots: [],
    trendChanges: [],
    reversals: [],
  };
  if (bars.length < 2) return walk;

  let dir: SwingDirection = null;
  let ext = 0; // index of the current swing's extreme (top in an up-swing, bottom in a down-swing)
  let counterExt = -1; // index of the counter-move's extreme since `ext`
  let run = 0; // consecutive counter bars (bars spec only)
  let lastTop: SwingPivot | null = null;
  let lastBottom: SwingPivot | null = null;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];

    // Trend first, against swings completed before this bar.
    const crossedTop = lastTop !== null && bar.h > lastTop.price;
    const brokeBottom = lastBottom !== null && bar.l < lastBottom.price;
    // A bar that does both is ambiguous on its own; the trend holds until one
    // side is cleared cleanly.
    const signal: SwingDirection =
      crossedTop && !brokeBottom ? "bullish" : brokeBottom && !crossedTop ? "bearish" : null;
    if (signal !== null && signal !== walk.trend) {
      walk.trend = signal;
      walk.trendChanges.push(i);
    }

    // Then the line.
    if (dir === null) {
      const higher = bar.h > bars[ext].h;
      const lower = bar.l < bars[ext].l;
      if (higher && !lower) {
        dir = "bullish";
        ext = i;
      } else if (lower && !higher) {
        dir = "bearish";
        ext = i;
      } else if (higher && lower) {
        ext = i; // outside bar: the new range is the starting point
      }
      // The chart starts from where the first swing began: the lowest low
      // before a first up-swing (or the highest high before a first
      // down-swing) is the chart's first old bottom (top). Without it the
      // first swing would have nothing to break, and a market that turned
      // from its opening swing would keep reading the opening direction.
      // Until another swing completes, the line's first direction is the
      // trend; from then on only a crossing changes it.
      if (dir !== null && walk.trend === null) {
        let start = 0;
        for (let k = 1; k < i; k++) {
          if (dir === "bullish" ? bars[k].l < bars[start].l : bars[k].h > bars[start].h) start = k;
        }
        const origin: SwingPivot =
          dir === "bullish"
            ? { index: start, price: bars[start].l, kind: "bottom" }
            : { index: start, price: bars[start].h, kind: "top" };
        walk.pivots.push(origin);
        if (dir === "bullish") lastBottom = origin;
        else lastTop = origin;
        walk.trend = dir;
        walk.trendChanges.push(i);
      }
      continue;
    }

    const up: boolean = dir === "bullish";
    const extends_ = up ? bar.h > bars[ext].h : bar.l < bars[ext].l;
    if (extends_) {
      ext = i;
      run = 0;
      counterExt = -1;
      continue;
    }

    // A counter-move bar: track its extreme and, for the bar-count chart, the run.
    const counterBetter = up
      ? counterExt < 0 || bar.l < bars[counterExt].l
      : counterExt < 0 || bar.h > bars[counterExt].h;
    if (counterBetter) counterExt = i;

    let reverse: boolean;
    if (spec.kind === "bars") {
      const continues = up ? bar.l < prev.l : bar.h > prev.h;
      const breaks = up ? bar.l > prev.l : bar.h < prev.h;
      if (continues) run++;
      else if (breaks) run = 0;
      reverse = run >= spec.count;
    } else {
      reverse = counterExt >= 0 && calendarDaysBetween(bars[ext], bars[counterExt]) >= spec.days;
    }

    if (reverse && counterExt >= 0) {
      const pivot: SwingPivot = up
        ? { index: ext, price: bars[ext].h, kind: "top" }
        : { index: ext, price: bars[ext].l, kind: "bottom" };
      walk.pivots.push(pivot);
      if (up) lastTop = pivot;
      else lastBottom = pivot;
      walk.reversals.push(i);
      dir = up ? "bearish" : "bullish";
      ext = counterExt;
      counterExt = -1;
      run = 0;
    }
  }

  walk.swingDirection = dir;
  return walk;
}

/** Gann's trend on the given chart: see `SwingChartWalk.trend`. */
export function swingChartDirection(bars: Bar[], chart: SwingChartSpec | number): SwingDirection {
  return walkSwingChart(bars, chart).trend;
}

export interface SwingChartReading {
  /** Trend on the 3-Day Chart. */
  threeDay: SwingDirection;
  /** Trend on the 7-day weekly swing chart. */
  weekly: SwingDirection;
}

export function computeSwingChart(bars: Bar[]): SwingChartReading {
  return {
    threeDay: swingChartDirection(bars, THREE_DAY_CHART),
    weekly: swingChartDirection(bars, WEEKLY_SWING_CHART),
  };
}

/**
 * Every completed swing's extreme, oldest first. A number is a
 * consecutive-bar count (3 = the 3-Day Chart).
 *
 * Only completed swings are returned. The swing still in progress has no
 * settled extreme, and an entry rule written against a moving level is not
 * the rule Gann stated.
 */
export function swingPivots(bars: Bar[], chart: SwingChartSpec | number): SwingPivot[] {
  return walkSwingChart(bars, chart).pivots;
}

export type CampaignLegConfidence = "low" | "high" | "extended";

export interface CampaignLegReading {
  /**
   * How many 3-Day Chart legs (including the current, still-open one) have
   * printed since the weekly swing chart's last trend change. Null until the
   * weekly chart has signalled a trend.
   */
  legNumber: number | null;
  /**
   * Gann's "sections of a campaign" (A05 1936; A8; A09 Rule 5): a bull or
   * bear move typically runs 3-4 sections before a genuine trend change, and
   * a reversal in the 3rd/4th is trusted more than one in the 2nd. `"low"` =
   * legs 1-2, `"high"` = legs 3-4, `"extended"` = leg 5+ (outside the
   * textbook case, not itself stronger or weaker). Null when `legNumber` is.
   */
  confidence: CampaignLegConfidence | null;
}

/**
 * Confluence/context only. Counts 3-Day Chart legs since the weekly chart's
 * last trend change and classifies the count against Gann's 3-4-section
 * pattern. Never affects a scored `passed`.
 */
export function computeCampaignLeg(bars: Bar[]): CampaignLegReading {
  const weekly = walkSwingChart(bars, WEEKLY_SWING_CHART);
  if (weekly.trend === null) return { legNumber: null, confidence: null };
  const threeDay = walkSwingChart(bars, THREE_DAY_CHART);

  const lastMajorChange = weekly.trendChanges[weekly.trendChanges.length - 1];
  const legsSinceMajorChange = threeDay.reversals.filter((i) => i > lastMajorChange).length;
  const legNumber = legsSinceMajorChange + 1; // the current, still-open leg counts as one

  const confidence: CampaignLegConfidence = legNumber <= 2 ? "low" : legNumber <= 4 ? "high" : "extended";
  return { legNumber, confidence };
}
