/**
 * Gann's planetary averages as time and price resistance, including the COE
 * average and the MOF formula. Built 2026-09-30 on the project owner's
 * direction ("The CE average as well as the MOF formula should be
 * implemented ... the algorithmic/equations/methodology need to be embedded
 * throughout the platform"; see AGENTS.md "Astrology"). Source note:
 * `docs/memory-bank/sources/A12_master_calculator_1953_and_1954_letter.md`.
 *
 * **What Gann wrote (Tier A, his letter to students of March 20, 1954, the
 * same date as the coffee letter A2.3):**
 * - The average of the six major planets (Mars to Pluto), heliocentric and
 *   geocentric, gives "the most powerful points for time and price
 *   resistance".
 * - The heliocentric and geocentric average of the five major planets with
 *   Mars left out is "of great importance and should be watched".
 * - Also calculate the averages of the eight planets that move around the
 *   Sun: "the first most important odd square" (the centre and the eight
 *   around it make 9, the square of 3).
 * - Students who kept the rules secret would later receive "the very
 *   important COE AVERAGE, and the MOF FORMULA". (Our earlier notes read
 *   this as "CE"; the letter says COE.)
 *
 * **What COE and MOF are (Tier B, and consistent with the letter).** The
 * letter names them but does not define them. Myles Wilson Walker ("WD
 * Gann's Letters to Students Explained", Part 3, 2004) gives MOF as the mean
 * of Jupiter, Saturn, Uranus, Neptune and Pluto (the five with Mars left
 * out), and COE as the mean of the eight, Mercury to Pluto. Ganntrader 3.0
 * labels its charts "MOF, Mean of Five" and "Circle of Eight". Both match the
 * letter's own paragraphs, which is why they are used here; the decoding of
 * the two acronyms remains secondary. Walker adds the heliocentric average of
 * Jupiter, Saturn, Uranus and Neptune, kept here as context only (Tier B
 * alone).
 *
 * **From an average to a price.** Walker: the average of 90° and 180° is 135
 * "degrees, cents or dollars"; the coffee letter reads one point as one
 * degree. So each average is read as price, adding whole circles of 360.
 * An average of N longitudes is only defined to within 360/N (moving one
 * planet through 0° shifts the mean by 360/N), so the resistance points are
 * the whole family A + k × 360/N: every 60° for the six, 72° for the five,
 * 45° for the eight. Ganntrader draws exactly these spacings ("Geo 60 deg
 * Average of 6", "Geo 72 deg MOF", "Geo 45 deg ... Circle of Eight"). This
 * also settles the open question of how to treat the 360° wrap (master
 * report AS1): the family is the same however the wrap is handled, so there
 * is nothing to choose.
 *
 * Rules fixed in advance, so nothing is searched (Dewey; master report AS1):
 * - Longitudes are tropical, of date (the ephemeris convention Gann used),
 *   from astronomy-engine (MIT, VSOP87 and a Pluto model), at 12:00 UTC on
 *   the session's date. Checked against the 1954 letter (heliocentric Uranus
 *   111.87°) and Gann's 1948 soy bean chart (Jupiter conjunct Mars on Dec 1).
 * - Geocentric sets leave out the Sun and Moon; heliocentric sets leave out
 *   the Earth (Walker's lists).
 * - One price unit, the Gann point (`pointScale.ts#gannPointForBars`), a
 *   point to a degree. No other scale is tried. Gann's own letters try
 *   several scales at once (1, 12, 30 and 45 points a degree), and that is
 *   the multiple-comparisons pattern the master report excludes.
 * - "On" an average means within 1¼ points, the tolerance of the circle
 *   reading (`circleOf360.ts`).
 *
 * Three-question basis:
 * 1. Gann: Tier A for the averages and their role; Tier B for the names COE
 *    and MOF, as above.
 * 2. Cycles: an external-forcing claim. By Dewey's diagnostic an external
 *    cycle should keep its phase through shocks (criteria 5 and 6); none of
 *    his 18 criteria has been tested for these averages. They enter as
 *    levels and measured factors so the replay can test them against the
 *    base rate; the owner's direction is to have them act, and measurement
 *    decides what stays.
 * 3. Hermetic: Correspondence ("as above, so below") is the premise, stated
 *    by Gann himself; recorded as his belief, not as evidence. The odd-square
 *    reading of the eight is Gann's Square of Nine geometry (1 + 8 = 9).
 */

