/**
 * Section 2, the time engine: candidate turn dates from every source, each
 * with its rule label and the bar from which it was knowable. RESEARCH ONLY.
 *
 * Gann's own text behind the sources (records in docs/memory-bank/sources/):
 * - "Time is the most important factor ... When time is up, space movement
 *   will start" (Master Course, A2_1 Ch. on time; *Commodities* p.56).
 * - Day counts from any high or low: 7-12, 18-21, 28-31, 42-49, 57-65, 85-92,
 *   112-120, 150-157, 175-185, and the dated seasonal change windows
 *   (*45 Years in Wall Street*, 1949, Ch. II Rule 8).
 * - Anniversaries 1, 2, 3 years from extreme highs and lows (*New Stock Trend
 *   Detector* pp.14-15, 44; *Commodities* p.58), and divisions of the circle
 *   (the 1/8ths and 1/3rds of 360) in days, weeks and months (Master Course,
 *   the time chapters; `lib/gann/timeCycles.ts`).
 * - Seasonal time from the Sun's cardinal points (Master Course Ch. 5,
 *   counted from March 21).
 * - Time and price balance: a price move in points matched by time (Master
 *   Course Ch. 18, PDF p.440; `lib/gann/timePriceSquare.ts`).
 * The squared bar counts, square roots, lunar 50/40 steps, planetary returns
 * and the cycle analysis come from the handoff's secondary sources; the
 * private ledger names them.
 */
import type { Bar } from "@/lib/types";
import { BarClock, MONTH_DAYS, isoDay } from "./calendar";
import type { EngineConfig, TimeFamily } from "./config";
import { aspectDays, eclipseDays, ingressDays, norm360, sky, stationDays, sunDegreeDays, type Planet } from "./sky";
import { runStats, type Pivot } from "./swing";

export interface TimeCandidate {
  family: TimeFamily;
  rule: string;
  /** Centre of the window, as a bar index. */
  index: number;
  /** Half-width in bars. */
  tol: number;
  /** First bar at whose close the candidate was knowable. */
  avail: number;
  /** Bar from which the window no longer counts (its pivot fell out of the recent set); Infinity if never. */
  expire: number;
}

export const CIRCLE_COUNTS = [30, 45, 60, 90, 120, 135, 144, 180, 225, 240, 270, 315, 360, 49, 52, 84, 7, 14, 21, 28] as const;
export const MAJOR_COUNTS = new Set([90, 144, 180, 360]);
/** Gann's day-count windows from a high or low (A09 Ch. II Rule 8), calendar days. */
export const GANN_DAY_WINDOWS: readonly [number, number][] = [[7, 12], [18, 21], [28, 31], [42, 49], [57, 65], [85, 92], [112, 120], [150, 157], [175, 185]];
/** Gann's seasonal change windows (A09 Ch. II Rule 8): [month, fromDay, toDay]. */
export const GANN_SEASONAL_WINDOWS: readonly [number, number, number][] = [
  [1, 7, 10], [1, 19, 24], [2, 3, 10], [2, 20, 25], [3, 20, 27], [4, 7, 12], [4, 20, 25], [5, 3, 10], [5, 21, 28],
  [6, 10, 15], [6, 21, 27], [7, 7, 10], [7, 21, 27], [8, 5, 8], [8, 14, 20], [9, 3, 10], [9, 21, 28], [10, 7, 14],
  [10, 21, 30], [11, 5, 10], [11, 20, 30], [12, 3, 10], [12, 15, 24],
];

/** H5: a bar count squared, its decimal shifted while over 100 (13 -> 169 -> 16.9; 9 -> 81). */
export function squaredCount(n: number): number {
  let v = n * n;
  while (v > 100) v /= 10;
  return v;
}

/** Decimal shifts of a number that land inside [lo, hi]. */
export function decimalShifts(v: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const k of [0.01, 0.1, 1, 10, 100]) {
    const x = v * k;
    if (x >= lo && x <= hi) out.push(x);
  }
  return out;
}

