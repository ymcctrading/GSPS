/**
 * Extended-hours (pre-market / after-hours) session extremes, treated as
 * structural S/R levels.
 *
 * Why this exists: Gann's resistance-point theory (docs/GANN_HISTORICAL_SOURCES.md
 * A2.1 — the Square of Nine chapter, and the 1936 course material's "old tops
 * and bottoms" rule) is a statement about *prices a market has actually
 * printed*, not about which session printed them. A pre-market or after-hours
 * extreme is a real transacted price like any other, so it belongs in the
 * same candidate pool as a regular-session pivot — it is not a new criterion,
 * just a previously-missing input to the S/R pool every existing criterion
 * already reads (`nearSupportResistance` / `historicalSR` in
 * lib/scoring/score.ts, and the stop/target anchoring in
 * lib/strat/levels.ts#computeTradeLevels).
 *
 * Per AGENTS.md's WD Gann precedence section: the Gann Master Course
 * (docs/GANN_HISTORICAL_SOURCES.md A2.1) names a dedicated "Overnight Chart"
 * mechanical system in its unread chapters — a real, still-open research gap,
 * not fabricated here. This module does NOT claim to implement that specific
 * system; it implements the narrower, already-fully-documented resistance-
 * point rule extended to extended-hours prints, which needs no further
 * citation to justify. If the Overnight Chart chapter is ever extracted and
 * turns out to prescribe something more specific, that supersedes this.
 *
 * Overnight is read from the most recent post-close session (yesterday's
 * after-hours, or Friday's for a Monday scan) through this morning's
 * pre-market — i.e. exactly the window between two regular sessions where a
 * gap can build unseen by anything that only reads regular-session bars.
 */

import type { Bar } from "@/lib/types";
import { equitySession, etDateKey, mostRecentClose } from "@/lib/market/session";

export interface ExtendedHoursLevels {
  preMarketHigh: number | null;
  preMarketLow: number | null;
  afterHoursHigh: number | null;
  afterHoursLow: number | null;
}

const EMPTY_LEVELS: ExtendedHoursLevels = {
  preMarketHigh: null,
  preMarketLow: null,
  afterHoursHigh: null,
  afterHoursLow: null,
};

/**
 * `minuteBars` should span at least the last ~30 hours so both today's
 * pre-market (04:00-09:30 ET) and the prior session's after-hours
 * (16:00-20:00 ET) are covered — the two halves of the same overnight window.
 * Bars from any other session, or with an unparseable timestamp, are ignored.
 */
export function computeExtendedHoursLevels(
  minuteBars: Bar[],
  now: Date = new Date(),
): ExtendedHoursLevels {
  if (minuteBars.length === 0) return EMPTY_LEVELS;

  const todayEt = etDateKey(now);
  const priorSessionEt = etDateKey(mostRecentClose(now));

  let preMarketHigh: number | null = null;
  let preMarketLow: number | null = null;
  let afterHoursHigh: number | null = null;
  let afterHoursLow: number | null = null;

  for (const bar of minuteBars) {
    const at = new Date(bar.t);
    if (Number.isNaN(at.getTime()) || !(bar.h >= bar.l) || bar.l <= 0) continue;

    const session = equitySession(at);
    const barEt = etDateKey(at);

    if (session === "pre" && barEt === todayEt) {
      preMarketHigh = preMarketHigh === null ? bar.h : Math.max(preMarketHigh, bar.h);
      preMarketLow = preMarketLow === null ? bar.l : Math.min(preMarketLow, bar.l);
    } else if (session === "post" && barEt === priorSessionEt) {
      afterHoursHigh = afterHoursHigh === null ? bar.h : Math.max(afterHoursHigh, bar.h);
      afterHoursLow = afterHoursLow === null ? bar.l : Math.min(afterHoursLow, bar.l);
    }
  }

  return { preMarketHigh, preMarketLow, afterHoursHigh, afterHoursLow };
}

/** Flattened to plain prices, for callers that only want candidate S/R levels. */
export function extendedHoursLevelPrices(levels: ExtendedHoursLevels): number[] {
  return [levels.preMarketHigh, levels.preMarketLow, levels.afterHoursHigh, levels.afterHoursLow].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
}
