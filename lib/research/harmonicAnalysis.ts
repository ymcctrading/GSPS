/**
 * Harmonic analysis as the published recipe gives it, and two extensions
 * (X6: C-TIME-32, -33, -34, CYC-36): research only. Nothing on the verdict
 * path imports this module (`lib/validation/__tests__/criteria-gate.test.ts`)
 * and nothing here runs on a scan.
 *
 * Sources, in our own words:
 * - Awodele (W007 pp.25-39): A0 is the series' mean; for each whole trial
 *   period T from 3 to half the record, a = (2/N)Σx·cos(2πt/T) and
 *   b = (2/N)Σx·sin(2πt/T), N being the most observations that hold whole
 *   cycles of T; periods rank by a² + b². The dominant periods' waves are then
 *   summed and t extended to project the composite forward. For stocks he uses
 *   the weekly (high + low)/2 midpoint (p.37). He picks the periods to combine
 *   "after some experimentation" (p.39) and concedes the dominant cycle may
 *   not persist (p.35).
 * - Halberg et al. (W041 pp.25-29): gliding (moving-window) spectra, so a
 *   component that comes and goes or changes period shows in its own window.
 *
 * **Where this differs from `lib/gann/spectralCycle.ts`, on purpose.** The
 * scan's detector scans 5 bars to 0.4 of the window on detrended log closes
 * and does not trim. The recipe here keeps Awodele's 3 to N/2 and trims to
 * whole cycles, as his text gives it. The two conflict on repetitions (see
 * `AWODELE_BAND_CONFLICT`); the scan keeps Dewey's side.
 *
 * Three-question basis:
 * 1. Source: Awodele's reconstruction of the harmonic analysis that *Tunnel
 *    Thru the Air* names (Ch. VII-VIII); W007 is a later reconstruction, not
 *    the primary text.
 * 2. Cycles: the composite is scored only on data it never saw, against a
 *    null of random periods (Dewey's persistence after discovery), because
 *    hand-picked periods fit their own data by construction. The gliding
 *    periodogram is Halberg's answer to constancy of period.
 * 3. Hermetic: Rhythm and Vibration (several rhythms summed, each with its
 *    own period), tested forward rather than assumed.
 *
 * Engineering choices, labelled as such: three components, chosen as the
 * three strongest local peaks on the first 70% (a fixed rule in place of
 * Awodele's experimentation); a band of 5 bars to 0.4 of the training window
 * for the composite; 99 null draws of log-uniform periods; the pass rule
 * (correlation above 0 and null p at or under 0.05) fixed here before any
 * run; weeks start on Monday, UTC.
 */
import type { Bar } from "@/lib/types";
import { linearDetrend, periodPower } from "@/lib/gann/spectralCycle";

export const AWODELE_BAND_CONFLICT =
  "The recipe tries periods up to half the record, which repeat only twice; Dewey's repetitions criterion holds that so few repetitions decide nothing, so the scan stops at 0.4 of the window and asks five repetitions before it credits a cycle.";

export interface AwodelePeriod {
  period: number;
  /** Observations used: the most that hold whole cycles of `period`. */
  n: number;
  a: number;
  b: number;
  power: number;
}

/** C-TIME-32: the recipe as published, ranked by a² + b² (strongest first). */
export function awodeleHarmonicAnalysis(x: number[], minPeriod = 3): { a0: number; periods: AwodelePeriod[] } {
  const a0 = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0;
  const periods: AwodelePeriod[] = [];
  for (let T = minPeriod; T <= Math.floor(x.length / 2); T++) {
    const n = Math.floor(x.length / T) * T;
    let a = 0;
    let b = 0;
    for (let t = 0; t < n; t++) {
      a += x[t] * Math.cos((2 * Math.PI * t) / T);
      b += x[t] * Math.sin((2 * Math.PI * t) / T);
    }
    a = (2 * a) / n;
    b = (2 * b) / n;
    periods.push({ period: T, n, a, b, power: a * a + b * b });
  }
  periods.sort((p, q) => q.power - p.power);
  return { a0, periods };
}

