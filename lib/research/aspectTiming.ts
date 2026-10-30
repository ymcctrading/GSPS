/**
 * Are planetary aspects the undisclosed time factor behind the published
 * calls? Research only: nothing on the verdict path imports this module, and
 * nothing here reaches a member.
 *
 * The question (owner, 2026-10-30, sharing nine videos; the first): the author "predicted
 * the devastating 50% market decline into the July 1932 lows" with "planetary
 * cycles, opposition alignments, and specific conjunctions with trines", and
 * the Sep-Oct 1932 turns with "dual conjunctions, multi-layered trines, and a
 * Grand Cross". A reading fitted to one year after the fact proves little, so
 * the aspects are tested here on every year the record holds, with the rule
 * fixed first.
 *
 * Fixed before any year was scored:
 * - Bodies: the Sun and Mercury to Neptune, geocentric, tropical of date, at
 *   noon UTC (`planetaryAverages.ts`). Pluto is left out: it was found in
 *   1930, after most of the forecasts were issued. The Moon is left out: it
 *   aspects every body every few days, so it would mark nearly every day.
 * - Aspects: the families the videos name: conjunction (0°), square (90°,
 *   the Grand Cross's sides), trine (120°) and opposition (180°).
 * - Event: the day a pair's separation passes the exact angle, ±2 days (the
 *   rebuild test's tolerance, `SEASONAL_TOLERANCE_DAYS`).
 * - Five rules:
 *   - allPairs: every pair of the eight bodies;
 *   - innerPairs: pairs among the Sun, Mercury and Venus (the fifth video,
 *     on the Oct 1922 top, credits these three);
 *   - outerPairs: pairs among Mars, Jupiter, Saturn, Uranus and Neptune;
 *   - slowPairs: pairs among Jupiter, Saturn, Uranus and Neptune;
 *   - clusters: days where two or more outerPairs events fall within ±2 days
 *     of each other ("dual conjunctions", "multi-layered trines").
 *   - symbol: days with at least one grand cross (grand square) and one grand
 *     trine among the eight bodies, within `GRAND_FIGURE_ORB` (the eighth
 *     video's "Gann symbol" of 8 Aug 1908, read as a general rule);
 *   - symbolWide: the same with the Moon and Pluto added, in case the
 *     videos' figures use them.
 *   The rules were set from the videos' descriptions as they arrived (eight
 *   on 2026-10-30), each before it was scored; the videos themselves could
 *   not be fetched from this environment.
 * - Three outcome sets, so 21 tests (Bonferroni 0.05 / 21 ≈ 0.0024):
 *   - the 52 published calls, in their forecast years (the rebuild test's
 *     targets);
 *   - every 9-point turn, 1913-1948, leaving out 1914 (the closure) and the
 *     years the printed record has no 9-point swings for (1921-1922,
 *     1942-1943);
 *   - every 3-day turn, 1913-1948, leaving out 1914.
 * - Null: each year's aspect days shifted round the year by every offset
 *   (keeping their number and clustering), pooled by drawing one shift per
 *   year (`forecastRebuild.ts#scoreYearDays`, the same machinery).
 *
 * Aspects are arithmetic on a published ephemeris, so they were known in
 * advance: there is no look-ahead to guard here, only the choice of rule,
 * which is why it is fixed above.
 *
 * Three-question basis:
 * 1. Source: no book in the collection gives the author's planetary timing
 *    rule (`docs/agents/10-astrology.md`); the aspect families are the
 *    videos' claim, tested as stated. The calls and turns are his own (W036,
 *    W005, W001, W009).
 * 2. Cycles: Dewey's base-rate rule, on a rule fixed before scoring, with no
 *    search over planets or orbs, and a correction for the 21 tests.
 * 3. Hermetic: Correspondence ("as above, so below"), held as the claim under
 *    test, never as evidence.
 */
import { Body, Ecliptic, EclipticGeoMoon, HelioVector } from "astronomy-engine";
import { ephemerisInstant, planetLongitudes } from "@/lib/gann/planetaryAverages";
import { SEASONAL_TOLERANCE_DAYS } from "@/lib/gann/seasonalCounts";
import { DOW_SWINGS, scoreCalls, type TurnSet } from "@/lib/research/forecastTrackRecord";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";

