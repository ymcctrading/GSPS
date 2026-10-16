/**
 * Three pre-registered research tests the owner chose on 2026-10-16 (Q33 Test,
 * Q38 Preregister, Q40 Test). Research only: nothing here feeds a verdict,
 * a level or a card. Each rule below is fixed before any data is read; a
 * deviation goes in the run notes, never back into this file. Reading rule
 * for all three: a technique beats placement at random only when its p is
 * under 0.05 and its statistic is above the null mean, Holm-corrected across
 * the three tests (`holm`, `calendarTest.ts`). Otherwise it stays unbuilt.
 *
 * 1. Monthly dates (A-TIME-22, W046 p.2: coffee's "important dates each
 *    month, 1st, 15th, 18th and 19th"). Gann gives coffee's dates only, so
 *    each symbol's own are searched for, then tested out of sample.
 *    - Turns: completed pivots of the weekly swing chart on daily bars.
 *    - Train on the first 70% of sessions: the 4 days of the month (1-31)
 *      with the most turns on them (Gann names exact days; ties to the
 *      earlier day).
 *    - Test on the last 30%: the share of turns within ±1 day of those days.
 *    - Null: 999 random 4-day sets per symbol (seeded), pooled the same way.
 * 2. Saturn's travel in price (A-ASTRO-04, W046 p.1). One scale, one frame,
 *    one sign: geocentric Saturn (the letter's worked examples), 30 points a
 *    degree (its first scale), added to the low. A point is the Gann point
 *    (`gannPointForBars`), so the scale reads in each symbol's own units.
 *    - From each major low (`majorPivots(findPivots(daily, 5))`), the line
 *      low + 30 × Saturn's travel since the low, for two years.
 *    - A turn (weekly swing chart top or bottom) in that span hits when its
 *      extreme is within 3 points of the line on its date.
 *    - Null: the same lines shifted by 1..359 degrees of travel.
 * 3. A month of many aspects (A-ASTRO-06, W046 p.2: "the month of April is
 *    very important ... wide swings"). Geocentric Sun, Mars, Jupiter, Saturn,
 *    Uranus and Neptune (the bodies of the letter's April calendar); every
 *    pair; aspects 60, 120, 135 and 180° within 1°. An aspect is counted in
 *    the month it first comes within orb. A cluster month has 4 or more.
 *    - Statistic: the mean of cluster months' high-to-low range over the
 *      symbol's median monthly range, less the same for the other months.
 *    - Null: the cluster calendar shifted circularly by 1..119 months.
 *
 * Three-question basis. Gann: as cited, his coffee letter of 1954 (A2.3).
 * Cycles: Dewey's recurrent-event statistic, a hit rate against a base rate,
 * with the rule fixed first, an out-of-sample test (1) and a family
 * correction. Hermetic: Correspondence (does a rule Gann gave one market hold
 * on others) and Rhythm.
 */
import { SunPosition } from "astronomy-engine";
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { ephemerisInstant, planetLongitudes, type Planet } from "@/lib/gann/planetaryAverages";
import { gannPointForBars } from "@/lib/gann/pointScale";

const DAY = 86_400_000;

/** A small seeded generator (mulberry32), so a run repeats exactly. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TestResult {
  observed: number;
  nullMean: number;
  p: number;
  n: number;
  holmSignificant?: boolean;
}

function weeklyTurns(daily: Bar[]): number[] {
  return walkSwingChart(daily, WEEKLY_SWING_CHART).pivots.map((p) => p.index).filter((i) => i > 0);
}

const dom = (t: string) => Number(t.slice(8, 10));
/** Day-of-month distance, ±1 day wrapping across a month's end only by calendar day number. */
const near = (d: number, set: readonly number[]) => set.some((s) => Math.abs(d - s) <= 1);

// ---- 1. Monthly dates ----

export const MONTHLY_DATES = 4;
export const TRAIN_SHARE = 0.7;
export const NULL_DRAWS = 999;

/** The 4 days of the month with the most turns on them, from the training sessions. */
export function trainMonthlyDates(daily: Bar[], turns: number[]): number[] {
  const counts = Array.from({ length: 32 }, () => 0);
  for (const i of turns) {
    counts[dom(daily[i].t)]++;
  }
  return Array.from({ length: 31 }, (_, i) => i + 1)
    .sort((a, b) => counts[b] - counts[a] || a - b)
    .slice(0, MONTHLY_DATES)
    .sort((a, b) => a - b);
}

