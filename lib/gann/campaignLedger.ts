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
 *   *Wall Street Stock Selector* Ch. IV and VII).
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
  /** The current bar broke the prior month's low (bullish campaign) or high (bearish). */
  monthlyBreak: boolean;
  /** Dates when the current move will have lasted as long as the matching prior leg. */
  timeBalanceDates: string[];
  firstYearHigh: { price: number; crossed: boolean } | null;
}

function monthlyExtremeBefore(bars: Bar[], kind: "low" | "high"): number | null {
  const lastMonth = bars[bars.length - 1].t.slice(0, 7);
  let priorMonth: string | null = null;
  let extreme: number | null = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    const m = bars[i].t.slice(0, 7);
    if (m === lastMonth) continue;
    if (priorMonth === null) priorMonth = m;
    if (m !== priorMonth) break;
    extreme = extreme === null ? (kind === "low" ? bars[i].l : bars[i].h) : kind === "low" ? Math.min(extreme, bars[i].l) : Math.max(extreme, bars[i].h);
  }
  return extreme;
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

  const priorMonthExtreme = monthlyExtremeBefore(bars, bull ? "low" : "high");
  const monthlyBreak = priorMonthExtreme !== null && (bull ? last.l < priorMonthExtreme : last.h > priorMonthExtreme);

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
    timeBalanceDates,
    firstYearHigh,
  };
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
  if (l.monthlyBreak) lines.push(`Broke the prior month's ${l.trend === "bullish" ? "low" : "high"}.`);
  if (l.timeBalanceDates.length > 0) lines.push(`Time balances with the prior matching swing on ${l.timeBalanceDates[0]}.`);
  if (l.firstYearHigh) lines.push(`First-year high ${l.firstYearHigh.price.toFixed(2)} ${l.firstYearHigh.crossed ? "crossed" : "not crossed"}.`);
  return lines;
}
