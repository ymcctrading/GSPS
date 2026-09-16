/**
 * Gann's Square of 52 / Master Calculator for Weekly Time Periods
 * (PRIVATE-GANN — Chapter 14, `docs/GANN_HISTORICAL_SOURCES.md` A2.1).
 * Internal/research use only — see `angleMonthCounts.ts`'s header for the
 * never-wire-into-the-public-scan rule; it applies identically here.
 *
 * 52² = 2,704 (~7 years 5 months in days), built from 7-day weeks: a fourth
 * Master construction, alongside the Square of Nine (base 9, price),
 * Master Twelve (base 12, price) and the Square of 20 (base 20, calendar
 * dates). This one's own disclosed content is a fractional division table
 * of the 52-week year, not a spiral — Gann's explicit weekly resistance
 * levels for any 52-week cycle.
 *
 * **Reuse decision (AGENTS.md cross-platform consistency principle).**
 * `lib/gann/retracement.ts` already implements an eighths fraction-band
 * table, and the two look structurally identical (label a fraction, compute
 * a value from it, sort by proximity). Evaluated reusing it directly;
 * concluded this is a real, documented exception rather than an oversight:
 * (1) retracement.ts's fractions are *price*-domain, dynamically anchored to
 * the range between the two most recent swing pivots — a different anchor
 * every time it runs; Square of 52's fractions are *time*-domain, anchored
 * to Gann's own fixed 52-week constant, never a per-instrument range. (2)
 * The disclosed tables differ in content, not just domain: Square of 52
 * discloses thirds (1/3, 2/3) that retracement.ts's eighths-only table does
 * not carry. Sharing one array would either silently add thirds to the
 * price eighths (not what that module discloses) or drop them from the time
 * table (not what this one discloses). This module therefore defines its
 * own fixed table, keeping the same `{ fraction, label }` shape convention
 * for consistency with `retracement.ts`.
 */

import type { Bar } from "@/lib/types";
import { majorPivots, findPivots } from "@/lib/analysis/pivots";

export const SQUARE_OF_52_WEEKS = 52;

export interface WeekFraction {
  fraction: number;
  label: string;
  weeks: number;
  /** Gann's own emphasis, as documented data. */
  emphasis: "most-important" | "very-important" | null;
  /** Whether this exact fraction/week-count is directly disclosed in the source vs. interpolated on the same grid. */
  disclosed: boolean;
}

function weeks(fraction: number): number {
  return Math.round(SQUARE_OF_52_WEEKS * fraction * 100) / 100;
}

/**
 * The full eighths + thirds division of the 52-week year. Disclosed values
 * (with Gann's own week-counts, matched exactly): 1/8 = 6.5wk, 1/4 = 13wk,
 * 1/3 = 17.33wk (the source's own prose rounds this to "17wk" — the exact
 * fraction is kept here and flagged in a comment, per the task's own
 * "actually 17.33, check source" note), 1/2 = 26wk ("a most important time
 * and resistance level"), 5/8 = 32.5wk, 3/4 = 39wk ("very important").
 * Remaining eighths/sixteenths/the second third are interpolated on the
 * same disclosed grid, not independently quoted, and flagged `disclosed:
 * false`.
 */
export const SQUARE_OF_52_FRACTIONS: WeekFraction[] = [
  { fraction: 1 / 16, label: "1/16", weeks: weeks(1 / 16), emphasis: null, disclosed: false },
  { fraction: 1 / 8, label: "1/8", weeks: weeks(1 / 8), emphasis: null, disclosed: true },
  { fraction: 3 / 16, label: "3/16", weeks: weeks(3 / 16), emphasis: null, disclosed: false },
  { fraction: 1 / 4, label: "1/4", weeks: weeks(1 / 4), emphasis: null, disclosed: true },
  { fraction: 1 / 3, label: "1/3", weeks: weeks(1 / 3), emphasis: null, disclosed: true }, // exact 17.33wk; source prose rounds to "17wk"
  { fraction: 3 / 8, label: "3/8", weeks: weeks(3 / 8), emphasis: null, disclosed: false },
  { fraction: 1 / 2, label: "1/2", weeks: weeks(1 / 2), emphasis: "most-important", disclosed: true },
  { fraction: 5 / 8, label: "5/8", weeks: weeks(5 / 8), emphasis: null, disclosed: true },
  { fraction: 2 / 3, label: "2/3", weeks: weeks(2 / 3), emphasis: null, disclosed: false },
  { fraction: 3 / 4, label: "3/4", weeks: weeks(3 / 4), emphasis: "very-important", disclosed: true },
  { fraction: 7 / 8, label: "7/8", weeks: weeks(7 / 8), emphasis: null, disclosed: false },
  { fraction: 15 / 16, label: "15/16", weeks: weeks(15 / 16), emphasis: null, disclosed: false },
  { fraction: 1, label: "1/1", weeks: weeks(1), emphasis: null, disclosed: false },
];

export interface SquareOf52Result {
  active: boolean;
  dates: string[]; // upcoming dates of interest (ISO date strings), disclosed fractions only
}

/**
 * Projects the disclosed fraction weeks forward from major swing pivots —
 * same anchor convention `lib/gann/timeCycles.ts` uses via `majorPivots()`.
 * Confluence/display only: no bull/bear polarity, never independently
 * scored or gated.
 */
export function squareOf52Windows(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): SquareOf52Result {
  if (dailyBars.length < 30) return { active: false, dates: [] };

  const pivots = findPivots(dailyBars, 5);
  const anchors = majorPivots(pivots).slice(-12);
  const disclosed = SQUARE_OF_52_FRACTIONS.filter((f) => f.disclosed);

  const dayMs = 24 * 3600 * 1000;
  const dates: Date[] = [];
  for (const anchor of anchors) {
    const anchorDate = new Date(anchor.bar.t);
    for (const { weeks: wk } of disclosed) {
      dates.push(new Date(anchorDate.getTime() + wk * 7 * dayMs));
    }
  }

  const nearby = dates.filter((d) => Math.abs(d.getTime() - asOf.getTime()) <= windowDays * dayMs);
  const upcoming = dates
    .filter((d) => d.getTime() >= asOf.getTime() && d.getTime() <= asOf.getTime() + 30 * dayMs)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 5)
    .map((d) => d.toISOString().slice(0, 10));

  return { active: nearby.length > 0, dates: upcoming };
}
