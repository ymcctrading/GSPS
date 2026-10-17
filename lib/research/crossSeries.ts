/**
 * Cycles across series (CYC-14, CYC-15, CYC-16, CYC-17, CYC-49): research and validation
 * only. Nothing on the verdict path imports this module, and a period match
 * between series or domains is a hint, never proof (CYC-41; guarded in
 * `lib/validation/__tests__/criteria-gate.test.ts`).
 *
 * Sources: Dewey's cross-series clustering and wave-shape identity criteria,
 * and his use of a well-established cycle in one series as a prior for a
 * related one (*The Case for Cycles*, 1967; Dewey & Dakin 1947), summarised in
 * `docs/memory-bank/sources/C06_dewey_case_for_cycles.md`.
 *
 * Three-question basis:
 * 1. Gann: none directly; these test the cycles `spectralCycle.ts` finds
 *    (Gann's harmonic analysis, Tunnel Ch. VII-VIII).
 * 2. Cycles: Dewey's cross-series clustering (CYC-14), prior from a related
 *    series (CYC-16), wave-shape identity (CYC-17), synchrony within a lag
 *    window (CYC-15; W039 pp.21-22) and the chance baseline for a family of
 *    doubled and tripled periods (CYC-49; W039 p.31, Tomes W042/W044).
 * 3. Hermetic: Correspondence ("as above, so below": the same rhythm in
 *    related series is what it predicts), held to a chance rate so it is
 *    tested, not assumed.
 *
 * Engineering choices, labelled as such: a match is within ±5% of the
 * reference period; the null spreads periods log-uniformly over the scanned
 * band; the reference is the series with the most matches, so the p-value is
 * multiplied by the number of series (Bonferroni); priors combine by Fisher's
 * method; wave shapes fold into 12 phase bins on the shared dates; a crest
 * is the highest bar within half a period either side; the family grid runs
 * to four doubling/tripling steps, as Dewey's Fig. 19 does.
 */
import type { Bar } from "@/lib/types";
import { SIDEREAL_DAYS, synodicPeriod, type PeriodBody } from "@/lib/research/planetaryPeriods";

export interface SeriesCycle {
  symbol: string;
  /** Dominant period in bars (`detectSpectralCycle`), null when none. */
  period: number | null;
  /** Schuster p for that period. */
  schusterP: number | null;
  /** The band of periods scanned, in bars. */
  minPeriod: number;
  maxPeriod: number;
}

const MATCH_TOLERANCE = 0.05;

const matches = (a: number, ref: number, tol: number) => Math.abs(a - ref) / ref <= tol;

/** P(X ≥ k) for X ~ Binomial(m, q). */
function binomialTail(m: number, k: number, q: number): number {
  let choose = 1;
  let total = 0;
  for (let i = 0; i <= m; i++) {
    if (i > 0) choose = (choose * (m - i + 1)) / i;
    if (i >= k) total += choose * q ** i * (1 - q) ** (m - i);
  }
  return Math.min(1, total);
}

/** CYC-14: the series sharing a period, and how often chance would give that many. */
export function samePeriodAcrossSeries(
  cycles: SeriesCycle[],
  tolerance = MATCH_TOLERANCE,
): { reference: number; matches: string[]; chanceRate: number; p: number } | null {
  const found = cycles.filter((c): c is SeriesCycle & { period: number } => c.period !== null && c.period > 0);
  if (found.length < 2) return null;
  let best = found[0];
  let bestCount = -1;
  for (const ref of found) {
    const k = found.filter((c) => c !== ref && matches(c.period, ref.period, tolerance)).length;
    if (k > bestCount) {
      bestCount = k;
      best = ref;
    }
  }
  const rates = found.map((c) => Math.min(1, Math.log((1 + tolerance) / (1 - tolerance)) / Math.log(c.maxPeriod / c.minPeriod)));
  const chanceRate = rates.reduce((s, v) => s + v, 0) / rates.length;
  const others = found.length - 1;
  const p = Math.min(1, found.length * binomialTail(others, bestCount, chanceRate));
  return {
    reference: best.period,
    matches: found.filter((c) => matches(c.period, best.period, tolerance)).map((c) => c.symbol),
    chanceRate,
    p: Math.round(p * 10000) / 10000,
  };
}

/**
 * CYC-16: an index's well-established cycle as a prior for a constituent.
 * When the periods match, the two Schuster p-values combine by Fisher's
 * method; otherwise the constituent's own p stands. Fisher assumes the two
 * tests are independent, and an index and its constituent are not, so the
 * combined p overstates the evidence; read it as an upper bound on strength.
 */
