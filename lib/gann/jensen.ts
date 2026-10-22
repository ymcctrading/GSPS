/**
 * L. J. Jensen's forecasting method (*Astro-Cycles and Speculative Markets*,
 * 1978; source note B16, spec `/mnt/project-files/astro-spec/astro-rules.md`
 * J-1 to J-10). Built 2026-10-16 on the owner's instruction "Determine the
 * best way to use Jensen work. If we are going to be forecasting then we
 * ought to [take] his information into account", which delegated the placement
 * the 2026-10-01 decision left to him item by item (AGENTS.md "Every Gann
 * method acts").
 *
 * **Placement, item by item (the decision this module records):**
 * - **Square of 90 in price (J-2, Section III): acts as levels.** Jensen lays
 *   the square at every major low and inverts it at every major high, and
 *   calls the square points resistance and the trine points consolidation.
 *   So the nearest square point above and below price, counted up from the
 *   low and down from the high, joins the S/R list (trine points stay
 *   context, C-LEVELS-21) (`jensenLevels`, via
 *   `masterLevels.ts`), on the live scan and the replay alike.
 * - **Square of 90 in time (J-2): forward turn dates.** The same counts in
 *   calendar days, weeks and months from the major high and low
 *   (`jensenTimeCounts`). A count marks a window for a turn; it does not make
 *   a setup (AGENTS.md's limits on the 2026-10-01 decision), so it acts
 *   through the shared time-window mechanism (parity plan item 7) and is
 *   measured and traced until then.
 * - **Slow-planet aspects (Section II): the market-wide forecast.** Jensen's
 *   own forecasting rule: the geocentric angles between Jupiter, Saturn and
 *   Uranus, read in his aspect families with his orbs, and timed by a fast
 *   planet (Mars, sometimes Mercury) coming into the same aspect
 *   (`readJensenAspects`, `jensenAspectCalendar`). The square family is
 *   bearish, the trine family bullish, the quintile family times reversals.
 *   Same route as the time counts: a dated window with an expected
 *   direction, acting through item 7, measured and traced until then.
 * - **Projection (Section IV): an exhaustion estimate in time and price.**
 *   A 60° line from the extreme close and a 45° line from the previous swing
 *   close; where they cross (`jensenProjection`). Measured and traced; its
 *   date goes to item 7 with the rest. It is not a level: Jensen draws it on
 *   both daily and weekly charts and the source doesn't say which governs.
 * - **One-point penetration (J-5):** the orb for Jensen's own price points
 *   only. A break of a plan's stop stays on Gann's 3-point rule
 *   (`pointScale.ts`), under WD Gann precedence; the two are not mixed.
 * - **Not built:** the Moon's Node against 9° Gemini (U.S.-only, about one
 *   square every nine years, and the opposition is read both ways in the
 *   book, so it can be neither fixed nor measured); mundane base charts,
 *   progressions and houses (J-7, no testable rule in the source); the
 *   84-year Uranus cycle and sunspots (J-8, two or three repetitions);
 *   reference tables (J-9, no rule); the lunar grain keys (J-10, commodities
 *   only, not specified). Jensen's 2½% orb on objectives is not used: his own
 *   one-point rule is the tighter, stated break test.
 *
 * **Not Gann's malefic cycle (A-ASTRO-11, measured 2026-10-21).** Gann's
 * 1919-1921 forecasts call stretches "depressing" and "malefic" without a
 * method. The square family here was the candidate reconstruction, and on
 * his own dated stretches it is no more common than on the rest of those
 * years (`lib/research/maleficCycles.ts`). So it stays Jensen's rule under
 * Jensen's name, and is never shown as Gann's malefic cycle.
 *
 * **Fixed before any testing (Dewey's standard; nothing here is searched):**
 * - Longitudes: geocentric, tropical, of date, at noon UTC (Jensen rejects
 *   heliocentric positions), from `planetaryAverages.ts`.
 * - Aspects and orbs: exactly B16 §2's. Square family 22½, 45, 90, 135, 180;
 *   trine family 15, 30, 60, 120, 150; quintile family 18, 36, 54, 72, 144;
 *   the conjunction. Orbs 5% of the aspect each side, ±9° for the
 *   conjunction and opposition, ±2° for the quintiles. Where two orbs
 *   overlap, the nearer exact aspect is read.
 * - Trigger: Mars or Mercury within 1° of the same aspect to either planet of
 *   a pair in orb. **Engineering choice, labelled:** Jensen names the
 *   trigger but not its orb; 1° is about two days of Mars and one of Mercury.
 * - Price unit: the Gann point (`gannPointForBars`), the one scale the rest
 *   of the astrology uses. Jensen's own is $1 for stocks (J-1), which is the
 *   Gann point only near $42.50; GSPS's price-scaling is the established
 *   translation of a 1930s point.
 * - Successive squares: past 90 points the square repeats every 90 (Jensen:
 *   squares repeat "in form, not exact prices"). Engineering choice,
 *   labelled: the repeat is anchored on the same low, the reading Gann's own
 *   Square of 90 chart gives.
 * - The major high and low: the bars' highest high and lowest low (about a
 *   year in the scan), as in `astroRules.ts`.
 *
 * Three-question basis:
 * 1. Gann: Section III restates Gann's January 1931 Pattern Chart (Tier A via
 *    A2.1), so the square of 90 is Gann's rule in Jensen's words. Sections II
 *    and IV are Jensen's own (Tier B) and are included by the owner's
 *    2026-10-01 decision, not as Gann's.
 * 2. Cycles: every rule here claims recurrence and clears no Dewey item yet.
 *    Jensen's own hit counts (13 of 13, 28 of 28) carry no base rate and no
 *    misses, so the factor table and the replay's halves are the first real
 *    test. Tomes' point holds: score against true ephemeris dates, never a
 *    mean period, which is what the calendar does.
 * 3. Hermetic: Correspondence, read the way Jensen reads it, one set of
 *    angles at once in the sky, on the chart and in the calendar; Polarity
 *    for the square laid at the low and inverted at the high, and for the
 *    square and trine families' opposite readings.
 */

