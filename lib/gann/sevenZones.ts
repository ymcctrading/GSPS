/**
 * Gann's Seven Zones of Activity (*Truth of the Stock Tape*, 1923, Ch. XI;
 * Tier A). Built 2026-09-28 by project-owner direction ("if the Seven Zones
 * can be pinned down, then do so and implement").
 *
 * What the chapter gives: a normal zone, where buying and selling roughly
 * balance and fluctuations are narrow, and three zones above and three below
 * it, each defined by *behaviour*, not by a price boundary:
 * - Zone 1 above: a quiet advance that draws little attention.
 * - Zone 2 above: greater activity; the public starts to buy and waits for a
 *   reaction back to zone 1 that seldom comes (reactions stay small).
 * - Zone 3 above: distribution. Very wide fluctuations, small reactions,
 *   prices opening higher every few days. The first sign of the end is an
 *   opening sharply lower with no news: supply has overtaken demand.
 * - Zone 1 below: a quiet decline, the first shake-out, dull rallies.
 * - Zone 2 below: liquidation; breaks get bigger and rallies smaller.
 * - Zone 3 below: panic and extreme pessimism, the time to cover and buy once
 *   liquidation is complete.
 * The same zone may last a month or several years; the chapter gives no
 * duration and no percentage boundaries. So the zones are "pinned down" here
 * the only way the source allows: by reading those behaviours off the chart.
 *
 * Engineering choices, labelled as such (none is Gann's number):
 * - Direction is the weekly swing chart's trend when the tops and bottoms
 *   step the same way (`readGannTrend`'s `structureAgrees`). Without that,
 *   buying and selling are taken as balanced: the normal zone.
 * - Activity is the median daily range of the last `RECENT_BARS` sessions
 *   against the median of the last `BASELINE_BARS` (the stock's own "normal"
 *   fluctuation). Below `QUIET` is zone 1, up to `ACTIVE` zone 2, above it
 *   zone 3. Three or more gaps in the trend's direction in the recent window
 *   also mark zone 3 (Gann's "opening higher every few days").
 * - The first sign of the end: in zone 3, the latest session opened beyond
 *   the prior session's low (high, below) against the run.
 *
 * GSPS use: context on the card, a line in the explanation trace, and
 * measured factors in the replay. It never gates a verdict until measured.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: the zones are a campaign's life cycle. No period is claimed (the
 *    chapter says a stage may take a month or ten years), so Dewey's checklist
 *    does not apply; the replay's factor table is the test.
 * 3. Hermetic: Rhythm (the swing from normal to the extreme and back through
 *    normal to the opposite extreme) and Polarity (each zone above has its
 *    mirror below; "darkest before dawn, brightest at noon"). Mentalism fits
 *    the outer zones, which the chapter describes as states of the crowd's
 *    mind, hope and fear, more than as prices.
 */

import type { Bar } from "@/lib/types";
import { readGannTrend } from "@/lib/gann/trendStrength";

export const RECENT_BARS = 20;
export const BASELINE_BARS = 250;
export const QUIET = 1.0;
export const ACTIVE = 1.5;
export const ZONE3_GAPS = 3;

/** −3 … +3; 0 is the normal zone. */
export type Zone = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface ZoneReading {
  zone: Zone;
  /** Recent median daily range over the baseline median. */
  activity: number;
  gapsWithTrend: number;
  /** Zone 3 only: the latest session opened against the run beyond the prior extreme. */
  firstSignOfEnd: boolean;
  label: string;
}

const LABELS: Record<Zone, string> = {
  [-3]: "Zone 3 below normal: panic and liquidation",
  [-2]: "Zone 2 below normal: liquidation, bigger breaks",
  [-1]: "Zone 1 below normal: quiet decline",
  0: "Normal zone: balanced, narrow",
  1: "Zone 1 above normal: quiet advance",
  2: "Zone 2 above normal: active advance",
  3: "Zone 3 above normal: feverish, distribution",
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
}

const rangePct = (b: Bar) => (b.c > 0 ? ((b.h - b.l) / b.c) * 100 : 0);

export function readSevenZones(daily: Bar[]): ZoneReading | null {
  if (daily.length < RECENT_BARS + 20) return null;
  const recent = daily.slice(-RECENT_BARS);
  const baseline = daily.slice(-BASELINE_BARS);
  const base = median(baseline.map(rangePct));
  if (!(base > 0)) return null;
  const activity = median(recent.map(rangePct)) / base;

  // A direction only when the weekly swing chart and the structure of tops and
  // bottoms agree; otherwise buying and selling are in balance (normal zone).
  const read = readGannTrend(daily);
  const trend = read.structureAgrees ? read.weekly : null;
  const up = trend === "bullish";
  let gapsWithTrend = 0;
  for (let i = daily.length - RECENT_BARS; i < daily.length; i++) {
    if (i < 1) continue;
    if (up ? daily[i].l > daily[i - 1].h : trend === "bearish" && daily[i].h < daily[i - 1].l) gapsWithTrend++;
  }

  let magnitude: 0 | 1 | 2 | 3 = 0;
  if (trend) {
    magnitude = activity < QUIET ? 1 : activity <= ACTIVE ? 2 : 3;
    if (gapsWithTrend >= ZONE3_GAPS) magnitude = 3;
  }
  const zone = (trend === "bearish" ? -magnitude : magnitude) as Zone;

  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2];
  const firstSignOfEnd = Math.abs(zone) === 3 && (up ? last.o < prev.l : last.o > prev.h);

  return { zone, activity, gapsWithTrend, firstSignOfEnd, label: LABELS[zone] };
}

export function describeSevenZones(r: ZoneReading): string {
  const end = r.firstSignOfEnd
    ? r.zone > 0
      ? " Today opened below yesterday's low after the run: the first sign that supply has overtaken demand."
      : " Today opened above yesterday's high after the fall: the first sign that selling is exhausted."
    : "";
  return `${r.label} (activity ${r.activity.toFixed(2)}× its normal range).${end}`;
}
