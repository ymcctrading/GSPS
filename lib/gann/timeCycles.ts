/**
 * Gann time cycles: anniversary dates of major pivots and fixed wheel counts
 * (45/90/180/360 calendar days) projected forward. A scan date falling within
 * `windowDays` of any projected date marks an active "date of interest".
 */

import type { Bar } from "@/lib/types";
import { findPivots } from "@/lib/analysis/pivots";

const WHEEL_COUNTS = [45, 90, 120, 180, 270, 360];

export interface TimeCycleResult {
  active: boolean;
  dates: string[]; // upcoming/nearby dates of interest (ISO date strings)
}

export function timeCycles(dailyBars: Bar[], asOf: Date = new Date(), windowDays = 2): TimeCycleResult {
  if (dailyBars.length < 30) return { active: false, dates: [] };

  const pivots = findPivots(dailyBars, 5);
  // Major pivots only: top quartile by prominence (distance from neighbors is
  // already implied by strength=5); use the last 12 pivots.
  const anchors = pivots.slice(-12).map((p) => new Date(p.bar.t));

  const dayMs = 24 * 3600 * 1000;
  const dates: Date[] = [];

  for (const anchor of anchors) {
    // Fixed wheel counts forward from the pivot
    for (const count of WHEEL_COUNTS) {
      dates.push(new Date(anchor.getTime() + count * dayMs));
    }
    // Anniversary dates (1–3 years out)
    for (let y = 1; y <= 3; y++) {
      const anniversary = new Date(anchor);
      anniversary.setFullYear(anniversary.getFullYear() + y);
      dates.push(anniversary);
    }
  }

  const nearby = dates.filter(
    (d) => Math.abs(d.getTime() - asOf.getTime()) <= windowDays * dayMs,
  );

  const upcoming = dates
    .filter((d) => d.getTime() >= asOf.getTime() && d.getTime() <= asOf.getTime() + 14 * dayMs)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 5)
    .map((d) => d.toISOString().slice(0, 10));

  return { active: nearby.length > 0, dates: upcoming };
}
