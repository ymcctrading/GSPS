/**
 * C-ASTRO-09, the first-trade chart (Bucholtz, *The Bull, the Bear and the
 * Planets*, W013 pp. 96-99, 103). A labelled reconstruction, and it acts
 * (Chuck, 2026-10-22: "Search for, confirm and ultimately use these dates"):
 * where a stock's first-trade date is confirmed by two sources
 * (`firstTradeDates.ts`), a transit chosen on the swings before a turn and
 * exact within `WINDOW_DAYS` of it is a dated window in the shared time-window
 * hold (`firstTradeWindows`, read by `timeWindow.ts`), live and replay alike.
 * Like every astro window it counts only on a 3-Day Chart turn (C-ASTRO-15).
 *
 * Bucholtz's method: cast a chart for the first trade (the exchange's city,
 * 9:30 am), keep the transits to it that most often lined up with past
 * swings, and project those forward. As he states it, the aspects are chosen
 * after the outcome is seen, so any hit rate on the same swings is selection,
 * not evidence. This module keeps his method and removes that fault: the
 * aspects are chosen on the first part of the record only (`selectAspects`)
 * and scored on the rest, which the selection never saw (`scoreHoldOut`).
 *
 * Fixed before testing (Dewey's standard; nothing here is searched beyond
 * the selection itself, which sees the training swings only):
 * - The chart: geocentric tropical longitudes of the Sun to Pluto at 9:30 am
 *   New York time on the first trade date. Houses, the Ascendant and the MC
 *   are left out: a listing date has no recorded time of the first trade
 *   (C-ASTRO-14), and 9:30 is the open, not the print.
 * - Transits: Mars, Jupiter, Saturn and Uranus, at noon UTC, to each natal
 *   point, in Bucholtz's aspects (`aspects.ts`), dated on the day the
 *   aspect is exact.
 * - A transit lines up with a swing when a pivot falls within ±`WINDOW_DAYS`
 *   (3) of it. Engineering choice.
 * - The selection keeps the `KEEP` (5) combinations with the highest hit
 *   rate on the training swings, with at least `MIN_EVENTS` (3) events
 *   there. Engineering choices.
 * - The first-trade date is the confirmed one (`firstTradeDates.ts`: Wikidata's
 *   listing and Yahoo's first bar agreeing within 3 days). The inception date
 *   GSPS also holds is often the founding, so it is never a stand-in.
 * - Acting: the training swings are the 3-Day Chart's completed tops and
 *   bottoms before the turn, so nothing after the turn decides; a window
 *   needs a kept combination exact within `WINDOW_DAYS` of the turn's date.
 *   Bucholtz gives no direction for a transit, so it is read for both a top
 *   and a bottom.
 *
 * Three-question basis:
 * 1. Gann: none. Bucholtz, Tier C, not sourced to Gann.
 * 2. Cycles: a recurrence claim judged on Dewey's persistence-after-discovery
 *    item, which the hold-out is.
 * 3. Hermetic: Correspondence (the birth chart as the stock's own heaven),
 *    held as a hypothesis.
 */
import { Body, Ecliptic, GeoVector } from "astronomy-engine";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import type { Bar } from "@/lib/types";

/** Bucholtz's aspects (W013), the angles only; the timing is the exact day. */
const BUCHOLTZ_ASPECTS = [0, 30, 45, 60, 90, 120, 150, 180].map((angle) => ({ angle }));

const DAY = 86_400_000;
export const NATAL_BODIES = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;
export const TRANSIT_BODIES = ["Mars", "Jupiter", "Saturn", "Uranus"] as const;
export const WINDOW_DAYS = 3;
export const KEEP = 5;
export const MIN_EVENTS = 3;

type Natal = (typeof NATAL_BODIES)[number];
type Transit = (typeof TRANSIT_BODIES)[number];

const lon = (b: Natal | Transit, t: Date) => Ecliptic(GeoVector(Body[b], t, true)).elon;

// A transit's noon longitude is the same for every symbol and session, so it
// is computed once per planet and day (about 30 ms a turn uncached, live and
// replay alike).
const transitLonCache = new Map<string, number>();
function transitLon(b: Transit, t: number): number {
  const key = `${b}:${t}`;
  let v = transitLonCache.get(key);
  if (v === undefined) {
    v = lon(b, new Date(t));
    transitLonCache.set(key, v);
  }
  return v;
}

/** UTC instant of 9:30 am New York time on `isoDate` (DST from the time-zone database). */
export function newYorkOpen(isoDate: string): Date {
  const guess = Date.parse(`${isoDate}T14:30:00Z`); // 9:30 EST
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(guess)));
  return new Date(guess - (hour - 9) * 3_600_000);
}

/** The first-trade chart: each body's longitude at 9:30 am New York time. */
export function firstTradeChart(isoDate: string): Record<Natal, number> {
  const t = newYorkOpen(isoDate);
  return Object.fromEntries(NATAL_BODIES.map((b) => [b, lon(b, t)])) as Record<Natal, number>;
}

export interface TransitCombo {
  transit: Transit;
  natal: Natal;
  angle: number;
}

export const comboKey = (c: TransitCombo) => `${c.transit}-${c.angle}-${c.natal}`;

