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
 */

import type { Bar } from "@/lib/types";

export interface SpectralCycleReading {
  /** True only once the dominance threshold is cleared — a candidate cycle exists, not a claim it's tradeable. */
  active: boolean;
  dominantPeriodBars: number | null;
  /** Peak spectral power / mean spectral power across all scanned candidate periods. */
  dominancePower: number | null;
  /** How many full cycles of the dominant period fit in the scanned window — Dewey's "repetition count" criterion. */
  repetitionCount: number | null;
  /** Whether independently re-estimating the dominant period from each half of the window agrees within tolerance — Dewey's "constancy of period" criterion. Null when the window is too short to split. */
  periodConsistent: boolean | null;
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

function linearDetrend(values: number[]): number[] {
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

function periodPower(values: number[], period: number): number {
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

const NOT_COMPUTED_NOTE =
  "Hypothesis only per AGENTS.md's Dewey cycle-validation checklist: dominance, repetition count, and constancy of period are evaluated numerically above; regularity of timing, phase-resumption after distortion, wave-shape identity, and cross-series clustering are not computed by this module. Never independently scored or gated.";

export function detectSpectralCycle(dailyBars: Bar[]): SpectralCycleReading {
  const n = dailyBars.length;
  if (n < MIN_BARS) {
    return {
      active: false,
      dominantPeriodBars: null,
      dominancePower: null,
      repetitionCount: null,
      periodConsistent: null,
      hypothesisOnly: true,
      note: `Insufficient bar history (${n} < ${MIN_BARS}) for spectral cycle detection.`,
    };
  }

  const closes = dailyBars.map((b) => b.c);
  const detrended = linearDetrend(closes);
  // A flat series or a purely linear trend leaves residual variance at
  // floating-point noise level; without this floor, tiny near-zero powers
  // can produce a spuriously large dominance *ratio* even though no real
  // cyclical amplitude exists.
  const detrendedVariance = detrended.reduce((a, v) => a + v * v, 0) / n;
  const maxPeriod = Math.floor(n * MAX_PERIOD_FRACTION);
  const result = detrendedVariance > 1e-6 ? dominantPeriod(detrended, maxPeriod) : null;

  if (!result || result.meanPower <= 0) {
    return {
      active: false,
      dominantPeriodBars: null,
      dominancePower: null,
      repetitionCount: null,
      periodConsistent: null,
      hypothesisOnly: true,
      note: "No usable spectral candidates in this window.",
    };
  }

  const dominance = result.power / result.meanPower;
  const active = dominance >= DOMINANCE_THRESHOLD;
  const repetitionCount = Math.round((n / result.period) * 10) / 10;

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
    hypothesisOnly: true,
    note: active
      ? `Dominant candidate cycle ~${result.period} bars (${dominance.toFixed(2)}x mean spectral power, ~${repetitionCount} repetitions in window).${consistencyNote} ${NOT_COMPUTED_NOTE}`
      : `No candidate cycle cleared the dominance threshold (best: ~${result.period} bars at ${dominance.toFixed(2)}x mean power, threshold ${DOMINANCE_THRESHOLD}x). ${NOT_COMPUTED_NOTE}`,
  };
}
