/**
 * The public astronomical event calendar sold as Gann "time" indicators,
 * tested on the author's own record. Research only: nothing on the verdict
 * path imports this module, and nothing here reaches a member.
 *
 * The question (owner, 2026-10-30): a paid charting indicator claims "Gann's
 * Laws of Vibration and Bayer's Rules" and marks New and Full Moons, ingresses,
 * retrogrades, Mercury's speed, declination extremes, latitude, and apogee and
 * perigee as the dates "that historically drive market pivots". Those event
 * kinds are public astronomy, so each is tested here with the aspect test's
 * machinery (`aspectTiming.ts`). Bayer's numbered rules are not: no Bayer
 * book is in the collection, so they are not built, and the indicator itself
 * was not bought or read.
 *
 * Fixed before any year was scored:
 * - Bodies: the Sun and Mercury to Neptune, geocentric, at noon UTC, plus the
 *   Moon where an event is the Moon's. Pluto left out (found 1930).
 * - Eight rules, one per event kind the indicator lists:
 *   - lunations: New and Full Moons (`lunarTest.ts`);
 *   - lunarApsides: the Moon's perigee and apogee;
 *   - moonDeclination: the Moon's greatest north and south declination;
 *   - ingresses: a body entering a new sign (a multiple of 30° of longitude);
 *   - stations: a planet turning retrograde or direct (Mercury to Neptune);
 *   - mercurySpeed: Mercury at its fastest (the daily motion's peak);
 *   - declination: a body's greatest north or south declination (Sun to
 *     Neptune);
 *   - latitude: a planet crossing the ecliptic (geocentric latitude through
 *     zero, Mercury to Neptune).
 * - Tolerance: ±1 day for the Moon's events (the lunar test's window; the
 *   Moon moves 13° a day), ±2 days for the rest (the aspect test's).
 * - Outcomes and null as in `aspectTiming.ts`: the 52 published calls, every
 *   9-point turn and every 3-day turn 1913-1948, each year's event days
 *   shifted round the year. 24 tests here, 45 with the aspect test's 21, so a
 *   result needs p below 0.05 / 45 ≈ 0.0011.
 *
 * Three-question basis:
 * 1. Source: none in the author's books for these event kinds; the claim is
 *    the indicator's, tested as stated.
 * 2. Cycles: Dewey's base-rate rule on rules fixed before scoring, with the
 *    correction across the whole batch.
 * 3. Hermetic: Rhythm and Correspondence, held as the claim under test.
 */
import { Body, Ecliptic, EquatorFromVector, GeoVector, NextLunarApsis, SearchLunarApsis } from "astronomy-engine";
import { DOW_SWINGS } from "@/lib/research/forecastTrackRecord";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";
import { newAndFullMoons } from "@/lib/research/lunarTest";
import { NINE_POINT_YEARS, THREE_DAY_YEARS } from "@/lib/research/aspectTiming";

export const CELESTIAL_RULES = [
  "lunations",
  "lunarApsides",
  "moonDeclination",
  "ingresses",
  "stations",
  "mercurySpeed",
  "declination",
  "latitude",
] as const;
export type CelestialRule = (typeof CELESTIAL_RULES)[number];
export const CELESTIAL_TESTS = CELESTIAL_RULES.length * 3;
/** Tests in the whole planetary batch: these and `aspectTiming.ts`'s 21. */
export const BATCH_TESTS = CELESTIAL_TESTS + 21;

const MOON_RULES: readonly CelestialRule[] = ["lunations", "lunarApsides", "moonDeclination"];
export const toleranceFor = (rule: CelestialRule) => (MOON_RULES.includes(rule) ? 1 : 2);

const PLANETS = [Body.Mercury, Body.Venus, Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune] as const;
const WITH_SUN = [Body.Sun, ...PLANETS] as const;

const DAY = 86_400_000;
const noon = (dayNo: number) => new Date(dayNo * DAY + DAY / 2);
const mod = (x: number, m: number) => ((x % m) + m) % m;
const wrap = (d: number) => {
  const x = mod(d, 360);
  return x > 180 ? x - 360 : x;
};

interface BodyDay {
  lon: number;
  lat: number;
  dec: number;
}

const dayCache = new Map<string, BodyDay>();
/** A body's geocentric ecliptic longitude and latitude (of date) and declination at noon UTC. */
function bodyDay(body: Body, dayNo: number): BodyDay {
  const key = `${body}:${dayNo}`;
  const hit = dayCache.get(key);
  if (hit) return hit;
  const vec = GeoVector(body, noon(dayNo), true);
  const ecl = Ecliptic(vec);
  const v = { lon: ecl.elon, lat: ecl.elat, dec: EquatorFromVector(vec).dec };
  if (dayCache.size > 400_000) dayCache.clear();
  dayCache.set(key, v);
  return v;
}

