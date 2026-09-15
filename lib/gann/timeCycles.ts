/**
 * Gann time cycles: anniversary dates of major pivots and fixed wheel counts
 * (45/90/180/360 calendar days) projected forward. A scan date falling within
 * `windowDays` of any projected date marks an active "date of interest".
 *
 * Directional: a low pivot projects turn windows a bullish reversal argues
 * from (the low resuming up); a high pivot projects the mirror for bearish.
 * Mixing the two together — treating "a turn window is active" as agreeing
 * with either direction — is what let this criterion argue for a bullish and
 * a bearish setup identically.
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

const WHEEL_COUNTS = [45, 90, 120, 180, 270, 360];

export interface TimeCycleResult {
  /** Any direction's turn window is active — for display, not scoring. */
  active: boolean;
  /** A low-anchored turn window is active: supports a bullish setup. */
  bullishActive: boolean;
  /** A high-anchored turn window is active: supports a bearish setup. */
  bearishActive: boolean;
  dates: string[]; // upcoming/nearby dates of interest (ISO date strings)
}

export function timeCycles(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): TimeCycleResult {
  if (dailyBars.length < 30) return { active: false, bullishActive: false, bearishActive: false, dates: [] };

  const pivots = findPivots(dailyBars, 5);
  // Major pivots only: the top quartile by swing prominence, not merely the
  // most recent by index — a shallow, recent pivot is still noise.
  const anchors = majorPivots(pivots).slice(-12);

  const dayMs = 24 * 3600 * 1000;
  const dates: { date: Date; bullish: boolean }[] = [];

  for (const anchor of anchors) {
    const anchorDate = new Date(anchor.bar.t);
    // A low resuming up argues bullish; a high resuming down argues bearish.
    const bullish = anchor.kind === "low";
    // Fixed wheel counts forward from the pivot
    for (const count of WHEEL_COUNTS) {
      dates.push({ date: new Date(anchorDate.getTime() + count * dayMs), bullish });
    }
    // Anniversary dates (1–3 years out)
    for (let y = 1; y <= 3; y++) {
      const anniversary = new Date(anchorDate);
      anniversary.setFullYear(anniversary.getFullYear() + y);
      dates.push({ date: anniversary, bullish });
    }
  }

  const nearby = dates.filter(
    (d) => Math.abs(d.date.getTime() - asOf.getTime()) <= windowDays * dayMs,
  );

  const upcoming = dates
    .filter((d) => d.date.getTime() >= asOf.getTime() && d.date.getTime() <= asOf.getTime() + 14 * dayMs)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map((d) => d.date.toISOString().slice(0, 10));

  return {
    active: nearby.length > 0,
    bullishActive: nearby.some((d) => d.bullish),
    bearishActive: nearby.some((d) => !d.bullish),
    dates: upcoming,
  };
}
