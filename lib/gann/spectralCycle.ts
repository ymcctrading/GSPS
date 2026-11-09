/**
 * Fourier/spectral dominant-cycle detection — the operative technique
 * behind Gann's own headline "Law of Vibration"/harmonic-analysis claim.
 * *Tunnel Thru the Air* (1927), Ch. VII-VIII, states the method directly in
 * first person: "In making my predictions I use geometry and mathematics,"
 * and separately names "the cycle theory, or harmonic analysis"
 * (`docs/GANN_HISTORICAL_SOURCES.md` A3). B1 (Awodele) and a signed 1926
 * Gann client letter corroborate this by naming Fourier, Schuster, and
 * Moore by name as the mathematicians whose harmonic-analysis technique
 * Gann described applying to price series.
 *
 * Nothing in this codebase addressed this claim before this module —
 * confirmed by a full repo audit (2026-09-16) finding zero FFT/spectral
 * code anywhere in `lib/gann/` or `lib/signals/`. This is the least
 * implementation-ready of the audit's ranked gap list (real, non-trivial
 * new work, not a translation of an already-disclosed table), but the most
 * Gann-authentic layer with zero prior coverage.
 *
 * Per AGENTS.md's "Hermetic principles & cycle theory" standing principle:
 * built as real, running, clearly-labeled-hypothesis code, confluence/
 * context only (wired into `GannConfluenceResult`, never into the scored
 * criteria in `lib/scoring/weights.ts`) — the same treatment
 * `lib/gann/digitalRoot.ts` and `lib/gann/decadeCycle.ts` already get. Not
 * to be trusted beyond a hypothesis until it clears Dewey's own
 * cycle-validation checklist in full (dominance, regularity of timing,
 * repetition count, constancy of period, phase-resumption after
 * distortion, wave-shape identity, cross-series clustering —
 * `docs/GANN_HISTORICAL_SOURCES.md` Part C). This module evaluates three of
 * those seven honestly and numerically (dominance, repetition count, and
 * constancy of period via a split-half re-estimate) and reports the other
 * four as explicitly not computed, rather than implying full validation.
 * The scan's reading stays that way; `validateCycle` (below) tests regularity
 * of timing and phase resumption, among others, for research only.
 *
 * Method: for a range of candidate periods, project the (linearly
 * detrended) closing-price series onto a sine/cosine pair at that period's
 * angular frequency (a per-frequency least-squares fit — a discrete-time
 * analog of a Lomb-Scargle periodogram, appropriate here because daily bars
 * are evenly spaced) and take the squared magnitude as that period's
 * spectral power. The candidate with the highest power is the "dominant"
 * cycle; `dominancePower` is its power relative to the mean power across
 * every candidate scanned — a numeric proxy for Dewey's "dominance" test
 * (the cycle must clearly stand out from background noise, not just be the
 * best of an otherwise flat spectrum).
 *
 * **Chance first (X4, 2026-10-16).** Dewey's method (*The Case for Cycles*,
 * 1967) assumes a cycle is chance until shown otherwise, and his résumé says
 * dominance alone can never show it. So `active` now also needs Schuster's p
 * at or under 0.05 (stricter for short periods, W040: short periodicities
 * arise easily by chance) and a minimum repetition count. The hold-out is
 * decided on the first 70% alone and ranked against other periods, and its
 * zero-amplitude test runs on the unseen 30% at the period fixed beforehand,
 * as Halberg's cosinor requires (W041). Three-question basis: (1) the
 * module's own source above; (2) Dewey's repetitions, persistence after
 * discovery and mathematical-test criteria; (3) Rhythm, tested rather than
 * assumed, and Cause and Effect (a cause is sought only once chance is out).
 * Context only, as before: `active` reaches the confluence card and its
 * trace, never a score, gate, plan or order.
 */

import type { Bar } from "@/lib/types";

