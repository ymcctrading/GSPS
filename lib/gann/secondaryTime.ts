/**
 * Secondary time counts (PLAN.md item 7, step 2): the class C time rules, as
 * context only. Class C means a secondary or interpretive source, not Gann's
 * own book or course (`gann_features.json`). These readings never gate a
 * verdict, never enter a scored criterion, and never join the class A lists
 * they sit beside (`WHEEL_COUNTS`, `DAY_COUNT_BANDS`, `MAJOR_CYCLE_YEARS`,
 * `SQUARE_OF_52_FRACTIONS`, `SEASONAL_POINTS`), so a class A count keeps its
 * own measured record. Each one is recorded on every replayed trade as a
 * context factor (`contextFactors.ts`) and shown on the card, live and in the
 * replay alike (both read it through `readDisclosedRules`).
 *
 * - C-TIME-19 (W003 p.19; W034 p.4): 23 days (1/16 of the year), 49 days (7²,
 *   "very important"), and a 42-day move changing at 45-46 days.
 * - C-TIME-21 (W003 p.20): 17- and 35-week counts. The 39-week count is the
 *   disclosed ¾ of the Square of 52 already.
 * - C-TIME-44 (W035 p.1): the circle's finer divisions, as days, that the ten
 *   class A wheel counts leave out (112½, 150, 157½, 165, 202½, 247½, 292½,
 *   337½).
 * - C-TIME-09 (W003 p.18): 6, 12 and 144 months from a pivot.
 * - C-TIME-12 (W003 p.18; W034 p.3): eighths and thirds of the long cycles
 *   (a 30-year cycle gives 3.75, 7.5 and 10 years).
 * - C-TIME-37 / -38 (W023; W035 p.3; W050 images 5 and 7): the seasonal
 *   circle in 22.5° and 15° steps from March 21, on the days the class A
 *   eighths and thirds leave out.
 *
 * Engineering choices, labelled as such: the anchors and windows follow the
 * class A reader each list sits beside (major daily pivots, exact day for the
 * day counts and ±2 days for the circle and week counts; major monthly pivots
 * at exact months for the month counts and cycle fractions; ±1 day for the
 * fine seasonal steps, since they fall 7-8 days apart). A degree of the
 * seasonal circle is 365.2422 / 360 days, and a step falls on the day it is
 * reached (rounded down), which puts 15° on April 5 and 22.5° on April 12 as
 * the sources do.
 *
 * Three-question basis:
 * 1. Gann: none of these is in Gann's own text as we hold it; they are the
 *    compilers' readings of it (class C), which is why they stay context.
 * 2. Cycles: each is a recurrence claim, and none has cleared Dewey's
 *    checklist. Repetition count, dominance and regularity are untested. The
 *    replay's factor table is the base-rate test they would have to pass,
 *    after which promotion is an owner decision.
 * 3. Hermetic: Correspondence. The same divisions of the circle are read in
 *    days, weeks, months, years and the seasons; that is the claim being
 *    recorded, not one being relied on.
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { MAJOR_CYCLE_YEARS } from "@/lib/gann/timeCycles";

const DAY_MS = 86_400_000;

/** C-TIME-19: inclusive day ranges from a major pivot. */
export const SECONDARY_DAY_COUNTS: readonly [number, number][] = [
  [23, 23],
  [45, 46],
  [49, 49],
];

/** C-TIME-21: week counts from a major pivot (39 is already the Square of 52's ¾). */
export const SECONDARY_WEEK_COUNTS: readonly number[] = [17, 35];

/** C-TIME-44: circle divisions, as days, that `WHEEL_COUNTS` does not carry. */
export const CIRCLE_FINE_DIVISIONS: readonly number[] = [112.5, 150, 157.5, 165, 202.5, 247.5, 292.5, 337.5];

/** C-TIME-09: month counts from a major monthly pivot. */
export const SECONDARY_MONTH_COUNTS: readonly number[] = [6, 12, 144];

/** C-TIME-12: the fractions any cycle is divided into. */
export const CYCLE_FRACTIONS: readonly { label: string; fraction: number }[] = [
  { label: "1/8", fraction: 1 / 8 },
  { label: "1/4", fraction: 1 / 4 },
  { label: "1/3", fraction: 1 / 3 },
  { label: "3/8", fraction: 3 / 8 },
  { label: "1/2", fraction: 1 / 2 },
  { label: "5/8", fraction: 5 / 8 },
  { label: "2/3", fraction: 2 / 3 },
  { label: "3/4", fraction: 3 / 4 },
  { label: "7/8", fraction: 7 / 8 },
];

