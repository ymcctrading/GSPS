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
 *   class A wheel counts leave out (112½, 157½, 165, 202½, 247½, 292½,
 *   337½). 150 days moved to the class A Ch.5 wheel counts on 2026-10-16
 *   (`timeCounts.ts`, Master Course Ch.5 PDF 162; C-TIME-06).
 * - C-TIME-09 (W003 p.18): 6, 12 and 144 months from a pivot.
 * - C-TIME-12 (W003 p.18; W034 p.3): eighths and thirds of the long cycles
 *   (a 30-year cycle gives 3.75, 7.5 and 10 years).
 * - C-TIME-37 / -38 (W023; W035 p.3; W050 images 5 and 7): the seasonal
 *   circle in 22.5° and 15° steps from March 21, on the days the class A
 *   eighths, thirds and sixteenths leave out (only the 15° steps since the
 *   sixteenths became class A on main, 2026-10-16).
 * - C-TIME-25 (W003 p.22; W034 p.5): a counter-trend move normally lasts 3-5
 *   trading days on a stock; one past its 4th day signals consolidation or a
 *   reversal, and the next counter-move runs 7-10 days.
 * - C-TIME-42 (W032 pp.1-5), time balance from top to top and bottom to
 *   bottom, **moved to class A on 2026-10-16** (M-T11): it is Gann's own rule
 *   in *How to Make Profits Trading in Commodities* p.311 ("always figure the
 *   time from any top ... to the next top, and from any low ... to the next
 *   low. This is BALANCING OF TIME"). It is read in `timeCounts.ts` now and
 *   re-exported here; W032's false-break confirmation (C-STOP-03,
 *   `falseBreakAt`) stays class C.
 * - C-TIME-40 (W033 pp.1-3): the fan as a time calculator, every ratio from
 *   1x8 (12.5%) to 8x1 (800%) of the anchor swing's own duration, from the
 *   fans' own anchors. `ANGLES` (which feeds a quarantined score) is not
 *   touched; this is its own list.
 * - C-TIME-39 (W031 pp.2-3): a retracement level reached at the time its
 *   paired angle gives, from the fans' anchor, makes a turn likelier. W031's
 *   pairs: 1/8-1x8, 1/4-1x4, 1/3-1x3, 3/8-1x2, 1/2-1x1, 5/8-2x1, 2/3-3x1,
 *   3/4-4x1, 7/8-8x1. The anchor swing's price range and its duration are
 *   the two sides of the square (the fans' own time convention). An angle's
 *   time multiple is W033's (`FAN_TIME_RATIOS`: a 1xN angle crosses the
 *   range in 1/N of the time, an Nx1 in N times it), so it reaches the
 *   fraction f of the range at f times its multiple of the swing's duration:
 *   50% on the 1x1 comes due at half the time, 3/8 on the 1x2 at 3/16 and
 *   2/3 on the 3x1 at twice it. (Corrected 2026-10-16: the first build
 *   divided by the multiple, reading the angle labels the other way round.)
 * - C-TIME-23 (W003 pp.20-21): that same 50%-at-half-the-time meeting, after
 *   which a three-month fast move may follow; it is recorded for 90 days,
 *   read from every swing of that time, not only the fans' current anchors.
 *
 * Engineering choices for those two, labelled as such and fixed before any
 * measurement: a level counts as reached when a bar's range spans it, and the
 * time window is ±1/16 of the swing's duration (at least a day). W031 never
 * states the chart's price scale, so the swing's own range and duration
 * stand in for the square; that is our reading, not the source's.
 *
 * Engineering choices, labelled as such: the anchors and windows follow the
 * class A reader each list sits beside (major daily pivots, the exact day for
 * the day counts, read on the first session on or after it, and ±2 days for
 * the circle and week counts; major monthly pivots at exact months for the
 * month counts and cycle fractions; ±1 day for the
 * fine seasonal steps, since they fall 7-8 days apart). A fine step is placed
 * between the two class A seasonal points around it, in proportion, on the
 * day it is reached (rounded down): 15° on April 5 and 22.5° on April 12 as
 * the sources have them, and 195° on October 7.
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
import { fanAnchors } from "@/lib/gann/fans";
import type { CounterMoveReading } from "@/lib/gann/disclosedRules";