import type { Bar } from "@/lib/types";
import { ephemerisInstant, planetLongitudes } from "@/lib/gann/planetaryAverages";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { gannThreePoints } from "@/lib/gann/pointScale";

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.4375;

const mod = (x: number, m: number) => ((x % m) + m) % m;
const wrap = (a: number, b: number) => {
  const d = mod(a - b, 360);
  return d > 180 ? d - 360 : d;
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------- square of 90

/** The harmonics of 90 and of 120 inside one square (B16 §3; spec J-2). */
export const JENSEN_POINTS = [5.625, 7.5, 11.25, 15, 22.5, 30, 45, 60, 67.5, 75, 90] as const;
/** The square points resist; the trine points consolidate. 90 and 45 are "doubly strong". */
export const JENSEN_SQUARE_POINTS = new Set([5.625, 11.25, 22.5, 45, 67.5, 90]);
/** The two square points Jensen calls "doubly strong" (B16 §3; C-LEVELS-21). */
export const JENSEN_STRONG_POINTS = new Set([45, 90]);
/** Time counts also run to 120, the top of the trine harmonics. */
export const JENSEN_TIME_POINTS = [...JENSEN_POINTS, 120] as const;
/** J-5: a point is broken only by a full one-point penetration. */
export const JENSEN_TOLERANCE = 1;
export const JENSEN_SQUARE = 90;

function extremes(bars: Bar[]) {
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h >= bars[hi].h) hi = i;
    if (bars[i].l <= bars[lo].l) lo = i;
  }
  return { hi, lo };
}

export interface JensenPoint {
  /** Points from the extreme, across squares (e.g. 135 = the second square's 45). */
  points: number;
  /** In the Gann point. */
  pts: number;
  from: "low" | "high";
  square: boolean;
  /** A 45 or 90 point: "doubly strong". */
  strong: boolean;
}

