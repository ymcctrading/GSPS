/**
 * M-S4, eclipse longitudes: a labelled reconstruction (Chuck, 2026-10-21,
 * "build the 11 that can be filled with a labelled reconstruction"), and it
 * acts (Chuck, 2026-10-22: astrology is "no longer research only ... replicate
 * said methodology into GSPS 1 for 1"): a crossing of a topping eclipse's
 * longitude is a dated window for a top in the shared time-window hold
 * (`timeWindow.ts`, through `eclipseBreakOn`), on the live scan and the replay
 * alike. Like every astro window it counts only on a 3-Day Chart turn, never
 * alone (C-ASTRO-15).
 *
 * The rule (Mikula, *Gann's Scientific Methods Unveiled* Vol. 2, W012 PDF
 * pp. 32-35; Tier B, his decoding, not Gann's text): an eclipse during a
 * topping formation, then a planet crossing the eclipse's longitude, dates
 * the break. His two worked cases, reproduced in the test:
 * - The partial lunar eclipse of Jan 29, 1907, Sun at 8°30' Aquarius
 *   (308.5°). Venus crossed it on Mar 14, 1907, the day of the March 1907
 *   break *Truth of the Stock Tape* discusses.
 * - The penumbral lunar eclipse of May 3, 1901, Sun at 12°36' Taurus
 *   (42.6°). Mikula has Mercury crossing it on May 9, 1901, the day of the
 *   panic. It crossed on the evening of the 9th (UTC), so the noon-UTC rule
 *   below dates it the 10th, a day late.
 * The eclipse's longitude is the Sun's at the peak (the Moon's is opposite on
 * a lunar eclipse), as both of his cases read it.
 *
 * Fixed before any testing (Dewey's standard; nothing here is searched):
 * - Eclipses: every global solar and every lunar eclipse, penumbral
 *   included, from astronomy-engine (the ephemeris `planetaryAverages.ts`
 *   uses), at the peak.
 * - Crossings: geocentric, tropical longitudes of date at noon UTC, the
 *   frame of both his cases. The crossing day is the first noon at or past
 *   the longitude.
 * - Planets: Mercury, Venus and Mars, the fast planets. His cases use
 *   Mercury and Venus; Mars is added because it is the trigger planet in
 *   every other timing rule here (`jensen.ts`, `astroRules.ts`). Engineering
 *   choice, labelled.
 * - Horizon: crossings within `CROSSING_HORIZON_DAYS` (120) of the eclipse,
 *   longer than both of his cases (44 and 6 days). Engineering choice.
 * - A topping formation: the eclipse falls within `TOP_WINDOW_SESSIONS` (10)
 *   sessions of a completed 3-Day Chart swing top. Mikula names a "topping
 *   formation" without a rule; the swing top is Gann's own top. Engineering
 *   choice, labelled.
 *  - The window: a crossing within `CROSSING_ORB_DAYS` (1) of a top's date,
 *   the astro readings' one-day orb in `timeWindow.ts`. A break opens a
 *   decline, so it is read for a top only (Polarity: the bottom has no
 *   mirror in his text, and none is invented).
 * His second rule (an eclipse on a first-trade longitude) needs first-trade
 * charts, which GSPS doesn't hold (C-ASTRO-14), so it is not built.
 *
 * Three-question basis:
 * 1. Gann: none in his own text. Mikula's decoding, Tier B, built because the
 *    owner asked for the labelled reconstructions.
 * 2. Cycles: a dated-event claim with two anecdotes, so it clears no Dewey
 *    item. Its test is `eventDateTest.ts#eventTurnRate` on the crossing dates
 *    against a circular shift.
 * 3. Hermetic: Correspondence, held as a hypothesis.
 */
import { Body, Ecliptic, GeoVector, NextGlobalSolarEclipse, NextLunarEclipse, SearchGlobalSolarEclipse, SearchLunarEclipse, SunPosition } from "astronomy-engine";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import type { Bar } from "@/lib/types";

const DAY = 86_400_000;
export const ECLIPSE_PLANETS = ["Mercury", "Venus", "Mars"] as const;
export type EclipsePlanet = (typeof ECLIPSE_PLANETS)[number];
export const CROSSING_HORIZON_DAYS = 120;
export const TOP_WINDOW_SESSIONS = 10;
export const CROSSING_ORB_DAYS = 1;

export interface Eclipse {
  kind: "solar" | "lunar";
  /** ISO time of the peak. */
  peak: string;
  /** The Sun's tropical longitude at the peak, 0-360°. */
  longitude: number;
}

/** Every global solar and lunar eclipse with a peak in [from, to). */
export function eclipsesBetween(from: Date, to: Date): Eclipse[] {
  const out: Eclipse[] = [];
  for (let e = SearchGlobalSolarEclipse(from); e.peak.date < to; e = NextGlobalSolarEclipse(e.peak)) {
    out.push({ kind: "solar", peak: e.peak.date.toISOString(), longitude: SunPosition(e.peak).elon });
  }
  for (let e = SearchLunarEclipse(from); e.peak.date < to; e = NextLunarEclipse(e.peak)) {
    out.push({ kind: "lunar", peak: e.peak.date.toISOString(), longitude: SunPosition(e.peak).elon });
  }
  return out.sort((a, b) => a.peak.localeCompare(b.peak));
}