const pv = (p: Pivot, dates: string[]) => `${p.kind} ${dates[p.index]?.slice(0, 10) ?? p.index} @ ${p.price.toFixed(2)}`;

export interface TimeContext {
  bars: Bar[];
  dates: string[];
  clock: BarClock;
  /** Major pivots, all of them (each carries the bar it became known). */
  pivots: Pivot[];
  cfg: EngineConfig;
  /** First-trade ("natal") date of the symbol, if known. */
  natal?: string | null;
}

/** Candidates projected from one pivot, given the pivots known with it. */
function fromPivot(ctx: TimeContext, known: Pivot[], p: Pivot, out: TimeCandidate[]): void {
  const { clock, dates, cfg } = ctx;
  const on = cfg.timeOn;
  const w = cfg.windowBars;
  const d0 = clock.dayOf(p.index);
  const avail = known[known.length - 1].known;
  const H = cfg.horizonDays;
  // the window closes when `timePivots` newer major pivots are known
  const later = ctx.pivots[ctx.pivots.indexOf(p) + cfg.timePivots];
  const expire = later ? later.known : Infinity;
  const add = (family: TimeFamily, index: number, tol: number, rule: string) => {
    if (!on[family]) return;
    if (index <= p.index || clock.dayOf(index) - d0 > H) return;
    out.push({ family, index, tol, rule, avail, expire: family === "T4.anniv" ? Infinity : expire });
  };
  const addDay = (family: TimeFamily, day: number, tol: number, rule: string) => {
    if (day - d0 > H || day <= d0) return;
    add(family, clock.indexOnOrAfter(Math.round(day)), tol, rule);
  };
  const from = pv(p, dates);

  // T1 circle counts in calendar days, trading bars, weeks and months.
  for (const c of CIRCLE_COUNTS) {
    const fam: TimeFamily = MAJOR_COUNTS.has(c) ? "T1.major" : "T1.minor";
    addDay(fam, d0 + c, w.major, `${c} calendar days from ${from}`);
    add(fam, p.index + c, w.major, `${c} trading days from ${from}`);
    addDay(fam, d0 + 7 * c, w.major, `${c} weeks from ${from}`);
    addDay(fam, d0 + c * MONTH_DAYS, w.long, `${c} months from ${from}`);
  }
  // Gann's own day counts: the window itself is the tolerance.
  for (const [a, b] of GANN_DAY_WINDOWS) {
    const i0 = clock.indexOnOrAfter(d0 + a);
    const i1 = clock.indexOnOrAfter(d0 + b + 1) - 1;
    if (i1 >= i0) add("T1.days", Math.round((i0 + i1) / 2), Math.ceil((i1 - i0) / 2), `${a}-${b} days from ${from}`);
  }

  // T2 from the swings that end at p.
  const k = known.indexOf(p);
  if (k >= 1) {
    const a = known[k - 1];
    const D = p.index - a.index;
    for (const f of [0.5, 1, 1.5, 2]) add("T2.expand", Math.round(p.index + D * f), w.major, `${f} x the ${D}-bar swing ${a.kind}->${p.kind}, from ${from}`);
    const sq = squaredCount(D);
    add("T2.squared", Math.round(p.index + sq), w.major, `${D} bars squared -> ${sq.toFixed(1)} bars from ${from}`);
    if (k >= 2) {
      const b = known[k - 2];
      const E = p.index - b.index; // same-kind span (low->low or high->high)
      for (const f of [0.5, 1, 1.5, 2]) add("T2.expand", Math.round(p.index + E * f), w.major, `${f} x the ${E}-bar ${p.kind}->${p.kind} span, from ${from}`);
      const prevD = a.index - b.index;
      const prod = squaredCount(Math.sqrt(prevD * D));
      add("T2.squared", Math.round(p.index + prod), w.major, `${prevD} x ${D} bars -> ${prod.toFixed(1)} bars from ${from}`);
    }
    const rs = runStats(known.slice(0, k + 1), cfg.runLookback);
    if (rs.projection) add("T2.run", rs.projection.index, w.major, `average run from ${from}`);

    // T3: the swing's range, low and high as time.
    const lo = Math.min(a.price, p.price);
    const hi = Math.max(a.price, p.price);
    const range = hi - lo;
    for (const [name, v] of [["range", range], ["low", lo], ["high", hi]] as const) {
      for (const m of [1, 2, 3]) {
        const r = Math.sqrt(v) * m;
        addDay("T3.sqrt", d0 + r, w.major, `sqrt(${name} ${v.toFixed(2)}) x${m} = ${r.toFixed(1)} calendar days from ${from}`);
        add("T3.sqrt", Math.round(p.index + r), w.major, `sqrt(${name} ${v.toFixed(2)}) x${m} = ${r.toFixed(1)} trading days from ${from}`);
      }
      for (const x of decimalShifts(v, 5, H)) addDay("T3.asTime", d0 + x, w.major, `${name} ${v.toFixed(2)} as ${x.toFixed(1)} days from ${from}`);
      for (const x of decimalShifts(v, 1, H / 7)) addDay("T3.asTime", d0 + 7 * x, w.major, `${name} ${v.toFixed(2)} as ${x.toFixed(1)} weeks from ${from}`);
      for (const x of decimalShifts(v, 1, H / MONTH_DAYS)) addDay("T3.asTime", d0 + x * MONTH_DAYS, w.long, `${name} ${v.toFixed(2)} as ${x.toFixed(1)} months from ${from}`);
    }
    if (on["T3.planet"]) {
      for (const pl of ["Mars", "Venus"] as Planet[]) {
        for (const x of decimalShifts(range, 3, 360)) {
          const day = sky().travelDay(pl, d0, x, H);
          if (day !== null) addDay("T3.planet", day, w.major, `${pl} travels ${x.toFixed(1)} deg (range) from ${from}`);
        }
      }
    }
  }

  // T4 solar degrees and anniversaries from the pivot.
  if (on["T4.solarDeg"]) {
    for (const deg of [30, 45, 60, 90, 120, 135, 144, 180, 225, 240, 270, 315, 360]) {
      const day = sky().travelDay("Sun", d0, deg, H);
      if (day !== null) addDay("T4.solarDeg", day, w.major, `Sun +${deg} deg from ${from}`);
    }
  }
  for (const y of [1, 2, 3]) {
    const t = new Date(dates[p.index].slice(0, 10) + "T00:00:00Z");
    t.setUTCFullYear(t.getUTCFullYear() + y);
    addDay("T4.anniv", Math.floor(t.getTime() / 86_400_000), w.major, `${y}-year anniversary of ${from}`);
  }

  // T5 Moon steps of 50 and 40 degrees, to 180 (the 630 variant is the same walk continued).
  if (on["T5.lunar"]) {
    let acc = 0;
    let step = 0;
    while (acc < 180) {
      acc += step % 2 === 0 ? 50 : 40;
      step++;
      const day = sky().travelDay("Moon", d0, acc, 60);
      if (day !== null) addDay("T5.lunar", day, w.short, `Moon +${acc} deg (50/40 steps) from ${from}`);
    }
  }

  // T6 planet returns to the pivot's longitude.
  if (on["T6.return"]) {
    for (const pl of ["Sun", "Mercury", "Venus", "Mars"] as Planet[]) {
      const target = sky().at(pl, d0);
      for (const day of sky().crossings(pl, target, d0 + 20, d0 + H)) addDay("T6.return", day, w.major, `${pl} back to ${target.toFixed(1)} deg (${from})`);
    }
  }

  // T7 nominal troughs from bottoms.
  if (p.kind === "bottom") for (const n of [20, 40, 80]) add("T7.hurst", p.index + n, w.major, `nominal ${n}-bar trough from ${from}`);
}