// The time balance moved to the class A counts (2026-10-16); kept importable from here.
export { TIME_BALANCE_TOLERANCE_WEEKS, falseBreakAt, readTimeBalanceSpans } from "@/lib/gann/timeCounts";

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
export const CIRCLE_FINE_DIVISIONS: readonly number[] = [112.5, 157.5, 165, 202.5, 247.5, 292.5, 337.5];

/** C-TIME-09: month counts from a major monthly pivot. */
export const SECONDARY_MONTH_COUNTS: readonly number[] = [6, 12, 144];

/**
 * Years of monthly history the long counts read (C-TIME-09's 144 months and
 * C-TIME-12's longest fractions): 144 months, the three months that confirm a
 * monthly pivot, and a year's margin. The live scan fetches this much and
 * hands it only to these context readings (every other monthly reading keeps
 * its ten years); the replay caps each session at the same span. An
 * engineering choice, sized to reach the count.
 */
export const LONG_MONTHLY_YEARS = 13;

/** The monthly bars within `LONG_MONTHLY_YEARS` before `asOf`, as the live scan holds them. */
export function longMonthlyWindow(monthly: Bar[], asOf: Date): Bar[] {
  const from = new Date(Date.UTC(asOf.getUTCFullYear() - LONG_MONTHLY_YEARS, asOf.getUTCMonth(), 1)).toISOString().slice(0, 7);
  return monthly.filter((b) => b.t.slice(0, 7) >= from);
}

/**
 * Years of monthly history the yearly counts read (A-TIME-11's 20 years, and
 * the 30, 50 and 60 of `MAJOR_CYCLE_YEARS`): the 60-year count plus a year for
 * the months that confirm a pivot. Fetched in the same monthly request as
 * `LONG_MONTHLY_YEARS` (the vendor returns what it holds), and handed only to
 * the time-window hold (`readWindowTurn`). An engineering choice, sized to
 * reach the count.
 */
export const YEAR_COUNT_MONTHLY_YEARS = 61;

/** The monthly bars within `YEAR_COUNT_MONTHLY_YEARS` before `asOf`. */
export function yearCountMonthlyWindow(monthly: Bar[], asOf: Date): Bar[] {
  const from = new Date(Date.UTC(asOf.getUTCFullYear() - YEAR_COUNT_MONTHLY_YEARS, asOf.getUTCMonth(), 1)).toISOString().slice(0, 7);
  return monthly.filter((b) => b.t.slice(0, 7) >= from);
}

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

/**
 * The long cycles C-TIME-12 divides: the 5- to 60-year cycles. The 1-year
 * cycle's fractions are the year fractions already; the 2- and 3-year cycles
 * are left undivided here, as the entry's gap is the long cycles.
 */
export const DIVIDED_CYCLE_YEARS: readonly number[] = MAJOR_CYCLE_YEARS.filter((y) => y >= 5);

/** C-TIME-12: the fractions of a cycle of `years`, in years. */
export function cycleFractions(years: number): { label: string; years: number }[] {
  return CYCLE_FRACTIONS.map((f) => ({ label: f.label, years: years * f.fraction }));
}

/**
 * The class A seasonal points as degrees from March 21 and their calendar
 * dates (`SEASONAL_POINTS`), the frame the fine steps are placed in: a fine
 * step falls between the two class A points around it, in proportion. A
 * uniform 365.2422/360 days a degree drifts up to three days from the
 * sources' own dates after the September equinox (item 7 second review L-a).
 */
