/**
 * GSPS — how soon price reaches a daily plan's entry, read on the session's
 * bars, so a person is told before it gets there (owner, 2026-10-28: "alerts
 * the user as price is moving towards that entry level ... so it may be five
 * minutes and maybe 15 minutes, but that should be determined by all of the
 * tools ... to determine how fast price is moving towards entry").
 *
 * The speed is Gann's: "a movement in price during a unit of time" (the 1954
 * course catalogue), read as an angle, so many points of price for each bar of
 * time, drawn from the top the reaction fell from (the bottom a rally rose
 * from, short). His angles are the disclosed tool for that rate (Master Course
 * Ch. 4; the 1x1 is one point a bar); the Three-Dimension Chart that measured
 * speed in his letters was never disclosed. The reaction's own pace is the
 * line drawn from its top through the latest close; the time left is the
 * distance to the entry at that pace.
 *
 * The free equity feed runs about 15 minutes late and the scheduled scan runs
 * every 15 minutes, so the time left is counted from now (the data's age taken
 * off), and a person's lead time is met on the last scan before it: an alert
 * goes out once the time left is within the lead plus one scan
 * (`SCAN_CADENCE_MINUTES`). With a 15-minute lead that is about 30 minutes
 * ahead on the data the scan saw.
 *
 * Engineering choices, labelled: the default lead (15 minutes, the owner's own
 * figure), the choices a member may set, the longest lead read (60 minutes),
 * and the pace as a straight line from the extreme (Gann's angle is a straight
 * line; a reaction that speeds up or slows is re-read each scan).
 *
 * Mandate: 1. Gann's angles (above); the entry itself is his, at the market once
 * a closed bar trades into the plan's zone (never-failing rule 9), never a limit. 2. No
 * periodicity claim; Dewey's checklist does not apply. 3. Rhythm: the reading
 * is a countdown re-read every scan, not a one-shot call. Cause and Effect: the
 * reaction's pace is the cause, the time left its effect. Law of Creation:
 * price ⊗ time, read as one rate; neither alone says "in about 20 minutes".
 */

import type { Bar } from "@/lib/types";

/** Minutes before the entry a person is told by default (owner's figure). */
export const APPROACH_LEAD_DEFAULT_MINUTES = 15;
/** Leads a member may choose in Settings (engineering, labelled). */
export const APPROACH_LEAD_CHOICES = [5, 10, 15, 30, 60] as const;
/** The longest lead read; the scan reports nothing farther off than this plus a scan. */
export const APPROACH_LEAD_MAX_MINUTES = 60;
/** How often the scheduled intraday scan runs (pg_cron, 6/21/36/51 past the hour). */
export const SCAN_CADENCE_MINUTES = 15;

/** A member's lead, or the default when unset or not one of the choices. */
export function approachLeadMinutes(saved: unknown): number {
  const n = Number(saved);
  return (APPROACH_LEAD_CHOICES as readonly number[]).includes(n) ? n : APPROACH_LEAD_DEFAULT_MINUTES;
}

/** True when an approach this many minutes off is due to a person with this lead. */
export function approachDue(etaMinutes: number, leadMinutes: number): boolean {
  return Number.isFinite(etaMinutes) && etaMinutes <= leadMinutes + SCAN_CADENCE_MINUTES;
}

export interface ApproachReading {
  /** The top (bottom, short) the reaction is measured from, and when it printed. */
  extreme: number;
  extremeAt: string;
  /** Bars from that extreme to the latest close. */
  barsSince: number;
  /** Price covered toward the entry each bar, at the reaction's pace. */
  ratePerBar: number;
  /** The same rate in the session's price unit (null when the unit is unknown). */
  unitsPerBar: number | null;
  /** From the latest close to the entry. */
  distance: number;
  /** Minutes to the entry at that pace, counted from now (the feed's lateness taken off), never below 0. */
  etaMinutes: number;
  /** When, at that pace, price reaches the entry. */
  expectedAt: string;
}

/**
 * The reaction toward a buy entry below price (a short's entry above it), or
 * null when price is not moving toward it: already at or through it, or still
 * making the extreme on the latest bar.
 *
 * `bars` are the session's bars, oldest first; `pivotIndex` the latest
 * completed swing extreme on the plan's side (a top for a buy), from which the
 * reaction's own top is found.
 */
export function readEntryApproach(args: {
  bars: readonly Bar[];
  intervalMinutes: number;
  direction: "up" | "down";
  entry: number;
  /** The session's price unit (`SessionMetrics.point`); 0 when unknown. */
  unit: number;
  /** Index of the latest completed swing top (bottom, short), or -1. */
  pivotIndex: number;
  dataAgeSeconds: number;
  now: Date;
}): ApproachReading | null {
  const { bars, intervalMinutes, direction, entry, unit, dataAgeSeconds, now } = args;
  const n = bars.length;
  if (n < 2 || !(entry > 0) || !(intervalMinutes > 0) || !Number.isFinite(entry) || !Number.isFinite(intervalMinutes)) return null;
  const up = direction === "up";
  const last = bars[n - 1].c;
  const distance = up ? last - entry : entry - last;
  if (!(distance > 0)) return null;

  // The reaction's extreme: the highest high (lowest low) since the latest
  // completed swing extreme on that side, so a higher top made after it counts.
  let ext = Math.max(0, args.pivotIndex);
  for (let i = ext + 1; i < n; i++) {
    if (up ? bars[i].h >= bars[ext].h : bars[i].l <= bars[ext].l) ext = i;
  }
  const barsSince = n - 1 - ext;
  if (barsSince < 1) return null;
  const extreme = up ? bars[ext].h : bars[ext].l;
  // The pace is the straight line from the extreme bar's high (low) to the
  // latest close; one bar after the extreme, a long wick sets it, and the next
  // scan reads it again.
  const ratePerBar = (up ? extreme - last : last - extreme) / barsSince;
  if (!(ratePerBar > 0)) return null;

  const etaFromData = (distance / ratePerBar) * intervalMinutes;
  if (!Number.isFinite(etaFromData)) return null;
  const lateMinutes = Number.isFinite(dataAgeSeconds) ? Math.max(0, dataAgeSeconds) / 60 : 0;
  const etaMinutes = Math.max(0, etaFromData - lateMinutes);
  return {
    extreme,
    extremeAt: bars[ext].t,
    barsSince,
    ratePerBar,
    unitsPerBar: unit > 0 ? ratePerBar / unit : null,
    distance,
    etaMinutes,
    expectedAt: new Date(now.getTime() + etaMinutes * 60_000).toISOString(),
  };
}