/** Every square-of-90 point from the low (up) and the high (down) within `span` points of `pricePts`. */
function jensenGrid(lowPts: number, highPts: number, pricePts: number, span: number): JensenPoint[] {
  const out: JensenPoint[] = [];
  for (const [from, base, sign] of [["low", lowPts, 1], ["high", highPts, -1]] as const) {
    const dist = sign * (pricePts - base);
    const first = Math.max(0, Math.floor((dist - span) / JENSEN_SQUARE));
    const last = Math.max(0, Math.floor((dist + span) / JENSEN_SQUARE));
    for (let k = first; k <= last; k++) {
      for (const p of JENSEN_POINTS) {
        const points = k * JENSEN_SQUARE + p;
        const pts = base + sign * points;
        if (pts > 0 && Math.abs(pts - pricePts) <= span) out.push({ points, pts, from, square: JENSEN_SQUARE_POINTS.has(p), strong: JENSEN_STRONG_POINTS.has(p) });
      }
    }
  }
  return out;
}

const pointLabel = (p: JensenPoint) =>
  `Jensen's square of 90: ${p.points} points ${p.from === "low" ? "above the low" : "below the high"} (${p.square ? (p.strong ? "square point, doubly strong" : "square point") : "trine point"})`;

/**
 * Jensen's square of 90 as price levels: the nearest square point above and
 * below price, counted up from the major low and down from the major high.
 * Only the square points: Jensen has them mark resistance and reversals, and
 * the trine points (the 120 family) mark consolidation, so a trine point is
 * read on the card (`jensenPriceHit`) and never joins the S/R list (review B,
 * C-LEVELS-21, 2026-10-16; until then trine points joined it too). Only the
 * nearest pair, so the list stays sparse (engineering choice, as for the
 * active angles).
 */
export function jensenLevels(bars: Bar[], price: number, unit: number): { price: number; label: string }[] {
  if (bars.length === 0 || !(price > 0) || !(unit > 0)) return [];
  const { hi, lo } = extremes(bars);
  const pts = price / unit;
  const grid = jensenGrid(bars[lo].l / unit, bars[hi].h / unit, pts, JENSEN_SQUARE);
  let above: JensenPoint | null = null;
  let below: JensenPoint | null = null;
  for (const p of grid) {
    if (!p.square) continue;
    if (p.pts <= pts && (!below || p.pts > below.pts)) below = p;
    if (p.pts > pts && (!above || p.pts < above.pts)) above = p;
  }
  const out: { price: number; label: string }[] = [];
  if (below) out.push({ price: below.pts * unit, label: pointLabel(below) });
  if (above) out.push({ price: above.pts * unit, label: pointLabel(above) });
  return out;
}

/** The square-of-90 point the price is on, within Jensen's one point, nearest first. */
export function jensenPriceHit(bars: Bar[], price: number, unit: number): (JensenPoint & { level: number }) | null {
  if (bars.length === 0 || !(price > 0) || !(unit > 0)) return null;
  const { hi, lo } = extremes(bars);
  const pts = price / unit;
  let best: JensenPoint | null = null;
  for (const p of jensenGrid(bars[lo].l / unit, bars[hi].h / unit, pts, JENSEN_TOLERANCE)) {
    if (!best || Math.abs(p.pts - pts) < Math.abs(best.pts - pts)) best = p;
  }
  return best ? { ...best, level: best.pts * unit } : null;
}

export interface JensenCount {
  date: string;
  from: "high" | "low";
  unit: "days" | "weeks" | "months";
  points: number;
  square: boolean;
}

const COUNT_UNITS = [["days", 1], ["weeks", 7], ["months", MONTH_DAYS]] as const;

/**
 * Jensen's square of 90 in time: the count dates from the major high and low
 * in calendar days, weeks and months, between `from` and `to` (inclusive).
 */