export const SEASONAL_FRAME: readonly { degrees: number; month: number; day: number }[] = [
  { degrees: 0, month: 3, day: 21 },
  { degrees: 22.5, month: 4, day: 12 },
  { degrees: 45, month: 5, day: 5 },
  { degrees: 67.5, month: 5, day: 27 },
  { degrees: 90, month: 6, day: 21 },
  { degrees: 112.5, month: 7, day: 14 },
  { degrees: 120, month: 7, day: 23 },
  { degrees: 135, month: 8, day: 5 },
  { degrees: 157.5, month: 8, day: 31 },
  { degrees: 180, month: 9, day: 22 },
  { degrees: 202.5, month: 10, day: 15 },
  { degrees: 225, month: 11, day: 8 },
  { degrees: 240, month: 11, day: 22 },
  { degrees: 247.5, month: 11, day: 30 },
  { degrees: 270, month: 12, day: 21 },
  { degrees: 292.5, month: 1, day: 13 },
  { degrees: 315, month: 2, day: 4 },
  { degrees: 337.5, month: 2, day: 28 },
  { degrees: 360, month: 3, day: 21 },
];

/** The day (UTC day number) `deg` degrees after March 21 of `year` falls on. */
function seasonalDay(year: number, deg: number): number {
  // Points before March 21 in the calendar belong to the next year.
  const at = (p: (typeof SEASONAL_FRAME)[number]) => utcDay(new Date(Date.UTC(p.month < 3 || (p.month === 3 && p.degrees === 360) ? year + 1 : year, p.month - 1, p.day)));
  for (let i = 0; i < SEASONAL_FRAME.length - 1; i++) {
    const a = SEASONAL_FRAME[i];
    const b = SEASONAL_FRAME[i + 1];
    if (deg >= a.degrees && deg <= b.degrees) {
      return at(a) + Math.floor(((deg - a.degrees) / (b.degrees - a.degrees)) * (at(b) - at(a)));
    }
  }
  throw new Error(`degrees out of range: ${deg}`);
}

/**
 * C-TIME-37/-38: the 22.5° and 15° steps of the seasonal circle from March 21
 * that are not already a class A seasonal point (the eighths, thirds and,
 * since the Square of Nine plate's dated sixteenths joined `SEASONAL_POINTS`,
 * every 22.5° step; so only the 15° steps remain here).
 */
export const SEASONAL_FINE_DEGREES: readonly number[] = (() => {
  const classA = new Set([0, 22.5, 45, 67.5, 90, 112.5, 120, 135, 157.5, 180, 202.5, 225, 240, 247.5, 270, 292.5, 315, 337.5]);
  const out = new Set<number>();
  for (let d = 0; d < 360; d += 22.5) if (!classA.has(d)) out.add(d);
  for (let d = 0; d < 360; d += 15) if (!classA.has(d)) out.add(d);
  return [...out].sort((a, b) => a - b);
})();

export const SEASONAL_FINE_TOLERANCE_DAYS = 1;

/** C-TIME-25: where a counter-move's length in trading days sits. */
export type ShortCounterMovePhase =
  /** Up to the 4th day: a normal counter-move. */
  | "normal"
  /** Days 5-6: past the 4th day, consolidation or a reversal. */
  | "pastFourthDay"
  /** Days 7-10: the length of the next counter-move. */
  | "sevenToTen"
  /** Past the 10th day. */
  | "longer";

export function shortCounterMovePhase(tradingDays: number): ShortCounterMovePhase {
  if (tradingDays <= 4) return "normal";
  if (tradingDays <= 6) return "pastFourthDay";
  if (tradingDays <= 10) return "sevenToTen";
  return "longer";
}

/** C-TIME-40: the fan's time ratios, as a fraction of the anchor swing's duration. */
export const FAN_TIME_RATIOS: readonly { label: string; ratio: number }[] = [
  { label: "1x8", ratio: 1 / 8 },
  { label: "1x4", ratio: 1 / 4 },
  { label: "1x3", ratio: 1 / 3 },
  { label: "1x2", ratio: 1 / 2 },
  { label: "1x1", ratio: 1 },
  { label: "2x1", ratio: 2 },
  { label: "3x1", ratio: 3 },
  { label: "4x1", ratio: 4 },
  { label: "8x1", ratio: 8 },
];