export function periodPrior(
  index: SeriesCycle,
  constituent: SeriesCycle,
  tolerance = MATCH_TOLERANCE,
): { periodsMatch: boolean; combinedP: number | null } {
  const own = constituent.schusterP;
  if (index.period === null || constituent.period === null || index.schusterP === null || own === null) {
    return { periodsMatch: false, combinedP: own };
  }
  if (!matches(constituent.period, index.period, tolerance)) return { periodsMatch: false, combinedP: own };
  const x = -2 * (Math.log(Math.max(index.schusterP, 1e-12)) + Math.log(Math.max(own, 1e-12)));
  // Chi-square with 4 degrees of freedom: P(X > x) = e^(−x/2)(1 + x/2).
  return { periodsMatch: true, combinedP: Math.round(Math.exp(-x / 2) * (1 + x / 2) * 10000) / 10000 };
}

const day = (t: string) => t.slice(0, 10);

function detrendLog(closes: number[]): number[] {
  const y = closes.map((c) => Math.log(Math.max(c, 1e-9)));
  const n = y.length;
  const mx = (n - 1) / 2;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  y.forEach((v, i) => {
    num += (i - mx) * (v - my);
    den += (i - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return y.map((v, i) => v - (my + slope * (i - mx)));
}

function corr(x: number[], y: number[]): number {
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

/**
 * CYC-17: fold each series at `period` on their shared dates, average each
 * phase bin, and correlate the two average waves. The period is in bars, so
 * the fold counts bars in the date-aligned shared series, not calendar days.
 */
export function waveShapeCorrelation(a: Bar[], b: Bar[], period: number, bins = 12): { correlation: number; cycles: number } | null {
  const bByDay = new Map(b.map((x) => [day(x.t), x.c]));
  const shared = a.filter((x) => bByDay.has(day(x.t)));
  if (!(period > 1) || shared.length < 3 * period) return null;
  const da = detrendLog(shared.map((x) => x.c));
  const db = detrendLog(shared.map((x) => bByDay.get(day(x.t))!));
  // Fold on the bar index of the shared series: both series sit on the same
  // dates, so the same index is the same bar in each.
  const profile = (d: number[]) => {
    const sum = new Array(bins).fill(0);
    const cnt = new Array(bins).fill(0);
    shared.forEach((_, i) => {
      const bin = Math.min(bins - 1, Math.floor((i % period) / (period / bins)));
      sum[bin] += d[i];
      cnt[bin]++;
    });
    return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  };
  return { correlation: Math.round(corr(profile(da), profile(db)) * 1000) / 1000, cycles: Math.floor(shared.length / period) };
}

/** Crests: bars that are the highest within half a period either side. */
function crestIndices(values: number[], period: number): number[] {
  const h = Math.max(1, Math.floor(period / 2));
  const out: number[] = [];
  for (let i = h; i < values.length - h; i++) {
    let top = true;
    for (let j = i - h; j <= i + h && top; j++) if (values[j] > values[i]) top = false;
    if (top && (out.length === 0 || i - out[out.length - 1] > h)) out.push(i);
  }
  return out;
}

/**
 * CYC-15: Dewey's synchrony. Same-period cycles in different series crest at
 * about the same time, and a common cause can stagger the responses, so a
 * test that demands the very same bar is invalid. On the shared dates, each
 * crest of `a` is matched to the nearest crest of `b`; the shares at the same
 * bar and within ±`lagBars` are reported, with the mean signed lag (b after
 * a is positive). The lag window is the caller's, stated before the test.
 * Null under three crests in `a`.
 */
export function crestSynchrony(
  a: Bar[],
  b: Bar[],
  period: number,
  lagBars: number,
): { crests: number; sameBarShare: number; withinLagShare: number; meanLag: number } | null {
  const bByDay = new Map(b.map((x) => [day(x.t), x.c]));
  const shared = a.filter((x) => bByDay.has(day(x.t)));
  if (!(period > 1) || shared.length < 3 * period) return null;
  const ca = crestIndices(detrendLog(shared.map((x) => x.c)), period);
  const cb = crestIndices(detrendLog(shared.map((x) => bByDay.get(day(x.t))!)), period);
  if (ca.length < 3 || cb.length === 0) return null;
  let same = 0;
  let within = 0;
  let lagSum = 0;
  let lagCount = 0;
  for (const i of ca) {
    let lag = cb[0] - i;
    for (const j of cb) if (Math.abs(j - i) < Math.abs(lag)) lag = j - i;
    if (lag === 0) same++;
    if (Math.abs(lag) <= lagBars) {
      within++;
      lagSum += lag;
      lagCount++;
    }
  }
  return {
    crests: ca.length,
    sameBarShare: Math.round((same / ca.length) * 1000) / 1000,
    withinLagShare: Math.round((within / ca.length) * 1000) / 1000,
    meanLag: lagCount ? Math.round((lagSum / lagCount) * 100) / 100 : 0,
  };
}

/**
 * CYC-49: on a doubling-and-tripling grid (Dewey's family of cycles: a base
 * period times 2^i·3^j, multiples with i, j ≥ 0 and fractions with i, j ≤ 0,
 * up to `maxOrder` steps) almost any period lies near a predicted one. So a
 * family match is reported with its chance baseline: the share of the
 * log-uniform band within ±`tolerance` of a grid period. `hits` and `misses`
 * count the observed periods that do and do not fit, and `p` is the chance of
 * that many hits or more at the baseline rate (Tomes' claim, Dewey's
 * objection that the reported periods which don't fit must be counted).
 */
export function gridMatchBaseline(
  base: number,
  observed: number[],
  opts: { minPeriod: number; maxPeriod: number; tolerance?: number; maxOrder?: number },
): { grid: number[]; baseline: number; hits: number; misses: number; p: number } {
  const tol = opts.tolerance ?? MATCH_TOLERANCE;
  const maxOrder = opts.maxOrder ?? 4;
  const grid = new Set<number>();
  for (let i = 0; i <= maxOrder; i++) {
    for (let j = 0; i + j <= maxOrder; j++) {
      grid.add(base * 2 ** i * 3 ** j);
      grid.add(base / (2 ** i * 3 ** j));
    }
  }
  const lo = Math.log(opts.minPeriod);
  const hi = Math.log(opts.maxPeriod);
  const points = [...grid].filter((g) => g * (1 + tol) >= opts.minPeriod && g * (1 - tol) <= opts.maxPeriod).sort((x, y) => x - y);
  // Union of the ±tolerance intervals in log space, clipped to the band.
  let covered = 0;
  let end = -Infinity;
  for (const g of points) {
    const a0 = Math.max(lo, Math.log(g * (1 - tol)));
    const a1 = Math.min(hi, Math.log(g * (1 + tol)));
    if (a1 <= a0) continue;
    const from = Math.max(a0, end);
    if (a1 > from) covered += a1 - from;
    end = Math.max(end, a1);
  }
  const baseline = hi > lo ? covered / (hi - lo) : 0;
  const hits = observed.filter((o) => points.some((g) => matches(o, g, tol))).length;
  return {
    grid: points,
    baseline: Math.round(baseline * 10000) / 10000,
    hits,
    misses: observed.length - hits,
    p: Math.round(binomialTail(observed.length, hits, baseline) * 10000) / 10000,
  };
}

/**
 * C-ASTRO-03: does a found cycle sit near a planetary period, and how often
 * would a random period do as well? Research only, not sourced to Gann
 * (W007 pp.28, 61 pairs found cycles with planets: 8 years with Venus,
 * 19.875 years with the Jupiter-Saturn synodic period). With nine sidereal
 * and 36 synodic periods, almost any period lies near one, so a match means
 * nothing without its chance rate (CYC-41, CYC-49).
 *
 * The references are each body's sidereal period and every pair's synodic
 * period (`planetaryPeriods.ts`), in days. `chanceRate` is the share of the
 * log-uniform band [minPeriod, maxPeriod] lying within ±tolerance of a
 * reference: the probability a random period in the band matches at least
 * one. The tolerance and the log-uniform null are engineering choices, the
 * same as `gridMatchBaseline`'s. Nothing on the verdict path reads this.
 */
export function matchPlanetaryPeriod(
  periodDays: number,
  opts: { minPeriod: number; maxPeriod: number; tolerance?: number },
): { matches: { label: string; periodDays: number }[]; chanceRate: number; hypothesisOnly: true } {
  const tol = opts.tolerance ?? MATCH_TOLERANCE;
  const bodies = Object.keys(SIDEREAL_DAYS) as PeriodBody[];
  const refs: { label: string; periodDays: number }[] = bodies.map((b) => ({ label: `${b} sidereal`, periodDays: SIDEREAL_DAYS[b] }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      refs.push({ label: `${bodies[i]}-${bodies[j]} synodic`, periodDays: synodicPeriod(SIDEREAL_DAYS[bodies[i]], SIDEREAL_DAYS[bodies[j]]) });
    }
  }
  const lo = Math.log(opts.minPeriod);
  const hi = Math.log(opts.maxPeriod);
  const intervals = refs
    .map((r) => [Math.max(lo, Math.log(r.periodDays * (1 - tol))), Math.min(hi, Math.log(r.periodDays * (1 + tol)))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let end = -Infinity;
  for (const [a, b] of intervals) {
    const from = Math.max(a, end);
    if (b > from) covered += b - from;
    end = Math.max(end, b);
  }
  return {
    matches: refs.filter((r) => matches(periodDays, r.periodDays, tol)),
    chanceRate: hi > lo ? Math.round((covered / (hi - lo)) * 10000) / 10000 : 0,
    hypothesisOnly: true,
  };
}
