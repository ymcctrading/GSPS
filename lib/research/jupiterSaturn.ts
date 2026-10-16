/**
 * The Jupiter–Saturn synodic cycle divided by 4 to 9 and projected from a
 * pivot (C-ASTRO-11; Bucholtz, W013 pp.113-117). Research and context only:
 * no criterion, gate, plan, entry or order reads this (CYC-41).
 *
 * Gann: none; not sourced to Gann. The 238.2 months is Bucholtz's figure
 * (19.85 years); `planetaryPeriods.ts#synodicPeriod` gives about 19.86.
 * Cycles: six divisors tried at once is a family of tests, so any measurement
 * of these projections corrects for six (Holm, `calendarTest.ts#holm`).
 * Hermetic: Rhythm, a long period read through its harmonics.
 */
export const JUPITER_SATURN_MONTHS = 238.2;
export const DIVISORS = [4, 5, 6, 7, 8, 9] as const;
const DAY = 86_400_000;
const MONTH_DAYS = 365.25 / 12;

export function jupiterSaturnSubdivisions(): { n: number; months: number }[] {
  return DIVISORS.map((n) => ({ n, months: JUPITER_SATURN_MONTHS / n }));
}

/** Each subdivision's date after a pivot (ms since epoch). */
export function projectFromPivot(pivotAt: number): { n: number; months: number; at: number }[] {
  return jupiterSaturnSubdivisions().map((s) => ({ ...s, at: pivotAt + s.months * MONTH_DAYS * DAY }));
}