/** The long cycles C-TIME-12 divides: the 5- to 60-year cycles (the 1-3-year ones are the year fractions already). */
export const DIVIDED_CYCLE_YEARS: readonly number[] = MAJOR_CYCLE_YEARS.filter((y) => y >= 5);

/** C-TIME-12: the fractions of a cycle of `years`, in years. */
export function cycleFractions(years: number): { label: string; years: number }[] {
  return CYCLE_FRACTIONS.map((f) => ({ label: f.label, years: years * f.fraction }));
}

const DAYS_PER_DEGREE = 365.2422 / 360;

/**
 * C-TIME-37/-38: the 22.5° and 15° steps of the seasonal circle from March 21
 * that are not already a class A seasonal point (the eighths and thirds).
 */
export const SEASONAL_FINE_DEGREES: readonly number[] = (() => {
  const classA = new Set([0, 45, 90, 120, 135, 180, 225, 240, 270, 315]);
  const out = new Set<number>();
  for (let d = 0; d < 360; d += 22.5) if (!classA.has(d)) out.add(d);
  for (let d = 0; d < 360; d += 15) if (!classA.has(d)) out.add(d);
  return [...out].sort((a, b) => a - b);
})();

export const SEASONAL_FINE_TOLERANCE_DAYS = 1;

export interface PivotCountHit {
  pivotDate: string;
  pivotKind: "high" | "low";
  /** The count hit, in the reading's own unit (days, weeks, months or years). */
  count: number;
  label: string;
}

export interface SecondaryTimeReading {
  dayCounts: PivotCountHit[];
  weekCounts: PivotCountHit[];
  circleDivisions: PivotCountHit[];
  /** Null when no monthly bars were given. */
  monthCounts: PivotCountHit[] | null;
  /** Null when no monthly bars were given. */
  cycleFractions: PivotCountHit[] | null;
  /** The fine seasonal step today sits on, in degrees from March 21, or null. */
  seasonalFineStep: { degrees: number; date: string; offsetDays: number } | null;
}

function utcDay(t: string | Date): number {
  const ms = typeof t === "string" ? Date.parse(t) : t.getTime();
  return Math.floor(ms / DAY_MS);
}

function hit(p: { bar: Bar; kind: "high" | "low" }, count: number, label: string): PivotCountHit {
  return { pivotDate: p.bar.t.slice(0, 10), pivotKind: p.kind, count, label };
}

/** Day counts (C-TIME-19), on `readDayCountBands`'s anchors: exact days, most recent pivot first. */
export function readSecondaryDayCounts(bars: Bar[]): PivotCountHit[] {
  if (bars.length === 0) return [];
  const today = utcDay(bars[bars.length - 1].t);
  const out: PivotCountHit[] = [];
  for (const p of majorPivots(findPivots(bars, 5)).slice(-8).reverse()) {
    const days = today - utcDay(p.bar.t);
    const band = SECONDARY_DAY_COUNTS.find(([lo, hi]) => days >= lo && days <= hi);
    if (band) out.push(hit(p, days, band[0] === band[1] ? `${band[0]} days` : `${band[0]}-${band[1]} days`));
  }
  return out;
}

/** Counts projected forward from `timeCycles`' anchors, active within ±`windowDays`. */
function projectedHits(bars: Bar[], asOf: Date, countsInDays: readonly number[], unitDays: number, unit: string, windowDays = 2): PivotCountHit[] {
  if (bars.length < 30) return [];
  const out: PivotCountHit[] = [];
  for (const p of majorPivots(findPivots(bars, 5)).slice(-12)) {
    for (const c of countsInDays) {
      const at = Date.parse(p.bar.t) + c * unitDays * DAY_MS;
      if (Math.abs(at - asOf.getTime()) <= windowDays * DAY_MS) out.push(hit(p, c, `${c} ${unit}`));
    }
  }
  return out;
}

/** Week counts (C-TIME-21), on the Square of 52's anchors and window. */
export function readSecondaryWeekCounts(bars: Bar[], asOf: Date): PivotCountHit[] {
  return projectedHits(bars, asOf, SECONDARY_WEEK_COUNTS, 7, "weeks");
}

