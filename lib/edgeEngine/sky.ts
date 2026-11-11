/**
 * Geocentric longitudes (true ecliptic of date), tabulated once a day at
 * 21:00 UTC (about the New York close), and the sky events the time engine
 * reads: ingresses, stations, exact aspects, eclipses and the Sun's degrees.
 * RESEARCH ONLY. Uses `astronomy-engine`, already a dependency.
 */
import * as A from "astronomy-engine";
import { DAY_MS } from "./calendar";

export type Planet = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto" | "Node";

export const PLANETS: readonly Planet[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Node"];

const BODY: Partial<Record<Planet, A.Body>> = {
  Mercury: A.Body.Mercury, Venus: A.Body.Venus, Mars: A.Body.Mars, Jupiter: A.Body.Jupiter,
  Saturn: A.Body.Saturn, Uranus: A.Body.Uranus, Neptune: A.Body.Neptune, Pluto: A.Body.Pluto,
};

export const norm360 = (x: number): number => ((x % 360) + 360) % 360;

/** Signed shortest difference b - a in (-180, 180]. */
export function angDiff(a: number, b: number): number {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
}

/** Geocentric longitude of a body at an instant (degrees, true ecliptic of date). */
export function longitudeAt(p: Planet, when: Date): number {
  if (p === "Sun") return A.SunPosition(when).elon;
  if (p === "Moon") return A.EclipticGeoMoon(when).lon;
  if (p === "Node") {
    // Mean lunar node (Meeus 47.7): 125.0445479 - 1934.1362891 T.
    const T = (when.getTime() / DAY_MS - 10957.5) / 36525;
    return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
  }
  return A.Ecliptic(A.GeoVector(BODY[p]!, when, true)).elon;
}

/** A daily table of longitudes, built lazily per day range and cached. */
export class SkyTable {
  readonly start: number; // calendar day number of row 0
  readonly lon: Record<Planet, Float64Array>;
  constructor(startDay: number, endDay: number) {
    this.start = startDay;
    const n = endDay - startDay + 1;
    this.lon = Object.fromEntries(PLANETS.map((p) => [p, new Float64Array(n)])) as Record<Planet, Float64Array>;
    for (let i = 0; i < n; i++) {
      const when = new Date((startDay + i) * DAY_MS + 21 * 3600_000);
      for (const p of PLANETS) this.lon[p][i] = longitudeAt(p, when);
    }
  }
  get days(): number {
    return this.lon.Sun.length;
  }
  at(p: Planet, day: number): number {
    const i = day - this.start;
    if (i < 0 || i >= this.days) return longitudeAt(p, new Date(day * DAY_MS + 21 * 3600_000));
    return this.lon[p][i];
  }
  /** Daily motion (degrees/day, signed) on `day`. */
  speed(p: Planet, day: number): number {
    return angDiff(this.at(p, day - 1), this.at(p, day));
  }
  /**
   * Days (after `fromDay`) on which the body's longitude crosses `target`
   * (moving either way), up to `toDay`.
   */
  crossings(p: Planet, target: number, fromDay: number, toDay: number): number[] {
    const out: number[] = [];
    let prev = angDiff(target, this.at(p, fromDay));
    for (let d = fromDay + 1; d <= toDay; d++) {
      const cur = angDiff(target, this.at(p, d));
      // a crossing of the target, not of its opposite point
      if ((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
        if (Math.abs(prev) < 90 && Math.abs(cur) < 90) out.push(Math.abs(cur) <= Math.abs(prev) ? d : d - 1);
      }
      prev = cur;
    }
    return out;
  }
  /** First day after `fromDay` on which the body's cumulative absolute travel reaches `deg`. */
  travelDay(p: Planet, fromDay: number, deg: number, maxDays: number): number | null {
    let acc = 0;
    let prev = this.at(p, fromDay);
    for (let d = fromDay + 1; d <= fromDay + maxDays; d++) {
      const cur = this.at(p, d);
      acc += Math.abs(angDiff(prev, cur));
      if (acc >= deg) return d;
      prev = cur;
    }
    return null;
  }
}

let cached: SkyTable | null = null;

/** Shared table covering 1990-01-01 .. 2032-12-31, built on first use (about a second). */
export function sky(): SkyTable {
  if (!cached) cached = new SkyTable(Math.floor(Date.UTC(1990, 0, 1) / DAY_MS), Math.floor(Date.UTC(2032, 11, 31) / DAY_MS));
  return cached;
}

/** Days on which the Sun's longitude crosses a multiple of `step` degrees (offset `offset`). */
export function sunDegreeDays(step: number, offset: number, fromDay: number, toDay: number): { day: number; deg: number }[] {
  const s = sky();
  const out: { day: number; deg: number }[] = [];
  for (let d = fromDay + 1; d <= toDay; d++) {
    const a = norm360(s.at("Sun", d - 1) - offset);
    const b = norm360(s.at("Sun", d) - offset);
    if (Math.floor(a / step) !== Math.floor(b / step) || b < a) {
      out.push({ day: d, deg: norm360(Math.floor(b / step) * step + offset) });
    }
  }
  return out;
}

/** Sign ingresses (crossing a multiple of 30) of a body. */
export function ingressDays(p: Planet, fromDay: number, toDay: number): number[] {
  const s = sky();
  const out: number[] = [];
  for (let d = fromDay + 1; d <= toDay; d++) {
    if (Math.floor(s.at(p, d - 1) / 30) !== Math.floor(s.at(p, d) / 30)) out.push(d);
  }
  return out;
}

/** Stations: the day the daily motion changes sign. */
export function stationDays(p: Planet, fromDay: number, toDay: number): number[] {
  const s = sky();
  const out: number[] = [];
  let prev = s.speed(p, fromDay);
  for (let d = fromDay + 1; d <= toDay; d++) {
    const cur = s.speed(p, d);
    if (prev !== 0 && Math.sign(cur) !== Math.sign(prev)) out.push(d);
    prev = cur;
  }
  return out;
}

/** Days on which two bodies' separation crosses one of `angles` (0, 90, 180 ...). */
export function aspectDays(a: Planet, b: Planet, angles: number[], fromDay: number, toDay: number): { day: number; angle: number }[] {
  const s = sky();
  const out: { day: number; angle: number }[] = [];
  for (const ang of angles) {
    let prev = angDiff(ang, norm360(s.at(b, fromDay) - s.at(a, fromDay)));
    for (let d = fromDay + 1; d <= toDay; d++) {
      const cur = angDiff(ang, norm360(s.at(b, d) - s.at(a, d)));
      if (((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) && Math.abs(prev) < 90 && Math.abs(cur) < 90) out.push({ day: d, angle: ang });
      prev = cur;
    }
  }
  return out;
}

/** Solar and lunar eclipse days between two days. */
export function eclipseDays(fromDay: number, toDay: number): number[] {
  const out: number[] = [];
  let le = A.SearchLunarEclipse(new Date(fromDay * DAY_MS));
  while (le.peak.date.getTime() / DAY_MS <= toDay) {
    out.push(Math.floor(le.peak.date.getTime() / DAY_MS));
    le = A.NextLunarEclipse(le.peak);
  }
  let se = A.SearchGlobalSolarEclipse(new Date(fromDay * DAY_MS));
  while (se.peak.date.getTime() / DAY_MS <= toDay) {
    out.push(Math.floor(se.peak.date.getTime() / DAY_MS));
    se = A.NextGlobalSolarEclipse(se.peak);
  }
  return out.sort((x, y) => x - y);
}