const signed = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Days (UTC day numbers) on which each transit combination is exact, in [from, to]. */
export function transitEvents(chart: Record<Natal, number>, fromMs: number, toMs: number): Map<string, { combo: TransitCombo; days: number[] }> {
  const out = new Map<string, { combo: TransitCombo; days: number[] }>();
  const start = Math.floor(fromMs / DAY) * DAY + DAY / 2;
  for (const transit of TRANSIT_BODIES) {
    let prev = transitLon(transit, start - DAY);
    for (let t = start; t <= toMs; t += DAY) {
      const cur = transitLon(transit, t);
      for (const natal of NATAL_BODIES) {
        for (const { angle } of BUCHOLTZ_ASPECTS) {
          for (const target of angle === 0 || angle === 180 ? [angle] : [angle, -angle]) {
            const d0 = signed(signed(prev, chart[natal]), target);
            const d1 = signed(signed(cur, chart[natal]), target);
            if ((d1 === 0 || Math.sign(d0) !== Math.sign(d1)) && Math.abs(d1 - d0) < 90) {
              const combo = { transit, natal, angle };
              const key = comboKey(combo);
              const e = out.get(key) ?? { combo, days: [] };
              e.days.push(Math.floor(t / DAY));
              out.set(key, e);
            }
          }
        }
      }
      prev = cur;
    }
  }
  return out;
}

const hits = (days: number[], pivotDays: number[]) => days.filter((d) => pivotDays.some((p) => Math.abs(p - d) <= WINDOW_DAYS)).length;

/** Bucholtz's selection, on the training swings only. */
export function selectAspects(events: Map<string, { combo: TransitCombo; days: number[] }>, trainPivotDays: number[], trainEndDay: number): TransitCombo[] {
  const ranked: { combo: TransitCombo; rate: number }[] = [];
  for (const { combo, days } of events.values()) {
    const inTrain = days.filter((d) => d <= trainEndDay);
    if (inTrain.length < MIN_EVENTS) continue;
    ranked.push({ combo, rate: hits(inTrain, trainPivotDays) / inTrain.length });
  }
  ranked.sort((a, b) => b.rate - a.rate || comboKey(a.combo).localeCompare(comboKey(b.combo)));
  return ranked.slice(0, KEEP).map((r) => r.combo);
}

export interface HoldOutScore {
  events: number;
  hits: number;
  /** Share of all hold-out days within the window of a pivot: the rate a random date scores. */
  baseRate: number;
}

/** The kept combinations' hit rate on the hold-out swings, against the share of days near a pivot. */
export function scoreHoldOut(
  events: Map<string, { combo: TransitCombo; days: number[] }>,
  kept: TransitCombo[],
  testPivotDays: number[],
  testStartDay: number,
  testEndDay: number,
): HoldOutScore {
  const keys = new Set(kept.map(comboKey));
  const days = [...events.entries()].filter(([k]) => keys.has(k)).flatMap(([, e]) => e.days.filter((d) => d > testStartDay && d <= testEndDay));
  let near = 0;
  for (let d = testStartDay + 1; d <= testEndDay; d++) if (testPivotDays.some((p) => Math.abs(p - d) <= WINDOW_DAYS)) near++;
  const span = testEndDay - testStartDay;
  return { events: days.length, hits: hits(days, testPivotDays), baseRate: span > 0 ? near / span : 0 };
}

const chartCache = new Map<string, Record<Natal, number>>();
// One stock's transit events by calendar year, so consecutive sessions in the
// replay and the day's scans reuse them.
const yearEventsCache = new Map<string, Map<string, { combo: TransitCombo; days: number[] }>>();

function cachedEvents(firstTrade: string, chart: Record<Natal, number>, fromMs: number, toMs: number) {
  const out = new Map<string, { combo: TransitCombo; days: number[] }>();
  const fromDay = Math.floor(fromMs / DAY);
  const toDay = Math.floor(toMs / DAY);
  for (let y = new Date(fromMs).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) {
    const key = `${firstTrade}:${y}`;
    let year = yearEventsCache.get(key);
    if (!year) {
      year = transitEvents(chart, Date.UTC(y, 0, 1), Date.UTC(y, 11, 31, 12));
      yearEventsCache.set(key, year);
    }
    for (const [k, e] of year) {
      const days = e.days.filter((d) => d >= fromDay && d <= toDay);
      if (days.length === 0) continue;
      const prev = out.get(k);
      if (prev) prev.days.push(...days);
      else out.set(k, { combo: e.combo, days });
    }
  }
  return out;
}

export interface FirstTradeWindow {
  combo: TransitCombo;
  /** YYYY-MM-DD the transit is exact. */
  exact: string;
}

/**
 * The window on a turn's date: Bucholtz's kept transits to the first-trade
 * chart, chosen on the 3-Day Chart swings in `bars` before the turn (`bars`
 * end at the turn), exact within `WINDOW_DAYS` of `date`. Empty without a
 * confirmed first-trade date or with too few swings to choose from.
 */
export function firstTradeWindows(bars: Bar[], date: string, firstTrade: string | null | undefined): FirstTradeWindow[] {
  if (!firstTrade || bars.length < 2) return [];
  let chart = chartCache.get(firstTrade);
  if (!chart) {
    chart = firstTradeChart(firstTrade);
    chartCache.set(firstTrade, chart);
  }
  const day = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / DAY);
  const turnDay = day(date);
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots.map((p) => day(bars[p.index].t)).filter((d) => d < turnDay);
  if (pivots.length < MIN_EVENTS) return [];
  const events = cachedEvents(firstTrade, chart, Date.parse(bars[0].t), (turnDay + WINDOW_DAYS + 1) * DAY);
  const kept = selectAspects(events, pivots, turnDay - 1);
  const out: FirstTradeWindow[] = [];
  for (const c of kept) {
    for (const d of events.get(comboKey(c))?.days ?? []) {
      if (Math.abs(d - turnDay) <= WINDOW_DAYS) out.push({ combo: c, exact: new Date(d * DAY).toISOString().slice(0, 10) });
    }
  }
  return out;
}