/** Circle divisions as days (C-TIME-44), on `timeCycles`' anchors and window. */
export function readCircleDivisions(bars: Bar[], asOf: Date): PivotCountHit[] {
  return projectedHits(bars, asOf, CIRCLE_FINE_DIVISIONS, 1, "days");
}

const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Major monthly pivots exactly `months` back, on `yearCycleConvergence`'s anchors. */
function monthlyHits(monthly: Bar[], asOf: Date, counts: { months: number; count: number; label: string }[]): PivotCountHit[] {
  if (monthly.length < 24) return [];
  const now = monthIndex(asOf);
  const out: PivotCountHit[] = [];
  for (const p of majorPivots(findPivots(monthly, 3))) {
    const age = now - monthIndex(new Date(p.bar.t));
    for (const c of counts) if (age === c.months) out.push(hit(p, c.count, c.label));
  }
  return out;
}

/** Month counts (C-TIME-09). */
export function readSecondaryMonthCounts(monthly: Bar[], asOf: Date): PivotCountHit[] {
  return monthlyHits(
    monthly,
    asOf,
    SECONDARY_MONTH_COUNTS.map((m) => ({ months: m, count: m, label: `${m} months` })),
  );
}

/** Fractions of the long cycles (C-TIME-12), to the month. */
export function readCycleFractions(monthly: Bar[], asOf: Date): PivotCountHit[] {
  const counts = DIVIDED_CYCLE_YEARS.flatMap((y) =>
    cycleFractions(y).map((f) => ({ months: Math.round(f.years * 12), count: f.years, label: `${f.label} of the ${y}-year cycle` })),
  );
  return monthlyHits(monthly, asOf, counts);
}

/** The fine seasonal step (C-TIME-37/-38) today sits on, if any. */
export function readSeasonalFineStep(asOf: Date): SecondaryTimeReading["seasonalFineStep"] {
  const today = utcDay(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())));
  let best: SecondaryTimeReading["seasonalFineStep"] = null;
  for (const y of [asOf.getUTCFullYear() - 1, asOf.getUTCFullYear()]) {
    const start = utcDay(new Date(Date.UTC(y, 2, 21)));
    for (const deg of SEASONAL_FINE_DEGREES) {
      const day = start + Math.floor(deg * DAYS_PER_DEGREE);
      const offsetDays = today - day;
      if (Math.abs(offsetDays) > SEASONAL_FINE_TOLERANCE_DAYS) continue;
      if (!best || Math.abs(offsetDays) < Math.abs(best.offsetDays)) {
        best = { degrees: deg, date: new Date(day * DAY_MS).toISOString().slice(0, 10), offsetDays };
      }
    }
  }
  return best;
}

export function readSecondaryTime(daily: Bar[], monthly: Bar[] | null | undefined, asOf: Date): SecondaryTimeReading {
  return {
    dayCounts: readSecondaryDayCounts(daily),
    weekCounts: readSecondaryWeekCounts(daily, asOf),
    circleDivisions: readCircleDivisions(daily, asOf),
    monthCounts: monthly ? readSecondaryMonthCounts(monthly, asOf) : null,
    cycleFractions: monthly ? readCycleFractions(monthly, asOf) : null,
    seasonalFineStep: readSeasonalFineStep(asOf),
  };
}

/** Plain-language lines for the card. */
export function describeSecondaryTime(r: SecondaryTimeReading): string[] {
  const lines: string[] = [];
  const first = (hs: PivotCountHit[] | null, what: string) => {
    const h = hs?.[0];
    if (h) lines.push(`${h.label} from the ${h.pivotKind} of ${h.pivotDate}: ${what}. Shown for context; it does not change the setup.`);
  };
  first(r.dayCounts, "a secondary day count");
  first(r.weekCounts, "a secondary week count");
  first(r.circleDivisions, "a finer division of the circle");
  first(r.monthCounts, "a secondary month count");
  first(r.cycleFractions, "a fraction of a long cycle");
  if (r.seasonalFineStep) {
    lines.push(`${r.seasonalFineStep.degrees}° of the seasonal circle from March 21 (${r.seasonalFineStep.date}): a finer seasonal step. Shown for context; it does not change the setup.`);
  }
  return lines;
}
