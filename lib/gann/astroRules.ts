/**
 * Gann's planetary rules beyond the averages, and Jensen's square of 90, as
 * labelled context and measured factors. Built 2026-10-16 on the project
 * owner's direction ("infuse the astrology connected to Gann, Jensen, and
 * anything from the cycles of observation folder that aligns with Gann and
 * Jensen"). The rule-by-rule spec, with every open parameter, is
 * `/mnt/project-files/astro-spec/astro-rules.md` (2026-10-16); the IDs below
 * are its IDs. The averages themselves (ASTRO-6, the COE and the MOF) are
 * `planetaryAverages.ts`.
 *
 * **Policy.** The owner decided on 2026-10-01 that every Gann method acts
 * where Gann says it acts, astrology included (AGENTS.md "Every Gann method
 * acts"). So far one reading here acts: the active angles at 0, 90, 120 and
 * 180° join the support and resistance list as price resistance
 * (`activeAngleLevels`, via `masterLevels.ts`), which moves plan stops and
 * targets. The time readings (Mars half-returns, the Sun's points, the Moon)
 * mark windows for a turn; they act once GSPS has one shared place where a
 * time window acts on the verdict (the parity plan's item 7), and until then
 * they are shown in the trace and measured as factors. Jensen's readings act
 * where the owner places them, item by item (AGENTS.md): his square of 90's
 * price points join the S/R list (`jensenLevels`) on the placement
 * recommended to him on 2026-10-16, and his time counts stay context. No source in the collection measures a planetary timing rule
 * against chance, so each one starts at zero evidence, and an inversion in
 * the replay is presumed a translation defect first.
 *
 * **What is built, and from what (tiers as in the spec):**
 * - ASTRO-4/5, active angles (A, the 1954 letters): price on the longitude of
 *   Jupiter, Saturn or Uranus, or 60, 90, 120, 135 or 180° from it, in either
 *   frame; and a close through a planet's own longitude ("below the body …
 *   indicates lower").
 * - ASTRO-8a, the Sun's travel (A, coffee letter): the degrees the Sun has
 *   moved since the major low, added to the low's price at 1 point a degree.
 * - ASTRO-10, Mars half-returns (A, coffee letter): geocentric Mars opposite
 *   its place at the major low, flagged as a change date; the third pass of a
 *   retrograde loop "very important".
 * - ASTRO-15, the wheel (A, Master Egg Course): price at the same degree as
 *   the year's high or low, or 90, 120 or 180° from it. Needs no ephemeris.
 * - ASTRO-16, the natural angle (A, Master Egg Course): days to the date the
 *   Sun stands at the price's degree; Gann notes a low 7 days from it.
 * - ASTRO-17, seasonal dates by the Sun (A, Master Course Ch. 5): the Sun on
 *   a multiple of 15° (ingresses and their halves), the true date rather than
 *   `seasonalCounts.ts`'s calendar one. Kept as a separate factor so the
 *   replay compares the two.
 * - ASTRO-18, the Moon (A, Master Course Ch. 5): a New Moon, and the Moon
 *   returning to its place at the last swing pivot.
 * - J-2, Jensen's square of 90 (J, *Astro-Cycles and Speculative Markets*
 *   pp. 107-110): 5⅝, 11¼, 22½, 30, 45, 60, 67½, 75 and 90 points above the
 *   major low, and the same counts in days, weeks and months from the major
 *   high and low. Jensen's one-point penetration (J-5) is the tolerance.
 *
 * **Not built, and why:** ASTRO-2 (five scales, no rule to choose one; the
 * multiple-scale search AGENTS.md bars); ASTRO-7 (midpoints with no stated
 * use); ASTRO-9 (the "very important" month has no threshold); ASTRO-11
 * (one forecast is one sample); ASTRO-12/13 (displays with no rule); ASTRO-14
 * (no price scale); ASTRO-19 (a 29½-year return needs more history than the
 * scan reads); J-6 to J-10 (the notes record headings, not rules); the
 * cycles folder (nothing in it validates a planetary rule: Dewey's planetary
 * item is a coincidence of period, and Tomes separates physical periods from
 * aspect astrology). Withheld items (Section 4 of the spec) are not
 * buildable.
 *
 * **Fixed before any testing, so nothing is searched (Dewey's standard):**
 * - Longitudes: tropical, of date, at noon UTC (`planetaryAverages.ts`).
 * - Price to degree: one Gann point (`gannPointForBars`) to a degree, the
 *   one scale `planetaryAverages.ts` uses. No other scale is tried.
 * - Orbs: price within `CIRCLE_TOLERANCE` (1¼ points) for Gann's rules and
 *   1 point for Jensen's (J-5); dates within ±1 day (Moon, Sun points),
 *   ±2 days (Mars), 7 days (the natural angle, Gann's own figure).
 * - Bodies and aspects: only those Gann names in the examples cited.
 * - The major low and high: the bars' lowest low and highest high (about a
 *   year in the scan). Gann's examples use the major lows of the campaign.
 *
 * Three-question basis:
 * 1. Gann: as tiered above. Jensen is a parallel source, not lineage: he
 *    never cites Gann.
 * 2. Cycles: every rule here is a periodicity or external-forcing claim and
 *    clears no Dewey item yet. The factor table is the base-rate test; the
 *    replay's halves are the persistence check.
 * 3. Hermetic: Correspondence ("as above, so below") is Gann's own premise,
 *    recorded as his belief, not as evidence; Rhythm for the Moon and Mars
 *    returns; Polarity for the half-return and the opposition.
 */