export interface SpectralCycleReading {
  /**
   * True only once chance is ruled out: the dominance threshold is cleared,
   * the peak is not at the band edge, Schuster's p is at or under
   * `schusterAlpha(period)` (0.05, stricter under 20 bars) and the period
   * repeats at least `MIN_REPETITIONS` times (CYC-01, -04, -13, -27). A
   * candidate cycle exists, not a claim it's tradeable.
   */
  active: boolean;
  dominantPeriodBars: number | null;
  /** Peak spectral power / mean spectral power across all scanned candidate periods. */
  dominancePower: number | null;
  /** How many full cycles of the dominant period fit in the scanned window — Dewey's "repetition count" criterion. */
  repetitionCount: number | null;
  /** Whether independently re-estimating the dominant period from each half of the window agrees within tolerance — Dewey's "constancy of period" criterion. It is also this module's reading of Dewey's persistence through changed conditions (CYC-07): a change of regime between the halves (drift, volatility) is what the period has to survive. Null when the window is too short to split. */
  periodConsistent: boolean | null;
  /**
   * Schuster's test (parity F3/M1; B01): the chance that noise alone would
   * produce a peak this dominant somewhere in the scanned band, ≈ the number
   * of independent frequencies × e^(−dominance). Below 0.05 reads as
   * significant. Caveat: the test assumes white noise, and detrended prices
   * are red noise (low frequencies carry more power by nature), so it is
   * optimistic for long periods. Null when no reading was made.
   */
  schusterP: number | null;
  /**
   * Cosinor fit at the dominant period (parity F3/M1; C07): the cycle's
   * amplitude (percent of price, on the log series), its 95% interval, and
   * the zero-amplitude F-test p-value. Like Schuster's test it assumes
   * independent residuals, which price series are not, so it is optimistic.
   */
  cosinor: { amplitudePct: number; amplitudeCiPct: [number, number]; zeroAmplitudeP: number } | null;
  /**
   * Artifact guards (B01): the peak is at the longest period scanned (a trend
   * residue, not a cycle), and whether the peak survives dropping the oldest
   * 10% of the window. The second is a window-artifact guard only, not
   * Dewey's persistence through changed conditions (that is `periodConsistent`).
   */
  atBandEdge: boolean | null;
  windowStable: boolean | null;
  /**
   * Forward hold-out (M2; Dewey's persistence after discovery): the period
   * and phase fitted on the first 70% of the window, correlated with the last
   * 30% it never saw. Positive and material means the cycle carried forward.
   */
  holdout: {
    trainPeriodBars: number;
    correlation: number;
    /**
     * CYC-08: share of 39 other periods, fitted on the same 70% and projected
     * the same way, that correlate at least as well with the last 30% (a
     * rank p-value; its floor is 1/40 = 0.025).
     */
    nullP: number;
    /**
     * CYC-32/33: the cosinor zero-amplitude p-value on the last 30% alone, at
     * the period fixed on the first 70%. The period is chosen before this
     * data is seen, so the test holds its nominal error rate, unlike the
     * full-window `cosinor` above, which tests the period it was scanned for.
     */
    zeroAmplitudeP: number | null;
    /** Pre-registered reading: positive correlation and `nullP` at or under 0.05. */
    carriedForward: boolean;
  } | null;
  /**
   * CYC-46 (Dewey: homogeneity first): whether the series kept one scale of
   * movement across its two halves (`readHomogeneity`). A cycle is never
   * credited on a series that changed scale, the same rule `validateCycle`
   * applies. Null when the window is too short to read.
   */
  homogeneity: { varianceRatio: number; homogeneous: boolean } | null;
  /** Always true — see module header. Never independently scored or gated regardless of this reading's values. */
  hypothesisOnly: true;
  note: string;
}

const MIN_BARS = 60;
const MIN_PERIOD_BARS = 5;
/** Cap candidate periods so at least ~2.5 repetitions could fit in the window — a period with under ~2 repetitions can't be "dominant" in any meaningful sense. */
const MAX_PERIOD_FRACTION = 0.4;
/** Peak power must exceed this multiple of the mean scanned power to count as genuinely standing out from noise. */
const DOMINANCE_THRESHOLD = 3.0;
/** Split-half period re-estimates must agree within this fraction of their average to count as "constant." */
const PERIOD_CONSISTENCY_TOLERANCE = 0.15;
/**
 * CYC-01/13: chance is ruled out first. A peak is a candidate only once
 * Schuster's p is at or under this level, never on dominance alone.
 */
const SCHUSTER_ALPHA = 0.05;
/**
 * CYC-04: Dewey's repetitions criterion. Too few repetitions decide nothing.
 * Five is an engineering floor (Dewey gives the criterion, not a number).
 */
export const MIN_REPETITIONS = 5;
/**
 * CYC-27: short periods arise easily by chance and long ones rarely (Dewey,
 * W040 p.5), so a short peak must clear a stricter significance level:
 * Schuster's p at or under 0.05 x min(1, period / 20). A 20-bar period or
 * longer keeps the 0.05 level, a 10-bar one needs 0.025 and a 5-bar one
 * 0.0125. The scaling and the 20-bar knee are an engineering choice; the
 * source gives the direction only. Until 2026-10-16 this was a repetitions
 * floor of 50 / period, which can never bind on the 60-bar minimum window
 * (review x456).
 */
export function schusterAlpha(periodBars: number): number {
  return SCHUSTER_ALPHA * Math.min(1, periodBars / 20);
}
/** CYC-08: other periods tried against the hold-out, and the pass level. */
const HOLDOUT_NULL_PERIODS = 39;
const HOLDOUT_NULL_ALPHA = 0.05;

export function linearDetrend(values: number[]): number[] {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return values.map((v, i) => v - (slope * i + intercept));
}

export function periodPower(values: number[], period: number): number {
  const n = values.length;
  const omega = (2 * Math.PI) / period;
  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < n; i++) {
    sumCos += values[i] * Math.cos(omega * i);
    sumSin += values[i] * Math.sin(omega * i);
  }
  return (sumCos * sumCos + sumSin * sumSin) / n;
}

function dominantPeriod(values: number[], maxPeriod: number): { period: number; power: number; meanPower: number } | null {
  if (maxPeriod < MIN_PERIOD_BARS) return null;
  let bestPeriod = MIN_PERIOD_BARS;
  let bestPower = -Infinity;
  let totalPower = 0;
  let count = 0;
  for (let p = MIN_PERIOD_BARS; p <= maxPeriod; p++) {
    const power = periodPower(values, p);
    totalPower += power;
    count++;
    if (power > bestPower) {
      bestPower = power;
      bestPeriod = p;
    }
  }
  return { period: bestPeriod, power: bestPower, meanPower: count > 0 ? totalPower / count : 0 };
}

