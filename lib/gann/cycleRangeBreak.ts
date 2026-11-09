/**
 * A sideways range broken on volume at a time cycle's expiry (C-TIME-03),
 * one combined context reading.
 *
 * Source (class C, *Additional Cycle Findings*, an anonymous compilation,
 * W003 p. 16, the third of its "nine mathematical proofs of resistance"):
 * time cycles act as vertical angles; go short when, after 3-4 sideways
 * days, a high-volume down day breaks the range at the expiry of a time
 * cycle. Its probable origin, the Master Stock Market Course, is unread, and
 * the held-rules recheck did not find the trigger in the method's own text,
 * so this stays context: it never places, gates or sizes anything. The text
 * gives the short side only, and so does this module.
 *
 * The parts already exist separately and are reused: the cycle windows
 * (`timeCycles.ts`, read by the caller and passed in as `onCycleDate`), and
 * the volume ratio the volume-climax rule uses (`VOLUME_CLIMAX_THRESHOLD`).
 *
 * Engineering choices, labelled as such:
 * - "Sideways" is the range bars' span (highest high to lowest low) within
 *   the 3-point allowance at that price (`pointScale.ts#threePoints`).
 *   Four days are tried before three.
 * - The break is the last bar closing under the range's low on a down day
 *   (close under open).
 * - "High volume" is the break day's volume at least 1.5× the average of the
 *   20 sessions before the range.
 *
 * Three-question basis:
 * 1. Source: as above, class C, trigger unconfirmed in the primary text.
 * 2. Cycles: it leans on the cycle windows, whose base-rate run (2026-10-16,
 *    736 symbols) found no family beating placement at random; no Dewey item
 *    is cleared, so it is measured as a factor and never gates.
 * 3. Hermetic: Correspondence of time and price (the cycle's date standing
 *    as a vertical line the price range runs into), and Cause and Effect:
 *    the volume is the cause the break needs.
 */
import type { Bar } from "@/lib/types";
import { threePoints } from "@/lib/gann/pointScale";
import { VOLUME_CLIMAX_THRESHOLD } from "@/lib/gann/volumeClimax";

export const RANGE_DAYS = [4, 3] as const;
export const PRIOR_VOLUME_SESSIONS = 20;

export interface CycleRangeBreak {
  rangeDays: (typeof RANGE_DAYS)[number];
  rangeLow: number;
  rangeHigh: number;
  /** The break day's volume over the 20 sessions before the range. */
  volumeRatio: number;
  onCycleDate: boolean;
  /** All three together: the compiler's short setup. */
  shortSetup: boolean;
}

/** The last bar breaking a 3-4 day sideways range downward, or null when it did not. */
export function readCycleRangeBreak(daily: Bar[], onCycleDate: boolean): CycleRangeBreak | null {
  const last = daily[daily.length - 1];
  if (!last || last.c >= last.o) return null;
  for (const n of RANGE_DAYS) {
    const end = daily.length - 1;
    if (end - n - PRIOR_VOLUME_SESSIONS < 0) continue;
    const range = daily.slice(end - n, end);
    const rangeHigh = Math.max(...range.map((b) => b.h));
    const rangeLow = Math.min(...range.map((b) => b.l));
    if (rangeHigh - rangeLow > threePoints(range[range.length - 1].c)) continue;
    if (last.c >= rangeLow) return null;
    const prior = daily.slice(end - n - PRIOR_VOLUME_SESSIONS, end - n);
    const avg = prior.reduce((s, b) => s + b.v, 0) / prior.length;
    if (!(avg > 0)) return null;
    const volumeRatio = last.v / avg;
    return {
      rangeDays: n,
      rangeLow,
      rangeHigh,
      volumeRatio,
      onCycleDate,
      shortSetup: onCycleDate && volumeRatio >= VOLUME_CLIMAX_THRESHOLD,
    };
  }
  return null;
}

export function describeCycleRangeBreak(r: CycleRangeBreak): string {
  return `After ${r.rangeDays} sideways days (${r.rangeLow.toFixed(2)} to ${r.rangeHigh.toFixed(2)}) a down day broke the range on ${r.volumeRatio.toFixed(1)}× volume, ${r.onCycleDate ? "on" : "off"} a time-cycle date${r.shortSetup ? ": the compiler's short setup" : ""}. Shown for context; it does not change the setup.`;
}