import { Body, Ecliptic, GeoVector, MoonPhase, SunPosition, EclipticGeoMoon } from "astronomy-engine";
import type { Bar } from "@/lib/types";
import { ephemerisInstant, planetLongitudes, type Frame } from "@/lib/gann/planetaryAverages";
import { CIRCLE_TOLERANCE } from "@/lib/gann/circleOf360";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

const DAY_MS = 86_400_000;
const SUN_DEG_PER_DAY = 360 / 365.2422;
const MOON_DEG_PER_DAY = 360 / 27.3217;
const SYNODIC_DEG_PER_DAY = 360 / 29.5306;

export const ACTIVE_BODIES = ["Jupiter", "Saturn", "Uranus"] as const;
export const ACTIVE_ASPECTS = [0, 60, 90, 120, 135, 180] as const;
export const WHEEL_ANGLES = [0, 90, 120, 180] as const;
export const JENSEN_POINTS = [5.625, 11.25, 22.5, 30, 45, 60, 67.5, 75, 90] as const;
/** 90 and 45 are "doubly strong"; the square points resist, the trine points consolidate. */
export const JENSEN_SQUARE_POINTS = new Set([5.625, 11.25, 22.5, 45, 67.5, 90]);
export const JENSEN_TOLERANCE = 1;
export const NATURAL_ANGLE_DAYS = 7;
export const MARS_DAYS = 2;
const MARS_LOOKBACK_DAYS = 240;
/** How far ahead the next half-return is looked for (Mars's synodic period is about 780 days). */
const MARS_HORIZON_DAYS = 800;

type ActiveBody = (typeof ACTIVE_BODIES)[number];

