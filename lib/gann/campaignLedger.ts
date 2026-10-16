/**
 * The campaign counter-move ledger (Gann parity roadmap, Stage B2).
 *
 * Gann judges a change of trend by comparing the market with its own record
 * during the current campaign. This module keeps that record: every swing on
 * the 3-Day Chart since the weekly chart's trend began, with its size in
 * percent and its length in calendar days, and from it the readings his
 * change-of-trend rules ask for.
 *
 * Rules and sources (all Tier A):
 * - **Sections of a campaign.** Bull and bear markets run in 3-4 sections,
 *   and a signal in the 3rd or 4th counts for more than one in the 2nd
 *   (*45 Years in Wall Street*, Rule 5; *Commodities* p. 51).
 * - **Over-balance of space** (the Space Rule's third stage). When a reaction
 *   exceeds the greatest reaction of the campaign, the trend has changed or
 *   will soon (Master Course Ch. 7, 10A, 11A; *Commodities* p. 51).
 * - **Over-balance of time.** When a reaction lasts longer than the longest
 *   reaction of the campaign, the trend is changing; time outranks price
 *   (*Commodities* p. 51, 1951 New Rules p. 312; A09 Rule 8).
 * - **Monthly-low break.** The first break of a prior month's low since the
 *   top signals the turn, mirrored for highs (*New Stock Trend Detector*;
 *   *Wall Street Stock Selector* Ch. IV and VII). Read on the month so far,
 *   with whether it is the campaign's first.
 * - **Time balancing.** Project a swing's duration forward from the last
 *   pivot: when the current move has lasted as long as the prior one, time
 *   has balanced (*Commodities* pp. 97-99, 205, 293).
 * - **First-year high.** A stock must cross the high of the first year of
 *   the campaign before it can lead a later section (*Wall Street Stock
 *   Selector* Ch. VII).
 *
 * Engineering choices, labelled as such:
 * - Size is measured in percent of price, not Gann's points, so the rule
 *   ports across price levels (the scaling precedent is Gann's own "normal
 *   move = 1/16 of price", *Commodities* 1951, p. 310).
 * - The campaign starts at the extreme the weekly chart's current trend
 *   began from, and sections and reactions are counted on the 3-Day Chart.
 * - The first-year high needs a campaign at least a year old, which the
 *   scan's year of daily bars rarely holds, so it is usually null.
 *
 * Context only for now, like Stage A: nothing here scores or gates until the
 * replay has measured it.
 *
 * Three-question basis:
 * 1. Gann: as cited above.
 * 2. Cycles: time balancing and over-balance of time are recurrence claims
 *    about swing durations. None of Dewey's items is cleared yet (untested
 *    against a base rate), which is why this is context only until measured.
 * 3. Hermetic: Cause and Effect (a campaign's record is the cause the next
 *    signal is judged against) and Rhythm (a reaction that outlasts every
 *    earlier one has broken the campaign's rhythm).
 */

import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

const DAY_MS = 24 * 3600 * 1000;

function days(a: Bar, b: Bar): number {
  return Math.round((Date.parse(b.t) - Date.parse(a.t)) / DAY_MS);
}

export interface SwingLeg {
  direction: "up" | "down";
  fromIndex: number;
  toIndex: number;
  /** Size as a percent of the price the leg started from. */
  pct: number;
  days: number;
}

export interface CounterMoveSize {
  pct: number;
  days: number;
}

export interface CampaignLedger {
  trend: "bullish" | "bearish";
  campaignStartDate: string;
  /** Legs in the trend's direction, counting the current one if it is running. */
  sections: number;
  /** Completed legs since the campaign began, oldest first. */
  legs: SwingLeg[];
  /** The largest completed counter-move, by size and by length (not necessarily the same leg). */
  greatestCounterMove: CounterMoveSize | null;
  /** The counter-move in progress, when the 3-Day Chart is moving against the trend. */
  currentCounterMove: CounterMoveSize | null;
  spaceOverbalanced: boolean;
  timeOverbalanced: boolean;
  /** This month so far has broken the prior month's low (bullish campaign) or high (bearish). */
  monthlyBreak: boolean;
  /** It is the campaign's first: no earlier month in the campaign broke the one before it. */
  monthlyBreakFirst: boolean;
  /**
   * The campaign's last three completed counter-moves each smaller than the
   * one before (C-TREND-04, W003 p.17, class C: late in a trend reactions get
   * smaller until a sharp reversal). Context only, never gating.
   */
  contracting: boolean;
  /** Calendar days spent moving with the campaign's trend, completed legs plus the open one. */
  trendDays: number;
  /** Calendar days spent moving against it, the same way. */
  counterDays: number;
  /**
   * More time against the trend than with it (C-TREND-07, W003 p.17 and W034
   * p.2, class C: a rising market should spend more time rising than falling).
   * Context only, never gating.
   */
  timeRatioInverted: boolean;
  /** Dates when the current move will have lasted as long as the matching prior leg. */
  timeBalanceDates: string[];
  firstYearHigh: { price: number; crossed: boolean } | null;
}

