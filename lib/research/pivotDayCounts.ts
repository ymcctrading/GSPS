/**
 * C-TIME-45, day counts projected from every swing pivot (Vera and Ferrera,
 * W035 pp. 1-2). A labelled reconstruction, research only: no criterion,
 * gate, plan, entry or order reads this (CYC-41). Nothing here is shown to a
 * person: under AGENTS.md's forward-looking-claims rule a cluster date needs
 * its measured record first, and this module is how that record is made.
 *
 * The rule: on a close-only chart whose swings are at least 2%, project 46,
 * 61, 91, 121, 137, 182, 227, 242, 272, 317, 333 and 365 calendar days from
 * every pivot, and treat a date where several projections land together as a
 * change-of-trend candidate. The offsets are about 1/8, 1/6, 1/4, 1/3, 3/8,
 * 1/2, 5/8, 2/3, 3/4, 7/8, 11/12 and the whole of the year, which are Gann's
 * own fractions of the year (`timeCycles.ts`, `seasonalCounts.ts`); what is
 * new here is projecting them from every pivot of a 2% chart and counting
 * the overlap.
 *
 * Fixed before testing:
 * - Swings: a pivot is a close that a later close reverses by `MIN_SWING`
 *   (2%) or more, the source's chart.
 * - A cluster on a date is the number of projections within ±`CLUSTER_DAYS`
 *   (1) of it. Engineering choice: the source says "several" without a
 *   figure, so the base rate is reported for each count rather than one
 *   chosen threshold.
 * - The base rate is the share of every date in the record with a cluster at
 *   least that large. A cluster that turns out common on random walks is
 *   common by construction, not a forecast.
 *
 * Three-question basis:
 * 1. Gann: the fractions are his (Master Course Ch. 5-7); the every-pivot
 *    projection and the clustering are Vera's and Ferrera's, Tier C.
 * 2. Cycles: a recurrence claim. It clears no Dewey item until the cluster
 *    rate on turns beats the base rate this module measures.
 * 3. Hermetic: Correspondence, the year's divisions repeated from every
 *    turn, held as a hypothesis.
 */

export const PIVOT_DAY_COUNTS = [46, 61, 91, 121, 137, 182, 227, 242, 272, 317, 333, 365] as const;
export const MIN_SWING = 0.02;
export const CLUSTER_DAYS = 1;

const DAY = 86_400_000;

/** Pivot indices of a close-only zigzag with a `minSwing` reversal. */
export function closeOnlyPivots(closes: readonly number[], minSwing = MIN_SWING): number[] {
  const pivots: number[] = [];
  if (closes.length < 2) return pivots;
  let dir: 1 | -1 | 0 = 0;
  let ext = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < closes.length; i++) {
    const c = closes[i];
    if (dir === 0) {
      // Until the first 2% move, the lowest and highest closes so far are the candidates.
      if (c >= closes[lo] * (1 + minSwing)) { pivots.push(lo); dir = 1; ext = i; }
      else if (c <= closes[hi] * (1 - minSwing)) { pivots.push(hi); dir = -1; ext = i; }
      else {
        if (c < closes[lo]) lo = i;
        if (c > closes[hi]) hi = i;
      }
      continue;
    }
    if (dir === 1) {
      if (c > closes[ext]) ext = i;
      else if (c <= closes[ext] * (1 - minSwing)) { pivots.push(ext); dir = -1; ext = i; }
    } else {
      if (c < closes[ext]) ext = i;
      else if (c >= closes[ext] * (1 + minSwing)) { pivots.push(ext); dir = 1; ext = i; }
    }
  }
  return pivots;
}

/** UTC day numbers (ms / DAY) each pivot projects to. */
export function projectedDays(pivotDays: readonly number[]): number[] {
  const out: number[] = [];
  for (const p of pivotDays) for (const n of PIVOT_DAY_COUNTS) out.push(p + n);
  return out;
}

/** Projections within ±CLUSTER_DAYS of `day`, from pivots before it. */
export function clusterOn(day: number, projections: readonly number[]): number {
  let n = 0;
  for (const p of projections) if (Math.abs(p - day) <= CLUSTER_DAYS) n++;
  return n;
}

export interface ClusterBaseRate {
  days: number;
  /** atLeast[k] is the share of days with a cluster of k or more, k = 1..6. */
  atLeast: Record<number, number>;
}

/**
 * The base rate of each cluster size over a record: for every calendar day
 * from the first pivot plus a year to the last session, the projections from
 * pivots already completed before that day.
 */
export function clusterBaseRate(sessionsMs: readonly number[], closes: readonly number[]): ClusterBaseRate {
  const days = sessionsMs.map((t) => Math.floor(t / DAY));
  const pivots = closeOnlyPivots(closes);
  const atLeast: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  if (pivots.length === 0) return { days: 0, atLeast };
  const first = days[pivots[0]] + 365;
  const last = days[days.length - 1];
  let n = 0;
  for (let d = first; d <= last; d++) {
    // A pivot is known once the reversal that confirms it has printed; the
    // next pivot's day is a conservative bound for that.
    const known = pivots.filter((p, k) => (pivots[k + 1] !== undefined ? days[pivots[k + 1]] : last + 1) < d).map((p) => days[p]);
    const c = clusterOn(d, projectedDays(known));
    n++;
    for (let k = 1; k <= 6; k++) if (c >= k) atLeast[k]++;
  }
  for (let k = 1; k <= 6; k++) atLeast[k] = n > 0 ? atLeast[k] / n : 0;
  return { days: n, atLeast };
}
