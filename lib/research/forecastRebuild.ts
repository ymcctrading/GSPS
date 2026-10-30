/**
 * Can the time methods GSPS has built from the books rebuild the author's own
 * published calls? Research only: nothing on the verdict path imports this
 * module, and nothing here reaches a member.
 *
 * The question (owner, 2026-10-30: "if his forecasts are correct then they
 * can be reproduced for now"). The published calls hit the important swings
 * about twice as often as chance (`forecastTrackRecord.ts`), but every
 * forecast credits an undisclosed "time factor". If the disclosed methods,
 * run as the author could have run them on each issue date, land on his
 * dates, part of that factor is rebuilt. If they do not, the missing piece is
 * the part he kept back.
 *
 * Fixed before any year was scored:
 * - Anchors: the 9-point swings (`dowSwingRecord.json`) dated before the
 *   issue date. Nothing after the issue date is read. A second, labelled
 *   run anchors on each finished year's highest top and lowest bottom only
 *   ("from important tops and bottoms"), in case the swings are too many.
 * - Methods, each with the module's own constants and a two-day tolerance
 *   (`timeCycles.ts` windowDays, `SEASONAL_TOLERANCE_DAYS`):
 *   - wheel: the last 12 anchors + `WHEEL_COUNTS` days (`timeCycles.ts`);
 *   - dayBands: the last 12 anchors + `DAY_COUNT_BANDS` (whole bands);
 *   - yearCycles: every anchor + `MAJOR_CYCLE_YEARS` anniversaries;
 *   - squareOf52: the last 12 anchors + `SQUARE_OF_52_FRACTIONS` weeks;
 *   - angleMonths: every anchor + `STARRED_MONTH_COUNTS` months, same day;
 *   - seasonal: `SEASONAL_POINTS`, every year;
 *   - fixedCalendar: `FIXED_CALENDAR_WINDOWS`, every year;
 *   - convergence: days two or more of wheel, yearCycles, squareOf52,
 *     angleMonths and seasonal share (dayBands and fixedCalendar left out as
 *     too broad or calendar-only).
 * - Scored in the forecast's calendar year only. Two counts: the published
 *   calls whose window meets a method day, and the 9-point turns that fall
 *   on a method day.
 * - Null: the year's method days shifted round the year by every offset
 *   (keeping how many days and how they cluster); years pooled by drawing one
 *   random offset per year (seeded, `DRAWS`). p = (draws at or above the
 *   observed total + 1) / (DRAWS + 1).
 *
 * Three-question basis:
 * 1. Source: each method is the module it names (class A, cited there); the
 *    calls and turns are the author's own (W036, W005, W001, W009).
 * 2. Cycles: Dewey's base-rate rule; the circular shift is the standard null
 *    for a recurrent-event claim that keeps the events' own spacing.
 * 3. Hermetic: Correspondence. If the disclosed counts are the same law the
 *    forecasts used, they should land where his dates landed.
 */
import { DAY_COUNT_BANDS, FIXED_CALENDAR_WINDOWS, MAJOR_CYCLE_YEARS, WHEEL_COUNTS } from "@/lib/gann/timeCycles";
import { SQUARE_OF_52_FRACTIONS } from "@/lib/gann/squareOf52";
import { STARRED_MONTH_COUNTS } from "@/lib/gann/angleMonthCounts";
import { SEASONAL_POINTS, SEASONAL_TOLERANCE_DAYS } from "@/lib/gann/seasonalCounts";
import { seeded } from "@/lib/research/preregisteredTimeTests";
import { DOW_SWINGS, type Turn } from "@/lib/research/forecastTrackRecord";
import { PUBLISHED_FORECASTS, type PublishedForecast } from "@/lib/research/publishedForecasts";

export const REBUILD_METHODS = [
  "wheel",
  "dayBands",
  "yearCycles",
  "squareOf52",
  "angleMonths",
  "seasonal",
  "fixedCalendar",
  "convergence",
] as const;
export type RebuildMethod = (typeof REBUILD_METHODS)[number];

