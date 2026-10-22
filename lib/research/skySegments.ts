/**
 * Dewey's sky-segment claim (C-ASTRO-06). Research only: no criterion, gate,
 * plan, entry or order reads this.
 *
 * The claim, as Meadors reports it (W028, secondhand): Edward R. Dewey,
 * "Stock Prices and Space", *Cycles*, October 1969, found that from 1897 to
 * 1961 the Dow rose in the 30 days before Mars–Jupiter and Mercury
 * conjunctions and oppositions near the Galactic Centre "92% of the time".
 *
 * Gann: none; not sourced to Gann. Kept apart from Gann's aspects
 * (`lib/gann/astroRules.ts`), Jensen's (`lib/gann/jensen.ts`) and Bucholtz's
 * (`aspects.ts`).
 * Cycles: a dated-event claim, so Dewey's own standard applies to it: a hit
 * rate against a base rate, a significance test with a multiple-comparisons
 * correction, and a hold-out the rule never saw (C06).
 * Hermetic: Correspondence ("as above, so below"), held as a hypothesis.
 *
 * PRE-REGISTERED, fixed before any data was read (2026-10-22). Nothing below
 * was searched over planets, orbs, widths or windows.
 * - Pairs: Mars–Jupiter, Mercury–Mars and Mercury–Jupiter. "Mars–Jupiter and
 *   Mercury conjunctions" is read as the three pairs those planets make; the
 *   source gives no list, so this reading is ours. Meadors's summary can also
 *   be read as two claims (any pair near the Galactic Centre up 92%; a 30-day
 *   advance before these pairs' conjunctions); this test reads them as one.
 * - Aspects: geocentric conjunction (0°) and opposition (180°), dated to the
 *   first noon UTC after the separation crosses the angle (orb 0, daily
 *   resolution, from `planetLongitudes`).
 * - Near the Galactic Centre: either planet of the pair within ±15° of 267°
 *   ecliptic longitude on that day (a 30° segment, one sign's width). 267° is
 *   an engineering figure: the Galactic Centre's tropical longitude drifts
 *   about 1.4° a century (near 265.3° in 1897), well inside the segment.
 * - Outcome: "rose in the 30 days before" is read on the monthly record as
 *   the event month's figure above the month before's. The record is Shiller's
 *   monthly S&P composite (`lib/gann/marketHistory.json`), not the Dow
 *   Dewey used, and a monthly average, not a 30-day close, so the comparison
 *   runs roughly mid-month to mid-month and part of it can fall after the
 *   event.
 * - Base rate: the share of all months in the same span that rose on the month
 *   before. One-sided exact binomial test of the hits against it.
 * - Spans: 1897–1961 (Dewey's own, so a replication) and 1962–2026 (the
 *   hold-out, data he never saw). Holm–Bonferroni across the two
 *   (`calendarTest.ts#holm`).
 *
 * RESULT (run 2026-10-22, pinned in `__tests__/skySegments.test.ts`): 47
 * events in 1897–1961 fall in 40 months on the record.
 * - 1897–1961: 26 of 40 months rose, 65.0%, against a base rate of 57.9%;
 *   one-sided p = 0.23. Not significant under Holm.
 * - 1962–2026 (hold-out): 23 of 37 rose, 62.2%, against a base rate of 62.2%;
 *   p = 0.57. Not significant.
 * Neither span comes near the reported 92%, and the hold-out shows no edge at
 * all. On this reading and this record the claim does not replicate. Whether
 * Dewey's own Dow series, a 30-day close or a different pair list would
 * reproduce his figure is open; testing those now would be a search, so they
 * would need registering first. Stays research only.
 */

import { planetLongitudes, type Planet } from "@/lib/gann/planetaryAverages";
import { marketMonth } from "@/lib/gann/massPressure";
import { holm } from "./calendarTest";

export const GALACTIC_CENTRE_LONGITUDE = 267;
export const SEGMENT_HALF_WIDTH = 15;
export const PAIRS: readonly [Planet, Planet][] = [
  ["Mars", "Jupiter"],
  ["Mercury", "Mars"],
  ["Mercury", "Jupiter"],
];
export const ASPECT_ANGLES = [0, 180] as const;
export const SPANS = [
  { label: "1897-1961 (Dewey's span)", from: 1897, to: 1961 },
  { label: "1962-2026 (hold-out)", from: 1962, to: 2026 },
] as const;