/** Goertzel power of `x` at period `per` (bars). */
export function goertzel(x: ArrayLike<number>, per: number): { power: number; phase: number } {
  const { cos, sin } = trigTable(per, x.length);
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    re += x[i] * cos[i];
    im -= x[i] * sin[i];
  }
  return { power: re * re + im * im, phase: Math.atan2(im, re) };
}

/**
 * cos(w·i) and sin(w·i) for i < n at w = 2π/per, computed once a process and reused: the same values the loop
 * computed inline, so every result is unchanged (dominantCycles calls this for 121 periods at every bar it reads).
 */
const trigTables = new Map<string, { cos: Float64Array; sin: Float64Array }>();
function trigTable(per: number, n: number): { cos: Float64Array; sin: Float64Array } {
  const key = `${per}|${n}`;
  let t = trigTables.get(key);
  if (!t) {
    const w = (2 * Math.PI) / per;
    const cos = new Float64Array(n);
    const sin = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      cos[i] = Math.cos(w * i);
      sin[i] = Math.sin(w * i);
    }
    t = { cos, sin };
    trigTables.set(key, t);
  }
  return t;
}

/**
 * Dominant cycles on the trailing `n` log closes ending at bar `t` (linear
 * trend removed), periods 8..128, top `top` by power, and the composite's
 * next trough and peak within 128 bars. Reads nothing after bar `t`.
 */
