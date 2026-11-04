/**
 * The timing formula in Myles Wilson Walker's *Super Timing* (1999, the
 * author's astrological method as Walker reads it), tested on the author's own record and on
 * today's market. Research only: nothing on the verdict path imports this
 * module, and nothing here reaches a member.
 *
 * The owner (2026-10-30) asked that the book be read in full and its timing
 * rules scored the same way as the rest of the batch. Read from the scanned
 * book (186 pages). Its formula, in its own words (p.149): "A trine must be
 * present: the trine will either have a conjunction at one end, or the trine
 * can be linked by a square, or an opposition to another conjunction (1
 * planet is part of both the square and the trine) but a conjunction does not
 * have to be present if most aspects are balanced ie. the degree of
 * separation of the aspects is the same." Elsewhere: aspects "balanced by 5*"
 * (pp.73-76); "The Moon is often the crucial part of Gann's trades because it
 * acts as the timer" (p.159), with "a one degree separation of aspects on a
 * fast moving body like the Moon ... insignificant"; "Planetary Ingress was a
 * potential trigger for trend change", Jupiter's above all, and "things
 * usually don't get moving until the planet changes to 1 degree of a new
 * sign" (p.81); and when a planet retrogrades, "each time Jupiter returned to
 * the same degree that it was at when the dollar made its first low there
 * would be a cycle low" (p.127, the "once only cycle", p.123). The book's
 * price methods (the hexagon chart, the "1908" targets) are price, not time,
 * and are not tested here. Its "clock" sequence (the next planet in line
 * features in the next turn, pp.160) it calls "an idea worth looking at
 * further" and gives no fixed rule for, so it is not built.
 *
 * The book's examples are fitted after the fact (a handful of trades, each
 * read once). So the rules were fixed here, before any year was scored:
 * - Bodies: the Sun, the Moon, Mercury to Pluto, geocentric, tropical of date,
 *   at noon UTC. Pluto is kept: the book uses it, 1926-27 included.
 * - Orb: 5° (the book's "balanced by 5*"); 7° for the Moon (its 8 Sep 1927
 *   example reads the Moon at 4° to 7°, p.160). Balanced means two aspects'
 *   orbs within 1° of each other (p.159), 2° when the Moon is one of them
 *   (the same page calls 1° on the Moon "insignificant"; 2° is this
 *   module's reading of that, an engineering choice). Checked against the
 *   book's own dates before scoring: the figure is found on 4 Dec 1926
 *   (Mercury trine Uranus, Saturn conjunct) and 8 Sep 1927 (Mars opposite
 *   the Jupiter-Uranus conjunction, trine Saturn), as the book reads them.
 * - Four rules:
 *   - figure: a trine between two bodies (Sun to Pluto, no Moon), and a third
 *     body either conjunct one end of it, or square or opposite one end with
 *     its orb balanced against the trine's;
 *   - figureMoon: a figure, and the Moon trine any body and square or
 *     opposite one of the figure's, its two orbs balanced (the Moon as the
 *     timer: on 8 Sep 1927 the book reads the Moon trine the Sun, square
 *     Uranus, "creating another Gann set-up to the Uranus Jupiter");
 *   - jupiterIngress: from Jupiter entering a sign (retrograde re-entries
 *     included) to the day it leaves the sign's first degree, ±2 days (the
 *     batch's tolerance);
 *   - jupiterReturn: days Jupiter stands within 0.5° of where it stood on a
 *     known turn (one of the last 12 dated at least 10 days earlier, as in
 *     `combinationTest.ts`), at least 60 days after that turn, so only a
 *     return on a retrograde loop counts, not the weeks just after the turn.
 * - Outcomes, as in `aspectTiming.ts` and `modernTiming.ts`: the 52 published
 *   calls; every 9-point and every 3-day Dow turn 1913-1948; SPY and DIA
 *   2016-2025 (3-Day Chart and major turns). 7 outcome sets × 4 rules = 28
 *   tests, so a result needs p below 0.05 / 28 ≈ 0.0018.
 * - Null: each year's marked days shifted round the year
 *   (`forecastRebuild.ts#scoreYearDays`). For jupiterReturn the shift also
 *   moves the days off the turns they count from, which favours finding
 *   something, so a pass there would be checked again before being believed.
 *
 * Three-question basis:
 * 1. Source: Walker's reading of the author's trades (a secondary source,
 *    not the author's own text); the author's own books in the collection
 *    give no planetary timing rule (`docs/agents/10-astrology.md`).
 * 2. Cycles: Dewey's base-rate rule and out-of-sample persistence: the book's
 *    examples are its sample, and every year here is out of it.
 * 3. Hermetic: Correspondence (as above, so below), held as the claim under
 *    test.
 */