const mod = (x: number, m: number) => ((x % m) + m) % m;
/** Signed difference a − b on the circle, in (−180, 180]. */
const wrap = (a: number, b: number) => {
  const d = mod(a - b, 360);
  return d > 180 ? d - 360 : d;
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Cache key: the UTC day number. Cheaper than a date string on the Mars walks. */
const dayKey = (dayMs: number) => Math.floor(dayMs / DAY_MS);
const dayCache = new Map<number, { sun: number; moon: number; phase: number }>();
/** The Sun's and Moon's geocentric longitudes and the Moon's phase at noon UTC, cached by date. */
function sunMoon(dayMs: number) {
  const key = dayKey(dayMs);
  const hit = dayCache.get(key);
  if (hit) return hit;
  const t = ephemerisInstant(new Date(dayMs));
  const v = { sun: SunPosition(t).elon, moon: EclipticGeoMoon(t).lon, phase: MoonPhase(t) };
  if (dayCache.size > 20_000) dayCache.clear();
  dayCache.set(key, v);
  return v;
}

const marsCache = new Map<number, number>();
/** Geocentric Mars, tropical of date, at noon UTC. Cached: it is the same for every symbol. */
function marsGeo(dayMs: number): number {
  const key = dayKey(dayMs);
  const hit = marsCache.get(key);
  if (hit !== undefined) return hit;
  const v = Ecliptic(GeoVector(Body.Mars, ephemerisInstant(new Date(dayMs)), true)).elon;
  if (marsCache.size > 20_000) marsCache.clear();
  marsCache.set(key, v);
  return v;
}

/** Faster than geocentric Mars ever moves, so a walk can skip days it cannot cross the target in. */
const MARS_MAX_DEG_PER_DAY = 0.85;

/**
 * Days (noon UTC, as day-start ms) on which geocentric Mars crosses `target`
 * between `from` and `to`, retrograde passes included.
 */
function marsCrossings(target: number, from: number, to: number, firstOnly = false): number[] {
  const out: number[] = [];
  let t = from + DAY_MS;
  while (t <= to) {
    const a = wrap(marsGeo(t - DAY_MS), target);
    const b = wrap(marsGeo(t), target);
    if (Math.sign(a) !== Math.sign(b) && Math.abs(a - b) < 90) {
      out.push(t);
      if (firstOnly) break;
    }
    t += Math.max(1, Math.floor((Math.abs(b) - 1) / MARS_MAX_DEG_PER_DAY)) * DAY_MS;
  }
  return out;
}

export interface ActiveAngleHit {
  body: ActiveBody;
  frame: Frame;
  aspect: number;
  /** The level in dollars. */
  level: number;
  distancePoints: number;
}

export interface AstroReading {
  date: string;
  /** One Gann point, in dollars: one degree. */
  unit: number;
  /** ASTRO-4/5: active angles price is on, nearest first. */
  activeAngles: ActiveAngleHit[];
  /** ASTRO-4: the last close went through a planet's own longitude. */
  closedThroughBody: { body: ActiveBody; frame: Frame; direction: "up" | "down"; level: number } | null;
  /** ASTRO-8a: the Sun's travel since the major low, added to the low. */
  sunTravel: { lowDate: string; level: number; distancePoints: number; on: boolean } | null;
  /** ASTRO-10: Mars opposite its place at the major low within ±2 days, and which pass of the loop. */
  marsHalfReturn: { lowDate: string; today: boolean; pass: number; next: string | null } | null;
  /** ASTRO-15: price on the wheel against the year's high or low. */
  wheel: { extreme: "high" | "low"; angle: number; distancePoints: number } | null;
  /** ASTRO-16: days from today to the nearest date the Sun stands at the price's degree (negative = past). */
  naturalAngle: { priceDegree: number; days: number; near: boolean };
  /** ASTRO-17: the Sun on a multiple of 15° within a day. */
  solarPoint: { degree: number; kind: "ingress" | "half"; offsetDays: number } | null;
  /** ASTRO-18: a New Moon within a day. */
  newMoon: { offsetDays: number } | null;
  /** ASTRO-18: the Moon back at its place at the last swing pivot, within a day. */
  lunarReturn: { pivotDate: string; offsetDays: number } | null;
  /** J-2: Jensen's square of 90 from the major low, in price and time. */
  jensen: {
    price: { points: number; level: number; square: boolean } | null;
    time: { from: "high" | "low"; unit: "days" | "weeks" | "months"; count: number; points: number } | null;
  };
}

function extremes(bars: Bar[]) {
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h >= bars[hi].h) hi = i;
    if (bars[i].l <= bars[lo].l) lo = i;
  }
  return { hi, lo };
}

function nearestLevel(pricePts: number, degree: number): number {
  return degree + 360 * Math.round((pricePts - degree) / 360);
}

/**
 * Gann's active angles as price resistance (owner decision 2026-10-01, "every
 * Gann method acts"; AGENTS.md). The 1954 letter defines an active angle as a
 * price or time at a major planet's longitude or at a square, trine or
 * opposition to it, and calls such points resistance, so they join the
 * support and resistance list (`masterLevels.ts`) the way the planetary
 * averages do. Only the letter's own aspects (0, 90, 120, 180) act; the 60°
 * and 135° readings above stay context.
 *
 * Engineering choice, labelled as such: to keep the list sparse, each body
 * contributes only its nearest point above and below price, across both
 * frames and all four aspects (`planetaryLevels` keeps one pair per average).
 */
export const LEVEL_ASPECTS = [0, 90, 120, 180] as const;