/** Each calendar month's low and high, oldest first, from `from` on. */
function monthRanges(bars: Bar[], from = 0): { month: string; low: number; high: number }[] {
  const out: { month: string; low: number; high: number }[] = [];
  for (let i = from; i < bars.length; i++) {
    const m = bars[i].t.slice(0, 7);
    const cur = out[out.length - 1];
    if (cur && cur.month === m) {
      cur.low = Math.min(cur.low, bars[i].l);
      cur.high = Math.max(cur.high, bars[i].h);
    } else out.push({ month: m, low: bars[i].l, high: bars[i].h });
  }
  return out;
}

export function buildCampaignLedger(bars: Bar[]): CampaignLedger | null {
  if (bars.length < 10) return null;
  const weekly = walkSwingChart(bars, WEEKLY_SWING_CHART);
  if (weekly.trend === null) return null;
  const bull = weekly.trend === "bullish";

  // The campaign starts at the extreme the current weekly trend began from:
  // the lowest low (bull) or highest high (bear) between the previous weekly
  // trend change and this one.
  const changes = weekly.trendChanges;
  const changeAt = changes[changes.length - 1];
  const prevChange = changes.length > 1 ? changes[changes.length - 2] : 0;
  let start = prevChange;
  for (let i = prevChange; i <= changeAt; i++) {
    if (bull ? bars[i].l < bars[start].l : bars[i].h > bars[start].h) start = i;
  }

  // Swing points from the 3-Day Chart after the start, kept alternating.
  const daily = walkSwingChart(bars, THREE_DAY_CHART);
  const points: { index: number; price: number; kind: "top" | "bottom" }[] = [
    { index: start, price: bull ? bars[start].l : bars[start].h, kind: bull ? "bottom" : "top" },
  ];
  for (const p of daily.pivots) {
    if (p.index <= start) continue;
    const last = points[points.length - 1];
    if (p.kind === last.kind) {
      // Same kind twice: keep the more extreme one.
      const better = p.kind === "top" ? p.price > last.price : p.price < last.price;
      if (better) points[points.length - 1] = p;
      continue;
    }
    points.push(p);
  }

  const legs: SwingLeg[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    legs.push({
      direction: b.price > a.price ? "up" : "down",
      fromIndex: a.index,
      toIndex: b.index,
      pct: (Math.abs(b.price - a.price) / a.price) * 100,
      days: days(bars[a.index], bars[b.index]),
    });
  }

  const trendDir: SwingLeg["direction"] = bull ? "up" : "down";
  const counterLegs = legs.filter((l) => l.direction !== trendDir);
  const greatestCounterMove =
    counterLegs.length > 0
      ? { pct: Math.max(...counterLegs.map((l) => l.pct)), days: Math.max(...counterLegs.map((l) => l.days)) }
      : null;

  // The open leg runs from the last swing point to the current extreme.
  const lastPoint = points[points.length - 1];
  const last = bars[bars.length - 1];
  // Crossing the last top (bottom in a bear campaign) ends the counter-move:
  // the trend has resumed even if the 3-Day Chart's line hasn't turned yet.
  let resumed = false;
  for (let i = lastPoint.index + 1; i < bars.length; i++) {
    if (bull ? bars[i].h > lastPoint.price : bars[i].l < lastPoint.price) resumed = true;
  }
  const openIsCounter = (bull ? lastPoint.kind === "top" : lastPoint.kind === "bottom") && !resumed;
  let currentCounterMove: CounterMoveSize | null = null;
  if (openIsCounter) {
    let extreme = lastPoint.index;
    for (let i = lastPoint.index + 1; i < bars.length; i++) {
      if (bull ? bars[i].l < bars[extreme].l : bars[i].h > bars[extreme].h) extreme = i;
    }
    const end = bull ? bars[extreme].l : bars[extreme].h;
    currentCounterMove = {
      pct: (Math.abs(lastPoint.price - end) / lastPoint.price) * 100,
      days: days(bars[lastPoint.index], last),
    };
  }

  const trendLegs = legs.filter((l) => l.direction === trendDir).length;
  const sections = trendLegs + (openIsCounter ? 0 : 1);

  const spaceOverbalanced =
    currentCounterMove !== null && greatestCounterMove !== null && currentCounterMove.pct > greatestCounterMove.pct;
  const timeOverbalanced =
    currentCounterMove !== null && greatestCounterMove !== null && currentCounterMove.days > greatestCounterMove.days;

  const lastCounters = counterLegs.slice(-3);
  const contracting = lastCounters.length === 3 && lastCounters[1].pct < lastCounters[0].pct && lastCounters[2].pct < lastCounters[1].pct;
  const openDays = days(bars[lastPoint.index], last);
  const trendDays = legs.filter((l) => l.direction === trendDir).reduce((n, l) => n + l.days, 0) + (openIsCounter ? 0 : openDays);
  const counterDays = counterLegs.reduce((n, l) => n + l.days, 0) + (openIsCounter ? openDays : 0);

  // The monthly break (A-TREND-11/-12, W006 pp.40-43): a month's bar keeps its
  // low (high) for the whole month, so the month so far is compared with the
  // one before, not the last session alone. Gann marks the first such break
  // since the last one; within the campaign, that is the first month to break
  // its predecessor (step 6.3).
  const breaks = (prev: { low: number; high: number }, cur: { low: number; high: number }) =>
    bull ? cur.low < prev.low : cur.high > prev.high;
  const months = monthRanges(bars);
  const monthlyBreak = months.length >= 2 && breaks(months[months.length - 2], months[months.length - 1]);
  const campaignMonths = monthRanges(bars, start);
  let earlierBreak = false;
  for (let k = 1; k < campaignMonths.length - 1; k++) if (breaks(campaignMonths[k - 1], campaignMonths[k])) earlierBreak = true;
  const monthlyBreakFirst = monthlyBreak && !earlierBreak;

  // Time balancing: the open leg measured against the last completed leg in
  // the same direction.
  const timeBalanceDates: string[] = [];
  const openDirection: SwingLeg["direction"] = openIsCounter ? (bull ? "down" : "up") : trendDir;
  const matching = [...legs].reverse().find((l) => l.direction === openDirection);
  if (matching) {
    const date = new Date(Date.parse(bars[lastPoint.index].t) + matching.days * DAY_MS);
    timeBalanceDates.push(date.toISOString().slice(0, 10));
  }

  let firstYearHigh: CampaignLedger["firstYearHigh"] = null;
  if (bull && days(bars[start], last) >= 365) {
    const cutoff = Date.parse(bars[start].t) + 365 * DAY_MS;
    let high = -Infinity;
    for (let i = start; i < bars.length && Date.parse(bars[i].t) <= cutoff; i++) high = Math.max(high, bars[i].h);
    firstYearHigh = { price: high, crossed: last.c > high };
  }

  return {
    trend: weekly.trend,
    campaignStartDate: bars[start].t.slice(0, 10),
    sections,
    legs,
    greatestCounterMove,
    currentCounterMove,
    spaceOverbalanced,
    timeOverbalanced,
    monthlyBreak,
    monthlyBreakFirst,
    contracting,
    trendDays,
    counterDays,
    timeRatioInverted: counterDays > trendDays,
    timeBalanceDates,
    firstYearHigh,
  };
}

