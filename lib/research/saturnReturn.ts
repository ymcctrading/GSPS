/**
 * Saturn return beside the 30-year count (C-ASTRO-02). Research only: no
 * criterion, gate, plan, entry, order or time-window hold reads this, and
 * `applyTimeWindowHold` must not (CYC-41; guarded by
 * `lib/validation/__tests__/criteria-gate.test.ts`). Feeding it into a verdict
 * needs the owner's sign-off under AGENTS.md's Astrology rule.
 *
 * Three-question basis:
 * 1. Gann: not sourced to him as read. W007 p.60 (Awodele) quotes an
 *    unidentified course saying the 30-year cycle is caused by Saturn; the
 *    probable origin is unread (UNVERIFIABLE). The 30-year count itself is
 *    `lib/gann/timeCycles.ts#MAJOR_CYCLE_YEARS`, counted from pivots with no
 *    planetary cause.
 * 2. Cycles: Saturn's sidereal period is about 29.46 years, so its return
 *    falls a few months before the 30-year date and drifts against it. A
 *    30-year cycle repeats only about four times in a US equity record (CYC-04),
 *    too few for Dewey's repetition count, so this is a date to test, not a
 *    validated period.
 * 3. Hermetic: Correspondence (a period above held to repeat below), kept as a
 *    hypothesis until a pre-registered test says otherwise.
 *
 * Engineering choices, labelled as such: the heliocentric tropical longitude
 * from `planetaryAverages.ts#planetLongitudes` (heliocentric Saturn never
 * loops back, so the return is a single crossing), day resolution, and a
 * search window of 28 to 31 years after the anchor.
 */
import { planetLongitudes } from "@/lib/gann/planetaryAverages";

export const SATURN_RETURN_LABEL = "Saturn return: research only, not part of the 30-year count or any verdict.";

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;

export interface SaturnReturnReading {
  anchorDate: string;
  anchorLongitude: number;
  returnDate: string;
  years: number;
  /** The 30-year count from the same anchor, for comparison. */
  thirtyYearDate: string;
  /** Days the return falls before that date (negative when after). */
  daysBeforeThirtyYear: number;
  label: string;
  hypothesisOnly: true;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const signedOffset = (lon: number, ref: number) => ((lon - ref + 540) % 360) - 180;

export function saturnReturn(anchor: Date): SaturnReturnReading | null {
  if (Number.isNaN(anchor.getTime())) return null;
  const start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const anchorLongitude = planetLongitudes(new Date(start)).helio.Saturn;
  const off = (day: number) => signedOffset(planetLongitudes(new Date(start + day * DAY_MS)).helio.Saturn, anchorLongitude);
  // Within the window the offset rises through zero once: binary search on days.
  let lo = Math.floor(28 * YEAR_DAYS);
  let hi = Math.ceil(31 * YEAR_DAYS);
  if (!(off(lo) < 0 && off(hi) >= 0)) return null;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (off(mid) < 0) lo = mid;
    else hi = mid;
  }
  const back = new Date(start + hi * DAY_MS);
  const thirty = new Date(Date.UTC(anchor.getUTCFullYear() + 30, anchor.getUTCMonth(), anchor.getUTCDate()));
  return {
    anchorDate: iso(new Date(start)),
    anchorLongitude,
    returnDate: iso(back),
    years: Math.round((hi / YEAR_DAYS) * 1000) / 1000,
    thirtyYearDate: iso(thirty),
    daysBeforeThirtyYear: Math.round((thirty.getTime() - back.getTime()) / DAY_MS),
    label: SATURN_RETURN_LABEL,
    hypothesisOnly: true,
  };
}