export function jensenTimeCounts(bars: Bar[], from: Date, to: Date): JensenCount[] {
  if (bars.length === 0) return [];
  const { hi, lo } = extremes(bars);
  const a = ephemerisInstant(from).getTime();
  const b = ephemerisInstant(to).getTime();
  const out: JensenCount[] = [];
  for (const [ext, idx] of [["low", lo], ["high", hi]] as const) {
    const t0 = ephemerisInstant(new Date(bars[idx].t)).getTime();
    for (const [u, per] of COUNT_UNITS) {
      for (const p of JENSEN_TIME_POINTS) {
        const t = ephemerisInstant(new Date(t0 + Math.round(p * per) * DAY_MS)).getTime();
        if (t >= a && t <= b) out.push({ date: iso(t), from: ext, unit: u, points: p, square: JENSEN_SQUARE_POINTS.has(p) });
      }
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

// ---------------------------------------------------------------- aspects

export type JensenFamily = "square" | "trine" | "quintile" | "conjunction";
export interface JensenAspect {
  angle: number;
  family: JensenFamily;
  orb: number;
}

/** B16 §2: his three families and the conjunction, with his orbs. */
export const JENSEN_ASPECTS: JensenAspect[] = [
  { angle: 0, family: "conjunction", orb: 9 },
  ...[22.5, 45, 90, 135].map((angle) => ({ angle, family: "square" as const, orb: angle * 0.05 })),
  { angle: 180, family: "square", orb: 9 },
  ...[15, 30, 60, 120, 150].map((angle) => ({ angle, family: "trine" as const, orb: angle * 0.05 })),
  ...[18, 36, 54, 72, 144].map((angle) => ({ angle, family: "quintile" as const, orb: 2 })),
];

export const JENSEN_PAIRS = [
  ["Jupiter", "Saturn"],
  ["Saturn", "Uranus"],
  ["Jupiter", "Uranus"],
] as const;
export const JENSEN_TRIGGERS = ["Mars", "Mercury"] as const;
/** Engineering choice, labelled: Jensen names the trigger, not its orb. */
export const JENSEN_TRIGGER_ORB = 1;

type Slow = (typeof JENSEN_PAIRS)[number][number];
type Fast = (typeof JENSEN_TRIGGERS)[number];

/** What Jensen reads each family as. */
export const JENSEN_EXPECT: Record<JensenFamily, "decline" | "advance" | "reversal" | "turn"> = {
  square: "decline",
  trine: "advance",
  quintile: "reversal",
  conjunction: "turn",
};

export interface JensenAspectHit {
  pair: readonly [Slow, Slow];
  /** Their geocentric separation, 0–180°. */
  separation: number;
  aspect: JensenAspect;
  offBy: number;
  applying: boolean;
  /** Mars or Mercury in the same aspect to either planet of the pair, within 1°. */
  trigger: Fast | null;
}

export interface JensenAspectReading {
  date: string;
  hits: JensenAspectHit[];
  /** The square family outnumbering the trine family is bearish, and the reverse bullish. */
  bias: "bullish" | "bearish" | "mixed" | null;
  triggered: boolean;
}

/** The Jensen aspect a separation is in, nearest exact first, or null. */
export function jensenAspectOf(separation: number): JensenAspect | null {
  let best: JensenAspect | null = null;
  for (const a of JENSEN_ASPECTS) {
    const off = Math.abs(separation - a.angle);
    if (off <= a.orb && (!best || off < Math.abs(separation - best.angle))) best = a;
  }
  return best;
}

const sep = (a: number, b: number) => Math.abs(wrap(a, b));

const aspectCache = new Map<string, JensenAspectReading>();

/** Jensen's slow-planet aspects on the day of `asOf` (noon UTC). The same for every symbol, so cached. */
export function readJensenAspects(asOf: Date): JensenAspectReading {
  const t = ephemerisInstant(asOf).getTime();
  const key = iso(t);
  const hit = aspectCache.get(key);
  if (hit) return hit;
  const today = planetLongitudes(new Date(t)).geo;
  const next = planetLongitudes(new Date(t + DAY_MS)).geo;
  const hits: JensenAspectHit[] = [];
  for (const pair of JENSEN_PAIRS) {
    const s = sep(today[pair[0]], today[pair[1]]);
    const aspect = jensenAspectOf(s);
    if (!aspect) continue;
    const offBy = Math.abs(s - aspect.angle);
    const applying = Math.abs(sep(next[pair[0]], next[pair[1]]) - aspect.angle) < offBy;
    let trigger: Fast | null = null;
    for (const f of JENSEN_TRIGGERS) {
      if (!trigger && pair.some((b) => Math.abs(sep(today[f], today[b]) - aspect.angle) <= JENSEN_TRIGGER_ORB)) trigger = f;
    }
    hits.push({ pair, separation: s, aspect, offBy, applying, trigger });
  }
  const squares = hits.filter((h) => h.aspect.family === "square").length;
  const trines = hits.filter((h) => h.aspect.family === "trine").length;
  const bias = squares > trines ? "bearish" : trines > squares ? "bullish" : squares > 0 ? "mixed" : null;
  const reading = { date: key, hits, bias, triggered: hits.some((h) => h.trigger !== null) } as const;
  if (aspectCache.size > 20_000) aspectCache.clear();
  aspectCache.set(key, reading);
  return reading;
}

export interface JensenAspectEvent {
  date: string;
  kind: "exact" | "trigger";
  pair: readonly [Slow, Slow];
  aspect: JensenAspect;
  /** For a trigger: the fast planet and the slow planet it aspects. */
  trigger?: { fast: Fast; to: Slow };
  expect: (typeof JENSEN_EXPECT)[JensenFamily];
}

/** Days on which the signed separation a − b crosses ±angle. */
function crossed(prevA: number, prevB: number, a: number, b: number, angle: number): boolean {
  for (const target of angle === 0 || angle === 180 ? [angle] : [angle, -angle]) {
    const d0 = wrap(wrap(prevA, prevB), target);
    const d1 = wrap(wrap(a, b), target);
    if (d0 !== 0 && Math.sign(d0) !== Math.sign(d1) && Math.abs(d0 - d1) < 90) return true;
    if (d1 === 0) return true;
  }
  return false;
}

/**
 * Jensen's aspect calendar between two dates: each day a slow pair's aspect
 * is exact (retrograde passes included), and each day Mars or Mercury comes
 * into the same aspect to either planet while the pair is in orb. These are
 * Jensen's rule computed, not a forecast GSPS makes: under AGENTS.md's
 * forward-looking-claims rule a date shown to a person needs its measured
 * record linked, and none exists yet.
 */
export function jensenAspectCalendar(from: Date, to: Date): JensenAspectEvent[] {
  const a = ephemerisInstant(from).getTime();
  const b = ephemerisInstant(to).getTime();
  const out: JensenAspectEvent[] = [];
  let prev = planetLongitudes(new Date(a - DAY_MS)).geo;
  for (let t = a; t <= b; t += DAY_MS) {
    const cur = planetLongitudes(new Date(t)).geo;
    for (const pair of JENSEN_PAIRS) {
      for (const aspect of JENSEN_ASPECTS) {
        if (crossed(prev[pair[0]], prev[pair[1]], cur[pair[0]], cur[pair[1]], aspect.angle)) {
          out.push({ date: iso(t), kind: "exact", pair, aspect, expect: JENSEN_EXPECT[aspect.family] });
        }
      }
      const inOrb = jensenAspectOf(sep(cur[pair[0]], cur[pair[1]]));
      if (!inOrb) continue;
      for (const fast of JENSEN_TRIGGERS) {
        for (const slow of pair) {
          if (crossed(prev[fast], prev[slow], cur[fast], cur[slow], inOrb.angle)) {
            out.push({ date: iso(t), kind: "trigger", pair, aspect: inOrb, trigger: { fast, to: slow }, expect: JENSEN_EXPECT[inOrb.family] });
          }
        }
      }
    }
    prev = cur;
  }
  return out;
}

// ---------------------------------------------------------------- projection

export interface JensenProjection {
  direction: "up" | "down";
  /** The extreme close the 60° line runs from, and the earlier swing close the 45° line runs from. */
  fromDate: string;
  previousDate: string;
  date: string;
  price: number;
  /** The crossing is after the last bar. */
  ahead: boolean;
}

const TAN60 = Math.tan(Math.PI / 3);

/**
 * Jensen's exhaustion projection (Section IV, his own): a 60° line from the
 * extreme close and a 45° line from the previous swing close in the same
 * direction, one point a calendar day on the 45°. Up from the lowest close
 * when it is later than the highest close, down from the highest otherwise
 * (the down form is the Polarity mirror; Jensen works the up form). The
 * previous swing is the last three-day-chart bottom (or top) before the
 * extreme. Engineering choices, labelled: the daily chart, and that swing
 * chart as the reading of "the previous low-close day".
 */
export function jensenProjection(bars: Bar[], unit: number): JensenProjection | null {
  if (bars.length < 20 || !(unit > 0)) return null;
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].c <= bars[lo].c) lo = i;
    if (bars[i].c >= bars[hi].c) hi = i;
  }
  const up = lo > hi;
  const ext = up ? lo : hi;
  const kind = up ? "bottom" : "top";
  const prevPivot = walkSwingChart(bars, THREE_DAY_CHART)
    .pivots.filter((p) => p.kind === kind && p.index < ext)
    .pop();
  if (!prevPivot) return null;
  const sign = up ? 1 : -1;
  const t1 = new Date(bars[prevPivot.index].t).getTime() / DAY_MS;
  const t2 = new Date(bars[ext].t).getTime() / DAY_MS;
  const y1 = bars[prevPivot.index].c / unit;
  const y2 = bars[ext].c / unit;
  // y2 + sign·tan60·(t − t2) = y1 + sign·(t − t1)
  const t = (sign * (y1 - y2) - t1 + TAN60 * t2) / (TAN60 - 1);
  if (!(t >= t2)) return null;
  const price = (y1 + sign * (t - t1)) * unit;
  if (!(price > 0)) return null;
  const ms = Math.round(t) * DAY_MS;
  return {
    direction: up ? "up" : "down",
    fromDate: iso(new Date(bars[ext].t).getTime()),
    previousDate: iso(new Date(bars[prevPivot.index].t).getTime()),
    date: iso(ms),
    price,
    ahead: ms > new Date(bars[bars.length - 1].t).getTime(),
  };
}