export function activeAngleLevels(asOf: Date, price: number, unit: number): { price: number; label: string }[] {
  if (!(price > 0) || !(unit > 0)) return [];
  const pts = price / unit;
  const lon = planetLongitudes(new Date(ephemerisInstant(asOf).getTime()));
  const out: { price: number; label: string }[] = [];
  for (const body of ACTIVE_BODIES) {
    let above: { pts: number; label: string } | null = null;
    let below: { pts: number; label: string } | null = null;
    for (const frame of ["helio", "geo"] as const) {
      const l = lon[frame][body];
      for (const aspect of LEVEL_ASPECTS) {
        for (const deg of aspect === 0 || aspect === 180 ? [mod(l + aspect, 360)] : [mod(l + aspect, 360), mod(l - aspect, 360)]) {
          // The largest point at this degree not above price, and the next one up.
          const lo = Math.floor((pts - deg) / 360) * 360 + deg;
          const hi = lo + 360;
          const label = `Active angle: ${ASPECT_NAME[aspect]} ${frame === "helio" ? "heliocentric" : "geocentric"} ${body}`;
          if (lo > 0 && (!below || lo > below.pts)) below = { pts: lo, label };
          if (!above || hi < above.pts) above = { pts: hi, label };
        }
      }
    }
    if (below) out.push({ price: below.pts * unit, label: below.label });
    if (above) out.push({ price: above.pts * unit, label: above.label });
  }
  return out;
}

/**
 * Jensen's square of 90 as price levels (J-2). Placed by the owner's 2026-10-01
 * decision that Jensen's astrology acts where he places it; the recommended
 * placement (price points as levels, time counts as context) was posted to him
 * on 2026-10-16 and is followed until he answers. Jensen calls the square
 * points resistance and the trine points consolidation, so both join the
 * support and resistance list. The low is the same one `readAstroRules`
 * measures from (the lowest low of the bars supplied). Engineering choice,
 * labelled as such: only the nearest point above and below price, so the list
 * stays sparse.
 */
export function jensenLevels(bars: Bar[], price: number, unit: number): { price: number; label: string }[] {
  if (bars.length === 0 || !(price > 0) || !(unit > 0)) return [];
  const lowPts = bars[extremes(bars).lo].l / unit;
  const pts = price / unit;
  let above: number | null = null;
  let below: number | null = null;
  for (const p of JENSEN_POINTS) {
    const level = lowPts + p;
    if (level <= pts && (below === null || level > lowPts + below)) below = p;
    if (level > pts && (above === null || level < lowPts + above)) above = p;
  }
  const label = (p: number) => `Jensen's square of 90: ${p} points above the low (${JENSEN_SQUARE_POINTS.has(p) ? "square point" : "trine point"})`;
  const out: { price: number; label: string }[] = [];
  if (below !== null) out.push({ price: (lowPts + below) * unit, label: label(below) });
  if (above !== null) out.push({ price: (lowPts + above) * unit, label: label(above) });
  return out;
}

