/**
 * The ranked time numbers (A-OTHER-07), research only and confluence-only.
 * Nothing scores, gates or displays from this list; a guard test checks no
 * module outside `lib/research` reads it.
 *
 * Source (class A, *Economic Forecaster*, 1954, W001, on the Master
 * Mathematical Price, Time and Trend Calculator, item 7): "The Number Seven
 * is mentioned more times in the Bible than any other number", which "proves
 * the importance of 7 in time periods, also 3, 9 and 12". So 7 ranks first;
 * the text gives no order among 3, 9 and 12, and they share the second rank.
 * The feature-map row ranks them "then 3, 9, 12"; the source is followed.
 * Related mentions (*The Magic Word*, W030: 3 and 7, twenty-one days, seven
 * circles round one; *Tunnel*, W022 p. 152: the 7th as a sacred day) give no
 * ranking and are not encoded.
 *
 * `masterTwelve.ts`'s Master Numbers (3, 5, 7, 9, 12) come from a different
 * source and are unranked; this list does not change them.
 *
 * Three-question basis:
 * 1. Source: as above, class A, a numerological claim from scripture.
 * 2. Cycles: a claim that some counts matter more; untested against a base
 *    rate, so it clears none of Dewey's items and stays a research list.
 * 3. Hermetic: Vibration (numbers as the measure of recurring time), held as
 *    a hypothesis, never as evidence.
 */

export interface RankedTimeNumber {
  n: number;
  /** 1 is most important; equal ranks are unordered in the source. */
  rank: number;
}

export const RANKED_TIME_NUMBERS: readonly RankedTimeNumber[] = [
  { n: 7, rank: 1 },
  { n: 3, rank: 2 },
  { n: 9, rank: 2 },
  { n: 12, rank: 2 },
];

export function timeNumberRank(n: number): number | null {
  return RANKED_TIME_NUMBERS.find((r) => r.n === n)?.rank ?? null;
}