export interface MonthlyDatesInput {
  /** Days of the month of the hold-out turns. */
  testDays: number[];
  chosen: number[];
}

export function monthlyDatesInput(daily: Bar[]): MonthlyDatesInput | null {
  const turns = weeklyTurns(daily);
  const cut = Math.floor(daily.length * TRAIN_SHARE);
  const train = turns.filter((i) => i < cut);
  const test = turns.filter((i) => i >= cut);
  if (train.length < 10 || test.length < 4) return null;
  return { chosen: trainMonthlyDates(daily, train), testDays: test.map((i) => dom(daily[i].t)) };
}

function hitShare(inputs: { testDays: number[] }[], sets: number[][]): number {
  let hits = 0;
  let n = 0;
  inputs.forEach((s, k) => {
    for (const d of s.testDays) {
      n++;
      if (near(d, sets[k])) hits++;
    }
  });
  return n ? hits / n : 0;
}

export function testMonthlyDates(inputs: MonthlyDatesInput[], seed = 1954): TestResult {
  const observed = hitShare(inputs, inputs.map((s) => s.chosen));
  const rand = seeded(seed);
  const draw = () => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    for (let i = days.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [days[i], days[j]] = [days[j], days[i]];
    }
    return days.slice(0, MONTHLY_DATES);
  };
  let ge = 0;
  let sum = 0;
  for (let k = 0; k < NULL_DRAWS; k++) {
    const v = hitShare(inputs, inputs.map(draw));
    sum += v;
    if (v >= observed) ge++;
  }
  return { observed, nullMean: sum / NULL_DRAWS, p: (ge + 1) / (NULL_DRAWS + 1), n: inputs.reduce((a, s) => a + s.testDays.length, 0) };
}

// ---- 2. Saturn's travel ----

export const SATURN_POINTS_PER_DEGREE = 30;
export const SATURN_SPAN_DAYS = 730;
export const SATURN_HIT_POINTS = 3;

const saturnGeo = (ms: number) => planetLongitudes(new Date(ms)).geo.Saturn;

/** Degrees Saturn has travelled (geocentric, retrograde loops netted) between two dates, walked a day at a time. */
export function saturnTravel(fromMs: number, toMs: number): number {
  let total = 0;
  let prev = saturnGeo(fromMs);
  for (let t = fromMs + DAY; t <= toMs; t += DAY) {
    const cur = saturnGeo(t);
    let d = cur - prev;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    total += d;
    prev = cur;
  }
  return total;
}

export interface SaturnCase {
  /** Distance from the line in points at each turn, for travel `travel` (degrees) since the low. */
  low: number;
  unit: number;
  turns: { travel: number; price: number }[];
}

export function saturnCases(daily: Bar[]): SaturnCase[] {
  const unit = gannPointForBars(daily);
  if (!(unit > 0)) return [];
  const turns = walkSwingChart(daily, WEEKLY_SWING_CHART).pivots;
  const out: SaturnCase[] = [];
  for (const low of majorPivots(findPivots(daily, 5)).filter((p) => p.kind === "low")) {
    const t0 = Date.parse(low.bar.t);
    const inSpan = turns.filter((p) => {
      const t = Date.parse(daily[p.index].t);
      return t > t0 && t - t0 <= SATURN_SPAN_DAYS * DAY;
    });
    if (inSpan.length === 0) continue;
    // Saturn's travel by day since the low, walked once.
    const byDay = [0];
    let prev = saturnGeo(t0);
    for (let d = 1; d <= SATURN_SPAN_DAYS; d++) {
      const cur = saturnGeo(t0 + d * DAY);
      let step = cur - prev;
      if (step > 180) step -= 360;
      if (step < -180) step += 360;
      byDay.push(byDay[d - 1] + step);
      prev = cur;
    }
    out.push({
      low: low.bar.l,
      unit,
      turns: inSpan.map((p) => ({ travel: byDay[Math.round((Date.parse(daily[p.index].t) - t0) / DAY)], price: p.price })),
    });
  }
  return out;
}

function saturnShare(cases: SaturnCase[], shiftDeg: number): number {
  let hits = 0;
  let n = 0;
  for (const c of cases) {
    for (const t of c.turns) {
      n++;
      const line = c.low + SATURN_POINTS_PER_DEGREE * (t.travel + shiftDeg) * c.unit;
      if (Math.abs(t.price - line) <= SATURN_HIT_POINTS * c.unit) hits++;
    }
  }
  return n ? hits / n : 0;
}