export function readAstroRules(bars: Bar[], asOf: Date, unit: number): AstroReading | null {
  if (bars.length < 20 || !(unit > 0)) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const today = ephemerisInstant(asOf).getTime();
  const pts = last.c / unit;
  const prevPts = prev.c / unit;
  const lon = planetLongitudes(new Date(today));

  // ASTRO-4/5: active angles.
  const activeAngles: ActiveAngleHit[] = [];
  let closedThroughBody: AstroReading["closedThroughBody"] = null;
  for (const frame of ["helio", "geo"] as const) {
    for (const body of ACTIVE_BODIES) {
      const l = lon[frame][body];
      for (const aspect of ACTIVE_ASPECTS) {
        for (const deg of aspect === 0 || aspect === 180 ? [mod(l + aspect, 360)] : [mod(l + aspect, 360), mod(l - aspect, 360)]) {
          const level = nearestLevel(pts, deg);
          const d = Math.abs(pts - level);
          if (level > 0 && d <= CIRCLE_TOLERANCE) activeAngles.push({ body, frame, aspect, level: level * unit, distancePoints: d });
        }
      }
      // A close through the body's own longitude, from the prior close.
      const level = nearestLevel((pts + prevPts) / 2, l);
      if (!closedThroughBody && level > 0 && Math.min(pts, prevPts) < level && Math.max(pts, prevPts) >= level) {
        closedThroughBody = { body, frame, direction: pts > prevPts ? "up" : "down", level: level * unit };
      }
    }
  }
  activeAngles.sort((a, b) => a.distancePoints - b.distancePoints);

  const { hi, lo } = extremes(bars);
  const lowT = ephemerisInstant(new Date(bars[lo].t)).getTime();
  const highT = ephemerisInstant(new Date(bars[hi].t)).getTime();
  const lowPts = bars[lo].l / unit;
  const highPts = bars[hi].h / unit;

  // ASTRO-8a: the Sun's travel since the major low, added to the low, 1 point a degree.
  let sunTravel: AstroReading["sunTravel"] = null;
  if (today > lowT) {
    const travel = ((today - lowT) / DAY_MS) * SUN_DEG_PER_DAY;
    const exact = mod(sunMoon(today).sun - sunMoon(lowT).sun, 360);
    const deg = Math.floor(travel / 360) * 360 + exact;
    const level = lowPts + deg;
    const d = Math.abs(pts - level);
    sunTravel = { lowDate: iso(lowT), level: level * unit, distancePoints: d, on: d <= CIRCLE_TOLERANCE };
  }

  // ASTRO-10: geocentric Mars opposite its place at the major low.
  let marsHalfReturn: AstroReading["marsHalfReturn"] = null;
  if (today > lowT) {
    const target = mod(marsGeo(lowT) + 180, 360);
    const crossings = marsCrossings(target, Math.max(lowT, today - MARS_LOOKBACK_DAYS * DAY_MS), today + MARS_DAYS * DAY_MS);
    const near = crossings.filter((t) => Math.abs(t - today) <= MARS_DAYS * DAY_MS);
    // Passes of one loop: crossings within 120 days of each other, counted up to today's.
    let pass = 0;
    if (near.length > 0) {
      pass = 1;
      for (let k = crossings.indexOf(near[0]) - 1; k >= 0 && crossings[k + 1] - crossings[k] <= 120 * DAY_MS; k--) pass++;
    }
    const ahead = marsCrossings(target, today + MARS_DAYS * DAY_MS, today + MARS_HORIZON_DAYS * DAY_MS, true);
    const next = ahead.length > 0 ? iso(ahead[0]) : null;
    marsHalfReturn = { lowDate: iso(lowT), today: near.length > 0, pass, next };
  }

  // ASTRO-15: the wheel against the year's high and low.
  let wheel: AstroReading["wheel"] = null;
  for (const [extreme, ePts] of [["high", highPts], ["low", lowPts]] as const) {
    const diff = Math.abs(wrap(pts, ePts));
    for (const angle of WHEEL_ANGLES) {
      const d = Math.abs(diff - angle);
      if (d <= CIRCLE_TOLERANCE && (!wheel || d < wheel.distancePoints) && Math.abs(pts - ePts) > CIRCLE_TOLERANCE) {
        wheel = { extreme, angle, distancePoints: d };
      }
    }
  }

  // ASTRO-16: the natural angle.
  const sun = sunMoon(today).sun;
  const priceDegree = mod(pts, 360);
  const ahead = mod(priceDegree - sun, 360) / SUN_DEG_PER_DAY;
  const behind = ahead - 365.2422;
  const days = Math.round(Math.abs(ahead) <= Math.abs(behind) ? ahead : behind);
  const naturalAngle = { priceDegree, days, near: Math.abs(days) <= NATURAL_ANGLE_DAYS };

  // ASTRO-17: the Sun on a multiple of 15°.
  const point = Math.round(sun / 15) * 15;
  const sunOffset = wrap(point, sun) / SUN_DEG_PER_DAY;
  const solarPoint =
    Math.abs(sunOffset) <= 1 ? { degree: mod(point, 360), kind: mod(point, 30) === 0 ? ("ingress" as const) : ("half" as const), offsetDays: sunOffset } : null;

  // ASTRO-18: the New Moon, and the Moon's return to its place at the last pivot.
  const phase = sunMoon(today).phase;
  const moonOffset = wrap(0, phase) / SYNODIC_DEG_PER_DAY;
  const newMoon = Math.abs(moonOffset) <= 1 ? { offsetDays: moonOffset } : null;
  let lunarReturn: AstroReading["lunarReturn"] = null;
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;
  const pivot = pivots[pivots.length - 1];
  if (pivot && pivot.index < bars.length - 1) {
    const pt = ephemerisInstant(new Date(bars[pivot.index].t));
    const off = wrap(sunMoon(pt.getTime()).moon, sunMoon(today).moon) / MOON_DEG_PER_DAY;
    if (Math.abs(off) <= 1 && today - pt.getTime() > 20 * DAY_MS) lunarReturn = { pivotDate: iso(pt.getTime()), offsetDays: off };
  }

  // J-2: Jensen's square of 90.
  let jensenPrice: AstroReading["jensen"]["price"] = null;
  for (const p of JENSEN_POINTS) {
    const level = lowPts + p;
    if (Math.abs(pts - level) <= JENSEN_TOLERANCE && (!jensenPrice || Math.abs(pts - level) < Math.abs(pts - jensenPrice.level / unit))) {
      jensenPrice = { points: p, level: level * unit, square: JENSEN_SQUARE_POINTS.has(p) };
    }
  }
  let jensenTime: AstroReading["jensen"]["time"] = null;
  for (const [from, t0] of [["low", lowT], ["high", highT]] as const) {
    const elapsed = (today - t0) / DAY_MS;
    if (elapsed <= 0) continue;
    for (const [u, per] of [["days", 1], ["weeks", 7], ["months", 30.4375]] as const) {
      const n = elapsed / per;
      for (const p of JENSEN_POINTS) if (!jensenTime && Math.abs(n - p) <= 1 * (u === "days" ? 1 : 0.5)) jensenTime = { from, unit: u, count: Math.round(n), points: p };
    }
  }

  return {
    date: iso(today),
    unit,
    activeAngles,
    closedThroughBody,
    sunTravel,
    marsHalfReturn,
    wheel,
    naturalAngle,
    solarPoint,
    newMoon,
    lunarReturn,
    jensen: { price: jensenPrice, time: jensenTime },
  };
}

