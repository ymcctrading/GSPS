/**
 * Spectral estimation checks (X5: CYC-09, -05, -48, -11, -12, -50): research
 * and validation only. Nothing on the verdict path imports this module
 * (`lib/validation/__tests__/criteria-gate.test.ts`), and nothing here runs
 * on a scan. Each function takes a series (log closes, usually) and a period
 * found by `detectSpectralCycle`, and asks one more of Dewey's questions of it.
 *
 * Sources, in our own words:
 * - Dewey, *The Case for Cycles* (1967; W039): rounding a period drifts the
 *   phase (Benner's 9.2-year pig-iron rule, run on whole years, slipped a
 *   year every five waves); constancy of period over separate sections (five
 *   sections of 48 waves for the Lake Saki varves); wave shape, which need not
 *   be symmetric; mathematical tests such as Bartels' (the 9.2-year stock
 *   cycle, 1 in 5,000 by chance).
 * - Tomes (W044): a cycle whose swing is modulated by a longer one; analyse
 *   such data on a log scale. Tomes (W045): a non-linear response to one sine
 *   produces in-phase whole-number harmonics, so a peak at half or a third of
 *   a stronger one's period may be its harmonic, not a cycle of its own.
 *
 * Three-question basis:
 * 1. Source: these test the cycles the harmonic analysis in
 *    `lib/gann/spectralCycle.ts` finds; none is a technique of its own.
 * 2. Cycles: Dewey's constancy, wave-shape and mathematical-test criteria,
 *    and his warning on rounded periods; Tomes on modulation and harmonics.
 * 3. Hermetic: Vibration (a period is measured to its true length, not the
 *    nearest whole bar) and Correspondence (a harmonic answers its
 *    fundamental, so it is read as one rhythm, not two).
 *
 * Engineering choices, labelled as such (the sources give the tests, not
 * these numbers): the 0.01-bar refinement step; sections of at least 2.5
 * periods and the ±15% agreement band; two-period blocks and a ratio of 2 for
 * modulation; 12 phase bins and a rise share outside 0.35-0.65 for asymmetry;
 * one cycle per Bartels segment with no correction for serial correlation
 * (so its p is optimistic on prices); peaks of 5% of the strongest's power
 * and a ±5% match for a harmonic.
 */
import { fitCosinor, linearDetrend, periodPower } from "@/lib/gann/spectralCycle";

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

/** Highest-power period on a fine grid over [lo, hi] of a detrended series. */
function finePeak(detrended: number[], lo: number, hi: number, step: number): number {
  let best = lo;
  let bestPower = -Infinity;
  for (let p = lo; p <= hi + 1e-9; p += step) {
    const pw = periodPower(detrended, p);
    if (pw > bestPower) {
      bestPower = pw;
      best = p;
    }
  }
  return best;
}

/**
 * CYC-09: refine a whole-bar period to 0.01 bar by searching one bar either
 * side of it, so a projection does not drift out of phase the way Benner's
 * whole-year rule did.
 */
export function refinePeriod(values: number[], period: number): number {
  const d = linearDetrend(values);
  return Math.round(finePeak(d, Math.max(2, period - 1), period + 1, 0.01) * 100) / 100;
}

/**
 * CYC-05: re-estimate the period on up to five consecutive sections, each
 * holding at least 2.5 periods, and ask whether the estimates agree within
 * ±15% of their mean. Null when fewer than two sections fit.
 */
export function periodConstancy(
  values: number[],
  period: number,
  maxSections = 5,
): { estimates: number[]; spread: number; consistent: boolean } | null {
  const k = Math.min(maxSections, Math.floor(values.length / (2.5 * period)));
  if (k < 2) return null;
  const len = Math.floor(values.length / k);
  const estimates: number[] = [];
  for (let s = 0; s < k; s++) {
    const d = linearDetrend(values.slice(s * len, (s + 1) * len));
    estimates.push(Math.round(finePeak(d, Math.max(2, period * 0.5), Math.min(period * 1.5, len / 2.5), 0.05) * 100) / 100);
  }
  const mean = estimates.reduce((a, b) => a + b, 0) / k;
  const spread = Math.max(...estimates.map((e) => Math.abs(e - mean) / mean));
  return { estimates, spread: Math.round(spread * 1000) / 1000, consistent: spread <= 0.15 };
}

/**
 * CYC-48: the cycle's amplitude in consecutive two-period blocks. A max/min
 * ratio of 2 or more reads as modulated by a longer cycle, which fails
 * Tomes' constancy test as a single fixed cycle. Null under three blocks.
 */
export function amplitudeModulation(
  values: number[],
  period: number,
): { blockAmplitudes: number[]; ratio: number; modulated: boolean } | null {
  const len = Math.max(4, Math.round(2 * period));
  const blocks = Math.floor(values.length / len);
  if (blocks < 3) return null;
  const amps: number[] = [];
  for (let b = 0; b < blocks; b++) {
    const fit = fitCosinor(values.slice(b * len, (b + 1) * len), period, { trend: true, offset: b * len });
    if (!fit) return null;
    amps.push(fit.amplitude);
  }
  const min = Math.min(...amps);
  const ratio = min > 0 ? Math.max(...amps) / min : Infinity;
  return { blockAmplitudes: amps.map((a) => Math.round(a * 10000) / 10000), ratio: Math.round(ratio * 100) / 100, modulated: ratio >= 2 };
}