export function dominantCycles(bars: Bar[], t: number, n = 256, top = 3): { periods: number[]; trough: number | null; peak: number | null } {
  if (t + 1 < n) return { periods: [], trough: null, peak: null };
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = Math.log(bars[t - n + 1 + i].c);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  for (let i = 0; i < n; i++) y[i] -= a + b * i;
  const scored: { per: number; power: number; phase: number }[] = [];
  for (let per = 8; per <= 128; per++) scored.push({ per, ...goertzel(y, per) });
  // local maxima only, so one wide peak is not counted three times
  const peaks = scored.filter((s, i) => (i === 0 || s.power >= scored[i - 1].power) && (i === scored.length - 1 || s.power >= scored[i + 1].power));
  peaks.sort((p, q) => q.power - p.power);
  const chosen = peaks.slice(0, top);
  const comp = (k: number) => chosen.reduce((s, c) => s + Math.sqrt(c.power) * Math.cos((2 * Math.PI * k) / c.per + c.phase), 0);
  let trough: number | null = null;
  let peak: number | null = null;
  let prev = comp(n - 1);
  let cur = comp(n);
  for (let k = n + 1; k <= n + 128 && (trough === null || peak === null); k++) {
    const next = comp(k);
    if (trough === null && cur < prev && cur <= next) trough = t + (k - 1 - (n - 1));
    if (peak === null && cur > prev && cur >= next) peak = t + (k - 1 - (n - 1));
    prev = cur;
    cur = next;
  }
  return { periods: chosen.map((c) => c.per), trough, peak };
}