const ASPECT_NAME: Record<number, string> = { 0: "on", 60: "60° from", 90: "square to", 120: "trine to", 135: "135° from", 180: "opposite" };

/** Plain-language lines for the explanation trace. Active angles act as levels; the rest is labelled context. */
export function describeAstroRules(r: AstroReading): string[] {
  const tag = "Planetary (context)";
  const lines: string[] = [];
  const a = r.activeAngles[0];
  if (a) lines.push(`Planetary: price is ${ASPECT_NAME[a.aspect]} ${a.frame === "helio" ? "heliocentric" : "geocentric"} ${a.body} (${a.level.toFixed(2)}), an active angle.`);
  const c = r.closedThroughBody;
  if (c) lines.push(`${tag}: closed ${c.direction === "up" ? "above" : "below"} the longitude of ${c.frame === "helio" ? "heliocentric" : "geocentric"} ${c.body} (${c.level.toFixed(2)}).`);
  if (r.sunTravel?.on) lines.push(`${tag}: price is at the Sun's travel since the ${r.sunTravel.lowDate} low, added to the low (${r.sunTravel.level.toFixed(2)}).`);
  if (r.marsHalfReturn?.today) lines.push(`${tag}: Mars is opposite its place at the ${r.marsHalfReturn.lowDate} low${r.marsHalfReturn.pass >= 3 ? ", the third pass, which the method calls very important" : ""}: a change date.`);
  else if (r.marsHalfReturn?.next) lines.push(`${tag}: next Mars half-return from the ${r.marsHalfReturn.lowDate} low: ${r.marsHalfReturn.next}.`);
  if (r.wheel) lines.push(`${tag}: price sits ${r.wheel.angle === 0 ? "at the same degree as" : `${r.wheel.angle}° from`} the year's ${r.wheel.extreme} on the wheel.`);
  if (r.naturalAngle.near) lines.push(`${tag}: the Sun is ${Math.abs(r.naturalAngle.days)} days ${r.naturalAngle.days >= 0 ? "from reaching" : "past"} the price's degree (${r.naturalAngle.priceDegree.toFixed(0)}°), the natural angle.`);
  if (r.solarPoint) lines.push(`${tag}: the Sun is at ${r.solarPoint.degree}° (${r.solarPoint.kind === "ingress" ? "a sign change" : "a half-sign point"}), a seasonal turning point measured by the Sun.`);
  if (r.newMoon) lines.push(`${tag}: New Moon within a day.`);
  if (r.lunarReturn) lines.push(`${tag}: the Moon is back at its place at the ${r.lunarReturn.pivotDate} swing pivot.`);
  const j = r.jensen;
  if (j.price) lines.push(`Jensen's square of 90: price is ${j.price.points} points above the year's low (${j.price.level.toFixed(2)}), a ${j.price.square ? "square point, resistance" : "trine point, consolidation"}.`);
  if (j.time) lines.push(`Jensen's square of 90: ${j.time.count} ${j.time.unit} from the year's ${j.time.from}, on the ${j.time.points} count.`);
  return lines;
}