const TOLERANCE = SEASONAL_TOLERANCE_DAYS;
const RECENT_ANCHORS = 12;
export const DRAWS = 20_000;

const DAY = 86_400_000;
const dayOf = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayUTC = (y: number, m0: number, d: number) => Math.floor(Date.UTC(y, m0, d) / DAY);

/** The method's days in the forecast year, as offsets from 1 January, using only anchors before `issued`. */
export type AnchorSet = "nine" | "yearly";

/** Each calendar year's highest high and lowest low among the 9-point swings: the year's major tops and bottoms. */
export function yearlyExtremes(): Turn[] {
  const byYear = new Map<string, Turn[]>();
  for (const x of DOW_SWINGS.nine) byYear.set(x.date.slice(0, 4), [...(byYear.get(x.date.slice(0, 4)) ?? []), x]);
  const out: Turn[] = [];
  for (const xs of byYear.values()) {
    const highs = xs.filter((x) => x.kind === "high");
    const lows = xs.filter((x) => x.kind === "low");
    if (highs.length) out.push(highs.reduce((a, b) => (b.price > a.price ? b : a)));
    if (lows.length) out.push(lows.reduce((a, b) => (b.price < a.price ? b : a)));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function methodDays(method: RebuildMethod, issued: string, year: number, anchorSet: AnchorSet = "nine"): Set<number> {
  const start = dayUTC(year, 0, 1);
  const len = dayUTC(year + 1, 0, 1) - start;
  const out = new Set<number>();
  const mark = (day: number, tol = TOLERANCE) => {
    for (let d = day - tol; d <= day + tol; d++) if (d >= start && d < start + len) out.add(d - start);
  };
  const markRange = (from: number, to: number) => {
    for (let d = from; d <= to; d++) if (d >= start && d < start + len) out.add(d - start);
  };
  // A year's extreme is known only once the year is over: read it from a year that ended before the issue date.
  const anchors: Turn[] =
    anchorSet === "nine"
      ? DOW_SWINGS.nine.filter((x) => x.date < issued)
      : yearlyExtremes().filter((x) => `${x.date.slice(0, 4)}-12-31` < issued);
  const recent = anchors.slice(-RECENT_ANCHORS);

  switch (method) {
    case "wheel":
      for (const a of recent) for (const n of WHEEL_COUNTS) mark(dayOf(a.date) + n);
      break;
    case "dayBands":
      for (const a of recent) for (const [lo, hi] of DAY_COUNT_BANDS) markRange(dayOf(a.date) + lo, dayOf(a.date) + hi);
      break;
    case "yearCycles":
      for (const a of anchors) {
        const [y, m, d] = a.date.split("-").map(Number);
        for (const n of MAJOR_CYCLE_YEARS) mark(dayUTC(y + n, m - 1, d));
      }
      break;
    case "squareOf52":
      for (const a of recent) for (const f of SQUARE_OF_52_FRACTIONS) mark(dayOf(a.date) + Math.round(f.weeks * 7));
      break;
    case "angleMonths":
      for (const a of anchors) {
        const [y, m, d] = a.date.split("-").map(Number);
        for (const c of STARRED_MONTH_COUNTS) mark(dayUTC(y, m - 1 + c.months, d));
      }
      break;
    case "seasonal":
      for (const p of SEASONAL_POINTS) mark(dayUTC(year, p.month - 1, p.day));
      break;
    case "fixedCalendar":
      for (const w of FIXED_CALENDAR_WINDOWS) markRange(dayUTC(year, w.month - 1, w.startDay), dayUTC(year, w.month - 1, w.endDay));
      break;
    case "convergence": {
      const parts = (["wheel", "yearCycles", "squareOf52", "angleMonths", "seasonal"] as const).map((m) => methodDays(m, issued, year, anchorSet));
      for (let i = 0; i < len; i++) if (parts.filter((s) => s.has(i)).length >= 2) out.add(i);
      break;
    }
  }
  return out;
}

interface YearTargets {
  year: number;
  len: number;
  /** Each published call as a day range, offsets from 1 January. */
  calls: [number, number][];
  /** The 9-point turns in the year, offsets from 1 January. */
  turns: number[];
}

function targetsFor(f: PublishedForecast): YearTargets {
  const year = Number(f.id);
  const start = dayUTC(year, 0, 1);
  const len = dayUTC(year + 1, 0, 1) - start;
  const clip = (d: number) => Math.min(len - 1, Math.max(0, d - start));
  return {
    year,
    len,
    calls: f.windows.map((w) => [clip(dayOf(w.from)), clip(dayOf(w.to))]),
    turns: DOW_SWINGS.nine.filter((x) => x.date.startsWith(`${year}-`)).map((x) => dayOf(x.date) - start),
  };
}

/** Hits of a day set shifted round the year by `k`. */
function hitsAt(days: number[], t: YearTargets, k: number): { calls: number; turns: number } {
  const set = new Set(days.map((d) => (d + k) % t.len));
  let calls = 0;
  for (const [a, b] of t.calls) {
    for (let d = a; d <= b; d++) {
      if (set.has(d)) {
        calls++;
        break;
      }
    }
  }
  const turns = t.turns.filter((d) => set.has(d)).length;
  return { calls, turns };
}

export interface RebuildYear {
  id: string;
  /** Share of the year's days the method marks. */
  coverage: number;
  calls: number;
  callsTotal: number;
  turns: number;
  turnsTotal: number;
  /** Mean hits over every circular shift. */
  callsExpected: number;
  turnsExpected: number;
}

export interface RebuildResult {
  method: RebuildMethod;
  anchorSet: AnchorSet;
  years: RebuildYear[];
  calls: { hits: number; total: number; expected: number; p: number };
  turns: { hits: number; total: number; expected: number; p: number };
}

export function rebuildMethod(
  method: RebuildMethod,
  anchorSet: AnchorSet = "nine",
  forecasts: PublishedForecast[] = PUBLISHED_FORECASTS,
  seed = 20261030,
): RebuildResult {
  const per = forecasts.map((f) => {
    const t = targetsFor(f);
    const days = [...methodDays(method, f.issued, t.year, anchorSet)];
    const shifts = Array.from({ length: t.len }, (_, k) => hitsAt(days, t, k));
    return { f, t, days, observed: shifts[0], shifts };
  });
  const years: RebuildYear[] = per.map(({ f, t, days, observed, shifts }) => ({
    id: f.id,
    coverage: days.length / t.len,
    calls: observed.calls,
    callsTotal: t.calls.length,
    turns: observed.turns,
    turnsTotal: t.turns.length,
    callsExpected: shifts.reduce((a, s) => a + s.calls, 0) / shifts.length,
    turnsExpected: shifts.reduce((a, s) => a + s.turns, 0) / shifts.length,
  }));
  const rnd = seeded(seed);
  const obsCalls = years.reduce((a, y) => a + y.calls, 0);
  const obsTurns = years.reduce((a, y) => a + y.turns, 0);
  let geCalls = 0;
  let geTurns = 0;
  for (let i = 0; i < DRAWS; i++) {
    let c = 0;
    let tt = 0;
    for (const p of per) {
      const s = p.shifts[Math.floor(rnd() * p.shifts.length)];
      c += s.calls;
      tt += s.turns;
    }
    if (c >= obsCalls) geCalls++;
    if (tt >= obsTurns) geTurns++;
  }
  return {
    method,
    anchorSet,
    years,
    calls: {
      hits: obsCalls,
      total: years.reduce((a, y) => a + y.callsTotal, 0),
      expected: years.reduce((a, y) => a + y.callsExpected, 0),
      p: (geCalls + 1) / (DRAWS + 1),
    },
    turns: {
      hits: obsTurns,
      total: years.reduce((a, y) => a + y.turnsTotal, 0),
      expected: years.reduce((a, y) => a + y.turnsExpected, 0),
      p: (geTurns + 1) / (DRAWS + 1),
    },
  };
}

export function rebuildAll(anchorSet: AnchorSet = "nine"): RebuildResult[] {
  return REBUILD_METHODS.map((m) => rebuildMethod(m, anchorSet));
}
