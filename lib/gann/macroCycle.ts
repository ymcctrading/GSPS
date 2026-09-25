/**
 * Gann's macro/historical-anchor time cycle — the same disclosed
 * 60/50/30/20/15/10/7/5/3/2/1-year hierarchy `lib/gann/timeCycles.ts`
 * already projects from *each symbol's own* pivots, run one level up: from
 * Gann's own cited historical market turns, independent of any single
 * stock's chart. Useful precisely where `timeCycles.ts` has nothing to
 * anchor from yet (a thin-history or newly-listed symbol) and as macro
 * backdrop context alongside a per-symbol read.
 *
 * **Anchors are Gann's own, not GSPS's invention.**
 * `docs/GANN_HISTORICAL_SOURCES.md` A2.1 Ch. 7 ("Master Time Factor and
 * Forecasting by Mathematical Rules") doesn't only state the year
 * hierarchy — it demonstrates it against a worked, dated DJIA case study,
 * walking August 1896's bottom through the November 1907 low, the 1909
 * top, and September 1929's top, naming the exact elapsed count at each
 * ("[Sept 1929] 240 months from 1909 top... 30 years from 1896 low"). Those
 * four are the anchors below, taken directly from that passage — not a
 * broader list assembled from memory (the earlier proposal that prompted
 * this module named 1932/1937/1949 as anchors; none of those three appear
 * in this citation, so they are deliberately left out rather than silently
 * included). The 1909 top's day/month is not given in the retrieved
 * source, only the year — anchored to January 1 of that year and flagged
 * here rather than guessed at finer precision than the source supports.
 *
 * **Three-question design basis** (AGENTS.md's standing mandate, answered
 * in writing before building, same as `lib/gann/entryTrigger.ts`):
 *
 * 1. **Gann source**: A2.1 Ch. 7, same tier and same year list as
 *    `timeCycles.ts` — this module differs only in *what* it anchors from
 *    (Gann's own cited historical turns) rather than *how* it projects.
 * 2. **Dewey's seven-item cycle checklist, run explicitly, not assumed
 *    cleared**: dominance — untested, no attribution run exists yet for
 *    this construction specifically; regularity of timing — the four
 *    anchors are irregularly spaced (~11, ~1.5, ~20 years apart), which
 *    Gann's own multi-length hierarchy expects rather than contradicts,
 *    but that is not the same as evidence the spacing recurs; repetition
 *    count — only four historical anchors are cited this way in the
 *    retrieved source, a small sample stated plainly as a real limitation;
 *    constancy of period and phase-resumption after distortion — not
 *    testable with four points; wave-shape identity and cross-series
 *    clustering — not evaluated here. This clears none of Dewey's seven
 *    items outright. Treated exactly like `digitalRoot.ts`/
 *    `decadeCycle.ts`: real, running, clearly labeled a hypothesis, never
 *    independently gating.
 * 3. **Hermetic principle**: Correspondence ("as above, so below") — the
 *    same cycle arithmetic that governs one stock's own pivots is asserted
 *    to govern the market as a whole from its own historical turns; Rhythm
 *    is why the projection runs indefinitely forward (through 2126 and
 *    beyond) rather than stopping at the last known anchor.
 *
 * Confluence/context only, per AGENTS.md's "Hermetic principles & cycle
 * theory" standing principle — never wired into scoring, never gating.
 */

import { MAJOR_CYCLE_YEARS } from "./timeCycles";

export interface MacroCycleAnchor {
  /** ISO date. Day/month precision not always given by the source — see module header. */
  date: string;
  kind: "high" | "low";
  label: string;
}

/**
 * Gann's own cited turns from A2.1 Ch. 7's worked DJIA case study. Do not
 * extend this list from general market history — only from a citable
 * passage in `docs/GANN_HISTORICAL_SOURCES.md`, per the module header.
 */
export const MACRO_CYCLE_ANCHORS: MacroCycleAnchor[] = [
  { date: "1896-08-01", kind: "low", label: "August 1896 bottom" },
  { date: "1907-11-01", kind: "low", label: "November 1907 low" },
  { date: "1909-01-01", kind: "high", label: "1909 top" },
  { date: "1929-09-01", kind: "high", label: "September 1929 top" },
];

export interface MacroCycleActiveWindow {
  anchor: string;
  years: number;
  date: string;
  bullish: boolean;
}

export interface MacroCycleResult {
  /** Any macro anchor's turn window is active — for display, not scoring. */
  active: boolean;
  /** A low-anchored macro window is active: supports a bullish backdrop read. */
  bullishActive: boolean;
  /** A high-anchored macro window is active: supports a bearish backdrop read. */
  bearishActive: boolean;
  /** Upcoming projected macro turn dates (ISO date strings), nearest first. */
  dates: string[];
  /** Which anchor/cycle-length pairs are active right now, for explanation traces. */
  activeWindows: MacroCycleActiveWindow[];
}

export function computeMacroCycle(asOf: Date = new Date(), windowDays = 3): MacroCycleResult {
  const dayMs = 24 * 3600 * 1000;

  const projected: { anchorLabel: string; date: Date; years: number; bullish: boolean }[] = [];
  for (const anchor of MACRO_CYCLE_ANCHORS) {
    const anchorDate = new Date(`${anchor.date}T00:00:00Z`);
    const bullish = anchor.kind === "low";
    for (const years of MAJOR_CYCLE_YEARS) {
      const projectedDate = new Date(anchorDate);
      projectedDate.setUTCFullYear(projectedDate.getUTCFullYear() + years);
      projected.push({ anchorLabel: anchor.label, date: projectedDate, years, bullish });
    }
  }

  const nearby = projected.filter(
    (p) => Math.abs(p.date.getTime() - asOf.getTime()) <= windowDays * dayMs,
  );

  const upcoming = projected
    .filter((p) => p.date.getTime() >= asOf.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map((p) => p.date.toISOString().slice(0, 10));

  return {
    active: nearby.length > 0,
    bullishActive: nearby.some((p) => p.bullish),
    bearishActive: nearby.some((p) => !p.bullish),
    dates: upcoming,
    activeWindows: nearby
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({
        anchor: p.anchorLabel,
        years: p.years,
        date: p.date.toISOString().slice(0, 10),
        bullish: p.bullish,
      })),
  };
}