/** Every time candidate for a symbol, from its pivots and the calendar. */
export function timeCandidates(ctx: TimeContext): TimeCandidate[] {
  const { bars, clock, pivots, cfg, dates } = ctx;
  const on = cfg.timeOn;
  const w = cfg.windowBars;
  const out: TimeCandidate[] = [];
  if (bars.length === 0) return out;
  const first = clock.dayOf(0);
  const last = clock.dayOf(bars.length - 1) + 30;

  // Pivot-based, each from the pivots known at its confirmation.
  for (let k = 0; k < pivots.length; k++) {
    // each pivot projects once, when it becomes the newest pivot known, from the pivots known then;
    // its windows stay open to the horizon (Gann counts from every important top and bottom)
    fromPivot(ctx, pivots.slice(0, k + 1), pivots[k], out);
    // the cycle analysis reads the closes up to this pivot's confirmation
    if (on["T7.cycle"]) {
      const at = pivots[k].known;
      const dc = dominantCycles(bars, at);
      if (dc.trough !== null) out.push({ family: "T7.cycle", index: dc.trough, tol: w.major, rule: `composite trough (periods ${dc.periods.join("/")}) seen ${dates[at].slice(0, 10)}`, avail: at, expire: Infinity });
      if (dc.peak !== null) out.push({ family: "T7.cycle", index: dc.peak, tol: w.major, rule: `composite peak (periods ${dc.periods.join("/")}) seen ${dates[at].slice(0, 10)}`, avail: at, expire: Infinity });
    }
  }

  // Calendar sources, known in advance.
  const cal = (family: TimeFamily, day: number, tol: number, rule: string) => {
    if (on[family]) out.push({ family, index: clock.indexOnOrAfter(day), tol, rule, avail: 0, expire: Infinity });
  };
  for (const e of sunDegreeDays(45, 0, first - 1, last)) {
    const cardinal = e.deg % 90 === 0;
    cal(cardinal ? "T4.season" : "T4.mid", e.day, w.major, `Sun at ${e.deg} deg ${isoDay(e.day)}`);
  }
  if (on["T4.calendar"]) {
    for (let y = new Date(first * 86_400_000).getUTCFullYear(); y <= new Date(last * 86_400_000).getUTCFullYear(); y++) {
      for (const [m, a, b] of GANN_SEASONAL_WINDOWS) {
        const i0 = clock.indexOnOrAfter(Math.floor(Date.UTC(y, m - 1, a) / 86_400_000));
        const i1 = clock.indexOnOrAfter(Math.floor(Date.UTC(y, m - 1, b + 1) / 86_400_000)) - 1;
        if (i1 >= i0) out.push({ family: "T4.calendar", index: Math.round((i0 + i1) / 2), tol: Math.ceil((i1 - i0) / 2), rule: `seasonal window ${m}/${a}-${m}/${b}`, avail: 0, expire: Infinity });
      }
    }
  }
  if (on["T6.ingress"]) for (const pl of ["Sun", "Mercury", "Mars"] as Planet[]) for (const d of ingressDays(pl, first - 1, last)) cal("T6.ingress", d, w.short, `${pl} changes sign ${isoDay(d)}`);
  if (on["T6.station"]) for (const pl of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as Planet[]) for (const d of stationDays(pl, first - 1, last)) cal("T6.station", d, w.short, `${pl} station ${isoDay(d)}`);
  if (on["T6.natal"] && ctx.natal) {
    const nd = Math.floor(Date.parse(ctx.natal + "T00:00:00Z") / 86_400_000);
    const nMars = sky().at("Mars", nd);
    const nSun = sky().at("Sun", nd);
    for (const [target, name] of [[nMars, "natal Mars"], [norm360(nSun + 90), "natal Sun +90"], [norm360(nSun + 180), "natal Sun +180"], [norm360(nSun + 270), "natal Sun +270"]] as const) {
      for (const d of sky().crossings("Sun", target, first - 1, last)) cal("T6.natal", d, w.major, `Sun at ${name} (${target.toFixed(1)} deg) ${isoDay(d)}`);
    }
  }
  return out;
}

/** Sky events for grading: hard aspects among Sun..Saturn, eclipses, and decan changes of the Sun. */
export function gradeEvents(fromDay: number, toDay: number): Set<number> {
  const s = new Set<number>();
  const bodies: Planet[] = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) for (const e of aspectDays(bodies[i], bodies[j], [0, 90, 180, 270], fromDay, toDay)) s.add(e.day);
  for (const d of eclipseDays(fromDay, toDay)) s.add(d);
  for (const e of sunDegreeDays(10, 0, fromDay, toDay)) s.add(e.day);
  return s;
}
