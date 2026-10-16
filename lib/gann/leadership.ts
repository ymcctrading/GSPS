/**
 * Gann's early and late leaders, and the first-year-high filter (parity
 * roadmap G25; *Wall Street Stock Selector* Ch. VII, Tier A).
 *
 * - "Stocks that bottom first top first." Leadership rotates by section: the
 *   early leaders bottom before the market and top before it; late movers
 *   bottom late and top late, with sharp tops and fast collapses.
 * - A stock must cross the high of the first year of the bull campaign (by
 *   the 3-point allowance) before it can lead a later section.
 * - The last campaign's leader rarely leads the next one.
 * - "Late tops make late bottoms, early tops make early bottoms" (A-TIME-08,
 *   *New Stock Trend Detector* pp. 31, 35-37, Tier A): Coca-Cola topped late
 *   and bottomed late. Read as a stock that topped after (or before) the
 *   market while its own campaign has turned down, so its bottom is expected
 *   after (or before) the market's. Context only; it gates nothing.
 *
 * The reading compares the stock's lowest low (and highest high) over the last
 * `LOOKBACK` sessions with the market's (the S&P 500 ETF, SPY, as the
 * market), and carries the campaign ledger's first-year-high test.
 *
 * Engineering choices, labelled as such: the market proxy is SPY; "first" and
 * "late" need a gap of at least `LEAD_DAYS` calendar days between the two
 * extremes; the lookback is a year of sessions.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: rotation of leadership within a campaign; no period is claimed,
 *    so Dewey does not apply. Cross-series clustering (Dewey's item) is what
 *    the comparison with the market measures, informally.
 * 3. Hermetic: Rhythm (the order of turning repeats: first down, first up)
 *    and Correspondence (the stock's cycle read against the market's).
 */

import type { Bar } from "@/lib/types";
import { buildCampaignLedger, type CampaignLedger } from "@/lib/gann/campaignLedger";
import { swingPivots, walkSwingChart, type SwingChartSpec } from "@/lib/gann/swingChart";

export const LOOKBACK = 250;
export const LEAD_DAYS = 10;

export interface LeadershipReading {
  /** The stock's low came before the market's by LEAD_DAYS or more: an early leader. */
  bottomedFirst: boolean;
  bottomedLate: boolean;
  /** The stock's high came before the market's: it may top first. */
  toppedFirst: boolean;
  /** The stock's high came after the market's by LEAD_DAYS or more: a late top. */
  toppedLate: boolean;
  /** Topped late and the stock's campaign is now bearish: late tops make late bottoms (A-TIME-08). */
  lateBottomExpected: boolean;
  /** Topped first and the stock's campaign is now bearish: early tops make early bottoms (A-TIME-08). */
  earlyBottomExpected: boolean;
  /** The campaign's first-year high, when a bull campaign has run a year. */
  firstYearHighCrossed: boolean | null;
}

function extremeDate(bars: Bar[], kind: "low" | "high"): number {
  let idx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (kind === "low" ? bars[i].l < bars[idx].l : bars[i].h > bars[idx].h) idx = i;
  }
  return Date.parse(bars[idx].t);
}

export function readLeadership(
  daily: Bar[],
  market: Bar[] | null,
  campaign?: CampaignLedger | null,
): LeadershipReading | null {
  if (daily.length < 60) return null;
  const ledger = campaign === undefined ? buildCampaignLedger(daily) : campaign;
  const firstYearHighCrossed = ledger?.firstYearHigh ? ledger.firstYearHigh.crossed : null;
  if (!market || market.length < 60) {
    return {
      bottomedFirst: false,
      bottomedLate: false,
      toppedFirst: false,
      toppedLate: false,
      lateBottomExpected: false,
      earlyBottomExpected: false,
      firstYearHighCrossed,
    };
  }
  const end = daily[daily.length - 1].t;
  const mkt = market.filter((b) => b.t <= end).slice(-LOOKBACK);
  const stk = daily.slice(-LOOKBACK);
  const lead = LEAD_DAYS * 86_400_000;
  const sLow = extremeDate(stk, "low");
  const mLow = extremeDate(mkt, "low");
  const sHigh = extremeDate(stk, "high");
  const mHigh = extremeDate(mkt, "high");
  const toppedFirst = mHigh - sHigh >= lead;
  const toppedLate = sHigh - mHigh >= lead;
  // Engineering choice, labelled: "now declining" is the stock's own campaign
  // ledger reading bearish (its weekly chart's trend).
  const declining = ledger?.trend === "bearish";
  return {
    bottomedFirst: mLow - sLow >= lead,
    bottomedLate: sLow - mLow >= lead,
    toppedFirst,
    toppedLate,
    lateBottomExpected: toppedLate && declining,
    earlyBottomExpected: toppedFirst && declining,
    firstYearHighCrossed,
  };
}

/**
 * Gann's monthly chart for dating a bull market: a swing turns on two monthly
 * bars against it. "Monthly tops and bottoms" in his examples include
 * two-month reactions (W006 p.38). The count is that reading, labelled an
 * engineering choice: Gann dates bull markets by their years and gives no
 * construction for the start.
 */
export const MONTHLY_REACTION_CHART: SwingChartSpec = { kind: "bars", count: 2 };

/** "The first or second year of a bull market" and "fails for two years" (W006 pp.25, 27), in months. */
export const EARLY_TOP_MONTHS = 24;
/** "Rallies only 2-3 months at the start" (W006 p.35). */
export const FIRST_RALLY_MAX_MONTHS = 3;