import { Body, Ecliptic, EclipticGeoMoon, HelioVector } from "astronomy-engine";
import { ephemerisInstant, planetLongitudes } from "@/lib/gann/planetaryAverages";
import { SEASONAL_TOLERANCE_DAYS } from "@/lib/gann/seasonalCounts";
import { NINE_POINT_YEARS, THREE_DAY_YEARS } from "@/lib/research/aspectTiming";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { DOW_SWINGS, type Turn } from "@/lib/research/forecastTrackRecord";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";
import turnsJson from "@/lib/research/modernTurns.json";

export const SUPER_TIMING_RULES = ["figure", "figureMoon", "jupiterIngress", "jupiterReturn"] as const;
export type SuperTimingRule = (typeof SUPER_TIMING_RULES)[number];
export const FIGURE_BODIES = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;
type FigureBody = (typeof FIGURE_BODIES)[number] | "Moon";
export const ORB = 5;
export const BALANCE = 1;
export const MOON_BALANCE = 2;
export const MOON_ORB = 7;
export const RETURN_ORB = 0.5;
export const RETURN_MIN_DAYS = 60;
export const ANCHOR_LAG_DAYS = 10;
const RECENT_ANCHORS = 12;

export const SUPER_SETS = ["calls", "dowNine", "dowThree", "spyThree", "spyMajor", "diaThree", "diaMajor"] as const;
export type SuperSet = (typeof SUPER_SETS)[number];
export const SUPER_TESTS = SUPER_TIMING_RULES.length * SUPER_SETS.length;
export const MODERN_YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);

const DAY = 86_400_000;
const mod = (x: number, m: number) => ((x % m) + m) % m;
const sep = (a: number, b: number) => Math.abs(mod(a - b + 180, 360) - 180);
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const yearStart = (y: number) => Math.floor(Date.UTC(y, 0, 1) / DAY);

const lonCache = new Map<number, Record<FigureBody, number>>();
/** Geocentric longitudes at noon UTC on day `d` (days since 1970-01-01): the Sun, the Moon, Mercury to Pluto. */
export function longitudesOn(d: number): Record<FigureBody, number> {
  const hit = lonCache.get(d);
  if (hit) return hit;
  const t = ephemerisInstant(new Date(d * DAY));
  const out = {
    ...planetLongitudes(t).geo,
    Sun: mod(Ecliptic(HelioVector(Body.Earth, t)).elon + 180, 360),
    Moon: EclipticGeoMoon(t).lon,
  } as Record<FigureBody, number>;
  lonCache.set(d, out);
  return out;
}

/** The orb of an aspect at `angle` between two longitudes, or null beyond `ORB`. */
const orbOf = (a: number, b: number, angle: number, max = ORB) => {
  const o = Math.abs(sep(a, b) - angle);
  return o <= max ? o : null;
};

export interface Figure {
  trine: [FigureBody, FigureBody];
  third: FigureBody;
  link: "conjunction" | "square" | "opposition";
  /** The trine's orb and the link's, degrees. */
  orbs: [number, number];
}

/** The book's figures on day `d`, among the Sun and Mercury to Pluto. */
export function figuresOn(d: number): Figure[] {
  const lon = longitudesOn(d);
  const out: Figure[] = [];
  const B = FIGURE_BODIES;
  for (let i = 0; i < B.length; i++)
    for (let j = i + 1; j < B.length; j++) {
      const t = orbOf(lon[B[i]], lon[B[j]], 120);
      if (t === null) continue;
      for (const c of B) {
        if (c === B[i] || c === B[j]) continue;
        for (const end of [B[i], B[j]]) {
          const conj = orbOf(lon[c], lon[end], 0);
          if (conj !== null) out.push({ trine: [B[i], B[j]], third: c, link: "conjunction", orbs: [t, conj] });
          for (const [angle, link] of [
            [90, "square"],
            [180, "opposition"],
          ] as const) {
            const o = orbOf(lon[c], lon[end], angle);
            if (o !== null && Math.abs(o - t) <= BALANCE) out.push({ trine: [B[i], B[j]], third: c, link, orbs: [t, o] });
          }
        }
      }
    }
  return out;
}

/** True when the Moon is trine a body and square or opposite one of a figure's bodies, its orbs balanced. */
export function moonTriggers(d: number, figures: Figure[]): boolean {
  const lon = longitudesOn(d);
  for (const f of figures) {
    const bodies = [...f.trine, f.third];
    for (const a of FIGURE_BODIES) {
      const t = orbOf(lon.Moon, lon[a], 120, MOON_ORB);
      if (t === null) continue;
      for (const b of bodies) {
        if (b === a) continue;
        for (const angle of [90, 180]) {
          const o = orbOf(lon.Moon, lon[b], angle, MOON_ORB);
          if (o !== null && Math.abs(o - t) <= MOON_BALANCE) return true;
        }
      }
    }
  }
  return false;
}