/** Least-squares cosine/sine coefficients at `period` (evenly spaced bars, index offset `from`). */
function harmonicFit(values: number[], period: number, from = 0): { a: number; b: number } {
  const n = values.length;
  const omega = (2 * Math.PI) / period;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    a += values[i] * Math.cos(omega * (i + from));
    b += values[i] * Math.sin(omega * (i + from));
  }
  return { a: (2 * a) / n, b: (2 * b) / n };
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

export interface CosinorFit {
  /** Rhythm-adjusted mean (the intercept; at bar 0 when a trend term is fitted). */
  mesor: number;
  mesorCi: [number, number];
  amplitude: number;
  amplitudeCi: [number, number];
  /** Phase φ of M + A·cos(2πt/period + φ), in radians within (−π, π]. */
  acrophase: number;
  acrophaseCi: [number, number];
  /** F-test that the amplitude is zero (exact F(2, n − k) tail). */
  zeroAmplitudeP: number;
}

/**
 * CYC-31: Halberg's single cosinor by least squares, y = M (+ slope·t) +
 * β·cos ωt + γ·sin ωt, with the MESOR, amplitude and acrophase each given a
 * 95% interval. Halberg draws the amplitude and phase interval as a joint
 * error ellipse; these are its linearised (delta-method) projections, which
 * agree with the ellipse when the amplitude is well clear of zero. Like every
 * test here it assumes independent residuals, which prices are not.
 */
export function fitCosinor(values: number[], period: number, opts: { trend?: boolean; offset?: number } = {}): CosinorFit | null {
  const n = values.length;
  const trend = opts.trend ?? false;
  const offset = opts.offset ?? 0;
  const k = trend ? 4 : 3;
  if (n < k + 3 || !(period > 0)) return null;
  const omega = (2 * Math.PI) / period;
  const row = (i: number) => {
    const t = offset + i;
    const r = [1, Math.cos(omega * t), Math.sin(omega * t)];
    if (trend) r.push(i);
    return r;
  };
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const r = row(i);
    for (let a = 0; a < k; a++) {
      xty[a] += r[a] * values[i];
      for (let b = 0; b < k; b++) xtx[a][b] += r[a] * r[b];
    }
  }
  const inv = invert(xtx);
  if (!inv) return null;
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * xty[j], 0));
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const r = row(i);
    rss += (values[i] - r.reduce((s, v, j) => s + v * coef[j], 0)) ** 2;
  }
  // Reduced model without the cosine pair (a mean, plus the line if fitted).
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let rss0 = 0;
  if (trend) {
    const mx = (n - 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - mx) * (values[i] - meanY);
      den += (i - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    for (let i = 0; i < n; i++) rss0 += (values[i] - (meanY + slope * (i - mx))) ** 2;
  } else {
    for (const v of values) rss0 += (v - meanY) ** 2;
  }
  const df = n - k;
  if (!(rss > 0) || df <= 0) return null;
  const s2 = rss / df;
  const f = Math.max(0, (rss0 - rss) / 2) / s2;
  const p = Math.pow(1 + (2 * f) / df, -df / 2);
  const [m, beta, gamma] = coef;
  const vb = s2 * inv[1][1];
  const vg = s2 * inv[2][2];
  const cbg = s2 * inv[1][2];
  const amplitude = Math.hypot(beta, gamma);
  const ampSe = amplitude > 0 ? Math.sqrt(Math.max(0, beta * beta * vb + gamma * gamma * vg + 2 * beta * gamma * cbg)) / amplitude : Math.sqrt((vb + vg) / 2);
  const phi = Math.atan2(-gamma, beta);
  const phiSe = amplitude > 0 ? Math.sqrt(Math.max(0, gamma * gamma * vb + beta * beta * vg - 2 * beta * gamma * cbg)) / (amplitude * amplitude) : Math.PI;
  const mSe = Math.sqrt(s2 * inv[0][0]);
  return {
    mesor: m,
    mesorCi: [m - 1.96 * mSe, m + 1.96 * mSe],
    amplitude,
    amplitudeCi: [Math.max(0, amplitude - 1.96 * ampSe), amplitude + 1.96 * ampSe],
    acrophase: phi,
    acrophaseCi: [phi - 1.96 * phiSe, phi + 1.96 * phiSe],
    zeroAmplitudeP: p,
  };
}

/** Gauss-Jordan inverse of a small symmetric matrix; null when singular. */
function invert(m: number[][]): number[][] | null {
  const k = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * k; j++) a[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f !== 0) for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r) => r.slice(k));
}

/** Cosinor amplitude, its 95% interval and the zero-amplitude F-test at `period`. */
function cosinor(values: number[], period: number): SpectralCycleReading["cosinor"] {
  if (values.length < 10) return null;
  const fit = fitCosinor(values, period);
  if (!fit) return null;
  const pct = (x: number) => Math.round(x * 10000) / 100;
  return {
    amplitudePct: pct(fit.amplitude),
    amplitudeCiPct: [pct(fit.amplitudeCi[0]), pct(fit.amplitudeCi[1])],
    zeroAmplitudeP: Math.round(fit.zeroAmplitudeP * 1000) / 1000,
  };
}

