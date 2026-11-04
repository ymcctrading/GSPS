/**
 * Selection-bias and dependence-aware statistics for a strategy's return
 * series (quant validation, slice 1). Measurement only: nothing here changes a
 * verdict, a score, a trade or anything a member reads.
 *
 * - `sharpeStats`: per-period Sharpe, skewness and (non-excess) kurtosis.
 * - `probabilisticSharpe`: the probability the true Sharpe exceeds a benchmark
 *   Sharpe, given the sample's length, skewness and kurtosis (Bailey and
 *   López de Prado, "The Sharpe Ratio Efficient Frontier", 2012).
 * - `expectedMaxSharpe`: the Sharpe the best of N independent trials would show
 *   by luck alone, given the variance of the trials' Sharpes (Bailey and López
 *   de Prado, "The Deflated Sharpe Ratio", 2014, eq. for E[max SR]).
 * - `deflatedSharpe`: the probabilistic Sharpe against that luck benchmark.
 * - `blockBootstrapMeanCI`: a circular moving-block bootstrap of a series'
 *   mean, so serially dependent returns (overlapping campaigns, one market
 *   regime) aren't treated as independent draws.
 *
 * Every input is per period (daily returns give a daily Sharpe). Annualise
 * only for display, and say so. The trial count must come from the experiment
 * registry (`docs/experiments/registry.json`), never be guessed; when the
 * trials' Sharpe variance isn't measured, the caller says so instead of
 * passing a number.
 *
 * Design basis (AGENTS.md mandate). Gann: none, this is measurement of the
 * translation, not a rule. Cycles: it is Dewey's call for a significance test
 * with correction for the search made. Hermetic: Cause and Effect, a result is
 * credited only past what chance and the number of tries would produce. Law of
 * Creation: result ⊗ the search that found it; the deflated figure exists in
 * neither alone.
 */

/** Euler–Mascheroni constant. */
const EULER_GAMMA = 0.5772156649015329;

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 via erf, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface SharpeStats {
  n: number;
  mean: number;
  sd: number;
  /** Per-period Sharpe (mean / sd, no risk-free rate). NaN when sd is 0 or n < 2. */
  sharpe: number;
  skew: number;
  /** Non-excess kurtosis (3 for a normal distribution). */
  kurtosis: number;
}

/** Per-period Sharpe and the moments the probabilistic Sharpe needs. Non-finite values are refused. */
export function sharpeStats(returns: readonly number[]): SharpeStats {
  for (const r of returns) if (!Number.isFinite(r)) throw new Error("sharpeStats: every return must be finite");
  const n = returns.length;
  if (n < 2) return { n, mean: n === 1 ? returns[0] : NaN, sd: NaN, sharpe: NaN, skew: NaN, kurtosis: NaN };
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const r of returns) {
    const d = r - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const sd = Math.sqrt((m2 * n) / (n - 1));
  if (!(m2 > 0)) return { n, mean, sd: 0, sharpe: NaN, skew: NaN, kurtosis: NaN };
  return { n, mean, sd, sharpe: mean / sd, skew: m3 / Math.pow(m2, 1.5), kurtosis: m4 / (m2 * m2) };
}

/**
 * P(true Sharpe > `benchmark`), per period. `n` observations, sample skewness
 * and non-excess kurtosis. NaN when the variance term is not positive (a
 * sample too skewed for the approximation).
 */
export function probabilisticSharpe(sharpe: number, benchmark: number, n: number, skew: number, kurtosis: number): number {
  if (![sharpe, benchmark, n, skew, kurtosis].every(Number.isFinite) || n < 2) return NaN;
  const v = 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe;
  if (!(v > 0)) return NaN;
  return normalCdf(((sharpe - benchmark) * Math.sqrt(n - 1)) / Math.sqrt(v));
}

/**
 * The expected maximum Sharpe among `trials` independent trials whose Sharpes
 * have variance `trialSharpeVariance` and true mean 0: the luck benchmark.
 * Same period as the variance. One trial has no selection, so 0.
 */
export function expectedMaxSharpe(trials: number, trialSharpeVariance: number): number {
  if (!(Number.isInteger(trials) && trials >= 1)) throw new Error("expectedMaxSharpe: trials must be a whole number >= 1");
  if (!(trialSharpeVariance >= 0)) throw new Error("expectedMaxSharpe: variance must be >= 0");
  if (trials === 1) return 0;
  return Math.sqrt(trialSharpeVariance) * ((1 - EULER_GAMMA) * normalInv(1 - 1 / trials) + EULER_GAMMA * normalInv(1 - 1 / (trials * Math.E)));
}

export interface DeflatedSharpe {
  stats: SharpeStats;
  /** The luck benchmark, per period. */
  benchmarkSharpe: number;
  /** P(true Sharpe > the luck benchmark). */
  dsr: number;
  trials: number;
}

/** Deflated Sharpe of a per-period return series after `trials` tries. */
export function deflatedSharpe(returns: readonly number[], trials: number, trialSharpeVariance: number): DeflatedSharpe {
  const stats = sharpeStats(returns);
  const benchmarkSharpe = expectedMaxSharpe(trials, trialSharpeVariance);
  return { stats, benchmarkSharpe, dsr: probabilisticSharpe(stats.sharpe, benchmarkSharpe, stats.n, stats.skew, stats.kurtosis), trials };
}

/** Seeded PRNG (mulberry32), so every bootstrap is reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlockBootstrapResult {
  mean: number;
  lo: number;
  hi: number;
  /** Share of resampled means at or below zero. */
  shareAtOrBelowZero: number;
  block: number;
  resamples: number;
}

/**
 * Circular moving-block bootstrap of the mean. `block` defaults to the cube
 * root of n (Hall, Horowitz and Jing 1995), labelled an engineering choice;
 * for daily portfolio returns pass a block near the typical holding period.
 */
export function blockBootstrapMeanCI(
  values: readonly number[],
  { block, resamples = 2000, alpha = 0.05, seed = 20261104 }: { block?: number; resamples?: number; alpha?: number; seed?: number } = {},
): BlockBootstrapResult {
  const n = values.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, shareAtOrBelowZero: NaN, block: 0, resamples: 0 };
  for (const v of values) if (!Number.isFinite(v)) throw new Error("blockBootstrapMeanCI: every value must be finite");
  const b = Math.max(1, Math.min(n, Math.round(block ?? Math.cbrt(n))));
  const rand = seededRandom(seed);
  const means: number[] = [];
  for (let s = 0; s < resamples; s++) {
    let sum = 0;
    let count = 0;
    while (count < n) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < b && count < n; k++, count++) sum += values[(start + k) % n];
    }
    means.push(sum / n);
  }
  means.sort((x, y) => x - y);
  const q = (p: number) => means[Math.min(means.length - 1, Math.max(0, Math.floor(p * means.length)))];
  return {
    mean: values.reduce((s, v) => s + v, 0) / n,
    lo: q(alpha / 2),
    hi: q(1 - alpha / 2),
    shareAtOrBelowZero: means.filter((m) => m <= 0).length / means.length,
    block: b,
    resamples,
  };
}
