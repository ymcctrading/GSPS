/**
 * Planetary sidereal periods and the synodic formula (C-ASTRO-01, C-ASTRO-12).
 * Research only: no criterion, gate, plan, entry or order reads this (CYC-41).
 *
 * Gann: none. These rows are not sourced to Gann (W003 p.23, an anonymous
 * compiler; W013 p.115, Bucholtz). The W003 table misprints Mercury (88.97 d)
 * and Neptune (61,285 d); the values below are the standard sidereal periods
 * (Mercury 87.97 d, Neptune about 60,190 d).
 * Cycles: a planetary period is a hint for cycle work, never proof; any match
 * against a market cycle needs its chance rate first (CYC-41, CYC-49,
 * `crossSeries.ts#periodPrior`).
 * Hermetic: Correspondence, the claim that a period above repeats below, held
 * here as a hypothesis only.
 */
export const SIDEREAL_DAYS = {
  Mercury: 87.969,
  Venus: 224.701,
  Earth: 365.256,
  Mars: 686.98,
  Jupiter: 4332.59,
  Saturn: 10759.22,
  Uranus: 30688.5,
  Neptune: 60182,
  Pluto: 90560,
} as const;

export type PeriodBody = keyof typeof SIDEREAL_DAYS;

/** Synodic period S = s1·s2 / |s2 − s1|, in the inputs' unit (Bucholtz, W013 p.115). */
export function synodicPeriod(s1: number, s2: number): number {
  return (s1 * s2) / Math.abs(s2 - s1);
}