/**
 * C-TIME-39: W031's pairs of a retracement fraction and its angle. Under the
 * angle multiples, 1/8 on the 1x8 and 1/4 on the 1x4 fall due within a few
 * days of the anchor, and a pivot confirms four bars late, so those two show
 * only on swings longer than about 50-60 days (item 7e review L4).
 */
export const RETRACEMENT_ANGLE_PAIRS: readonly { fraction: number; label: string; angle: string; ratio: number }[] = [
  { fraction: 1 / 8, label: "1/8", angle: "1x8", ratio: 1 / 8 },
  { fraction: 1 / 4, label: "1/4", angle: "1x4", ratio: 1 / 4 },
  { fraction: 1 / 3, label: "1/3", angle: "1x3", ratio: 1 / 3 },
  { fraction: 3 / 8, label: "3/8", angle: "1x2", ratio: 1 / 2 },
  { fraction: 1 / 2, label: "1/2", angle: "1x1", ratio: 1 },
  { fraction: 5 / 8, label: "5/8", angle: "2x1", ratio: 2 },
  { fraction: 2 / 3, label: "2/3", angle: "3x1", ratio: 3 },
  { fraction: 3 / 4, label: "3/4", angle: "4x1", ratio: 4 },
  { fraction: 7 / 8, label: "7/8", angle: "8x1", ratio: 8 },
];

/** C-TIME-23: how long the half-price-at-half-time meeting is recorded for (the three months it sets up). */
export const HALF_PRICE_HALF_TIME_DAYS = 90;

export interface RetracementTimingHit {
  /** The retracement fraction and its paired angle. */
  label: string;
  angle: string;
  anchorKind: "high" | "low";
  level: number;
  /** The day price reached the level inside the angle's time window. */
  date: string;
}

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
  /** The open counter-move's length against the weekly trend, or null when not in one. */
  shortCounterMove?: { trend: "bullish" | "bearish"; tradingDays: number; phase: ShortCounterMovePhase } | null;
  /** Fan time ratios due within two days of today. */
  fanTimeRatios?: { label: string; anchorKind: "high" | "low"; date: string }[];
  /** Retracement levels reached at their angle's time, with the window still open today (C-TIME-39). */
  retracementTiming?: RetracementTimingHit[];
  /** 50% of the range reached at half the time within the last 90 days (C-TIME-23), or null. */
  halfPriceHalfTime?: RetracementTimingHit | null;
}

function utcDay(t: string | Date): number {
  const ms = typeof t === "string" ? Date.parse(t) : t.getTime();
  return Math.floor(ms / DAY_MS);
}

function hit(p: { bar: Bar; kind: "high" | "low" }, count: number, label: string): PivotCountHit {
  return { pivotDate: p.bar.t.slice(0, 10), pivotKind: p.kind, count, label };
}

/**
 * Day counts (C-TIME-19), on `readDayCountBands`'s anchors, most recent pivot
 * first. A count is read on the first session on or after its calendar day,
 * so one that falls on a weekend or holiday is read on the next session
 * rather than missed, and only once. The hit carries the count reached.
 */