const NOT_COMPUTED_NOTE =
  "Hypothesis only per AGENTS.md's Dewey cycle-validation checklist: homogeneity of the series, dominance (with Schuster's and the cosinor zero-amplitude tests), repetition count, constancy of period and persistence on unseen data (a 70/30 hold-out) are evaluated numerically above; regularity of timing, phase-resumption after distortion, wave-shape identity, and cross-series clustering are not computed by this module. Never independently scored or gated.";

export function detectSpectralCycle(dailyBars: Bar[]): SpectralCycleReading {
  const n = dailyBars.length;
  if (n < MIN_BARS) {
    return {
      active: false,
      dominantPeriodBars: null,
      dominancePower: null,
      repetitionCount: null,
      periodConsistent: null,
      schusterP: null,
      cosinor: null,
      atBandEdge: null,
      windowStable: null,
      holdout: null,
      homogeneity: null,
      hypothesisOnly: true,
      note: `Insufficient bar history (${n} < ${MIN_BARS}) for spectral cycle detection.`,
    };
  }

  // Log prices (parity F3; C03): a cycle's swing is a percentage of price, so
  // the same cycle reads the same at $20 and $200.
  const closes = dailyBars.every((b) => b.c > 0) ? dailyBars.map((b) => Math.log(b.c)) : dailyBars.map((b) => b.c);
  const detrended = linearDetrend(closes);
  // A flat series or a purely linear trend leaves residual variance at
  // floating-point noise level; without this floor, tiny near-zero powers
  // can produce a spuriously large dominance *ratio* even though no real
  // cyclical amplitude exists.
  const detrendedVariance = detrended.reduce((a, v) => a + v * v, 0) / n;
  const homogeneity = readHomogeneity(dailyBars);
  const maxPeriod = Math.floor(n * MAX_PERIOD_FRACTION);
  const result = detrendedVariance > 1e-6 ? dominantPeriod(detrended, maxPeriod) : null;

  if (!result || result.meanPower <= 0) {
    return {
      active: false,
      dominantPeriodBars: null,
      dominancePower: null,
      repetitionCount: null,
      periodConsistent: null,
      schusterP: null,
      cosinor: null,
      atBandEdge: null,
      windowStable: null,
      holdout: null,
      homogeneity,
      hypothesisOnly: true,
      note: "No usable spectral candidates in this window.",
    };
  }

  const dominance = result.power / result.meanPower;
  // A peak at the longest period scanned is trend left over from detrending,
  // not a cycle (B01), so it never counts as active.
  const atBandEdge = result.period >= maxPeriod - 1;
  // Independent Fourier frequencies inside the scanned band of periods.
  const independent = Math.max(1, Math.round(n / MIN_PERIOD_BARS - n / maxPeriod));
  const schusterP = Math.min(1, independent * Math.exp(-dominance));
  const repetitionCount = Math.round((n / result.period) * 10) / 10;
  const dominant = dominance >= DOMINANCE_THRESHOLD && !atBandEdge;
  // CYC-01/13: chance first. Dominance alone never makes a candidate; the
  // peak must also be significant (Schuster) and repeat often enough for its
  // length (CYC-04/27).
  const significant = schusterP <= schusterAlpha(result.period);
  const enoughRepetitions = n / result.period >= MIN_REPETITIONS;
  // CYC-46: a series that changed scale between its halves is not one
  // population, so no cycle in it is credited (Dewey checks this first).
  const active = dominant && significant && enoughRepetitions && homogeneity.homogeneous;

  let periodConsistent: boolean | null = null;
  if (n >= MIN_BARS * 2) {
    const half = Math.floor(n / 2);
    const halfMaxPeriod = Math.floor(half * MAX_PERIOD_FRACTION);
    const firstHalf = dominantPeriod(linearDetrend(closes.slice(0, half)), halfMaxPeriod);
    const secondHalf = dominantPeriod(linearDetrend(closes.slice(n - half)), halfMaxPeriod);
    if (firstHalf && secondHalf) {
      const avg = (firstHalf.period + secondHalf.period) / 2;
      periodConsistent = Math.abs(firstHalf.period - secondHalf.period) / avg <= PERIOD_CONSISTENCY_TOLERANCE;
    }
  }

  // The checks below only mean something for a peak that could be a cycle,
  // and each costs another scan, so they run only for an active candidate
  // (keeps the common case at one scan; measured ~2 ms per symbol otherwise).
  // Window artifact guard: the peak should survive dropping the oldest 10%.
  let windowStable: boolean | null = null;
  if (active) {
    const trimmed = closes.slice(Math.floor(n * 0.1));
    const trimmedPeak = dominantPeriod(linearDetrend(trimmed), Math.floor(trimmed.length * MAX_PERIOD_FRACTION));
    windowStable = trimmedPeak
      ? Math.abs(trimmedPeak.period - result.period) / result.period <= PERIOD_CONSISTENCY_TOLERANCE
      : null;
  }

  // Forward hold-out (CYC-08): the period is decided on the first 70% alone,
  // whatever the full window shows, then projected onto the last 30% and
  // ranked against other periods fitted and projected the same way. The
  // zero-amplitude test runs on the last 30% at that pre-chosen period
  // (CYC-32/33), so it is not a test of a period picked from the same data.
  let holdout: SpectralCycleReading["holdout"] = null;
  const cut = Math.floor(n * 0.7);
  const train = linearDetrend(closes.slice(0, cut));
  const trainMax = Math.floor(cut * MAX_PERIOD_FRACTION);
  const trainPeak = n - cut >= 10 ? dominantPeriod(train, trainMax) : null;
  if (trainPeak && trainPeak.power > 0) {
    const test = linearDetrend(closes.slice(cut));
    const projectedCorr = (period: number) => {
      const { a, b } = harmonicFit(train, period);
      const omega = (2 * Math.PI) / period;
      return correlation(test.map((_, k) => a * Math.cos(omega * (cut + k)) + b * Math.sin(omega * (cut + k))), test);
    };
    const observed = projectedCorr(trainPeak.period);
    let beaten = 0;
    for (let k = 0; k < HOLDOUT_NULL_PERIODS; k++) {
      let p = MIN_PERIOD_BARS * Math.pow(trainMax / MIN_PERIOD_BARS, (k + 0.5) / HOLDOUT_NULL_PERIODS);
      if (Math.abs(p - trainPeak.period) / trainPeak.period < 0.1) p = trainPeak.period * (p < trainPeak.period ? 0.85 : 1.15);
      if (projectedCorr(p) >= observed) beaten++;
    }
    const nullP = Math.round(((1 + beaten) / (1 + HOLDOUT_NULL_PERIODS)) * 1000) / 1000;
    const testFit = fitCosinor(closes.slice(cut), trainPeak.period, { trend: true, offset: cut });
    holdout = {
      trainPeriodBars: trainPeak.period,
      correlation: Math.round(observed * 100) / 100,
      nullP,
      zeroAmplitudeP: testFit ? Math.round(testFit.zeroAmplitudeP * 1000) / 1000 : null,
      carriedForward: observed > 0 && nullP <= HOLDOUT_NULL_ALPHA,
    };
  }

  const fit = active ? cosinor(detrended, result.period) : null;

  const guardNote =
    (fit ? ` Amplitude ~${fit.amplitudePct}% of price (95% ${fit.amplitudeCiPct[0]}-${fit.amplitudeCiPct[1]}%, zero-amplitude p ${fit.zeroAmplitudeP < 0.001 ? "<0.001" : fit.zeroAmplitudeP}).` : "") +
    (windowStable === false ? " The peak moved when the oldest 10% of the window was dropped, a sign of a window artifact." : "") +
    (holdout ? ` Fitted on the first 70% (~${holdout.trainPeriodBars} bars), it correlated ${holdout.correlation} with the last 30% it hadn't seen (rank p ${holdout.nullP} against other periods).` : "");
  const consistencyNote =
    periodConsistent === true
      ? " Period held consistent across the first/second half of the window."
      : periodConsistent === false
        ? " Period was NOT consistent across the first/second half of the window — weak evidence."
        : "";

  return {
    active,
    dominantPeriodBars: result.period,
    dominancePower: Math.round(dominance * 100) / 100,
    repetitionCount,
    periodConsistent,
    schusterP: Math.round(schusterP * 1000) / 1000,
    cosinor: fit,
    atBandEdge,
    windowStable,
    holdout,
    homogeneity,
    hypothesisOnly: true,
    note: active
      ? `Dominant candidate cycle ~${result.period} bars (${dominance.toFixed(2)}x mean spectral power, ~${repetitionCount} repetitions in window; Schuster p ≈ ${schusterP < 0.001 ? "<0.001" : schusterP.toFixed(3)}${schusterP < 0.05 ? ", significant against white noise" : ", not significant"}).${consistencyNote}${guardNote} ${NOT_COMPUTED_NOTE}`
      : atBandEdge
        ? `The strongest peak (~${result.period} bars) sits at the longest period scanned: leftover trend, not a cycle. ${NOT_COMPUTED_NOTE}`
        : dominant
          ? `A peak ~${result.period} bars stands out (${dominance.toFixed(2)}x mean power) but is not credited: ${[
              significant ? null : `chance not ruled out (Schuster p ≈ ${schusterP.toFixed(3)}, needs ${+schusterAlpha(result.period).toFixed(4)} or less)`,
              enoughRepetitions ? null : `too few repetitions (~${repetitionCount}, needs ${MIN_REPETITIONS})`,
              homogeneity.homogeneous ? null : `the series changed scale between its halves (ratio ${homogeneity.varianceRatio}, at most ${HOMOGENEITY_MAX_RATIO})`,
            ]
              .filter(Boolean)
              .join("; ")}. ${NOT_COMPUTED_NOTE}`
        : `No candidate cycle cleared the dominance threshold (best: ~${result.period} bars at ${dominance.toFixed(2)}x mean power, threshold ${DOMINANCE_THRESHOLD}x). ${NOT_COMPUTED_NOTE}`,
  };
}

