/**
 * Parity roadmap Stage D2 (gap G7): volume read against the company's whole
 * capital stock (its shares outstanding), not only against its own recent
 * volume. Context only: nothing here feeds a scored criterion, a gate, a plan,
 * an entry, a stop or a target. It is shown in the explanation trace and
 * recorded on every replayed trade (`contextFactors.ts`), so it is measured
 * before anything may gate (AGENTS.md "Gann-derived AND measured").
 *
 * Gann's rules (Tier A, his own books):
 * - "Two-thirds of the float changing hands in one week" at a top means
 *   distribution: Vanadium, Feb 1929 (*Wall Street Stock Selector*, 1930,
 *   Ch. VII).
 * - Weekly volume "almost equalling the total amount of stock outstanding"
 *   marks a plain top (Master Stock Market Course, Ch. 12, Vanadium weekly
 *   chart 1928-30).
 * - The entire capital stock trading inside one range after an advance means
 *   distribution and a change in trend: Chrysler, Jan-Apr 1934, after a
 *   52-point advance (Master Course Ch. 12).
 *
 * Gann's "float" in the Stock Selector and "capital stock" / "stock
 * outstanding" in the Master Course are the same figure in his usage: the
 * shares issued. We read shares outstanding from SEC filings (migration 0083).
 * Modern float, which excludes insider and restricted holdings, is a later
 * concept and is not used.
 *
 * Engineering choices, labelled as such:
 * - "At a top" is the heavy week closing in the upper half of the last 13
 *   weeks' high-low range. A heavy week in the lower half is the panic climax
 *   at a low, which D1 (`volumeClimax.ts`) already reads, and is not called
 *   distribution here.
 * - "Almost equalling" is read as at least 90% of the stock in one week.
 * - A heavy week counts for 4 weeks (about a month) after it prints, so the
 *   warning stays visible while the top forms.
 * - The range for the third rule is `readBreakaway`'s: the 13-week 3-Day
 *   Chart range, only when the market is range-bound. Volume is summed back
 *   from the latest bar for as long as bars stay inside it. Gann's range is
 *   10 points on 1934 prices, which doesn't port literally.
 * - Companies with several share classes are read against all classes
 *   together (Alphabet's GOOGL volume against A, B and C shares). That is
 *   Gann's "capital stock", but it understates one listed class's turnover.
 * - Weekly bars include the week in progress, as `disclosedRules.ts` rule 7
 *   does.
 * - A share count that would make the median week turn over more than a
 *   quarter of the stock is treated as wrong and the reading is dropped.
 *   Large caps trade a few percent a week; a count that far off is a bad
 *   filing figure or a split the filings haven't caught up with.
 *
 * Three-question basis:
 * 1. Gann: as cited above (A04 Ch. VII; A2.1 Ch. 12), Tier A.
 * 2. Cycles: no periodicity or recurrence claim, so Dewey's checklist does
 *    not apply. It is a reading of supply against the total available.
 * 3. Hermetic: Cause and Effect. Gann reads distribution as a cause (the
 *    stock passing from strong hands to weak ones) whose effect, a change in
 *    trend, follows. Polarity was considered and not used: the text states
 *    these as top rules, and the mirror at lows is D1's drying-up bottom,
 *    not a turnover rule, so no mirror is invented here.
 */

import type { Bar } from "@/lib/types";
import { readBreakaway } from "@/lib/gann/breakaway";

/** Two-thirds of the capital stock in one week (A04 Ch. VII). */
export const DISTRIBUTION_WEEK_TURNOVER = 2 / 3;
/** "Almost equalling the total amount of stock outstanding" (A2.1 Ch. 12), read as 90%. */
export const PLAIN_TOP_WEEK_TURNOVER = 0.9;
/** The whole capital stock traded inside one range (A2.1 Ch. 12). */
export const RANGE_TURNOVER_DISTRIBUTION = 1;
/** Median weekly turnover above this means the share count is wrong, not the market. */
export const IMPLAUSIBLE_MEDIAN_WEEK_TURNOVER = 0.25;
/** How many recent weeks a heavy week stays on the reading. */
export const HEAVY_WEEK_MEMORY = 4;
const TOP_RANGE_WEEKS = 13;

