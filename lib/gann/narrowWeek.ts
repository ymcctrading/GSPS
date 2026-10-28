/**
 * A narrow week followed by a sharp drop on large volume turns the trend down
 * (A-ENTRY-19, W006 p.27: Corn Products, week ended 20 July 1935, short even
 * while the averages rose). PLAN.md item 6 step 10, fork F7 (a), measured
 * (`contextFactors.ts`, `narrowWeekBreakAgrees`). Since 2026-10-16 ("every
 * Gann method acts") the drop is also a sale: `narrowWeekSell` in
 * `entryTrigger.ts`, on completed weeks. The rise mirror stays context.
 *
 * Gann names the pattern and leaves "narrow", "sharp" and "large" undefined.
 * The readings, engineering choices fixed before any measurement:
 * - narrow: the week's high-to-low range is the smallest of the four weeks
 *   ending with it;
 * - sharp: the next week closes Gann's 3 points (price-scaled,
 *   `pointScale.ts`) under the narrow week's low;
 * - large: that week's volume is above the average of the 13 weeks before it.
 * The reading holds for the drop week and the week after it. The mirror (a
 * sharp rise on volume out of a narrow week) is read as up, an inference from
 * Gann's symmetric treatment of tops and bottoms, labelled as such.
 *
 * Three-question basis: 1. W006 p.27, Gann's own text (class A). 2. No claim
 * about periodicity. 3. Rhythm: a contraction (the narrow week) gives way to
 * an expansion, and Polarity gives the mirror.
 */
import type { Bar } from "@/lib/types";
import { threePoints } from "@/lib/gann/pointScale";

/** The narrow week is the narrowest of this many weeks ending with it. Pre-registered. */
export const NARROW_WEEK_LOOKBACK = 4;
/** "Large volume": above the average of this many weeks before the drop. Pre-registered. */
export const NARROW_WEEK_VOLUME_WEEKS = 13;

export interface NarrowWeekBreakReading {
  direction: "bullish" | "bearish";
  /** The narrow week's start (ISO). */
  narrowWeek: string;
  narrowHigh: number;
  narrowLow: number;
  /** The break week's close and its volume over the 13-week average. */
  breakClose: number;
  volumeRatio: number;
}

function breakAt(weekly: Bar[], i: number): NarrowWeekBreakReading | null {
  if (i < NARROW_WEEK_VOLUME_WEEKS || i - 1 < NARROW_WEEK_LOOKBACK - 1) return null;
  const narrow = weekly[i - 1];
  const span = narrow.h - narrow.l;
  for (let k = i - NARROW_WEEK_LOOKBACK; k < i - 1; k++) if (weekly[k].h - weekly[k].l <= span) return null;
  const prior = weekly.slice(i - NARROW_WEEK_VOLUME_WEEKS, i);
  const avg = prior.reduce((n, b) => n + b.v, 0) / prior.length;
  const week = weekly[i];
  if (!(avg > 0) || !(week.v > avg)) return null;
  const base = { narrowWeek: narrow.t, narrowHigh: narrow.h, narrowLow: narrow.l, breakClose: week.c, volumeRatio: week.v / avg };
  if (week.c <= narrow.l - threePoints(narrow.l)) return { direction: "bearish", ...base };
  if (week.c >= narrow.h + threePoints(narrow.h)) return { direction: "bullish", ...base };
  return null;
}

/** The latest narrow-week break, read on the drop week and the week after it. */
export function readNarrowWeekBreak(weekly: Bar[]): NarrowWeekBreakReading | null {
  const last = weekly.length - 1;
  return breakAt(weekly, last) ?? breakAt(weekly, last - 1);
}
