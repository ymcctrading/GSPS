/**
 * C-TIME-35: a cycle-analysis window between heliocentric Jupiter-Saturn
 * conjunctions. **Research only, and not from the method's own books**: the
 * source is Awodele, *Divination by Mathematics: Harmonic Analysis* (2013,
 * class C, long-book notes W007 p. 44), whose first CSX window ran between the
 * conjunctions of 16 Apr 1981 and 22 Jun 2000 and whose second ran up to the
 * next (2 Nov 2020, per the author). Astrology stays research here
 * (AGENTS.md "Astrology"): nothing in the scan, the score, a gate, a plan or
 * the setup's context reads this module, and it has no card.
 *
 * It does not change the cycle detector (`spectralCycle.ts`); it only picks
 * which bars the detector is given, so a run over a conjunction window is the
 * same analysis on a fixed, pre-registered span rather than a searched one.
 *
 * Engineering choices, labelled: positions are the shared ephemeris
 * (`planetaryAverages.ts#planetLongitudes`, heliocentric, tropical, of date,
 * at noon UTC), stepped by 30 days and refined to the day; a conjunction is the first day the
 * Jupiter-minus-Saturn separation turns from below zero to zero or above.
 * The ephemeris lands one day after each of the source's three dates (17 Apr
 * 1981, 23 Jun 2000, 3 Nov 2020; see the test); the window uses the ephemeris.
 *
 * Three-question basis. Source: class C, an interpreter's window choice, not
 * a rule of the method. Cycles: choosing the record by a planetary period is
 * itself a claim, and it is tested only by running the detector inside and
 * outside such windows; no Dewey item is cleared. Hermetic: Correspondence
 * (as above, so below), the claim the window rests on, held as a hypothesis.
 */
import type { Bar } from "@/lib/types";
import { planetLongitudes } from "@/lib/gann/planetaryAverages";
import { detectSpectralCycle, type SpectralCycleReading } from "@/lib/gann/spectralCycle";

const DAY_MS = 86_400_000;
const separation = (d: Date) => {
  const { helio } = planetLongitudes(d);
  const x = (((helio.Jupiter - helio.Saturn) % 360) + 360) % 360;
  return x > 180 ? x - 360 : x;
};

/** Heliocentric Jupiter-Saturn conjunction dates (YYYY-MM-DD) between `from` and `to`. */
export function jupiterSaturnConjunctions(from: Date, to: Date): string[] {
  // Jupiter gains about 1.5 degrees a month on Saturn, so a 30-day step never
  // skips a crossing; each bracketed crossing is then walked a day at a time.
  // A wrap from +180 to -180 is the opposition side, not a conjunction.
  const STEP = 30 * DAY_MS;
  const out: string[] = [];
  let t0 = from.getTime();
  let prev = separation(from);
  while (t0 < to.getTime()) {
    const t1 = Math.min(t0 + STEP, to.getTime());
    const s1 = separation(new Date(t1));
    if (prev < 0 && s1 >= 0 && s1 - prev < 90) {
      let p = prev;
      for (let t = t0 + DAY_MS; t <= t1; t += DAY_MS) {
        const s = separation(new Date(t));
        if (p < 0 && s >= 0) {
          out.push(new Date(t).toISOString().slice(0, 10));
          break;
        }
        p = s;
      }
    }
    t0 = t1;
    prev = s1;
  }
  return out;
}

/** The bars dated from `from` to `to` (YYYY-MM-DD, inclusive). */
export function barsBetween(bars: Bar[], from: string, to: string): Bar[] {
  return bars.filter((b) => b.t.slice(0, 10) >= from && b.t.slice(0, 10) <= to);
}

/** The cycle detector run only on the bars between two dates, such as two conjunctions. */
export function spectralCycleBetween(
  bars: Bar[],
  from: string,
  to: string,
): { window: { from: string; to: string; bars: number }; reading: SpectralCycleReading } {
  const inside = barsBetween(bars, from, to);
  return { window: { from, to, bars: inside.length }, reading: detectSpectralCycle(inside) };
}
