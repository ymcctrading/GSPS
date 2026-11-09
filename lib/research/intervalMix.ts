/**
 * CYC-43, an irregular cycle as a mix of specific intervals (Tomes, W045 p. 2,
 * pp. 12-13, 17-19, Fig. 20 and Table 3). A labelled reconstruction, research
 * only: no criterion, gate, plan, entry or order reads this (CYC-41).
 *
 * Tomes' point: a cycle can recur at two or three specific lengths whose
 * weighted mix makes the long-run average. His examples are 3.244 and 4.542
 * years averaging 3.446, and 10.38 and 12.00 years in about 4:3 averaging
 * 11.07. So a test for one fixed period can miss a cycle that is real. GSPS's
 * time counts (`timeCycles.ts`) are single fixed lengths; this module tests a
 * set of lengths instead, so the two can be compared on the same turns.
 *
 * Fixed before testing: a spacing is caught when it lies within `tolerance`
 * (a share of the interval, 5% by default, an engineering choice) of any
 * interval in the set. Nothing is fitted to the turns.
 *
 * Three-question basis:
 * 1. Gann: none. Tomes, Tier C (cycle theory).
 * 2. Cycles: Dewey's constancy-of-period item, refined. A period that
 *    alternates between fixed lengths fails a single-period test and passes
 *    this one. Regularity and repetition are measured here; dominance and
 *    phase-resumption are not.
 * 3. Hermetic: Rhythm, the swing between two lengths held in one cycle.
 */

export interface IntervalShare {
  years: number;
  /** Share of the cycle's recurrences at this length, 0-1. */
  weight: number;
}

/** The long-run average of a mix: Σ weight × length, over Σ weight. */
export function mixAverage(mix: readonly IntervalShare[]): number {
  const w = mix.reduce((s, m) => s + m.weight, 0);
  return w > 0 ? mix.reduce((s, m) => s + m.weight * m.years, 0) / w : Number.NaN;
}

const YEAR_MS = 365.25 * 86_400_000;

export interface IntervalFit {
  spacings: number;
  caught: number;
  /** Each spacing in years, with the interval that caught it or null. */
  detail: { years: number; caughtBy: number | null }[];
}

/** How many successive spacings of `turns` (ms) lie within `tolerance` of an interval in `intervals` (years). */
export function fitIntervals(turns: readonly number[], intervals: readonly number[], tolerance = 0.05): IntervalFit {
  const sorted = [...turns].sort((a, b) => a - b);
  const detail: IntervalFit["detail"] = [];
  for (let i = 1; i < sorted.length; i++) {
    const years = (sorted[i] - sorted[i - 1]) / YEAR_MS;
    const hit = intervals.find((L) => Math.abs(years - L) <= tolerance * L) ?? null;
    detail.push({ years, caughtBy: hit });
  }
  return { spacings: detail.length, caught: detail.filter((d) => d.caughtBy !== null).length, detail };
}