/** Days (offsets from 1 January) in `year` where a daily series has a local extreme (max or min). */
function extremes(series: (dayNo: number) => number, start: number, end: number, which: "both" | "max" = "both"): number[] {
  const out: number[] = [];
  for (let d = start; d < end; d++) {
    const a = series(d - 1);
    const b = series(d);
    const c = series(d + 1);
    if ((b > a && b >= c) || (which === "both" && b < a && b <= c)) out.push(d - start);
  }
  return out;
}

/** Days in `year` where a daily series changes sign (the first day on the new side). */
function signChanges(series: (dayNo: number) => number, start: number, end: number): number[] {
  const out: number[] = [];
  for (let d = start; d < end; d++) {
    const a = series(d - 1);
    const b = series(d);
    if (a !== 0 && Math.sign(a) !== Math.sign(b)) out.push(d - start);
  }
  return out;
}

const eventCache = new Map<string, number[]>();
/** The event days a rule marks in `year`, as offsets from 1 January, before the tolerance. */
export function celestialEventDays(rule: CelestialRule, year: number): number[] {
  const key = `${rule}:${year}`;
  const hit = eventCache.get(key);
  if (hit) return hit;
  const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const end = Math.floor(Date.UTC(year + 1, 0, 1) / DAY);
  const speed = (b: Body) => (d: number) => wrap(bodyDay(b, d + 1).lon - bodyDay(b, d).lon);
  let out: number[] = [];
  switch (rule) {
    case "lunations":
      out = newAndFullMoons(start * DAY, end * DAY).map((m) => Math.round(m.at / DAY) - start);
      break;
    case "lunarApsides": {
      let a = SearchLunarApsis(new Date(start * DAY));
      while (a.time.date.getTime() < end * DAY) {
        out.push(Math.floor(a.time.date.getTime() / DAY) - start);
        a = NextLunarApsis(a);
      }
      break;
    }
    case "moonDeclination":
      out = extremes((d) => bodyDay(Body.Moon, d).dec, start, end);
      break;
    case "ingresses":
      for (const b of WITH_SUN) {
        for (let d = start; d < end; d++) {
          if (Math.floor(bodyDay(b, d - 1).lon / 30) !== Math.floor(bodyDay(b, d).lon / 30)) out.push(d - start);
        }
      }
      break;
    case "stations":
      for (const b of PLANETS) out.push(...signChanges(speed(b), start, end));
      break;
    case "mercurySpeed":
      out = extremes(speed(Body.Mercury), start, end, "max");
      break;
    case "declination":
      for (const b of WITH_SUN) out.push(...extremes((d) => bodyDay(b, d).dec, start, end));
      break;
    case "latitude":
      for (const b of PLANETS) out.push(...signChanges((d) => bodyDay(b, d).lat, start, end));
      break;
  }
  out = [...new Set(out.filter((d) => d >= 0 && d < end - start))].sort((x, y) => x - y);
  eventCache.set(key, out);
  return out;
}

/** The rule's event days widened by its tolerance and clipped to the year. */
export function celestialDays(rule: CelestialRule, year: number): number[] {
  const len = Math.floor(Date.UTC(year + 1, 0, 1) / DAY) - Math.floor(Date.UTC(year, 0, 1) / DAY);
  const tol = toleranceFor(rule);
  const out = new Set<number>();
  for (const c of celestialEventDays(rule, year)) for (let d = c - tol; d <= c + tol; d++) if (d >= 0 && d < len) out.add(d);
  return [...out].sort((x, y) => x - y);
}

export interface CelestialRuleResult {
  rule: CelestialRule;
  coverage: number;
  calls: PooledDayScore["calls"];
  nine: PooledDayScore["turns"];
  three: PooledDayScore["turns"];
}

export function celestialRule(rule: CelestialRule, seed = 20261030): CelestialRuleResult {
  const calls = scoreYearDays(
    PUBLISHED_FORECASTS.map((f) => ({
      id: f.id,
      days: celestialDays(rule, Number(f.id)),
      targets: yearTargets(Number(f.id), f.windows, DOW_SWINGS.nine),
    })),
    seed,
  );
  const turns = (set: "nine" | "three", years: number[]) =>
    scoreYearDays(
      years.map((y) => ({ id: String(y), days: celestialDays(rule, y), targets: yearTargets(y, [], DOW_SWINGS[set]) })),
      seed,
    );
  const nine = turns("nine", NINE_POINT_YEARS);
  const three = turns("three", THREE_DAY_YEARS);
  return {
    rule,
    coverage: nine.years.reduce((a, y) => a + y.coverage, 0) / nine.years.length,
    calls: calls.calls,
    nine: nine.turns,
    three: three.turns,
  };
}

export function celestialAll(): CelestialRuleResult[] {
  return CELESTIAL_RULES.map((r) => celestialRule(r));
}