export interface CapitalStockReading {
  sharesOutstanding: number;
  /** The latest week's volume (week in progress included) as a fraction of shares outstanding. */
  latestWeekTurnover: number;
  /** The heaviest week of the last `HEAVY_WEEK_MEMORY`, as a fraction of shares outstanding. */
  peakRecentWeekTurnover: number;
  peakRecentWeek: string | null;
  /** That heavy week closed in the upper half of the 13-week range. */
  peakWeekAtTop: boolean;
  /** Gann's ⅔-of-the-stock week at a top, within the last 4 weeks. */
  distributionWeek: boolean;
  /** A week turning over ~all the stock at a top, within the last 4 weeks. */
  plainTopWeek: boolean;
  /** Volume inside the current range as a fraction of shares outstanding; null when not range-bound. */
  rangeTurnover: number | null;
  /** The range was entered from below (after an advance). */
  rangeAfterAdvance: boolean | null;
  /** The whole capital stock has traded inside the range after an advance. */
  distributionInRange: boolean;
  /** Any of the three distribution readings holds. */
  distributionSignal: boolean;
}

export function readCapitalStock(
  daily: Bar[],
  weekly: Bar[],
  sharesOutstanding: number | null | undefined,
): CapitalStockReading | null {
  if (!sharesOutstanding || sharesOutstanding <= 0 || weekly.length === 0 || daily.length === 0) return null;
  const shares = sharesOutstanding;
  const sorted = weekly.map((w) => w.v).sort((a, b) => a - b);
  if (sorted[Math.floor(sorted.length / 2)] / shares > IMPLAUSIBLE_MEDIAN_WEEK_TURNOVER) return null;

  const latestWeekTurnover = weekly[weekly.length - 1].v / shares;
  const topWindow = weekly.slice(-TOP_RANGE_WEEKS);
  const hi = Math.max(...topWindow.map((b) => b.h));
  const lo = Math.min(...topWindow.map((b) => b.l));
  let peak: Bar | null = null;
  for (const w of weekly.slice(-HEAVY_WEEK_MEMORY)) if (!peak || w.v > peak.v) peak = w;
  const peakRecentWeekTurnover = peak ? peak.v / shares : 0;
  const peakWeekAtTop = peak !== null && hi > lo && peak.c >= (hi + lo) / 2;

  let rangeTurnover: number | null = null;
  let rangeAfterAdvance: boolean | null = null;
  const range = readBreakaway(daily, null);
  if (range.rangeBound && range.rangeHigh !== null && range.rangeLow !== null) {
    let volume = 0;
    let i = daily.length - 1;
    for (; i >= 0; i--) {
      const b = daily[i];
      if (b.h > range.rangeHigh || b.l < range.rangeLow) break;
      volume += b.v;
    }
    rangeTurnover = volume / shares;
    // The bar that broke the walk is where price came from.
    rangeAfterAdvance = i >= 0 ? daily[i].c < (range.rangeHigh + range.rangeLow) / 2 : null;
  }

  const distributionWeek = peakWeekAtTop && peakRecentWeekTurnover >= DISTRIBUTION_WEEK_TURNOVER;
  const plainTopWeek = peakWeekAtTop && peakRecentWeekTurnover >= PLAIN_TOP_WEEK_TURNOVER;
  const distributionInRange =
    rangeTurnover !== null && rangeAfterAdvance === true && rangeTurnover >= RANGE_TURNOVER_DISTRIBUTION;

  return {
    sharesOutstanding: shares,
    latestWeekTurnover,
    peakRecentWeekTurnover,
    peakRecentWeek: peak ? peak.t.slice(0, 10) : null,
    peakWeekAtTop,
    distributionWeek,
    plainTopWeek,
    rangeTurnover,
    rangeAfterAdvance,
    distributionInRange,
    distributionSignal: distributionWeek || plainTopWeek || distributionInRange,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 2 : 1)}%`;

export function describeCapitalStock(r: CapitalStockReading): string[] {
  const lines = [
    `Capital stock: the latest week traded ${pct(r.latestWeekTurnover)} of the ${Math.round(r.sharesOutstanding).toLocaleString("en-US")} shares outstanding; the heaviest of the last ${HEAVY_WEEK_MEMORY} weeks traded ${pct(r.peakRecentWeekTurnover)}.`,
  ];
  if (r.plainTopWeek) lines.push("A week turned over almost the whole capital stock at a top: a plain top.");
  else if (r.distributionWeek) lines.push("Two-thirds of the capital stock changed hands in one week at a top: a distribution week.");
  if (r.rangeTurnover !== null) {
    lines.push(
      `Inside the current range, ${pct(r.rangeTurnover)} of the stock has traded${r.distributionInRange ? " after an advance: the whole capital stock has changed hands, a sign of distribution" : ""}.`,
    );
  }
  return lines;
}