// ---------------------------------------------------------------------------
// Dewey-standard validation tools (CYC-06, -10, -22, -25, -26, -34, -37, -45,
// -46). Research and validation only: `validateCycle` is never called on the
// scan path (so it adds no time to a scan) and nothing it returns can reach a
// criterion, a gate, a plan or an order (`criteria-gate.test.ts`).
//
// Sources: Dewey, *The Case for Cycles* (1967), and Dewey & Dakin, *Cycles:
// The Science of Prediction* (1947), as summarised in
// `docs/memory-bank/sources/C06_dewey_case_for_cycles.md`: check homogeneity
// first; every estimate carries its uncertainty; persistence after discovery;
// phase resumption after a distortion (crests back within about ±9% of the
// period); forced cycles both persist and resume phase, free ones don't;
// crest spacing tested against chance, and its regularity; beats between
// near-equal periods.
//
// Three-question basis:
// 1. Gann: the module's own source (Tunnel Ch. VII-VIII, harmonic analysis);
//    these tools test whether a cycle that method finds is real.
// 2. Cycles: this is Dewey's checklist itself, items noted inline.
// 3. Hermetic: Rhythm, tested rather than assumed, and Cause and Effect
//    (a forced cycle has a cause that resets its phase; a free one doesn't).
//
// Engineering choices, labelled as such (Dewey gives the tests, not these
// numbers): the homogeneity ratio of 2, the half-power width as the period's
// interval, the 40-60% interior block, 39 null periods and 99 surrogates,
// the 5x-median one-bar shock, the half-of-crests resumption rule, the ±20%
// regularity band and the 25% beat band.