export function testSaturnTravel(cases: SaturnCase[]): TestResult {
  const observed = saturnShare(cases, 0);
  let ge = 0;
  let sum = 0;
  for (let s = 1; s <= 359; s++) {
    const v = saturnShare(cases, s);
    sum += v;
    if (v >= observed) ge++;
  }
  return { observed, nullMean: sum / 359, p: (ge + 1) / 360, n: cases.reduce((a, c) => a + c.turns.length, 0) };
}

// ---- 3. A month of many aspects ----

export const CLUSTER_BODIES = ["Sun", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"] as const;
export const CLUSTER_ASPECTS = [60, 120, 135, 180] as const;
export const CLUSTER_ORB = 1;
export const CLUSTER_MIN = 4;
export const CLUSTER_SHIFTS = 119;

function geoLongitudes(ms: number): Record<(typeof CLUSTER_BODIES)[number], number> {
  const p = planetLongitudes(new Date(ms)).geo;
  const sun = SunPosition(ephemerisInstant(new Date(ms))).elon;
  return { Sun: sun, ...(Object.fromEntries((CLUSTER_BODIES.slice(1) as Planet[]).map((b) => [b, p[b]])) as Record<Exclude<(typeof CLUSTER_BODIES)[number], "Sun">, number>) };
}

/** Aspect entries by calendar month ("YYYY-MM"), from `from` to `to` (inclusive), walked a day at a time. */
export function aspectCountsByMonth(from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  const inOrb = new Set<string>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const lon = geoLongitudes(t);
    const month = new Date(t).toISOString().slice(0, 7);
    if (!out.has(month)) out.set(month, 0);
    for (let i = 0; i < CLUSTER_BODIES.length; i++) {
      for (let j = i + 1; j < CLUSTER_BODIES.length; j++) {
        let sep = Math.abs(lon[CLUSTER_BODIES[i]] - lon[CLUSTER_BODIES[j]]) % 360;
        if (sep > 180) sep = 360 - sep;
        for (const a of CLUSTER_ASPECTS) {
          const key = `${i}-${j}-${a}`;
          if (Math.abs(sep - a) <= CLUSTER_ORB) {
            if (!inOrb.has(key)) {
              inOrb.add(key);
              out.set(month, (out.get(month) ?? 0) + 1);
            }
          } else inOrb.delete(key);
        }
      }
    }
  }
  return out;
}

/** One symbol's monthly ranges over its median, by month. */
export function normalisedMonthlyRanges(daily: Bar[]): Map<string, number> {
  const months = new Map<string, { h: number; l: number }>();
  for (const b of daily) {
    const m = b.t.slice(0, 7);
    const cur = months.get(m);
    if (cur) {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
    } else months.set(m, { h: b.h, l: b.l });
  }
  const ranges = [...months].map(([m, v]) => [m, v.l > 0 ? Math.log(v.h / v.l) : 0] as const);
  const sorted = ranges.map((r) => r[1]).sort((a, b) => a - b);
  const median = sorted.length ? sorted[sorted.length >> 1] : 0;
  return new Map(median > 0 ? ranges.map(([m, r]) => [m, r / median]) : []);
}

function clusterGap(series: Map<string, number>[], calendar: string[], cluster: Set<number>, shift: number): number {
  let inSum = 0;
  let inN = 0;
  let outSum = 0;
  let outN = 0;
  const idx = new Map(calendar.map((m, i) => [m, i]));
  for (const s of series) {
    for (const [m, r] of s) {
      const i = idx.get(m);
      if (i === undefined) continue;
      const shifted = (i - shift + calendar.length * 1000) % calendar.length;
      if (cluster.has(shifted)) {
        inSum += r;
        inN++;
      } else {
        outSum += r;
        outN++;
      }
    }
  }
  return inN && outN ? inSum / inN - outSum / outN : 0;
}

export function testAspectClusters(series: Map<string, number>[], counts: Map<string, number>): TestResult {
  const calendar = [...counts.keys()].sort();
  const cluster = new Set(calendar.map((m, i) => (counts.get(m)! >= CLUSTER_MIN ? i : -1)).filter((i) => i >= 0));
  const observed = clusterGap(series, calendar, cluster, 0);
  let ge = 0;
  let sum = 0;
  for (let s = 1; s <= CLUSTER_SHIFTS; s++) {
    const v = clusterGap(series, calendar, cluster, s);
    sum += v;
    if (v >= observed) ge++;
  }
  return { observed, nullMean: sum / CLUSTER_SHIFTS, p: (ge + 1) / (CLUSTER_SHIFTS + 1), n: cluster.size };
}