const dayCache = new Map<string, number[]>();
/**
 * The days (offsets from 1 January) a rule marks in `year`. `anchors` are the
 * turns jupiterReturn counts from; the other rules ignore them.
 */
export function superTimingDays(rule: SuperTimingRule, year: number, anchors: Turn[] = DOW_SWINGS.nine): number[] {
  const key = `${rule}:${year}:${rule === "jupiterReturn" ? anchors.length + (anchors[0]?.date ?? "") : ""}`;
  const hit = dayCache.get(key);
  if (hit) return hit;
  const start = yearStart(year);
  const len = yearStart(year + 1) - start;
  const marked = new Set<number>();
  if (rule === "figure" || rule === "figureMoon") {
    for (let d = start; d < start + len; d++) {
      const f = figuresOn(d);
      if (f.length && (rule === "figure" || moonTriggers(d, f))) marked.add(d - start);
    }
  } else if (rule === "jupiterIngress") {
    // From 40 days before the year, so an ingress late in December marks into January.
    const jup = (d: number) => longitudesOn(d).Jupiter;
    for (let d = start - 40; d < start + len + 2; d++) {
      if (Math.floor(jup(d) / 30) === Math.floor(jup(d - 1) / 30)) continue;
      const sign = Math.floor(jup(d) / 30);
      // The planet may have entered moving backwards; the "first degree" is the one nearest the edge it crossed.
      const edge = jup(d) > jup(d - 1) || jup(d - 1) - jup(d) > 180 ? sign * 30 : sign * 30 + 30;
      let e = d;
      while (e < d + 60 && Math.floor(jup(e) / 30) === sign && sep(jup(e), edge) < 1) e++;
      for (let x = d - SEASONAL_TOLERANCE_DAYS; x <= e + SEASONAL_TOLERANCE_DAYS; x++) if (x >= start && x < start + len) marked.add(x - start);
    }
  } else {
    const known = anchors.map((a) => dayNo(a.date)).sort((a, b) => a - b);
    for (let d = start; d < start + len; d++) {
      const recent = known.filter((a) => a <= d - ANCHOR_LAG_DAYS).slice(-RECENT_ANCHORS);
      const j = longitudesOn(d).Jupiter;
      if (recent.some((a) => d - a >= RETURN_MIN_DAYS && sep(j, longitudesOn(a).Jupiter) <= RETURN_ORB)) marked.add(d - start);
    }
  }
  const out = [...marked].sort((a, b) => a - b);
  dayCache.set(key, out);
  return out;
}

const MODERN = (turnsJson as unknown as { symbols: Record<"SPY" | "DIA", Record<"three" | "major", Turn[]>> }).symbols;
/** Each outcome set: its turns, the turns jupiterReturn counts from, and its years. */
const SETS: Record<Exclude<SuperSet, "calls">, { turns: Turn[]; anchors: Turn[]; years: number[] }> = {
  dowNine: { turns: DOW_SWINGS.nine, anchors: DOW_SWINGS.nine, years: NINE_POINT_YEARS },
  dowThree: { turns: DOW_SWINGS.three, anchors: DOW_SWINGS.nine, years: THREE_DAY_YEARS },
  spyThree: { turns: MODERN.SPY.three, anchors: MODERN.SPY.three, years: MODERN_YEARS },
  spyMajor: { turns: MODERN.SPY.major, anchors: MODERN.SPY.three, years: MODERN_YEARS },
  diaThree: { turns: MODERN.DIA.three, anchors: MODERN.DIA.three, years: MODERN_YEARS },
  diaMajor: { turns: MODERN.DIA.major, anchors: MODERN.DIA.three, years: MODERN_YEARS },
};

export interface SuperTimingResult {
  rule: SuperTimingRule;
  set: SuperSet;
  /** Mean share of each year's days the rule marks. */
  coverage: number;
  score: PooledDayScore["turns"];
}

export function superTimingScore(rule: SuperTimingRule, set: SuperSet, seed = 20261030): SuperTimingResult {
  if (set === "calls") {
    const s = scoreYearDays(
      PUBLISHED_FORECASTS.map((f) => ({
        id: f.id,
        days: superTimingDays(rule, Number(f.id), DOW_SWINGS.nine),
        targets: yearTargets(Number(f.id), f.windows, DOW_SWINGS.nine),
      })),
      seed,
    );
    return { rule, set, coverage: s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length, score: s.calls };
  }
  const { turns, anchors, years } = SETS[set];
  const s = scoreYearDays(
    years.map((y) => ({ id: String(y), days: superTimingDays(rule, y, anchors), targets: yearTargets(y, [], turns) })),
    seed,
  );
  return { rule, set, coverage: s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length, score: s.turns };
}

export function superTimingAll(): SuperTimingResult[] {
  const out: SuperTimingResult[] = [];
  for (const rule of SUPER_TIMING_RULES) for (const set of SUPER_SETS) out.push(superTimingScore(rule, set));
  return out;
}