// ---------------------------------------------------------------- forecast

export interface JensenWindow {
  date: string;
  source: "count" | "aspect" | "projection";
  expect: "turn" | "decline" | "advance" | "reversal";
  label: string;
  /** Only for the projection. */
  price?: number;
}

/**
 * Every dated Jensen reading between `from` and `to`, in one shape: the
 * input the shared time-window mechanism (parity plan item 7) takes, and what
 * the replay measures. Backend only until a measured record exists
 * (AGENTS.md, "Forward-looking claims").
 */
export function jensenWindows(bars: Bar[], unit: number, from: Date, to: Date): JensenWindow[] {
  const out: JensenWindow[] = [];
  for (const c of jensenTimeCounts(bars, from, to)) {
    out.push({ date: c.date, source: "count", expect: "turn", label: `Jensen's square of 90: ${c.points} ${c.unit} from the ${c.from}` });
  }
  for (const e of jensenAspectCalendar(from, to)) {
    const what = `${e.pair[0]}–${e.pair[1]} ${e.aspect.angle}° (${e.aspect.family})`;
    out.push({
      date: e.date,
      source: "aspect",
      expect: e.expect,
      label: e.kind === "exact" ? `Jensen: ${what} exact` : `Jensen: ${e.trigger!.fast} triggers ${what} at ${e.trigger!.to}`,
    });
  }
  const p = jensenProjection(bars, unit);
  if (p && p.ahead) {
    const t = ephemerisInstant(new Date(p.date)).getTime();
    if (t >= ephemerisInstant(from).getTime() && t <= ephemerisInstant(to).getTime()) {
      out.push({ date: p.date, source: "projection", expect: p.direction === "up" ? "decline" : "advance", label: `Jensen's projection: ${p.direction === "up" ? "advance" : "decline"} exhausts`, price: p.price });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

// ---------------------------------------------------------------- Plate 1 protractor

/**
 * C-LEVELS-22 (class C, Jensen, Plate 1, printed p. 110, PDF 61L; re-read at
 * 300 dpi, W049 visuals-reinspection): a table that turns square-of-90
 * points into protractor angles, so a line can be drawn without laying out
 * the whole square. Each scale point is 90 x up/over (45 = 4 up, 8 over). A
 * ray to the right margin at `points` rises `points` over 90, so its angle is
 * atan(points / 90); a ray to the top margin is the complement.
 *
 * GSPS gives the exact angle. The printed angles are rounded to quarter
 * degrees (26¼° for 45 points, against 26.57°). The X–G top angle prints as
 * 54½°, which is neither the complement of its own 37½° nor the geometry; it
 * is kept as printed and flagged, not corrected. The 15-point row appears
 * only in the scale table and has no ray.
 *
 * Display only: the angle is a label for a line, never a level, stop or gate.
 * Three-question basis: class C; no periodicity claim; Correspondence, the
 * same proportion read as a count of points and as an angle on the chart.
 */
export interface Plate1Row {
  ray: "A" | "B" | "C" | "D" | "E" | "F" | "G" | null;
  points: number;
  over: number;
  up: number;
  /** As printed ("Right Margin Upward"); null where the row has no ray. */
  printedRight: number | null;
  /** As printed ("Top of Graph to Right"). */
  printedTop: number | null;
  /** Exact: atan(points / 90), in degrees. */
  rightAngle: number;
  /** Exact: 90 minus `rightAngle`. */
  topAngle: number;
  /** The printed top angle is not the complement of the printed right angle. */
  misprint: boolean;
}

/** A square-of-90 point's line angle, exactly: atan(points / 90) in degrees. */
export function jensenPointAngle(points: number): number {
  return (Math.atan(points / JENSEN_SQUARE) * 180) / Math.PI;
}

const plate1Row = (ray: Plate1Row["ray"], over: number, up: number, printedRight: number | null, printedTop: number | null): Plate1Row => {
  const points = (JENSEN_SQUARE * up) / over;
  const rightAngle = jensenPointAngle(points);
  return {
    ray,
    points,
    over,
    up,
    printedRight,
    printedTop,
    rightAngle,
    topAngle: 90 - rightAngle,
    misprint: printedRight !== null && printedTop !== null && printedTop !== 90 - printedRight,
  };
};

export const PLATE_1: readonly Plate1Row[] = [
  plate1Row("A", 16, 1, 3.75, 86.25),
  plate1Row("B", 16, 2, 7.5, 82.5),
  plate1Row(null, 12, 2, null, null),
  plate1Row("C", 16, 4, 15, 75),
  plate1Row("D", 12, 4, 18.75, 71.25),
  plate1Row("E", 8, 4, 26.25, 63.75),
  plate1Row("F", 12, 8, 33.75, 56.25),
  plate1Row("G", 16, 12, 37.5, 54.5),
];

// ---------------------------------------------------------------- converging lines from multiple bottoms

/**
 * C-LEVELS-24 (class C, Jensen, printed pp. 111-113; Plate 3, the U.S. Steel
 * weekly from the July 1932 low, where a new base line is set at a
 * convergence): lines of 90, 45 and 22½ drawn from the tests of a double or
 * triple bottom converge on a major point. Jensen inverts the square at
 * highs (J-2), so a double or triple top is read the same way, lines falling.
 *
 * How GSPS reads it: the tests are the 3-Day Chart swing bottoms (tops) of the
 * cluster `readMultipleTops` reports. The lines are read in Jensen's points,
 * as Plate 1 lays them out: a line of N points rises N per 90 bars in the
 * Gann point (`unit`), so 90 is the 1x1, and each line carries its exact
 * angle (`jensenPointAngle`, C-LEVELS-22).
 *
 * Engineering choices, labelled: the candidate points are the crossings of
 * lines from different tests after the last test; a line passes a point
 * when it is within Jensen's one point (J-5) there; the major point is the
 * crossing the most lines pass, the earliest on a tie, then the one nearest
 * the last close; a crossing more than `CONVERGENCE_PAST_BARS` behind the last
 * bar is history and is not reported. A test belongs to the cluster when it
 * lies within twice the 3-point allowance of the cluster's level.
 *
 * Context only: shown and measured, never a level, stop, target or gate.
 * Three-question basis: class C, Jensen's own. Cycles: no periodicity claim.
 * Hermetic: Correspondence (separate tests of one level answering to one
 * point ahead), and Polarity for the top's mirror.
 */
export const CONVERGENCE_POINTS = [90, 45, 22.5] as const;
export const CONVERGENCE_PAST_BARS = 5;

export interface ConvergenceLine {
  testIndex: number;
  points: (typeof CONVERGENCE_POINTS)[number];
  /** Exact line angle in degrees (Plate 1, C-LEVELS-22). */
  angle: number;
}

export interface JensenConvergence {
  kind: "bottom" | "top";
  tests: { index: number; date: string; price: number }[];
  point: { index: number; barsFromNow: number; price: number; lines: ConvergenceLine[] };
}

export function jensenBottomConvergence(bars: Bar[], unit: number): JensenConvergence | null {
  if (bars.length < 20 || !(unit > 0)) return null;
  const multiple = readMultipleTops(bars);
  const last = bars.length - 1;
  const close = bars[last].c;
  let best: JensenConvergence | null = null;
  for (const m of [multiple.bottom, multiple.top]) {
    if (!m) continue;
    const band = 2 * gannThreePoints(m.level);
    const tests = walkSwingChart(bars, THREE_DAY_CHART)
      .pivots.filter((p) => p.kind === m.kind && p.index <= m.lastTestIndex && Math.abs(p.price - m.level) <= band)
      .slice(-m.tests);
    if (tests.length < 2) continue;
    const sign = m.kind === "bottom" ? 1 : -1;
    const lines = tests.flatMap((t) => CONVERGENCE_POINTS.map((points) => ({ t, points, slope: (sign * points * unit) / JENSEN_SQUARE })));
    const at = (l: (typeof lines)[number], i: number) => l.t.price + l.slope * (i - l.t.index);
    const lastTest = tests[tests.length - 1].index;
    for (let a = 0; a < lines.length; a++) {
      for (let b = a + 1; b < lines.length; b++) {
        const la = lines[a];
        const lb = lines[b];
        if (la.t.index === lb.t.index || la.slope === lb.slope) continue;
        const index = (lb.t.price - la.t.price + la.slope * la.t.index - lb.slope * lb.t.index) / (la.slope - lb.slope);
        if (!(index > lastTest) || index < last - CONVERGENCE_PAST_BARS) continue;
        const price = at(la, index);
        if (!(price > 0)) continue;
        const through = lines.filter((l) => Math.abs(at(l, index) - price) <= JENSEN_TOLERANCE * unit);
        const point = {
          index: Math.round(index),
          barsFromNow: Math.round(index) - last,
          price,
          lines: through.map((l) => ({ testIndex: l.t.index, points: l.points, angle: jensenPointAngle(l.points) })),
        };
        const cur = best?.point;
        const better =
          !cur ||
          point.lines.length > cur.lines.length ||
          (point.lines.length === cur.lines.length &&
            (point.index < cur.index || (point.index === cur.index && Math.abs(price - close) < Math.abs(cur.price - close))));
        if (better) {
          best = {
            kind: m.kind,
            tests: tests.map((t) => ({ index: t.index, date: bars[t.index].t.slice(0, 10), price: t.price })),
            point,
          };
        }
      }
    }
  }
  return best;
}

export function describeJensenConvergence(r: JensenConvergence): string {
  const name = `${r.tests.length >= 3 ? "triple" : "double"} ${r.kind}`;
  const when = r.point.barsFromNow === 0 ? "at this session" : r.point.barsFromNow > 0 ? `in ${r.point.barsFromNow} sessions` : `${-r.point.barsFromNow} sessions ago`;
  const lines = r.point.lines.map((l) => `${l.points} (${l.angle.toFixed(2)}°)`).join(", ");
  return `Lines from the ${name} at ${r.tests.map((t) => t.price.toFixed(2)).join(" and ")} converge near ${r.point.price.toFixed(2)} ${when}: ${lines}. Shown for context; it does not change the setup.`;
}