export interface MonthlyBreakWarning {
  trend: "bullish" | "bearish";
  monthlyBreak: boolean;
  first: boolean;
}

/**
 * The monthly break as a warning against new trades with the campaign's trend
 * (PLAN.md item 6, step 3). It does not end the trend: Gann's 1933 reaction
 * broke monthly lows and he still read the trend as up, because the low held
 * above the first section's top (W006 p.14).
 */
export function readMonthlyBreakWarning(bars: Bar[]): MonthlyBreakWarning | null {
  const l = buildCampaignLedger(bars);
  return l ? { trend: l.trend, monthlyBreak: l.monthlyBreak, first: l.monthlyBreakFirst } : null;
}

export function describeCampaignLedger(l: CampaignLedger): string[] {
  const lines = [`Campaign (${l.trend}) since ${l.campaignStartDate}: section ${l.sections}.`];
  if (l.currentCounterMove && l.greatestCounterMove) {
    lines.push(
      `Current counter-move ${l.currentCounterMove.pct.toFixed(1)}% over ${l.currentCounterMove.days}d vs the campaign's greatest ${l.greatestCounterMove.pct.toFixed(1)}% / ${l.greatestCounterMove.days}d` +
        (l.spaceOverbalanced || l.timeOverbalanced
          ? ` — over-balanced in ${[l.spaceOverbalanced && "space", l.timeOverbalanced && "time"].filter(Boolean).join(" and ")}${l.sections >= 3 ? " after the 3rd section" : ""}.`
          : "."),
    );
  }
  if (l.monthlyBreak) lines.push(`Broke the prior month's ${l.trend === "bullish" ? "low" : "high"}${l.monthlyBreakFirst ? ", the first such break of the campaign" : ""}.`);
  if (l.contracting) lines.push("Each of the last three reactions was smaller than the one before.");
  if (l.timeRatioInverted) lines.push(`More time against the trend (${l.counterDays}d) than with it (${l.trendDays}d).`);
  if (l.timeBalanceDates.length > 0) lines.push(`Time balances with the prior matching swing on ${l.timeBalanceDates[0]}.`);
  if (l.firstYearHigh) lines.push(`First-year high ${l.firstYearHigh.price.toFixed(2)} ${l.firstYearHigh.crossed ? "crossed" : "not crossed"}.`);
  return lines;
}
