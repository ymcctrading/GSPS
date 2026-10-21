/**
 * The charts every surface reads its support and resistance, its target
 * angles and Gann's percentage levels from (PLAN.md item 9, step 4: level
 * parity). The live scan fetches a year of daily bars with the session still
 * trading, five years of weeks and thirteen of months, each with its bar in
 * progress; the replay holds six years of completed sessions and closed months
 * only. Read raw, the two drew different levels from the same market (the
 * item 10 review measured the old-top and level-test readings disagreeing on
 * 74-88% of sessions). One window removes that:
 * - daily: the 52 weeks of completed sessions before the session
 *   (`entryChartBars`, the window a buying point is already read from);
 * - weekly: the closed weeks whose Monday falls within `WEEKLY_CHART_YEARS`
 *   before the session, and the week in progress built from its completed
 *   sessions;
 * - monthly: the closed months from 1 January `OLDER_LEVELS_YEARS` before the
 *   session's year (`monthlyChartFrom`), and the month in progress built from
 *   its completed sessions.
 *
 * Engineering choices, labelled: the spans are the live feed's reach (Gann
 * names none), and weeks run Monday to Friday. A bar in progress is built from
 * completed sessions only, so neither surface reads a session that has no
 * close yet.
 *
 * Three-question basis:
 * 1. Gann: no rule of its own; it carries his levels (old tops and bottoms on
 *    the daily, weekly and monthly charts, W006 pp.19-24) unchanged to both
 *    surfaces.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence (the same chart above and below, live and in
 *    the measurement of it).
 */
import type { Bar } from "@/lib/types";
import { entryChartBars, monthlyChartFrom } from "@/lib/scan/entrySelection";

/** Years of weekly bars read, the live feed's weekly fetch. */
export const WEEKLY_CHART_YEARS = 5;

/** The Monday (YYYY-MM-DD) of the week holding `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const hit = MONDAYS.get(date);
  if (hit) return hit;
  const t = Date.parse(`${date}T00:00:00Z`);
  const back = (new Date(t).getUTCDay() + 6) % 7;
  const monday = new Date(t - back * 86_400_000).toISOString().slice(0, 10);
  if (MONDAYS.size > 20_000) MONDAYS.clear();
  MONDAYS.set(date, monday);
  return monday;
}
/** Dates already resolved: the replay reads the same sessions on every day it walks. */
const MONDAYS = new Map<string, string>();

/** One bar from `bars` (oldest first), stamped `t`. */
function merge(bars: Bar[], t: string): Bar {
  return {
    t,
    o: bars[0].o,
    h: Math.max(...bars.map((b) => b.h)),
    l: Math.min(...bars.map((b) => b.l)),
    c: bars[bars.length - 1].c,
    v: bars.reduce((n, b) => n + b.v, 0),
  };
}

/** Daily bars rolled into Monday-to-Friday weeks, stamped with their Monday. */
export function weeksFromDaily(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  let group: Bar[] = [];
  let key = "";
  for (const b of daily) {
    const k = mondayOf(b.t.slice(0, 10));
    if (k !== key && group.length > 0) {
      out.push(merge(group, `${key}T04:00:00.000Z`));
      group = [];
    }
    key = k;
    group.push(b);
  }
  if (group.length > 0) out.push(merge(group, `${key}T04:00:00.000Z`));
  return out;
}

/** Daily bars rolled into calendar months, stamped with the month's first day. */
function monthsFromDaily(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  let group: Bar[] = [];
  let key = "";
  for (const b of daily) {
    const k = b.t.slice(0, 7);
    if (k !== key && group.length > 0) {
      out.push(merge(group, `${key}-01T04:00:00.000Z`));
      group = [];
    }
    key = k;
    group.push(b);
  }
  if (group.length > 0) out.push(merge(group, `${key}-01T04:00:00.000Z`));
  return out;
}

export interface LevelCharts {
  daily: Bar[];
  weekly: Bar[];
  monthly: Bar[];
}

/**
 * The level charts for the session `asOf` (YYYY-MM-DD). `weekly` may be null
 * (the replay holds no weekly series), and is then rolled up from `daily`.
 */
export function levelCharts(input: { daily: Bar[]; weekly: Bar[] | null; monthly: Bar[] }, asOf: string): LevelCharts {
  const completed = input.daily.filter((b) => b.t.slice(0, 10) < asOf);
  const daily = entryChartBars(input.daily, asOf);

  const thisWeek = mondayOf(asOf);
  const weekFrom = `${Number(asOf.slice(0, 4)) - WEEKLY_CHART_YEARS}${asOf.slice(4)}`;
  const weeks = (input.weekly ?? weeksFromDaily(completed)).filter((b) => {
    const m = mondayOf(b.t.slice(0, 10));
    return m >= weekFrom && m < thisWeek;
  });
  const weekSessions = completed.filter((b) => b.t.slice(0, 10) >= thisWeek);
  const weekly = weekSessions.length > 0 ? [...weeks, merge(weekSessions, `${thisWeek}T04:00:00.000Z`)] : weeks;

  const thisMonth = asOf.slice(0, 7);
  const monthFrom = monthlyChartFrom(new Date(`${asOf}T12:00:00Z`)).toISOString().slice(0, 7);
  // A run with no monthly series (unit fixtures; never the live feed) reads
  // months rolled up from its daily bars instead.
  const source = input.monthly.length > 0 ? input.monthly : monthsFromDaily(completed);
  const months = source.filter((b) => b.t.slice(0, 7) >= monthFrom && b.t.slice(0, 7) < thisMonth);
  const monthSessions = completed.filter((b) => b.t.slice(0, 7) === thisMonth);
  const monthly = monthSessions.length > 0 ? [...months, merge(monthSessions, `${thisMonth}-01T04:00:00.000Z`)] : months;

  return { daily, weekly, monthly };
}

/**
 * The months the yearly cycles are counted on (`yearCycleConvergence`) for
 * the session `asOf` (YYYY-MM-DD): the closed months from the same month ten
 * years before it, the provider's month in progress left out. The live scan
 * read the provider's ten years to the wall clock, month in progress included,
 * and the replay every closed month it held (up to sixteen years back), so the
 * two counted different anchors (2026-10-20, weekly parity). Ten years is the
 * provider's monthly reach the cycle count was written for.
 */
export function yearCycleMonths(monthly: Bar[], asOf: string): Bar[] {
  const thisMonth = asOf.slice(0, 7);
  const from = `${Number(asOf.slice(0, 4)) - 10}${asOf.slice(4, 7)}`;
  return monthly.filter((b) => {
    const m = b.t.slice(0, 7);
    return m >= from && m < thisMonth;
  });
}