export function readSecondaryDayCounts(bars: Bar[]): PivotCountHit[] {
  if (bars.length === 0) return [];
  const today = utcDay(bars[bars.length - 1].t);
  const prevDay = bars.length > 1 ? utcDay(bars[bars.length - 2].t) : today - 1;
  const out: PivotCountHit[] = [];
  for (const p of majorPivots(findPivots(bars, 5)).slice(-8).reverse()) {
    const days = today - utcDay(p.bar.t);
    const before = prevDay - utcDay(p.bar.t);
    // The counts in (before, days]: reached since the previous session.
    for (const [lo, hi] of SECONDARY_DAY_COUNTS) {
      const first = Math.max(lo, before + 1);
      if (first <= hi && first <= days) out.push(hit(p, first, lo === hi ? `${lo} days` : `${lo}-${hi} days`));
    }
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
    for (const deg of SEASONAL_FINE_DEGREES) {
      const day = seasonalDay(y, deg);
      const offsetDays = today - day;
      if (Math.abs(offsetDays) > SEASONAL_FINE_TOLERANCE_DAYS) continue;
      if (!best || Math.abs(offsetDays) < Math.abs(best.offsetDays)) {
        best = { degrees: deg, date: new Date(day * DAY_MS).toISOString().slice(0, 10), offsetDays };
      }
    }
  }
  return best;
}

/** Fan time ratios (C-TIME-40) due within ±`windowDays` of `asOf`. */
export function readFanTimeRatios(bars: Bar[], asOf: Date, windowDays = 2): NonNullable<SecondaryTimeReading["fanTimeRatios"]> {
  if (bars.length < 20) return [];
  const out: NonNullable<SecondaryTimeReading["fanTimeRatios"]> = [];
  for (const { anchor, baseIntervalMs } of fanAnchors(bars)) {
    if (baseIntervalMs === null || baseIntervalMs <= 0) continue;
    for (const { label, ratio } of FAN_TIME_RATIOS) {
      const at = Date.parse(anchor.bar.t) + ratio * baseIntervalMs;
      if (Math.abs(at - asOf.getTime()) <= windowDays * DAY_MS) {
        out.push({ label, anchorKind: anchor.kind, date: new Date(at).toISOString().slice(0, 10) });
      }
    }
  }
  return out;
}

function retracementTiming(daily: Bar[]): Pick<SecondaryTimeReading, "retracementTiming" | "halfPriceHalfTime"> {
  const hits = readRetracementTimingHits(daily);
  const last = daily.length > 0 ? Date.parse(daily[daily.length - 1].t) : 0;
  const strip = (h: RetracementTimingHit & { windowEnd: number }): RetracementTimingHit => ({
    label: h.label,
    angle: h.angle,
    anchorKind: h.anchorKind,
    level: h.level,
    date: h.date,
  });
  // The meeting is kept for 90 days, as each session read it (item 7e review
  // M2): counting every strength-4 swing as "the range" put a meeting on 98%
  // of random-walk sessions; read this way it is on 79% (the saturation test
  // in secondaryTime.test.ts), so it is weak context, and labelled so.
  const half = halfMeetingsAsRead(daily)
    .filter((h) => last - Date.parse(`${h.date}T00:00:00Z`) <= HALF_PRICE_HALF_TIME_DAYS * DAY_MS)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    // Still inside the angle's time window on the last bar: the turn it argues for is now.
    retracementTiming: hits.filter((h) => h.windowEnd >= last).map(strip),
    halfPriceHalfTime: half ? strip(half) : null,
  };
}

/** Every retracement level reached inside its paired angle's time window, from the fans' anchors. */
export function readRetracementTimingHits(bars: Bar[]): (RetracementTimingHit & { windowEnd: number })[] {
  if (bars.length < 20) return [];
  return retracementHitsFrom(bars, fanAnchors(bars), RETRACEMENT_ANGLE_PAIRS);
}

/**
 * The 1/2-at-half-time meetings as each session read them: on every session of
 * the last 90 days, the fans' anchors as of that session, keeping a meeting
 * seen on that session. A newer swing then can't erase a meeting already
 * recorded, and the range stays the swing the fans were drawn from.
 */
function halfMeetingsAsRead(daily: Bar[]): (RetracementTimingHit & { windowEnd: number })[] {
  if (daily.length < 20) return [];
  const last = Date.parse(daily[daily.length - 1].t);
  const half = RETRACEMENT_ANGLE_PAIRS.filter((p) => p.label === "1/2");
  const out: (RetracementTimingHit & { windowEnd: number })[] = [];
  for (let j = daily.length - 1; j >= 19; j--) {
    const day = daily[j].t.slice(0, 10);
    if (last - Date.parse(`${day}T00:00:00Z`) > HALF_PRICE_HALF_TIME_DAYS * DAY_MS) break;
    const slice = daily.slice(0, j + 1);
    for (const h of retracementHitsFrom(slice, fanAnchors(slice), half)) if (h.date === day) out.push(h);
  }
  return out;
}