const DAY_MS = 86_400_000;

/** Signed separation a − b folded into (−180, 180]. */
function signedSep(a: number, b: number): number {
  const d = ((((a - b) % 360) + 360) % 360);
  return d > 180 ? d - 360 : d;
}

/** Folded distance of a longitude from another, 0–180. */
function arc(a: number, b: number): number {
  return Math.abs(signedSep(a, b));
}

export interface SkyEvent {
  date: string;
  pair: string;
  aspect: "conjunction" | "opposition";
  longitudes: [number, number];
}

/**
 * Every geocentric conjunction and opposition of the pre-registered pairs with
 * a planet within the Galactic Centre segment, by UTC day, in [fromYear, toYear].
 */
export function galacticCentreEvents(fromYear: number, toYear: number): SkyEvent[] {
  const events: SkyEvent[] = [];
  const start = Date.UTC(fromYear, 0, 1);
  const end = Date.UTC(toYear, 11, 31);
  let prev: Record<string, number> | null = null;
  for (let t = start; t <= end; t += DAY_MS) {
    const geo = planetLongitudes(new Date(t)).geo;
    const now: Record<string, number> = {};
    for (const [a, b] of PAIRS) {
      for (const angle of ASPECT_ANGLES) {
        const key = `${a}-${b}-${angle}`;
        // Offset from the aspect, in (−180, 180]; a crossing is a sign change
        // near zero (not the wrap at ±180).
        const off = signedSep(signedSep(geo[a], geo[b]), angle);
        now[key] = off;
        const before = prev?.[key];
        if (before == null || off === 0 || Math.sign(before) === Math.sign(off) || Math.abs(before - off) > 90) continue;
        const nearGc =
          arc(geo[a], GALACTIC_CENTRE_LONGITUDE) <= SEGMENT_HALF_WIDTH ||
          arc(geo[b], GALACTIC_CENTRE_LONGITUDE) <= SEGMENT_HALF_WIDTH;
        if (!nearGc) continue;
        events.push({
          date: new Date(t).toISOString().slice(0, 10),
          pair: `${a}–${b}`,
          aspect: angle === 0 ? "conjunction" : "opposition",
          longitudes: [geo[a], geo[b]],
        });
      }
    }
    prev = now;
  }
  return events;
}

/** Whether the month of `date` rose on the month before, or null outside the record. */
export function monthRose(year: number, month: number): boolean | null {
  const [py, pm] = month === 1 ? [year - 1, 12] : [year, month - 1];
  const before = marketMonth("stocks", py, pm);
  const now = marketMonth("stocks", year, month);
  if (before == null || now == null) return null;
  return now > before;
}

/** P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (!(p > 0)) return 0;
  if (!(p < 1)) return 1;
  let logC = 0;
  let total = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) total += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

export interface SpanResult {
  label: string;
  events: number;
  hits: number;
  hitRate: number;
  baseRate: number;
  p: number;
  holmSignificant?: boolean;
}

function scoreSpan(label: string, from: number, to: number): SpanResult {
  // Several events in one month count once: the outcome is the month's.
  const months = new Set(galacticCentreEvents(from, to).map((e) => e.date.slice(0, 7)));
  let events = 0;
  let hits = 0;
  for (const key of months) {
    const [y, m] = key.split("-").map(Number);
    const rose = monthRose(y, m);
    if (rose == null) continue;
    events++;
    if (rose) hits++;
  }
  let up = 0;
  let all = 0;
  for (let y = from; y <= to; y++) {
    for (let m = 1; m <= 12; m++) {
      const rose = monthRose(y, m);
      if (rose == null) continue;
      all++;
      if (rose) up++;
    }
  }
  const baseRate = all ? up / all : NaN;
  return {
    label,
    events,
    hits,
    hitRate: events ? hits / events : NaN,
    baseRate,
    p: events ? binomialUpperTail(hits, events, baseRate) : 1,
  };
}

/** The pre-registered test: both spans, Holm across them. */
export function runSkySegmentTest(): SpanResult[] {
  return holm(SPANS.map((s) => scoreSpan(s.label, s.from, s.to)));
}