export const ASPECT_BODIES = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"] as const;
export type AspectBody = (typeof ASPECT_BODIES)[number];
export const ASPECT_ANGLES = [0, 90, 120, 180] as const;
export const ASPECT_RULES = ["allPairs", "innerPairs", "outerPairs", "slowPairs", "clusters", "symbol", "symbolWide"] as const;
export type AspectRule = (typeof ASPECT_RULES)[number];
export const ASPECT_TOLERANCE = SEASONAL_TOLERANCE_DAYS;
export const ASPECT_TESTS = ASPECT_RULES.length * 3;

const INNER: readonly AspectBody[] = ["Sun", "Mercury", "Venus"];
const OUTER: readonly AspectBody[] = ["Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
const SLOW: readonly AspectBody[] = ["Jupiter", "Saturn", "Uranus", "Neptune"];

/** Years the 9-point record covers in full. */
export const NINE_POINT_YEARS = [1913, ...range(1915, 1920), ...range(1923, 1941), ...range(1944, 1948)];
/** Years the 3-day record covers in full. */
export const THREE_DAY_YEARS = [1913, ...range(1915, 1948)];

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const DAY = 86_400_000;
const mod = (x: number, m: number) => ((x % m) + m) % m;
const wrap = (d: number) => {
  const x = mod(d, 360);
  return x > 180 ? x - 360 : x;
};
const iso = (dayNo: number) => new Date(dayNo * DAY).toISOString().slice(0, 10);

const lonCache = new Map<number, Record<AspectBody, number>>();
/** Geocentric longitudes of the eight bodies at noon UTC on day `dayNo` (days since 1970-01-01). */
function longitudes(dayNo: number): Record<AspectBody, number> {
  const hit = lonCache.get(dayNo);
  if (hit) return hit;
  const date = new Date(dayNo * DAY);
  const geo = planetLongitudes(date).geo;
  // The Sun seen from the Earth is opposite the Earth seen from the Sun, in the same ecliptic of date.
  const sun = mod(Ecliptic(HelioVector(Body.Earth, ephemerisInstant(date))).elon + 180, 360);
  const out = { Sun: sun, ...geo } as Record<AspectBody, number>;
  lonCache.set(dayNo, out);
  return out;
}

export interface AspectEvent {
  date: string;
  a: AspectBody;
  b: AspectBody;
  angle: (typeof ASPECT_ANGLES)[number];
}

/** True when the signed separation crosses ±angle between two days. Retrograde passes count again. */
function crosses(prev: number, cur: number, angle: number): boolean {
  for (const target of angle === 0 || angle === 180 ? [angle] : [angle, -angle]) {
    const d0 = wrap(prev - target);
    const d1 = wrap(cur - target);
    if (d1 === 0) return true;
    if (d0 !== 0 && Math.sign(d0) !== Math.sign(d1) && Math.abs(d0 - d1) < 90) return true;
  }
  return false;
}

const eventCache = new Map<number, AspectEvent[]>();
/** Every exact aspect among the eight bodies in a calendar year, dated to the first noon past exact. */
export function aspectEvents(year: number): AspectEvent[] {
  const hit = eventCache.get(year);
  if (hit) return hit;
  const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const end = Math.floor(Date.UTC(year + 1, 0, 1) / DAY);
  const out: AspectEvent[] = [];
  let prev = longitudes(start - 1);
  for (let d = start; d < end; d++) {
    const cur = longitudes(d);
    for (let i = 0; i < ASPECT_BODIES.length; i++) {
      for (let j = i + 1; j < ASPECT_BODIES.length; j++) {
        const a = ASPECT_BODIES[i];
        const b = ASPECT_BODIES[j];
        const s0 = wrap(prev[a] - prev[b]);
        const s1 = wrap(cur[a] - cur[b]);
        for (const angle of ASPECT_ANGLES) if (crosses(s0, s1, angle)) out.push({ date: iso(d), a, b, angle });
      }
    }
    prev = cur;
  }
  eventCache.set(year, out);
  return out;
}

const within = (set: readonly AspectBody[], e: AspectEvent) => set.includes(e.a) && set.includes(e.b);

/** The days a rule marks in `year`, as offsets from 1 January, each widened by the tolerance and clipped to the year. */
export function aspectDays(rule: AspectRule, year: number): number[] {
  const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const len = Math.floor(Date.UTC(year + 1, 0, 1) / DAY) - start;
  const all = aspectEvents(year);
  const dayOfEvent = (e: AspectEvent) => Math.floor(Date.parse(`${e.date}T00:00:00Z`) / DAY) - start;
  let centres: number[];
  if (rule === "allPairs") centres = all.map(dayOfEvent);
  else if (rule === "innerPairs") centres = all.filter((e) => within(INNER, e)).map(dayOfEvent);
  else if (rule === "outerPairs") centres = all.filter((e) => within(OUTER, e)).map(dayOfEvent);
  else if (rule === "slowPairs") centres = all.filter((e) => within(SLOW, e)).map(dayOfEvent);
  else if (rule === "symbol" || rule === "symbolWide") {
    centres = [];
    for (let d = 0; d < len; d++) {
      const g = grandFigures(iso(start + d), rule === "symbolWide");
      if (g.trines.length && g.crosses.length) centres.push(d);
    }
  } else {
    // Two or more distinct outer-pair events within ±tolerance: every day of the stretch they span, widened by the tolerance.
    const outer = all.filter((e) => within(OUTER, e)).map(dayOfEvent).sort((x, y) => x - y);
    centres = [];
    for (let i = 0; i + 1 < outer.length; i++) {
      if (outer[i + 1] - outer[i] <= ASPECT_TOLERANCE) for (let d = outer[i]; d <= outer[i + 1]; d++) centres.push(d);
    }
  }
  const out = new Set<number>();
  for (const c of centres) for (let d = c - ASPECT_TOLERANCE; d <= c + ASPECT_TOLERANCE; d++) if (d >= 0 && d < len) out.add(d);
  return [...out].sort((x, y) => x - y);
}

export interface AspectRuleResult {
  rule: AspectRule;
  /** Mean share of each year's days the rule marks. */
  coverage: { calls: number; nine: number; three: number };
  calls: PooledDayScore["calls"];
  nine: PooledDayScore["turns"];
  three: PooledDayScore["turns"];
}

function turnScore(rule: AspectRule, set: TurnSet, years: number[], seed: number): PooledDayScore {
  return scoreYearDays(
    years.map((y) => ({ id: String(y), days: aspectDays(rule, y), targets: yearTargets(y, [], DOW_SWINGS[set]) })),
    seed,
  );
}

const meanCoverage = (s: PooledDayScore) => s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length;

export function aspectRule(rule: AspectRule, seed = 20261030): AspectRuleResult {
  const callScore = scoreYearDays(
    PUBLISHED_FORECASTS.map((f) => ({
      id: f.id,
      days: aspectDays(rule, Number(f.id)),
      targets: yearTargets(Number(f.id), f.windows, DOW_SWINGS.nine),
    })),
    seed,
  );
  const nine = turnScore(rule, "nine", NINE_POINT_YEARS, seed);
  const three = turnScore(rule, "three", THREE_DAY_YEARS, seed);
  return {
    rule,
    coverage: { calls: meanCoverage(callScore), nine: meanCoverage(nine), three: meanCoverage(three) },
    calls: callScore.calls,
    nine: nine.turns,
    three: three.turns,
  };
}

export function aspectTimingAll(): AspectRuleResult[] {
  return ASPECT_RULES.map((r) => aspectRule(r));
}

/** The exact aspects within `days` of a date, for reading a single turn (the videos' 1932 examples). */
export function aspectsNear(date: string, days = ASPECT_TOLERANCE): AspectEvent[] {
  const t = Date.parse(`${date}T00:00:00Z`);
  const y = new Date(t).getUTCFullYear();
  return [...aspectEvents(y - 1), ...aspectEvents(y), ...aspectEvents(y + 1)].filter(
    (e) => Math.abs(Date.parse(`${e.date}T00:00:00Z`) - t) <= days * DAY,
  );
}

export interface CallAspectMatch {
  forecast: string;
  label: string;
  aspects: AspectEvent[];
  /** The call caught a 9-point turn of its kind (`forecastTrackRecord.ts#scoreCalls`). */
  hit: boolean;
}

/**
 * The published calls a rule's aspect days meet, each with whether the call
 * caught a turn. Separates "he set dates on aspects" from "dates set on
 * aspects caught the turns".
 */
export function callAspectMatches(rule: AspectRule): CallAspectMatch[] {
  const out: CallAspectMatch[] = [];
  for (const f of PUBLISHED_FORECASTS) {
    const year = Number(f.id);
    const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
    const days = new Set(aspectDays(rule, year));
    const scored = scoreCalls(f.windows, "nine").calls;
    f.windows.forEach((w, i) => {
      const lo = Math.floor(Date.parse(`${w.from}T00:00:00Z`) / DAY) - start;
      const hi = Math.floor(Date.parse(`${w.to}T00:00:00Z`) / DAY) - start;
      let met = false;
      for (let d = lo; d <= hi && !met; d++) met = days.has(d);
      if (!met) return;
      const aspects = aspectEvents(year).filter((e) => {
        const d = Math.floor(Date.parse(`${e.date}T00:00:00Z`) / DAY) - start;
        return ruleHas(rule, e) && d >= lo - ASPECT_TOLERANCE && d <= hi + ASPECT_TOLERANCE;
      });
      out.push({ forecast: f.id, label: w.label, aspects, hit: scored[i].hit });
    });
  }
  return out;
}

function ruleHas(rule: AspectRule, e: AspectEvent): boolean {
  if (rule === "symbol" || rule === "symbolWide") return false;
  if (rule === "allPairs") return true;
  if (rule === "innerPairs") return within(INNER, e);
  if (rule === "slowPairs") return within(SLOW, e);
  return within(OUTER, e);
}

/**
 * Orb for the grand figures, an engineering choice fixed before reading any
 * day: 8°, the usual orb for a major aspect in the astrological almanacs.
 */
export const GRAND_FIGURE_ORB = 8;

type FigureBody = AspectBody | "Moon" | "Pluto";

export interface GrandFigures {
  /** Sets of three bodies, each pair within the orb of a trine. */
  trines: FigureBody[][];
  /** Sets of four bodies forming two oppositions whose ends are square to each other. */
  crosses: FigureBody[][];
}

const near = (sep: number, angle: number) => Math.abs(sep - angle) <= GRAND_FIGURE_ORB;

/** The grand trines and grand crosses (grand squares) on a day at noon UTC, among the eight bodies, or ten with the Moon and Pluto. */
export function grandFigures(date: string, withMoonAndPluto = false): GrandFigures {
  const dayNo = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
  const lon: Record<string, number> = { ...longitudes(dayNo) };
  const B: FigureBody[] = [...ASPECT_BODIES];
  if (withMoonAndPluto) {
    const t = ephemerisInstant(new Date(dayNo * DAY));
    lon.Moon = EclipticGeoMoon(t).lon;
    lon.Pluto = planetLongitudes(t).geo.Pluto;
    B.push("Moon", "Pluto");
  }
  const sep = (a: FigureBody, b: FigureBody) => Math.abs(wrap(lon[a] - lon[b]));
  const trines: FigureBody[][] = [];
  const crosses: FigureBody[][] = [];
  for (let i = 0; i < B.length; i++)
    for (let j = i + 1; j < B.length; j++)
      for (let k = j + 1; k < B.length; k++)
        if (near(sep(B[i], B[j]), 120) && near(sep(B[j], B[k]), 120) && near(sep(B[i], B[k]), 120)) trines.push([B[i], B[j], B[k]]);
  const opps: [FigureBody, FigureBody][] = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (near(sep(B[i], B[j]), 180)) opps.push([B[i], B[j]]);
  for (let i = 0; i < opps.length; i++)
    for (let j = i + 1; j < opps.length; j++) {
      const [a, b] = opps[i];
      const [c, d] = opps[j];
      if (new Set([a, b, c, d]).size < 4) continue;
      if (near(sep(a, c), 90) && near(sep(a, d), 90)) crosses.push([a, b, c, d]);
    }
  return { trines, crosses };
}

/** Share of days from `from` to `to` (inclusive) with at least `minTrines` grand trines and `minCrosses` grand crosses. */
export function grandFigureRate(
  from: string,
  to: string,
  minTrines: number,
  minCrosses: number,
  withMoonAndPluto = false,
): { days: number; matching: number; share: number } {
  const a = Math.floor(Date.parse(`${from}T00:00:00Z`) / DAY);
  const b = Math.floor(Date.parse(`${to}T00:00:00Z`) / DAY);
  let matching = 0;
  for (let d = a; d <= b; d++) {
    const g = grandFigures(iso(d), withMoonAndPluto);
    if (g.trines.length >= minTrines && g.crosses.length >= minCrosses) matching++;
  }
  return { days: b - a + 1, matching, share: matching / (b - a + 1) };
}