export interface CycleValidation {
  /** Dominant period of the detrended log series, in bars. */
  period: number | null;
  /** CYC-46: ratio of the halves' squared median absolute returns; homogeneous at 2 or under. */
  homogeneity: { varianceRatio: number; homogeneous: boolean };
  /** CYC-34: the peak's half-power width, read as the period's interval (Rayleigh resolution, not a bootstrap). */
  periodCi: [number, number] | null;
  /** CYC-45: |best period on the last 30% − period fitted on the first 70%| / the fitted period. */
  holdoutPeriodError: number | null;
  /** CYC-10: the 40-60% block withheld, predicted from the fit around it, against 39 other periods. */
  interiorHoldout: { correlation: number; nullP: number } | null;
  /** CYC-06: crests after the largest one-bar shock against the pre-shock cycle's own period and phase, within ±9% of it. */
  phaseResumption: { shockStart: number; shockEnd: number; crestsTested: number; crestsWithin: number; resumed: boolean } | null;
  /** CYC-22: forced when the period survives a trimmed window and the phase resumes; free when either fails. */
  forcedOrFree: "forced" | "free" | null;
  /** CYC-25: coefficient of variation of crest intervals, against shuffled-return surrogates (small p = not random). */
  intervalRandomness: { intervals: number; cv: number; p: number } | null;
  /** CYC-26: share of crest intervals within ±20% of the period, 0-100. */
  regularityPct: number | null;
  /** CYC-37: two near-equal spectral peaks and the beat period between them. */
  beats: { periods: [number, number]; beatPeriod: number } | null;
  hypothesisOnly: true;
}