export interface WeakStockReading {
  /** The month (YYYY-MM) the market's bull market began: its low before the monthly chart turned up. */
  bullStart: string;
  /**
   * A-TREND-07: the stock's top of the bull market's first two years, not
   * exceeded in the two years since. Null until two years have passed since
   * that top.
   */
  earlyTopFailed: { top: number; month: string } | null;
  /**
   * A-TREND-08: the stock's first rally of the bull market lasted three
   * months or less and no later month has exceeded its top.
   */
  firstRallyNotExceeded: { top: number; month: string; months: number } | null;
  /** Either reading: Gann calls such a stock weak in a bull market. */
  weak: boolean;
}

/**
 * The completed months plus the month in progress from the daily bars, so the
 * live scan (whose monthly bars include the month so far) and the replay
 * (which passes closed months only) read the same chart.
 */
export function monthlyWithCurrent(monthly: Bar[], daily: Bar[]): Bar[] {
  if (daily.length === 0) return monthly;
  const month = daily[daily.length - 1].t.slice(0, 7);
  const closed = monthly.filter((b) => b.t.slice(0, 7) < month);
  const cur = daily.filter((b) => b.t.slice(0, 7) === month);
  if (cur.length === 0) return closed;
  return [
    ...closed,
    { t: cur[0].t, o: cur[0].o, h: Math.max(...cur.map((b) => b.h)), l: Math.min(...cur.map((b) => b.l)), c: cur[cur.length - 1].c, v: cur.reduce((n, b) => n + b.v, 0) },
  ];
}

/**
 * The month the market's current bull market began, or null when the
 * market's monthly chart is not in a bull trend: the lowest monthly low
 * between the chart's previous trend change and the change to up (the same
 * construction the campaign ledger uses on the weekly chart).
 */
export function marketBullStart(marketMonthly: Bar[]): string | null {
  if (marketMonthly.length < 6) return null;
  const walk = walkSwingChart(marketMonthly, MONTHLY_REACTION_CHART);
  if (walk.trend !== "bullish") return null;
  const changes = walk.trendChanges;
  const changeAt = changes.length > 0 ? changes[changes.length - 1] : marketMonthly.length - 1;
  const prev = changes.length > 1 ? changes[changes.length - 2] : 0;
  let start = prev;
  for (let i = prev; i <= changeAt; i++) if (marketMonthly[i].l < marketMonthly[start].l) start = i;
  return marketMonthly[start].t.slice(0, 7);
}

/**
 * The month the market's current bear market began, or null when the market's
 * monthly chart is not in a bear trend: the highest monthly high between the
 * chart's previous trend change and the change to down. The mirror of
 * `marketBullStart`, for Gann's bear-market durations (`bearDuration.ts`).
 */
export function marketBearStart(marketMonthly: Bar[]): string | null {
  if (marketMonthly.length < 6) return null;
  const walk = walkSwingChart(marketMonthly, MONTHLY_REACTION_CHART);
  if (walk.trend !== "bearish") return null;
  const changes = walk.trendChanges;
  const changeAt = changes.length > 0 ? changes[changes.length - 1] : marketMonthly.length - 1;
  const prev = changes.length > 1 ? changes[changes.length - 2] : 0;
  let start = prev;
  for (let i = prev; i <= changeAt; i++) if (marketMonthly[i].h > marketMonthly[start].h) start = i;
  return marketMonthly[start].t.slice(0, 7);
}

/**
 * Gann's two weak-stock readings in a bull market (A-TREND-07, W006 pp.25,
 * 27; A-TREND-08, p.35), on the stock's and the market's monthly bars from
 * the market's bull start. Context only: Gann's action on a weak stock
 * (leave it alone on the buy side, sell the weakest short) is A-SELECTION-04,
 * PLAN.md item 11, and is not built here.
 */
export function readWeakStock(stockMonthly: Bar[], marketMonthly: Bar[]): WeakStockReading | null {
  const bullStart = marketBullStart(marketMonthly);
  if (!bullStart) return null;
  const from = stockMonthly.findIndex((b) => b.t.slice(0, 7) >= bullStart);
  if (from < 0) return null;
  const bars = stockMonthly.slice(from);

  // A-TREND-07: the highest month of the first two years, then two years with
  // no month above it.
  let earlyTopFailed: WeakStockReading["earlyTopFailed"] = null;
  const early = bars.slice(0, EARLY_TOP_MONTHS);
  if (early.length > 0) {
    let top = 0;
    for (let i = 1; i < early.length; i++) if (early[i].h > early[top].h) top = i;
    const after = bars.slice(top + 1);
    if (after.length >= EARLY_TOP_MONTHS && after.every((b) => b.h <= early[top].h)) {
      earlyTopFailed = { top: early[top].h, month: early[top].t.slice(0, 7) };
    }
  }

  // A-TREND-08: the first rally from the start, measured to its first top on
  // the monthly chart, lasting three months or less, never exceeded since.
  let firstRallyNotExceeded: WeakStockReading["firstRallyNotExceeded"] = null;
  const pivots = swingPivots(bars, MONTHLY_REACTION_CHART);
  const firstTop = pivots.find((p) => p.kind === "top" && p.index > 0);
  if (firstTop) {
    let low = 0;
    for (let i = 1; i < firstTop.index; i++) if (bars[i].l < bars[low].l) low = i;
    const months = firstTop.index - low;
    if (months <= FIRST_RALLY_MAX_MONTHS && bars.slice(firstTop.index + 1).every((b) => b.h <= firstTop.price)) {
      firstRallyNotExceeded = { top: firstTop.price, month: bars[firstTop.index].t.slice(0, 7), months };
    }
  }

  return { bullStart, earlyTopFailed, firstRallyNotExceeded, weak: earlyTopFailed !== null || firstRallyNotExceeded !== null };
}
