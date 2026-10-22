/**
 * A-ASTRO-11, Gann's "malefic" and "depressing" cycles: the reconstruction
 * tested against his own dates (Chuck, 2026-10-21, "build the 11 that can be
 * filled with a labelled reconstruction"). Research only: no criterion, gate,
 * plan, entry or order reads this (CYC-41).
 *
 * Gann's annual forecasts for 1919-1921 (W036, reprinted from his mailings,
 * Tier A) call stretches of each year depressing or malefic, without saying
 * how. The candidate reconstruction is Jensen's square family between the
 * slow planets (`jensen.ts#readJensenAspects`), which Jensen reads as
 * declines. This module lists Gann's dated stretches and measures the
 * reading on them against the rest of the same years.
 *
 * Fixed before measuring:
 * - The stretches are the ones W036 dates, whole months where he names only
 *   the month (Jun 1920, May 1921, Aug 1921).
 * - The comparison is every other day of 1919-1921, the years the forecasts
 *   cover.
 * - Three readings: a bearish bias (more square-family hits than trine), any
 *   square-family hit, and a square-family hit triggered by Mars or Mercury.
 *
 * The result (pinned in the test): Jensen's reading is no more common on
 * Gann's malefic days than off them. Bearish bias 57% against 55%, any
 * square 59% against 73%, triggered 2.2% against 2.7%. So Jensen's aspects do
 * not reproduce Gann's malefic cycles. A-ASTRO-11 stays an unexplained
 * Gann term; `jensen.ts` keeps its own placement under Jensen's name, not as
 * Gann's malefic cycle.
 *
 * Three-question basis:
 * 1. Gann: the dates are his (W036). The method is not; Jensen is Tier B.
 * 2. Cycles: this is Dewey's hit rate against a base rate on a fixed rule,
 *    with a single test and no search over planets or orbs.
 * 3. Hermetic: Polarity (malefic against benefic, the square family against
 *    the trine), held as a hypothesis the measurement doesn't support.
 */
import { readJensenAspects } from "@/lib/gann/jensen";

const DAY = 86_400_000;

/** Gann's dated depressing and malefic stretches, 1919-1921 (W036). */
export const GANN_MALEFIC_STRETCHES: readonly { from: string; to: string; words: string }[] = [
  { from: "1919-01-20", to: "1919-01-25", words: "depressing" },
  { from: "1919-06-22", to: "1919-07-10", words: "depressing" },
  { from: "1919-09-02", to: "1919-09-08", words: "depressing" },
  { from: "1920-06-01", to: "1920-06-30", words: "a cycle of very depressing influences" },
  { from: "1920-09-19", to: "1920-09-22", words: "very depressing" },
  { from: "1920-10-07", to: "1920-10-31", words: "very malefic" },
  { from: "1920-11-18", to: "1920-12-19", words: "culmination of very malefic bearish cycle" },
  { from: "1921-05-01", to: "1921-05-31", words: "very depressing cycle" },
  { from: "1921-08-01", to: "1921-08-31", words: "very depressing bearish cycle" },
];

export interface ShareCounts {
  days: number;
  bearishBias: number;
  anySquare: number;
  triggeredSquare: number;
}

export interface MaleficComparison {
  inside: ShareCounts;
  outside: ShareCounts;
}

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Jensen's reading on Gann's malefic days against every other day of 1919-1921. */
export function compareMaleficCycles(): MaleficComparison {
  const empty = (): ShareCounts => ({ days: 0, bearishBias: 0, anySquare: 0, triggeredSquare: 0 });
  const inside = empty();
  const outside = empty();
  const inStretch = (t: number) => GANN_MALEFIC_STRETCHES.some((s) => t >= noon(s.from) && t <= noon(s.to));
  for (let t = noon("1919-01-01"); t <= noon("1921-12-31"); t += DAY) {
    const r = readJensenAspects(new Date(t));
    const k = inStretch(t) ? inside : outside;
    k.days++;
    if (r.bias === "bearish") k.bearishBias++;
    const squares = r.hits.filter((h) => h.aspect.family === "square");
    if (squares.length > 0) k.anySquare++;
    if (squares.some((h) => h.trigger !== null)) k.triggeredSquare++;
  }
  return { inside, outside };
}