function correlation(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fourier coefficients at `period` over whole cycles of `train` (Awodele's trimming). */
function wave(train: number[], period: number): { a: number; b: number } {
  const n = Math.max(1, Math.floor(train.length / period)) * period;
  const m = Math.min(train.length, Math.round(n));
  let a = 0;
  let b = 0;
  for (let t = 0; t < m; t++) {
    a += train[t] * Math.cos((2 * Math.PI * t) / period);
    b += train[t] * Math.sin((2 * Math.PI * t) / period);
  }
  return { a: (2 * a) / m, b: (2 * b) / m };
}

/**
 * C-TIME-33: choose the strongest `components` periods on the first 70%,
 * sum their waves, extend t across the last 30% and correlate with it. The
 * same is done for 99 draws of random periods; `nullP` is the share that do
 * as well. Null when the series is too short to split.
 */
export function compositeHoldout(
  values: number[],
  opts: { components?: number; trainFraction?: number; nullDraws?: number; seed?: number } = {},
): { periods: number[]; correlation: number; nullP: number; passes: boolean } | null {
  const k = opts.components ?? 3;
  const cut = Math.floor(values.length * (opts.trainFraction ?? 0.7));
  const lo = 5;
  const hi = Math.floor(cut * 0.4);
  if (values.length - cut < 10 || hi <= lo + 2) return null;
  const train = linearDetrend(values.slice(0, cut));
  const test = linearDetrend(values.slice(cut));
  const grid: { p: number; pw: number }[] = [];
  for (let p = lo; p <= hi; p++) grid.push({ p, pw: periodPower(train, p) });
  const peaks = grid
    .filter((g, i) => i > 0 && i < grid.length - 1 && g.pw > grid[i - 1].pw && g.pw >= grid[i + 1].pw)
    .sort((x, y) => y.pw - x.pw)
    .slice(0, k)
    .map((g) => g.p);
  if (peaks.length === 0) return null;
  const score = (periods: number[]) => {
    const fits = periods.map((p) => ({ p, ...wave(train, p) }));
    const projected = test.map((_, j) =>
      fits.reduce((s, f) => s + f.a * Math.cos((2 * Math.PI * (cut + j)) / f.p) + f.b * Math.sin((2 * Math.PI * (cut + j)) / f.p), 0),
    );
    return correlation(projected, test);
  };
  const observed = score(peaks);
  const rnd = seeded(opts.seed ?? 1);
  const draws = opts.nullDraws ?? 99;
  let beaten = 0;
  for (let d = 0; d < draws; d++) {
    const random = peaks.map(() => lo * Math.pow(hi / lo, rnd()));
    if (score(random) >= observed) beaten++;
  }
  const nullP = Math.round(((1 + beaten) / (1 + draws)) * 1000) / 1000;
  return { periods: peaks, correlation: Math.round(observed * 1000) / 1000, nullP, passes: observed > 0 && nullP <= 0.05 };
}

/**
 * C-TIME-34: weekly bars whose close is the week's (high + low)/2 midpoint,
 * for `detectSpectralCycle` or any series reader. Open is the week's first,
 * volume the week's sum, t the week's first bar.
 */
export function weeklyMidpointBars(dailyBars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let key = "";
  for (const bar of dailyBars) {
    const d = new Date(bar.t);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const k = monday.toISOString().slice(0, 10);
    if (k !== key) {
      key = k;
      out.push({ t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: (bar.h + bar.l) / 2, v: bar.v });
      continue;
    }
    const w = out[out.length - 1];
    w.h = Math.max(w.h, bar.h);
    w.l = Math.min(w.l, bar.l);
    w.v += bar.v;
    w.c = (w.h + w.l) / 2;
  }
  return out;
}

/**
 * CYC-36: the dominant period in each window of `window` bars, stepped by
 * `step` (Halberg's gliding spectrum, reduced to its peak per window). The
 * band per window is 5 bars to 0.4 of the window.
 */
export function glidingPeriodogram(
  values: number[],
  window: number,
  step: number,
): { start: number; end: number; period: number; dominance: number }[] {
  const out: { start: number; end: number; period: number; dominance: number }[] = [];
  const hi = Math.floor(window * 0.4);
  if (hi < 6 || step < 1) return out;
  for (let start = 0; start + window <= values.length; start += step) {
    const d = linearDetrend(values.slice(start, start + window));
    let best = 5;
    let bestPw = -Infinity;
    let total = 0;
    let count = 0;
    for (let p = 5; p <= hi; p++) {
      const pw = periodPower(d, p);
      total += pw;
      count++;
      if (pw > bestPw) {
        bestPw = pw;
        best = p;
      }
    }
    const mean = total / count;
    out.push({ start, end: start + window, period: best, dominance: mean > 0 ? Math.round((bestPw / mean) * 100) / 100 : 0 });
  }
  return out;
}