/**
 * CYC-11: fold the detrended series at `period` and average each phase bin
 * (Dewey's average wave). `riseShare` is the part of the cycle spent rising
 * from trough to crest; a sine spends half. The two halves' average waves are
 * correlated to ask whether the shape keeps. Null under two cycles per half.
 */
export function epochAveragedWave(
  values: number[],
  period: number,
  bins = 12,
): { profile: number[]; riseShare: number; asymmetric: boolean; halvesCorrelation: number } | null {
  const n = values.length;
  if (!(period > 1) || n < 4 * period) return null;
  const d = linearDetrend(values);
  const fold = (from: number, to: number) => {
    const sum = new Array<number>(bins).fill(0);
    const cnt = new Array<number>(bins).fill(0);
    for (let i = from; i < to; i++) {
      const bin = Math.min(bins - 1, Math.floor(((i % period) / period) * bins));
      sum[bin] += d[i];
      cnt[bin]++;
    }
    return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  };
  const profile = fold(0, n);
  const crest = profile.indexOf(Math.max(...profile));
  const trough = profile.indexOf(Math.min(...profile));
  const riseShare = (((crest - trough) % bins) + bins) % bins / bins;
  const half = Math.floor(n / 2);
  return {
    profile: profile.map((v) => Math.round(v * 10000) / 10000),
    riseShare: Math.round(riseShare * 1000) / 1000,
    asymmetric: riseShare < 0.35 || riseShare > 0.65,
    halvesCorrelation: Math.round(correlation(fold(0, half), fold(half, n)) * 1000) / 1000,
  };
}

/**
 * CYC-12: Bartels' harmonic-dial test. Each whole cycle of the detrended
 * series gives one Fourier vector at `period`; a real cycle's vectors point
 * the same way, chance ones wander. With m vectors of mean-square length
 * ⟨r²⟩, chance gives a mean vector of expected length √(⟨r²⟩/m), and the
 * probability of one as long as R is e^(−κ²), κ = R / that expectancy.
 * Bartels corrects for serial correlation with an equivalent number of
 * independent vectors; that is not done here. Null under three cycles.
 */
export function bartelsTest(values: number[], period: number): { vectors: number; kappa: number; p: number } | null {
  const len = Math.round(period);
  const m = Math.floor(values.length / len);
  if (len < 2 || m < 3) return null;
  const d = linearDetrend(values);
  const w = (2 * Math.PI) / period;
  let sa = 0;
  let sb = 0;
  let sq = 0;
  for (let j = 0; j < m; j++) {
    let a = 0;
    let b = 0;
    for (let i = j * len; i < (j + 1) * len; i++) {
      a += d[i] * Math.cos(w * i);
      b += d[i] * Math.sin(w * i);
    }
    a = (2 * a) / len;
    b = (2 * b) / len;
    sa += a;
    sb += b;
    sq += a * a + b * b;
  }
  const R = Math.hypot(sa / m, sb / m);
  const expectancy = Math.sqrt(sq / m / m);
  const kappa = expectancy > 0 ? R / expectancy : 0;
  return { vectors: m, kappa: Math.round(kappa * 1000) / 1000, p: Math.exp(-kappa * kappa) };
}

/**
 * CYC-50: the periodogram's local peaks, strongest first, each labelled a
 * harmonic of a stronger peak whose period is 2 or 3 times its own (±5%).
 */
export function labelHarmonics(
  values: number[],
  opts: { minPeriod?: number; maxPeriod?: number; minRelativePower?: number } = {},
): { period: number; relativePower: number; harmonicOf: { period: number; order: number } | null }[] {
  const d = linearDetrend(values);
  const lo = opts.minPeriod ?? 5;
  const hi = opts.maxPeriod ?? Math.floor(values.length * 0.4);
  const grid: { p: number; pw: number }[] = [];
  for (let p = lo; p <= hi + 1e-9; p += 0.25) grid.push({ p, pw: periodPower(d, p) });
  const peaks = grid
    .filter((g, i) => i > 0 && i < grid.length - 1 && g.pw > grid[i - 1].pw && g.pw >= grid[i + 1].pw)
    .sort((x, y) => y.pw - x.pw);
  if (peaks.length === 0) return [];
  const top = peaks[0].pw;
  const kept = peaks.filter((g) => g.pw >= (opts.minRelativePower ?? 0.05) * top);
  return kept.map((g, idx) => {
    let harmonicOf: { period: number; order: number } | null = null;
    for (const stronger of kept.slice(0, idx)) {
      for (const order of [2, 3]) {
        if (Math.abs(stronger.p / order - g.p) / g.p <= 0.05) {
          harmonicOf = { period: stronger.p, order };
          break;
        }
      }
      if (harmonicOf) break;
    }
    return { period: g.p, relativePower: Math.round((g.pw / top) * 1000) / 1000, harmonicOf };
  });
}