const PHASE_TOLERANCE = 0.09;
const HOMOGENEITY_MAX_RATIO = 2;
const NULL_PERIODS = 39;
const SURROGATES = 99;

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

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Power, line and harmonic fit over chosen bar indices (for a series with a withheld block). */
function detrendAt(values: number[], idx: number[]): number[] {
  const mx = idx.reduce((s, i) => s + i, 0) / idx.length;
  const my = idx.reduce((s, i) => s + values[i], 0) / idx.length;
  let num = 0;
  let den = 0;
  for (const i of idx) {
    num += (i - mx) * (values[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return values.map((v, i) => v - (my + slope * (i - mx)));
}
function fitAt(values: number[], idx: number[], period: number): { a: number; b: number; power: number } {
  const w = (2 * Math.PI) / period;
  let a = 0;
  let b = 0;
  for (const i of idx) {
    a += values[i] * Math.cos(w * i);
    b += values[i] * Math.sin(w * i);
  }
  return { a: (2 * a) / idx.length, b: (2 * b) / idx.length, power: (a * a + b * b) / idx.length };
}

/** Crests: bars that are the highest within half a period either side. */
function crests(values: number[], period: number): number[] {
  const h = Math.max(1, Math.floor(period / 2));
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let top = true;
    for (let j = Math.max(0, i - h); j <= Math.min(values.length - 1, i + h) && top; j++) if (values[j] > values[i]) top = false;
    if (top && (out.length === 0 || i - out[out.length - 1] > h)) out.push(i);
  }
  return out;
}
const intervalsOf = (cs: number[]) => cs.slice(1).map((c, k) => c - cs[k]);
const cvOf = (xs: number[]) => {
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
  return m > 0 ? sd / m : 0;
};

/** CYC-22: a cycle is forced only when it persists through a trimmed window AND its phase resumes. */
export function forcedOrFree(persists: boolean, resumed: boolean): "forced" | "free" {
  return persists && resumed ? "forced" : "free";
}

/**
 * CYC-46: whether the series kept one scale of movement across its two
 * halves. Squared median absolute log return per half, so a single jump (the
 * shock CYC-06 looks for) doesn't count as a change of scale; homogeneous at a
 * ratio of `HOMOGENEITY_MAX_RATIO` or less (an engineering figure). Read by
 * the live `detectSpectralCycle` and the research `validateCycle` alike.
 */
export function readHomogeneity(dailyBars: Bar[]): { varianceRatio: number; homogeneous: boolean } {
  const logs = dailyBars.map((b) => Math.log(Math.max(b.c, 1e-9)));
  const returns = logs.slice(1).map((v, i) => v - logs[i]);
  const half = Math.floor(returns.length / 2);
  const scale = (xs: number[]) => (xs.length > 0 ? median(xs.map(Math.abs)) ** 2 : 0);
  const s1 = scale(returns.slice(0, half));
  const s2 = scale(returns.slice(half));
  const varianceRatio = Math.min(s1, s2) > 0 ? Math.max(s1, s2) / Math.min(s1, s2) : s1 === s2 ? 1 : Infinity;
  return { varianceRatio: Math.round(varianceRatio * 100) / 100, homogeneous: varianceRatio <= HOMOGENEITY_MAX_RATIO };
}

export function validateCycle(dailyBars: Bar[], seed = 1): CycleValidation {
  const empty = (homogeneity: CycleValidation["homogeneity"], period: number | null = null): CycleValidation => ({
    period,
    homogeneity,
    periodCi: null,
    holdoutPeriodError: null,
    interiorHoldout: null,
    phaseResumption: null,
    forcedOrFree: null,
    intervalRandomness: null,
    regularityPct: null,
    beats: null,
    hypothesisOnly: true,
  });
  const n = dailyBars.length;
  const logs = dailyBars.map((b) => Math.log(Math.max(b.c, 1e-9)));
  const returns = logs.slice(1).map((v, i) => v - logs[i]);
  if (n < MIN_BARS) return empty({ varianceRatio: 1, homogeneous: false });

  // CYC-46: homogeneity first.
  const homogeneity = readHomogeneity(dailyBars);
  if (!homogeneity.homogeneous) return empty(homogeneity);

  const detrended = linearDetrend(logs);
  const maxPeriod = Math.floor(n * MAX_PERIOD_FRACTION);
  const peak = dominantPeriod(detrended, maxPeriod);
  if (!peak || peak.power <= 0) return empty(homogeneity);
  const P = peak.period;
  const out = empty(homogeneity, P);

  // CYC-34: half-power width of the peak, on a fine grid.
  const fine = (p: number) => periodPower(detrended, p);
  const top = Math.max(...[-0.5, -0.25, 0, 0.25, 0.5].map((d) => fine(P + d)));
  let lo = P;
  let hi = P;
  while (lo > MIN_PERIOD_BARS && fine(lo - 0.05) >= top / 2) lo -= 0.05;
  while (hi < maxPeriod && fine(hi + 0.05) >= top / 2) hi += 0.05;
  out.periodCi = [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100];

  // CYC-45: the period's error on the 70/30 hold-out.
  const cut = Math.floor(n * 0.7);
  const train = linearDetrend(logs.slice(0, cut));
  const trainPeak = dominantPeriod(train, Math.floor(cut * MAX_PERIOD_FRACTION));
  if (trainPeak && n - cut >= 10) {
    const test = linearDetrend(logs.slice(cut));
    let best = trainPeak.period;
    let bestR = -Infinity;
    for (let p = trainPeak.period * 0.7; p <= trainPeak.period * 1.3; p += 0.1) {
      const { a, b } = harmonicFit(train, p);
      const w = (2 * Math.PI) / p;
      const r = correlation(test.map((_, k) => a * Math.cos(w * (cut + k)) + b * Math.sin(w * (cut + k))), test);
      if (r > bestR) {
        bestR = r;
        best = p;
      }
    }
    out.holdoutPeriodError = Math.round((Math.abs(best - trainPeak.period) / trainPeak.period) * 1000) / 1000;
  }

  // CYC-10: withhold the 40-60% block; fit on both sides; predict the block.
  const b0 = Math.floor(n * 0.4);
  const b1 = Math.floor(n * 0.6);
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i < b0 || i >= b1);
  const block = Array.from({ length: b1 - b0 }, (_, k) => b0 + k);
  const dRest = detrendAt(logs, rest);
  let restP = MIN_PERIOD_BARS;
  let restPow = -Infinity;
  for (let p = MIN_PERIOD_BARS; p <= maxPeriod; p++) {
    const pw = fitAt(dRest, rest, p).power;
    if (pw > restPow) {
      restPow = pw;
      restP = p;
    }
  }
  const blockCorr = (p: number) => {
    const { a, b } = fitAt(dRest, rest, p);
    const w = (2 * Math.PI) / p;
    return correlation(block.map((i) => a * Math.cos(w * i) + b * Math.sin(w * i)), block.map((i) => dRest[i]));
  };
  const observed = blockCorr(restP);
  let beaten = 0;
  for (let k = 0; k < NULL_PERIODS; k++) {
    let p = MIN_PERIOD_BARS * Math.pow(maxPeriod / MIN_PERIOD_BARS, (k + 0.5) / NULL_PERIODS);
    if (Math.abs(p - restP) / restP < 0.1) p = restP * (p < restP ? 0.85 : 1.15);
    if (blockCorr(p) >= observed) beaten++;
  }
  out.interiorHoldout = { correlation: Math.round(observed * 100) / 100, nullP: Math.round(((1 + beaten) / (1 + NULL_PERIODS)) * 1000) / 1000 };

  // CYC-06: the largest one-bar move, if it stands out (5x the median move),
  // is the shock. The cycle established before it (its own period and phase)
  // is projected past it, and each crest after it is tested within ±9% of
  // that period.
  const absR = returns.map(Math.abs);
  const medR = median(absR);
  let s = 0;
  absR.forEach((v, i) => {
    if (v > absR[s]) s = i;
  });
  const shockStart = s + 1;
  const shockEnd = shockStart + 1;
  const preIdx = Array.from({ length: shockStart }, (_, i) => i);
  const prePeak = shockStart >= MIN_BARS ? dominantPeriod(detrendAt(logs, preIdx).slice(0, shockStart), Math.floor(shockStart * MAX_PERIOD_FRACTION)) : null;
  if (medR > 0 && absR[s] >= 5 * medR && prePeak && n - shockEnd >= 2 * prePeak.period) {
    const Pp = prePeak.period;
    const { a, b } = fitAt(detrendAt(logs, preIdx), preIdx, Pp);
    const phi = Math.atan2(b, a);
    const postIdx = Array.from({ length: n - shockEnd }, (_, k) => shockEnd + k);
    const dPost = detrendAt(logs, postIdx);
    let tested = 0;
    let within = 0;
    const base = (phi / (2 * Math.PI)) * Pp;
    for (let c = Math.ceil((shockEnd - base) / Pp); ; c++) {
      const proj = base + c * Pp;
      const from = Math.round(proj - Pp / 2);
      const to = Math.round(proj + Pp / 2);
      if (from < shockEnd) continue;
      if (to >= n) break;
      let arg = from;
      for (let i = from; i <= to; i++) if (dPost[i] > dPost[arg]) arg = i;
      tested++;
      if (Math.abs(arg - proj) <= PHASE_TOLERANCE * Pp) within++;
    }
    if (tested > 0) out.phaseResumption = { shockStart, shockEnd, crestsTested: tested, crestsWithin: within, resumed: within / tested >= 0.5 };
  }

  // CYC-22: forced = persists (the period survives a trimmed window) and resumes phase.
  if (out.phaseResumption) {
    const trimmed = logs.slice(Math.floor(n * 0.1));
    const tp = dominantPeriod(linearDetrend(trimmed), Math.floor(trimmed.length * MAX_PERIOD_FRACTION));
    const persists = !!tp && Math.abs(tp.period - P) / P <= PERIOD_CONSISTENCY_TOLERANCE;
    out.forcedOrFree = forcedOrFree(persists, out.phaseResumption.resumed);
  }

  // CYC-25 / CYC-26: crest spacing against shuffled-return surrogates, and its regularity.
  const iv = intervalsOf(crests(detrended, P));
  if (iv.length >= 3) {
    const cv = cvOf(iv);
    const rnd = seeded(seed);
    let asRegular = 0;
    for (let k = 0; k < SURROGATES; k++) {
      const sh = [...returns];
      for (let i = sh.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [sh[i], sh[j]] = [sh[j], sh[i]];
      }
      let x = logs[0];
      const series = [x, ...sh.map((r) => (x += r))];
      const siv = intervalsOf(crests(linearDetrend(series), P));
      if (siv.length >= 2 && cvOf(siv) <= cv) asRegular++;
    }
    out.intervalRandomness = { intervals: iv.length, cv: Math.round(cv * 1000) / 1000, p: Math.round(((1 + asRegular) / (1 + SURROGATES)) * 1000) / 1000 };
    out.regularityPct = Math.round((iv.filter((d) => Math.abs(d - P) <= 0.2 * P).length / iv.length) * 100);
  }

  // CYC-37: two spectral peaks within 25% of each other, with a dip between.
  const grid: { p: number; pw: number }[] = [];
  for (let p = MIN_PERIOD_BARS; p <= maxPeriod; p += 0.25) grid.push({ p, pw: periodPower(detrended, p) });
  const peaks = grid.filter((g, i) => i > 0 && i < grid.length - 1 && g.pw > grid[i - 1].pw && g.pw >= grid[i + 1].pw).sort((x, y) => y.pw - x.pw);
  if (peaks.length >= 2) {
    const [p1, p2] = peaks;
    const [a, b] = p1.p < p2.p ? [p1, p2] : [p2, p1];
    const between = grid.filter((g) => g.p > a.p && g.p < b.p);
    const dip = between.length ? Math.min(...between.map((g) => g.pw)) : Infinity;
    if (p2.pw >= 0.5 * p1.pw && (b.p - a.p) / a.p <= 0.25 && dip < 0.5 * Math.min(a.pw, b.pw)) {
      out.beats = { periods: [a.p, b.p], beatPeriod: Math.round(1 / Math.abs(1 / a.p - 1 / b.p)) };
    }
  }

  return out;
}