function retracementHitsFrom(
  bars: Bar[],
  anchors: ReturnType<typeof fanAnchors>,
  pairs: readonly (typeof RETRACEMENT_ANGLE_PAIRS)[number][],
): (RetracementTimingHit & { windowEnd: number })[] {
  const out: (RetracementTimingHit & { windowEnd: number })[] = [];
  for (const { anchor, preceding, baseIntervalMs } of anchors) {
    if (!preceding || baseIntervalMs === null || baseIntervalMs <= 0) continue;
    const range = Math.abs(anchor.price - preceding.price);
    if (range <= 0) continue;
    const t0 = Date.parse(anchor.bar.t);
    const tol = Math.max(DAY_MS, baseIntervalMs / 16);
    // From a low the counter-move rises back into the fall; from a high it falls.
    const sign = anchor.kind === "low" ? 1 : -1;
    for (const p of pairs) {
      const level = anchor.price + sign * p.fraction * range;
      // The angle's time multiple (`FAN_TIME_RATIOS`, W033: a 1xN angle
      // takes 1/N of the square's time to the whole range, an Nx1 angle N
      // times it) applied to the fraction of the range: f of the way at f
      // times the angle's time.
      const due = t0 + p.fraction * p.ratio * baseIntervalMs;
      for (let i = anchor.index + 1; i < bars.length; i++) {
        const t = Date.parse(bars[i].t);
        if (t < due - tol) continue;
        if (t > due + tol) break;
        if (bars[i].l <= level && bars[i].h >= level) {
          out.push({ label: p.label, angle: p.angle, anchorKind: anchor.kind, level, date: bars[i].t.slice(0, 10), windowEnd: due + tol });
          break;
        }
      }
    }
  }
  return out;
}

export function readSecondaryTime(
  daily: Bar[],
  monthly: Bar[] | null | undefined,
  asOf: Date,
  counterMove: CounterMoveReading | null = null,
): SecondaryTimeReading {
  return {
    shortCounterMove:
      counterMove?.inCounterMove && counterMove.tradingDays !== undefined
        ? { trend: counterMove.trend, tradingDays: counterMove.tradingDays, phase: shortCounterMovePhase(counterMove.tradingDays) }
        : null,
    fanTimeRatios: readFanTimeRatios(daily, asOf),
    ...retracementTiming(daily),
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
  const scm = r.shortCounterMove;
  if (scm && scm.phase !== "normal") {
    const note = { pastFourthDay: "past its 4th day, a sign of consolidation or a reversal", sevenToTen: "in the 7-10 day length of a second counter-move", longer: "longer than 10 days" }[scm.phase];
    lines.push(`Counter-move against the ${scm.trend} trend: ${scm.tradingDays} trading days, ${note}. Shown for context; it does not change the setup.`);
  }
  const rt = r.retracementTiming?.[0];
  if (rt) lines.push(`The ${rt.label} retracement (${rt.level.toFixed(2)}) was reached ${rt.date}, at the time the ${rt.angle} angle from the ${rt.anchorKind} gives: a turn is likelier. Shown for context; it does not change the setup.`);
  const hp = r.halfPriceHalfTime;
  if (hp) lines.push(`Half the range was retraced at half the time on ${hp.date}; a fast move of up to three months can follow. Shown for context; it does not change the setup.`);
  const fan = r.fanTimeRatios?.[0];
  if (fan) lines.push(`The ${fan.label} time ratio from the last ${fan.anchorKind} comes due ${fan.date}. Shown for context; it does not change the setup.`);
  return lines;
}
