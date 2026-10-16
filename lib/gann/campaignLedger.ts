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
 * - **Campaign age** (C-TIME-27). Campaigns last no more than 3 to 3½ years,
 *   with culminations in the 23rd-24th, 34th-35th, 41st-42nd, 49th-60th,
 *   67th-72nd and 84th-90th months (Master Course Ch. 2, PDF 51, the 1931
 *   Time Rules); the 1935 lesson refines it to the 23rd, 24th, 27th or 30th
 *   month, with extremes in the 34th-35th or 41st-42nd (Ch. 7, PDF 220).
 *   Months are counted with the start month as the first, as Gann counts
 *   them (Ch. 6, PDF 197: March 1901 to October 1911 is "the 128th month").
 * - **Prior-range projection** (C-PRICE-01). A prior range added to a later
 *   low marks a top: "136⅞ = 80 + (94⅞ − 38) exactly" (Master Course Ch. 6,
 *   PDF 197). Gann gives it by example only. A resistance candidate, never a
 *   target (he never fixes one, M-E8).
 * - **Over-balance by a point** (C-TREND-06). The space rule's decline
 *   exceeds the greatest previous reaction "by 1+ point" (Master Course
 *   Ch. 8, PDF 249). `spaceOverbalanced` keeps its earlier no-margin reading
 *   because the exit rules and the trend read use it; the margin is a
 *   separate, context-only flag until a replay measures the switch.
 *   *Commodities* p. 312 says a swing that exceeds the greatest "in price or
 *   time" changes the trend (C-TREND-03): the two flags are read with "or"
 *   everywhere they are used.
 *
 * Engineering choices, labelled as such:
 * - Size is measured in percent of price, not Gann's points, so the rule
 *   ports across price levels (the scaling precedent is Gann's own "normal
 *   move = 1/16 of price", *Commodities* 1951, p. 310).
 * - The campaign starts at the extreme the weekly chart's current trend
 *   began from, and sections and reactions are counted on the 3-Day Chart.
 * - The first-year high needs a campaign at least a year old, which the
 *   scan's year of daily bars rarely holds, so it is usually null.
 * - The campaign's age can't reach past the bars supplied, so the later
 *   culmination months and the ceiling show only on a long history.
 * - The prior range is the last completed leg with the trend, and the later
 *   low is the bottom that ended the counter-move after it (mirrored in a
 *   bear campaign, an engineering symmetry).
 * - The 1-point margin is one price-scaled point (`pointScale.ts#gannPoint`)
 *   at the counter-move's start, in percent of that price.
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
import { gannPoint } from "@/lib/gann/pointScale";

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

/** The campaign's month, counted with its start month as the first (Master Course Ch. 6, PDF 197). */
export function campaignMonthOrdinal(startIso: string, asOfIso: string): number {
  const y = Number(asOfIso.slice(0, 4)) - Number(startIso.slice(0, 4));
  const m = Number(asOfIso.slice(5, 7)) - Number(startIso.slice(5, 7));
  return y * 12 + m + 1;
}

/** Master Course Ch. 2, PDF 51 (1931 Time Rules): culminations by month of the campaign. */
export const CULMINATION_MONTHS_1931: readonly (readonly [number, number])[] = [
  [23, 24],
  [34, 35],
  [41, 42],
  [49, 60],
  [67, 72],
  [84, 90],
];
/** Master Course Ch. 7, PDF 220 (1935): culminations in the 23rd, 24th, 27th or 30th month; extremes in the 34th-35th or 41st-42nd. */
export const CULMINATION_MONTHS_1935: readonly number[] = [23, 24, 27, 30, 34, 35, 41, 42];
/** "Campaigns last ≤3–3½ years" (Master Course Ch. 2, PDF 51), in months. */
export const CAMPAIGN_CEILING_MONTHS: readonly [number, number] = [36, 42];

export interface CampaignAge {
  /** The campaign's month, the start month being the first. */
  month: number;
  culmination1931: boolean;
  culmination1935: boolean;
  /** Past 3 years: in the 37th month or later. */
  pastThreeYears: boolean;
  /** Past 3½ years: in the 43rd month or later. */
  pastThreeAndHalfYears: boolean;
}

export function readCampaignAge(month: number): CampaignAge {
  return {
    month,
    culmination1931: CULMINATION_MONTHS_1931.some(([a, b]) => month >= a && month <= b),
    culmination1935: CULMINATION_MONTHS_1935.includes(month),
    pastThreeYears: month > CAMPAIGN_CEILING_MONTHS[0],
    pastThreeAndHalfYears: month > CAMPAIGN_CEILING_MONTHS[1],
  };
}

export interface RangeProjection {
  /** "resistance" over a bull campaign's later low; "support" under a bear campaign's later high. */
  kind: "resistance" | "support";
  price: number;
  /** The later low (high in a bear campaign) the range is added to (taken from). */
  base: number;
  /** The prior leg's range in price. */
  priorRange: number;
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
  /** The counter-move exceeds the greatest by 1 point or more (C-TREND-06, Master Course Ch. 8 PDF 249). Context only. */
  spaceOverbalancedByPoint: boolean;
  /** The campaign's age in months and Gann's culmination months (C-TIME-27). Context only. */
  age: CampaignAge;
  /** A prior leg's range from the later low, as a resistance (support) candidate (C-PRICE-01). Context only. */
  rangeProjection: RangeProjection | null;
  /**
   * The counter-move in progress made its latest extreme in its third month
   * (after `SECOND_MONTH_END_DAYS`): a rising stock that keeps falling in the
   * third month has changed its trend (A-TIME-01, W006 p.38; the bear rally's
   * mirror, A-TIME-02). One that made its low in the second month and has held
   * since is resuming, and is not flagged.
   */
  counterMoveThirdMonth: boolean;
  /** The day of the current section's top (bottom in a bear campaign), which the reaction is counted from. */
  sectionTopDate: string;
  /** This month so far has broken the prior month's low (bullish campaign) or high (bearish). */
  monthlyBreak: boolean;
  /** It is the campaign's first: no earlier month in the campaign broke the one before it. */
  monthlyBreakFirst: boolean;
  /**
   * The latest reaction has gone under the top of the section before the last
   * one (over its bottom in a bear campaign). Gann's 1933 reaction broke
   * monthly lows and he still read the trend as up because it held above the
   * first section's top (W006 p.14, A-TREND-06); a monthly break with this
   * set ends the trend (PLAN.md item 6 step 3, item 6 review R2). False when
   * the campaign has no earlier section to measure against.
   */
  reactionBelowPriorSection: boolean;
  /**
   * A month since the current section's top broke the month before it. With
   * `reactionBelowPriorSection` it ends the trend until a new section top: a
   * later month that holds does not undo it (item 6 second review F4).
   */
  monthlyBreakInReaction: boolean;
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
  /**
   * The top of the secondary rally (A-LEVELS-02, W006 p.13: after the 1929
   * top, the rally to 297 in April 1930 "is always an important point to
   * watch"): the first weekly-chart top after a bear campaign's start, once
   * the chart has turned down from it. The bull campaign's mirror, the first
   * weekly bottom after the start, is the same rule turned over (Polarity; an
   * engineering symmetry, Gann gives the bear case). Context only. It carries
   * no "crossed" flag: crossing it crosses the campaign's last weekly top
   * too (each later one is lower), which turns the weekly chart and starts a
   * new campaign.
   */
  secondaryTurn: { kind: "top" | "bottom"; price: number; date: string } | null;
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

/**
 * The counter-move clock's months, in calendar days (Stock Selector Ch. IV;
 * `counterMovePhase` in disclosedRules.ts reads the same constant): a
 * counter-move's second month ends on day 60, and its third begins after it.
 */
export const SECOND_MONTH_END_DAYS = 60;

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
  // C-TREND-06: "by 1+ point" (Master Course Ch. 8, PDF 249), one point at the counter-move's start price.
  const pointPct = (gannPoint(lastPoint.price) / lastPoint.price) * 100;
  const spaceOverbalancedByPoint =
    currentCounterMove !== null && greatestCounterMove !== null && currentCounterMove.pct >= greatestCounterMove.pct + pointPct;

  // C-PRICE-01: the last completed leg with the trend, added to the extreme
  // that ended the counter-move after it (Master Course Ch. 6, PDF 197).
  let rangeProjection: RangeProjection | null = null;
  for (let k = points.length - 1; k >= 2; k--) {
    const [a, b, c] = [points[k - 2], points[k - 1], points[k]];
    if (c.kind !== (bull ? "bottom" : "top")) continue;
    const priorRange = Math.abs(b.price - a.price);
    rangeProjection = {
      kind: bull ? "resistance" : "support",
      price: bull ? c.price + priorRange : c.price - priorRange,
      base: c.price,
      priorRange,
    };
    break;
  }

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

  // The sections are the weekly chart's legs (item 6 second review F1): its
  // trend-side turning points are the section tops (bottoms in a bear
  // campaign), not every minor 3-Day swing, so a short bounce inside a
  // reaction or a dip inside a section does not move them. Once price has gone
  // past the last weekly top, a new section is running and its top is the
  // running extreme; until then the reaction is still the one from that top.
  // Only a record top (above every earlier one in the campaign; a record
  // bottom in a bear campaign) starts a section: a lower weekly top is a rally
  // inside the reaction, not a new section (item 7 review H1).
  const trendKind = bull ? "top" : "bottom";
  const weeklyTops: typeof weekly.pivots = [];
  for (const p of weekly.pivots) {
    if (p.index < start || p.kind !== trendKind) continue;
    const record = weeklyTops[weeklyTops.length - 1];
    if (!record || (bull ? p.price > record.price : p.price < record.price)) weeklyTops.push(p);
  }
  const beyond = (i: number, price: number) => (bull ? bars[i].h > price : bars[i].l < price);
  let sectionTop = start;
  let priorTop: number | null = null;
  const lastTop = weeklyTops[weeklyTops.length - 1];
  if (lastTop && !bars.slice(lastTop.index + 1).some((_, k) => beyond(lastTop.index + 1 + k, lastTop.price))) {
    sectionTop = lastTop.index;
    priorTop = weeklyTops.length >= 2 ? weeklyTops[weeklyTops.length - 2].price : null;
  } else {
    const from = lastTop ? lastTop.index : start;
    sectionTop = from;
    for (let i = from; i < bars.length; i++) if (beyond(i, bull ? bars[sectionTop].h : bars[sectionTop].l)) sectionTop = i;
    priorTop = lastTop ? lastTop.price : null;
  }
  // The reaction: everything since the section's top.
  let reactionExtreme = -1;
  for (let i = sectionTop + 1; i < bars.length; i++) {
    if (reactionExtreme < 0 || (bull ? bars[i].l < bars[reactionExtreme].l : bars[i].h > bars[reactionExtreme].h)) reactionExtreme = i;
  }
  const reactionBelowPriorSection =
    priorTop !== null && reactionExtreme >= 0 && (bull ? bars[reactionExtreme].l < priorTop : bars[reactionExtreme].h > priorTop);
  // A month since the section's top broke the month before it: the reaction's
  // part of each month (the top's own month from the day after the top) against
  // the whole month before.
  let monthlyBreakInReaction = false;
  for (const r of monthRanges(bars, sectionTop + 1)) {
    const k = months.findIndex((m) => m.month === r.month);
    if (k > 0 && breaks(months[k - 1], r)) monthlyBreakInReaction = true;
  }
  // The reaction still making new extremes in its third month (A-TIME-01/-02).
  const counterMoveThirdMonth = reactionExtreme >= 0 && days(bars[sectionTop], bars[reactionExtreme]) > SECOND_MONTH_END_DAYS;

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

  // The secondary rally: Gann defines it by example only, so "the first weekly
  // counter-swing after the campaign's start" is the engineering reading.
  const counterKind = bull ? "bottom" : "top";
  const secondary = weekly.pivots.find((p) => p.index > start && p.kind === counterKind);
  const secondaryTurn: CampaignLedger["secondaryTurn"] = secondary
    ? {
        kind: counterKind,
        price: secondary.price,
        date: bars[secondary.index].t.slice(0, 10),
      }
    : null;

  return {
    trend: weekly.trend,
    campaignStartDate: bars[start].t.slice(0, 10),
    sections,
    legs,
    greatestCounterMove,
    currentCounterMove,
    spaceOverbalanced,
    timeOverbalanced,
    spaceOverbalancedByPoint,
    age: readCampaignAge(campaignMonthOrdinal(bars[start].t.slice(0, 10), last.t.slice(0, 10))),
    rangeProjection,
    counterMoveThirdMonth,
    sectionTopDate: bars[sectionTop].t.slice(0, 10),
    monthlyBreak,
    monthlyBreakFirst,
    reactionBelowPriorSection,
    monthlyBreakInReaction,
    contracting,
    trendDays,
    counterDays,
    timeRatioInverted: counterDays > trendDays,
    timeBalanceDates,
    firstYearHigh,
    secondaryTurn,
  };
}

export interface MonthlyBreakWarning {
  trend: "bullish" | "bearish";
  monthlyBreak: boolean;
  first: boolean;
}

/**
 * The monthly break as a warning against new trades with the campaign's trend
 * (PLAN.md item 6, step 3). On its own it does not end the trend: Gann's 1933
 * reaction broke monthly lows and he still read the trend as up, because the
 * low held above the first section's top (W006 p.14). When the reaction has
 * gone under that top as well, `readGannTrend` ends the trend instead.
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
  const age = l.age;
  if (age.culmination1931 || age.culmination1935 || age.pastThreeYears) {
    const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
    const notes = [
      (age.culmination1931 || age.culmination1935) && "a month in which campaigns often culminate",
      age.pastThreeAndHalfYears ? "past the 3½ years campaigns seldom outlast" : age.pastThreeYears && "past 3 years, near the 3-3½ years campaigns seldom outlast",
    ].filter(Boolean);
    lines.push(`The campaign is in its ${ord(age.month)} month: ${notes.join("; ")}.`);
  }
  if (l.rangeProjection) {
    const p = l.rangeProjection;
    lines.push(
      `The prior range (${p.priorRange.toFixed(2)}) ${p.kind === "resistance" ? "added to the later low" : "taken from the later high"} (${p.base.toFixed(2)}) gives ${p.price.toFixed(2)}, a ${p.kind} level to watch, not a target.`,
    );
  }
  if (l.counterMoveThirdMonth) lines.push(`Still making new ${l.trend === "bullish" ? "lows" : "highs"} in the counter-move's third month: the trend is changing.`);
  if (l.monthlyBreak) lines.push(`Broke the prior month's ${l.trend === "bullish" ? "low" : "high"}${l.monthlyBreakFirst ? ", the first such break of the campaign" : ""}.`);
  if (l.contracting) lines.push("Each of the last three reactions was smaller than the one before.");
  if (l.timeRatioInverted) lines.push(`More time against the trend (${l.counterDays}d) than with it (${l.trendDays}d).`);
  if (l.timeBalanceDates.length > 0) lines.push(`Time balances with the prior matching swing on ${l.timeBalanceDates[0]}.`);
  if (l.secondaryTurn) {
    const t = l.secondaryTurn;
    const name = t.kind === "top" ? "secondary rally top" : "secondary reaction bottom";
    lines.push(`The campaign's ${name}, ${t.price.toFixed(2)} (${t.date}), is a point to watch.`);
  }
  if (l.firstYearHigh) lines.push(`First-year high ${l.firstYearHigh.price.toFixed(2)} ${l.firstYearHigh.crossed ? "crossed" : "not crossed"}.`);
  return lines;
}