const geoLon = (p: EclipsePlanet, t: number) => Ecliptic(GeoVector(Body[p], new Date(t), true)).elon;
const signed = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

export interface EclipseCrossing {
  planet: EclipsePlanet;
  /** UTC day (YYYY-MM-DD) of the first noon at or past the eclipse's longitude. */
  date: string;
}

/** Each fast planet's crossings of the eclipse's longitude within the horizon, retrograde passes included. */
export function eclipseCrossings(e: Eclipse, horizonDays = CROSSING_HORIZON_DAYS): EclipseCrossing[] {
  const peak = Date.parse(e.peak);
  const start = Math.floor(peak / DAY) * DAY + DAY / 2;
  const out: EclipseCrossing[] = [];
  for (const planet of ECLIPSE_PLANETS) {
    let prev = signed(geoLon(planet, start - DAY), e.longitude);
    for (let t = start; t <= start + horizonDays * DAY; t += DAY) {
      const cur = signed(geoLon(planet, t), e.longitude);
      // A sign change near zero is a crossing; one near ±180 is the far side.
      if ((cur === 0 || Math.sign(cur) !== Math.sign(prev)) && Math.abs(cur - prev) < 90 && t >= peak) {
        out.push({ planet, date: new Date(t).toISOString().slice(0, 10) });
      }
      prev = cur;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface EclipseBreakWindow {
  eclipse: Eclipse;
  /** The 3-Day Chart swing top the eclipse fell beside. */
  topDate: string;
  crossings: EclipseCrossing[];
}

/**
 * Eclipses that fell within `TOP_WINDOW_SESSIONS` sessions of a completed
 * 3-Day Chart swing top in `bars`, with the crossings that date the break.
 */
export function eclipseBreakWindows(bars: Bar[]): EclipseBreakWindow[] {
  if (bars.length < 2) return [];
  const tops = walkSwingChart(bars, THREE_DAY_CHART).pivots.filter((s) => s.kind === "top");
  if (tops.length === 0) return [];
  const day = (t: string) => t.slice(0, 10);
  const index = new Map(bars.map((b, i) => [day(b.t), i]));
  const sessionOf = (iso: string) => {
    const t = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
    for (let k = 0; k < 7; k++) {
      const i = index.get(new Date(t + k * DAY).toISOString().slice(0, 10));
      if (i !== undefined) return i;
    }
    return null;
  };
  const eclipses = eclipsesBetween(new Date(bars[0].t), new Date(Date.parse(bars[bars.length - 1].t) + DAY));
  const out: EclipseBreakWindow[] = [];
  for (const e of eclipses) {
    const at = sessionOf(e.peak);
    if (at === null) continue;
    const top = tops.find((s) => Math.abs(s.index - at) <= TOP_WINDOW_SESSIONS);
    if (!top) continue;
    out.push({ eclipse: e, topDate: day(bars[top.index].t), crossings: eclipseCrossings(e) });
  }
  return out;
}

export interface EclipseBreak {
  eclipse: Eclipse;
  crossing: EclipseCrossing;
}

/**
 * The window on a top's date: a fast planet crossing, within
 * `CROSSING_ORB_DAYS`, the longitude of an eclipse that fell within
 * `TOP_WINDOW_SESSIONS` sessions of a 3-Day Chart top in `bars` or of the turn
 * itself (`bars` end at the turn, so only what was known by then is read).
 */
export function eclipseBreakOn(bars: Bar[], date: string): EclipseBreak[] {
  if (bars.length < 2) return [];
  const asOf = Date.parse(`${date}T12:00:00Z`);
  const eclipses = eclipsesBetween(new Date(asOf - (CROSSING_HORIZON_DAYS + 1) * DAY), new Date(asOf + DAY));
  if (eclipses.length === 0) return [];
  const day = (t: string) => t.slice(0, 10);
  const tops = walkSwingChart(bars, THREE_DAY_CHART).pivots.filter((s) => s.kind === "top").map((s) => s.index);
  tops.push(bars.length - 1); // the turn being read
  const sessionAtOrAfter = (iso: string) => {
    const d = day(iso);
    const i = bars.findIndex((b) => day(b.t) >= d);
    return i < 0 ? null : i;
  };
  const out: EclipseBreak[] = [];
  for (const e of eclipses) {
    const at = sessionAtOrAfter(e.peak);
    if (at === null || !tops.some((i) => Math.abs(i - at) <= TOP_WINDOW_SESSIONS)) continue;
    for (const c of eclipseCrossings(e)) {
      if (Math.abs(Date.parse(`${c.date}T12:00:00Z`) - asOf) <= CROSSING_ORB_DAYS * DAY) out.push({ eclipse: e, crossing: c });
    }
  }
  return out;
}