import { Body, Ecliptic, GeoVector, HelioVector } from "astronomy-engine";
import { CIRCLE_TOLERANCE } from "@/lib/gann/circleOf360";

export type Planet = "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto";
export type Frame = "helio" | "geo";
export type AverageId = "six-helio" | "six-geo" | "mof-helio" | "mof-geo" | "coe-helio" | "coe-geo" | "four-helio";

export interface AverageSpec {
  id: AverageId;
  name: string;
  /** Short label for tiles and trace lines. */
  short: string;
  frame: Frame;
  planets: Planet[];
  /** A: the average is in Gann's letter. B: only in a secondary source. */
  tier: "A" | "B";
  /** Whether its resistance points join the scan's support and resistance list. */
  inLevels: boolean;
}

const SIX: Planet[] = ["Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const FIVE: Planet[] = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const EIGHT: Planet[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

export const PLANETARY_AVERAGES: AverageSpec[] = [
  { id: "six-helio", short: "Six helio", name: "Six major planets, heliocentric", frame: "helio", planets: SIX, tier: "A", inLevels: true },
  { id: "six-geo", short: "Six geo", name: "Six major planets, geocentric", frame: "geo", planets: SIX, tier: "A", inLevels: true },
  { id: "mof-helio", short: "MOF helio", name: "MOF (mean of five, Mars left out), heliocentric", frame: "helio", planets: FIVE, tier: "A", inLevels: true },
  { id: "mof-geo", short: "MOF geo", name: "MOF (mean of five, Mars left out), geocentric", frame: "geo", planets: FIVE, tier: "A", inLevels: true },
  { id: "coe-helio", short: "COE helio", name: "COE (circle of eight), heliocentric", frame: "helio", planets: EIGHT, tier: "A", inLevels: true },
  { id: "coe-geo", short: "COE geo", name: "COE (circle of eight), geocentric", frame: "geo", planets: EIGHT, tier: "A", inLevels: true },
  {
    id: "four-helio",
    short: "Four helio",
    name: "Jupiter, Saturn, Uranus and Neptune, heliocentric",
    frame: "helio",
    planets: ["Jupiter", "Saturn", "Uranus", "Neptune"],
    tier: "B",
    inLevels: false,
  },
];

const BODY: Record<Planet, Body> = {
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
  Pluto: Body.Pluto,
};

const ALL_PLANETS = EIGHT;

/** Noon UTC on the date's UTC day: the time of day ephemeris tables are printed for. */
export function ephemerisInstant(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

const cache = new Map<string, Record<Frame, Record<Planet, number>>>();
const CACHE_LIMIT = 20_000;

/** Tropical ecliptic longitudes of date, 0–360°, for Mercury to Pluto, heliocentric and geocentric. */
export function planetLongitudes(date: Date): Record<Frame, Record<Planet, number>> {
  const t = ephemerisInstant(date);
  const key = t.toISOString().slice(0, 10);
  const hit = cache.get(key);
  if (hit) return hit;
  const helio = {} as Record<Planet, number>;
  const geo = {} as Record<Planet, number>;
  for (const p of ALL_PLANETS) {
    helio[p] = Ecliptic(HelioVector(BODY[p], t)).elon;
    geo[p] = Ecliptic(GeoVector(BODY[p], t, true)).elon;
  }
  const out = { helio, geo };
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, out);
  return out;
}

/** The arithmetic mean of the longitudes, and the spacing of its resistance points (360/N). */
export function meanAndStep(longitudes: number[]): { mean: number; step: number } {
  const n = longitudes.length;
  const mean = longitudes.reduce((s, x) => s + x, 0) / n;
  return { mean: ((mean % 360) + 360) % 360, step: 360 / n };
}

/** The resistance points of a mean in one circle: A + k × 360/N, from 0 up to 360. */
export function familyDegrees(mean: number, step: number): number[] {
  const base = ((mean % step) + step) % step;
  const out: number[] = [];
  for (let d = base; d < 360 - 1e-9; d += step) out.push(d);
  return out;
}

export interface AverageReading {
  id: AverageId;
  name: string;
  short: string;
  tier: "A" | "B";
  /** The average longitude, 0–360°. */
  degree: number;
  /** Degrees between its resistance points (60, 72 or 45). */
  step: number;
  /** Nearest resistance points, in dollars, and the distance to the nearer one in points. */
  below: number | null;
  above: number;
  distancePoints: number;
  /** Price within 1¼ points of one of its resistance points. */
  on: boolean;
}

export function averageDegree(spec: AverageSpec, date: Date): { degree: number; step: number } {
  const lon = planetLongitudes(date)[spec.frame];
  const { mean, step } = meanAndStep(spec.planets.map((p) => lon[p]));
  return { degree: mean, step };
}

/** The average's resistance points nearest to price, in dollars. `unit` is the Gann point. */
export function readAverage(spec: AverageSpec, date: Date, price: number, unit: number): AverageReading | null {
  if (!(price > 0) || !(unit > 0)) return null;
  const { degree, step } = averageDegree(spec, date);
  const base = ((degree % step) + step) % step;
  const points = price / unit;
  const j = Math.floor((points - base) / step);
  const belowPts = base + j * step;
  const abovePts = belowPts + step;
  const below = belowPts >= 0 ? belowPts * unit : null;
  const distancePoints = Math.min(points - belowPts, abovePts - points);
  return {
    id: spec.id,
    name: spec.name,
    short: spec.short,
    tier: spec.tier,
    degree,
    step,
    below,
    above: abovePts * unit,
    distancePoints,
    on: distancePoints <= CIRCLE_TOLERANCE,
  };
}

export interface PlanetaryReading {
  date: string;
  unit: number;
  averages: AverageReading[];
}

export function readPlanetaryAverages(date: Date, price: number, unit: number): PlanetaryReading | null {
  if (!(price > 0) || !(unit > 0)) return null;
  const averages = PLANETARY_AVERAGES.map((s) => readAverage(s, date, price, unit)).filter(
    (r): r is AverageReading => r !== null,
  );
  return { date: ephemerisInstant(date).toISOString().slice(0, 10), unit, averages };
}

/**
 * The resistance points that join the scan's support and resistance list:
 * for each Tier A average, the nearest point above and below price.
 */
export function planetaryLevels(date: Date, price: number, unit: number): { price: number; label: string }[] {
  const out: { price: number; label: string }[] = [];
  for (const spec of PLANETARY_AVERAGES) {
    if (!spec.inLevels) continue;
    const r = readAverage(spec, date, price, unit);
    if (!r) continue;
    if (r.below !== null && r.below > 0) out.push({ price: r.below, label: spec.name });
    out.push({ price: r.above, label: spec.name });
  }
  return out;
}

/** Plain-language lines for the explanation trace. */
export function describePlanetaryAverages(r: PlanetaryReading): string[] {
  const lines = [
    `Planetary averages for ${r.date} (1954 letter; 1 point = ${r.unit.toFixed(2)} = 1°): ${r.averages
      .filter((a) => a.tier === "A")
      .map((a) => `${a.short} ${a.degree.toFixed(1)}°`)
      .join("; ")}.`,
  ];
  for (const a of r.averages) {
    if (a.on) {
      lines.push(`Price is on the ${a.name} (within ${a.distancePoints.toFixed(2)} points), a time and price resistance point.`);
    }
  }
  return lines;
}
