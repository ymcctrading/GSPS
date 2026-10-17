/**
 * The decade digit against a shuffled-digit base rate (CYC-52). Research
 * only: nothing on the verdict path imports it.
 *
 * Question: in the years `decadeCycle.ts` calls bullish (bearish) by their
 * place in the decade, did the market's yearly return come out up (down) more
 * often than the same bull/bear labels dealt to the years at random?
 *
 * Source: Dewey, *Definitions and Concepts Used in Cycle Study* (1965, W040
 * p. 4): recurrent discrete events need a hit rate against a base rate, not
 * a wave statistic. Applied by us to the decade digit (Master Course Ch. 7,
 * "Bull and Bear Calendar Years", `decadeCycle.ts`).
 *
 * Fixed before any data is read:
 * - A year's bias is `computeDecadeCycle` at 1 July of that year; "mixed"
 *   years are reported but not scored.
 * - A hit is a bullish year with a return above zero, or a bearish year
 *   below zero.
 * - The base rate permutes the years' digits (seeded, `draws` times), so the
 *   share of bull and bear labels is kept; p = (draws scoring ≥ observed + 1)
 *   / (draws + 1). Each digit's base mean is its own hit rate under the same
 *   permutations.
 *
 * Three-question basis:
 * 1. Source: the digit's character is the method's (class A, A2.1 Ch. 7); the
 *    test is Dewey's.
 * 2. Cycles: Dewey's recurrent-event statistic; the repetition count is the
 *    number of decades in the record, reported per digit.
 * 3. Hermetic: Rhythm, the decade returning, held to a test.
 */
import { computeDecadeCycle, type DecadeBias } from "@/lib/gann/decadeCycle";
import { seeded } from "@/lib/research/preregisteredTimeTests";

export interface YearReturn {
  year: number;
  /** The market's return over the calendar year, any unit; only its sign is read. */
  ret: number;
}

export interface DigitResult {
  digit: number;
  bias: DecadeBias;
  years: number;
  hits: number;
  /** Null for a mixed digit, which is not scored. */
  hitRate: number | null;
  baseMean: number | null;
}

export interface DecadeBaseRate {
  digits: DigitResult[];
  scored: number;
  hitRate: number;
  baseMean: number;
  p: number;
}

const digitOf = (y: number) => (y % 10 === 0 ? 10 : y % 10);
const biasOf = (digit: number) => computeDecadeCycle(new Date(Date.UTC(2000 + (digit % 10), 6, 1))).bias;
const hit = (bias: DecadeBias, ret: number) => (bias === "bullish" ? ret > 0 : bias === "bearish" ? ret < 0 : false);

export function decadeDigitBaseRate(rows: YearReturn[], { draws = 999, seed = 52 }: { draws?: number; seed?: number } = {}): DecadeBaseRate {
  const digits = rows.map((r) => digitOf(r.year));
  const score = (ds: number[]) => {
    let n = 0;
    let h = 0;
    const per = new Map<number, { n: number; h: number }>();
    ds.forEach((d, i) => {
      const b = biasOf(d);
      if (b === "mixed") return;
      const ok = hit(b, rows[i].ret);
      n++;
      if (ok) h++;
      const e = per.get(d) ?? { n: 0, h: 0 };
      e.n++;
      if (ok) e.h++;
      per.set(d, e);
    });
    return { rate: n > 0 ? h / n : 0, n, per };
  };
  const obs = score(digits);
  const rand = seeded(seed);
  const perSum = new Map<number, number>();
  let atLeast = 0;
  let sum = 0;
  for (let k = 0; k < draws; k++) {
    const shuffled = [...digits];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const s = score(shuffled);
    sum += s.rate;
    if (s.rate >= obs.rate) atLeast++;
    for (const [d, e] of s.per) perSum.set(d, (perSum.get(d) ?? 0) + (e.n > 0 ? e.h / e.n : 0));
  }
  const out: DigitResult[] = Array.from({ length: 10 }, (_, i) => {
    const digit = i + 1;
    const bias = biasOf(digit);
    const years = digits.filter((d) => d === digit).length;
    const e = obs.per.get(digit);
    return {
      digit,
      bias,
      years,
      hits: e?.h ?? 0,
      hitRate: bias === "mixed" || !e ? null : e.h / e.n,
      baseMean: bias === "mixed" || draws === 0 ? null : (perSum.get(digit) ?? 0) / draws,
    };
  });
  return { digits: out, scored: obs.n, hitRate: obs.rate, baseMean: draws > 0 ? sum / draws : 0, p: (atLeast + 1) / (draws + 1) };
}
