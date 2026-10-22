/**
 * C-ASTRO-09, the first-trade chart (Bucholtz, *The Bull, the Bear and the
 * Planets*, W013 pp. 96-99, 103). A labelled reconstruction, research only:
 * no criterion, gate, plan, entry or order reads this (CYC-41).
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
 * - GSPS holds an inception date per symbol (Wikidata), which is often the
 *   founding, not the first trade. A true first-trade date has to be supplied
 *   by the caller; the inception date is not a stand-in.
 *
 * Why it does not act (2026-10-22, when Chuck moved the astrology from research
 * to acting): it needs a true first-trade date per symbol, which GSPS does not
 * hold, and Bucholtz's method is his own, not Gann's. It acts once those dates
 * are held and the hold-out beats its base rate.
 *
 * Three-question basis:
 * 1. Gann: none. Bucholtz, Tier C, not sourced to Gann.
 * 2. Cycles: a recurrence claim judged on Dewey's persistence-after-discovery
 *    item, which the hold-out is.
 * 3. Hermetic: Correspondence (the birth chart as the stock's own heaven),
 *    held as a hypothesis.
 */
import { Body, Ecliptic, GeoVector } from "astronomy-engine";
import { BUCHOLTZ_ASPECTS } from "@/lib/research/aspects";

const DAY = 86_400_000;
export const NATAL_BODIES = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;
export const TRANSIT_BODIES = ["Mars", "Jupiter", "Saturn", "Uranus"] as const;
export const WINDOW_DAYS = 3;
export const KEEP = 5;
export const MIN_EVENTS = 3;

type Natal = (typeof NATAL_BODIES)[number];
type Transit = (typeof TRANSIT_BODIES)[number];

const lon = (b: Natal | Transit, t: Date) => Ecliptic(GeoVector(Body[b], t, true)).elon;

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
    let prev = lon(transit, new Date(start - DAY));
    for (let t = start; t <= toMs; t += DAY) {
      const cur = lon(transit, new Date(t));
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
