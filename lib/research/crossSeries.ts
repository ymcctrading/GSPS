/**
 * Cycles across series (CYC-14, CYC-16, CYC-17): research and validation
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
 *    series (CYC-16) and wave-shape identity (CYC-17).
 * 3. Hermetic: Correspondence ("as above, so below": the same rhythm in
 *    related series is what it predicts), held to a chance rate so it is
 *    tested, not assumed.
 *
 * Engineering choices, labelled as such: a match is within ±5% of the
 * reference period; the null spreads periods log-uniformly over the scanned
 * band; the reference is the series with the most matches, so the p-value is
 * multiplied by the number of series (Bonferroni); priors combine by Fisher's
 * method; wave shapes fold into 12 phase bins on the shared dates.
 */
import type { Bar } from "@/lib/types";

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
