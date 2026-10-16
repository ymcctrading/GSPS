/**
 * The day as a circle, on Gann's own clock (built 2026-09-30; owner: "I always
 * defer to Gann's method, that is how you account for [the clock]").
 *
 * Sources (Tier A):
 * - Gann's Square of Nine plate (Collected Writings Vol. 3 p. 34; transcribed
 *   in the Cycles Research Institute workbook, source note B12) labels the
 *   wheel with the time of day as well as the date: 0° at 6:00 AM, 90° at noon,
 *   180° at 6:00 PM, 270° at midnight, 22.5° every hour and a half. That is 15°
 *   an hour. On the plate 292.5° is 1:30 AM and 315° is 3:00 AM (the workbook
 *   misprints both as PM).
 * - *Tunnel Thru the Air* (1927): one degree is four minutes of the earth's
 *   rotation, which is the same 15° an hour.
 * - Master Course Ch. 14 (1955): the day's quarters are sunrise, noon, sunset
 *   and midnight, with noon (90°) and midnight most important.
 *
 * Deferring to Gann's method means the clock is used exactly as drawn: 0° is
 * 6:00 AM, not the market's open, and the clock is New York time, where the
 * exchange Gann drew it for sits. A US equity session (9:30 AM to 4:00 PM ET)
 * spans 52.5° to 150° of it: 60° at 10:00, 90° at noon, 120° at 2:00 PM, 135°
 * at 3:00 PM and 150° at the close.
 *
 * Two readings, both Gann's rules on this clock:
 * - **On a major degree.** A bar that contains a major degree of the circle
 *   (the multiples of 30° and 45°, `circleOf360.ts#MAJOR_DEGREES`), or an
 *   instant within 1¼° (5 minutes) of one.
 * - **Price on the degree of its time angle** (GA-32's rule, on the day's
 *   circle). Price read in Gann points, one to a degree, sits within 1¼° of
 *   the clock's degree.
 *
 * Engineering choices, labelled as such: New York time for every market (the
 * clock is Gann's, drawn for the exchange he traded, and GSPS scans US
 * markets); the 1¼° tolerance of the circle reading.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: the day is the one cycle whose period and phase nobody disputes
 *    (Dewey's regularity and constancy hold by construction). Whether turns
 *    favour its major degrees is the recurrence claim, untested; the replay
 *    measures it.
 * 3. Hermetic: Correspondence, the same wheel for the year, the day and
 *    price (the plate draws all three at once); Rhythm, the day returning.
 */

import { etParts } from "@/lib/market/session";
import { CIRCLE_TOLERANCE, MAJOR_DEGREES } from "@/lib/gann/circleOf360";

/** 6:00 AM, the plate's 0°. */
export const DAY_ORIGIN_MINUTES = 6 * 60;
/** 15° an hour: one degree every four minutes. */
export const MINUTES_PER_DEGREE = 4;

/** The degree of the day circle at this instant, 0 up to 360. */
export function dayDegree(date: Date): number {
  const { minutes } = etParts(date);
  const sec = date.getUTCSeconds() / 60;
  const d = (minutes + sec - DAY_ORIGIN_MINUTES) / MINUTES_PER_DEGREE;
  return ((d % 360) + 360) % 360;
}

/** The clock time (ET, "h:mm AM/PM") of a degree of the day circle. */
export function timeOfDegree(degree: number): string {
  const total = (DAY_ORIGIN_MINUTES + degree * MINUTES_PER_DEGREE) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = Math.round(total % 60);
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export interface DayCircleReading {
  /** Degree at the start of the bar (or the instant). */
  degree: number;
  /** The major degree inside the bar, or within 1¼° of the instant, if any. */
  majorDegree: number | null;
  /** Price read in Gann points, as a degree of the circle. */
  priceDegree: number | null;
  /** Price within 1¼° of the clock's degree over the bar. */
  priceOnTimeAngle: boolean;
  /** The next major degree after the bar, and its clock time (ET). */
  nextMajor: { degree: number; time: string };
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/**
 * The day circle for a bar starting at `start` and lasting `barMinutes` (0 for
 * an instant). `price` and `unit` (the Gann point) give the price's degree.
 */
export function readDayCircle(start: Date, barMinutes: number, price?: number, unit?: number): DayCircleReading {
  const degree = dayDegree(start);
  const span = Math.max(0, barMinutes) / MINUTES_PER_DEGREE;
  let majorDegree: number | null = null;
  for (const m of MAJOR_DEGREES) {
    const ahead = (((m - degree) % 360) + 360) % 360; // degrees from the bar's start to m
    const inBar = span > 0 && ahead < span;
    const nearInstant = circularDistance(degree, m) <= CIRCLE_TOLERANCE;
    if (inBar || nearInstant) {
      majorDegree = m % 360;
      break;
    }
  }
  let priceDegree: number | null = null;
  let priceOnTimeAngle = false;
  if (price !== undefined && unit !== undefined && price > 0 && unit > 0) {
    priceDegree = (price / unit) % 360;
    const ahead = (((priceDegree - degree) % 360) + 360) % 360;
    priceOnTimeAngle = ahead <= span + CIRCLE_TOLERANCE || circularDistance(priceDegree, degree) <= CIRCLE_TOLERANCE;
  }
  const end = degree + span;
  let next = MAJOR_DEGREES.find((m) => m > end + 1e-9 && m < 360) ?? 360;
  if (next === 360) next = 0;
  return { degree, majorDegree, priceDegree, priceOnTimeAngle, nextMajor: { degree: next, time: timeOfDegree(next) } };
}

export function describeDayCircle(r: DayCircleReading): string {
  const on = r.majorDegree !== null ? `, on the ${r.majorDegree}° point of the day (${timeOfDegree(r.majorDegree)} ET)` : "";
  const price = r.priceOnTimeAngle ? "; price is on the degree of its time angle" : "";
  return `Day circle: ${r.degree.toFixed(1)}° (${timeOfDegree(r.degree)} ET, 0° = 6:00 AM, 15° an hour)${on}${price}.`;
}
