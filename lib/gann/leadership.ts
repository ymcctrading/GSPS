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
import { beyondByThreePoints } from "@/lib/gann/pointScale";

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
  /**
   * "Or cross previous years' tops first" (A-SELECTION-02, W006 pp.27-29):
   * the stock closed 3 points over the prior calendar year's high LEAD_DAYS or
   * more before the market did (or the market has not yet).
   */
  crossedTopsFirst: boolean;
  /**
   * "Or break previous years' bottoms first" (A-SELECTION-03, W006 pp.24-25):
   * the mirror, a close 3 points under the prior calendar year's low.
   */
  brokeBottomsFirst: boolean;
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

/**
 * When the daily bars first closed 3 points beyond the prior calendar year's
 * high ("top") or low ("bottom"), within the latest calendar year. NaN when
 * they have not, or when the prior year is not on record. The prior year's
 * extreme is read off the monthly bars when given (a whole year; the 52-week
 * daily chart holds only part of it), else off the daily bars. "Previous
 * years' tops" is read as the prior calendar year's extreme, an engineering
 * choice: Gann's examples cross the tops of one, two and three years back,
 * and the nearest year is the one every stock in the comparison has.
 */
function priorYearCrossDate(daily: Bar[], kind: "top" | "bottom", monthly?: Bar[] | null): number {
  if (daily.length === 0) return NaN;
  const year = daily[daily.length - 1].t.slice(0, 4);
  const prior = String(Number(year) - 1);
  const fromMonthly = (monthly ?? []).filter((b) => b.t.slice(0, 4) === prior);
  const last = fromMonthly.length > 0 ? fromMonthly : daily.filter((b) => b.t.slice(0, 4) === prior);
  if (last.length === 0) return NaN;
  const line = kind === "top"
    ? beyondByThreePoints(Math.max(...last.map((b) => b.h)), 1)
    : beyondByThreePoints(Math.min(...last.map((b) => b.l)), -1);
  const hit = daily.find((b) => b.t.slice(0, 4) === year && (kind === "top" ? b.c > line : b.c < line));
  return hit ? Date.parse(hit.t) : NaN;
}

/** The stock's date came LEAD_DAYS or more before the market's, or the market has none yet. */
function first(stock: number, market: number, lead: number): boolean {
  if (Number.isNaN(stock)) return false;
  return Number.isNaN(market) || market - stock >= lead;
}

export function readLeadership(
  daily: Bar[],
  market: Bar[] | null,
  campaign?: CampaignLedger | null,
  /** The stock's and the market's monthly bars, for the prior year's top and bottom. */
  monthly?: { stock?: Bar[] | null; market?: Bar[] | null },
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
      crossedTopsFirst: false,
      brokeBottomsFirst: false,
      firstYearHighCrossed,
    };
  }
  const end = daily[daily.length - 1].t;
  const mktAll = market.filter((b) => b.t <= end);
  const mkt = mktAll.slice(-LOOKBACK);
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
    crossedTopsFirst: first(priorYearCrossDate(daily, "top", monthly?.stock), priorYearCrossDate(mktAll, "top", monthly?.market), lead),
    brokeBottomsFirst: first(priorYearCrossDate(daily, "bottom", monthly?.stock), priorYearCrossDate(mktAll, "bottom", monthly?.market), lead),
    firstYearHighCrossed,
  };
}

/**
 * How strongly Gann's selection rules favour a trade in `direction`, for
 * ordering the lists (W006 pp.24-29, 32-34). Higher ranks first.
 *
 * - A-SELECTION-02: buy the early leaders of a bull market, the stocks that
 *   bottom first or cross previous years' tops first.
 * - A-SELECTION-03: sell short the early leaders of a bear market, the
 *   stocks that top first or break previous years' bottoms first (Chrysler
 *   topped 11 months before the averages, W006 pp.24-25).
 * - A-SELECTION-04: "always buy the stocks in strong position and leave those
 *   in weak position alone" (W006 p.33), and be long the strongest while short
 *   the weakest (Chrysler long, United Fruit short, 1935, pp.37-38). A weak
 *   stock in a bull market (`readWeakStock`) ranks last on the buy side and
 *   first on the sell side; `applyWeakStockHold` keeps it off Execute as a buy.
 *
 * - S6 (*How to Make Profits in Commodities* p. 20): "How to Select the
 *   Commodity that will Lead": compare the monthly highs and lows and take the
 *   strongest for a long, the weakest for a short. A stock in the strongest
 *   quarter of the universe or of its industry group (`readUniverseRank`)
 *   ranks a step higher as a buy, one in the weakest quarter a step higher as
 *   a short (2026-10-21).
 *
 * It orders setups and never scores them here (P3(c) scores the same rank).
 * Engineering choice, labelled as such: each reading counts one step, since
 * Gann ranks none of them above another.
 */
export function selectionStrength(
  direction: "bullish" | "bearish" | "none",
  leadership: LeadershipReading | null | undefined,
  weak?: WeakStockReading | null,
  rank?: { strongest: boolean; weakest: boolean; group?: { strongest: boolean; weakest: boolean } | null } | null,
): number {
  const strong = rank?.strongest || rank?.group?.strongest ? 1 : 0;
  const weakest = rank?.weakest || rank?.group?.weakest ? 1 : 0;
  const isWeak = weak?.weak === true ? 1 : 0;
  if (direction === "bullish") return (leadership?.bottomedFirst || leadership?.crossedTopsFirst ? 1 : 0) - isWeak + strong;
  if (direction === "bearish") return (leadership?.toppedFirst || leadership?.brokeBottomsFirst ? 1 : 0) + isWeak + weakest;
  return 0;
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
 * `readWeakStock` on the stock's and the market's months, each with the month
 * in progress from its daily bars (the market's cut at the stock's last
 * session), as `readDisclosedRules` reads it. Shared by the live scan, the
 * market scan's shortlist and the replay. Null without both monthly charts.
 */
export function readWeakStockFrom(
  stockMonthly: Bar[] | null | undefined,
  stockDaily: Bar[],
  marketMonthly: Bar[] | null | undefined,
  marketDaily: Bar[] | null | undefined,
): WeakStockReading | null {
  if (!stockMonthly || !marketMonthly || stockDaily.length === 0) return null;
  const end = stockDaily[stockDaily.length - 1].t;
  const market = monthlyWithCurrent(marketMonthly, (marketDaily ?? []).filter((b) => b.t <= end));
  return readWeakStock(monthlyWithCurrent(stockMonthly, stockDaily), market);
}

/**
 * Gann's two weak-stock readings in a bull market (A-TREND-07, W006 pp.25,
 * 27; A-TREND-08, p.35), on the stock's and the market's monthly bars from
 * the market's bull start. Gann's action on a weak stock (leave it alone on
 * the buy side, sell the weakest short) is A-SELECTION-04: `selectionStrength`
 * and `applyWeakStockHold` (2026-10-16).
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
