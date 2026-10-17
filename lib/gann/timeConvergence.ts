/**
 * Gann's finer timing rules (parity roadmap Stage F1, gaps G9, G11, G12).
 *
 * - **G9, 7/14-day alternation.** His annual forecasts mark turn dates about
 *   every week, with the more important ones about every 14 days (A2.2,
 *   1919-1922), and the Master Course ranks 14 days first and 21 next
 *   (A2.1 Ch. 14). Read here as: is today 7, 14 or 21 days (±1) from the last
 *   completed 3-Day Chart pivot?
 * - **G11, Square of 144 convergence.** Time runs in twelfths of 144: a turn
 *   is likelier when days, weeks and months counted from a major top or
 *   bottom land on a multiple of 12 together (A2.1 Ch. 13; "changes often on
 *   even 12-month periods"). Read as how many of the three units are on the
 *   square at once.
 * - **G12, projection dispersion.** Gann counts from every pivot; Tomes'
 *   method (C02) asks how tightly those counts agree. Each earlier swing
 *   cycle (pivot to the next pivot of the same kind) is projected forward
 *   from the latest pivot of that kind; the spread of the projected dates is
 *   a confidence annotation. Tight means the market's rhythm has been
 *   regular; wide means it hasn't.
 *
 * - **A-TIME-16, change dates alternate** (W036 pp. 7, 22, *Annual Forecasts
 *   1919-1922*, class A). The forecasts' dates to watch alternate high and
 *   low about weekly, and "if low prices are made on the date indicated, you
 *   may expect high prices at the next date"; a date marks "some kind of a
 *   rally or decline", not always the extreme. GSPS has no forecast date
 *   list, so the 7/14/21-day marks above stand in for it: from a bottom they
 *   are labelled high, low, high (from a top, low, high, low), and a date
 *   that came in the opposite way flips the labels after it. The next date's
 *   label is shown. Engineering choices: a date "came in" high (low) when the
 *   bar on it (±1 day) has the highest high (lowest low) of the five
 *   sessions around it, read only once two sessions have followed it.
 *
 * All context and measured factors only. These are periodicity claims, and
 * none has cleared Dewey's checklist (C05/C06): the replay's factor table is
 * the base-rate test (M4/M6) they have to pass first.
 *
 * Engineering choices, labelled as such: tolerances (±1 day, ±½ week or
 * month), the major pivot as the year's extreme, and projecting from the last
 * `PROJECTION_CYCLES` cycles.
 *
 * Three-question basis:
 * 1. Gann: as cited above (A2.1 Tier A; A2.2 his own dated forecasts).
 * 2. Cycles: Dewey items addressed only by measurement: regularity of timing
 *    is what the dispersion reports; the rest are not cleared.
 * 3. Hermetic: Rhythm (turns recur at measured intervals) and Vibration
 *    (several independent counts landing together, the convergence).
 */

import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

const DAY_MS = 86_400_000;
export const ALTERNATION_DAYS = [7, 14, 21] as const;
export const PROJECTION_CYCLES = 5;

export interface TimingReading {
  /** Days from the last completed 3-Day Chart pivot, and which of 7/14/21 it sits on (±1), if any. */
  alternation: { daysSincePivot: number; mark: 7 | 14 | 21 | null } | null;
  /** Units (days, weeks, months) from the year's extreme that sit on a multiple of 12. */
  square144: { pivotDate: string; units: ("days" | "weeks" | "months")[] } | null;
  /** Projected next pivot date (median) and the spread of the projections in days. */
  projection: { kind: "top" | "bottom"; medianDate: string; spreadDays: number; count: number } | null;
  /** The 7/14/21-day dates from the last pivot, labelled high or low (A-TIME-16). */
  changeDates: ChangeDates | null;
}

export interface ChangeDate {
  date: string;
  days: (typeof ALTERNATION_DAYS)[number];
  /** What the date is labelled to bring, after any earlier date that came in the other way. */
  expect: "high" | "low";
  /** What it brought, once settled; null when it marked neither, or has not come. */
  came: "high" | "low" | null;
}

export interface ChangeDates {
  dates: ChangeDate[];
  /** The first date after the last bar, if any is left. */
  next: ChangeDate | null;
}

/** Sessions either side a date's bar is compared with. */
const SETTLE_SESSIONS = 2;

/** The 7/14/21-day dates from a pivot, labelled alternately and flipped where one came in the other way. */
export function labelChangeDates(bars: Bar[], pivotIndex: number, pivotKind: "top" | "bottom"): ChangeDates {
  const from = Date.parse(bars[pivotIndex].t);
  const lastDay = Math.floor(Date.parse(bars[bars.length - 1].t) / DAY_MS);
  let expect: "high" | "low" = pivotKind === "bottom" ? "high" : "low";
  const dates: ChangeDate[] = [];
  for (const d of ALTERNATION_DAYS) {
    const at = from + d * DAY_MS;
    let came: ChangeDate["came"] = null;
    let k = -1;
    for (let i = pivotIndex + 1; i < bars.length; i++) {
      const off = Math.abs(Date.parse(bars[i].t) - at) / DAY_MS;
      if (off <= 1 && (k < 0 || off < Math.abs(Date.parse(bars[k].t) - at) / DAY_MS)) k = i;
    }
    if (k >= 0 && k + SETTLE_SESSIONS < bars.length && k - SETTLE_SESSIONS >= 0) {
      const around = bars.slice(k - SETTLE_SESSIONS, k + SETTLE_SESSIONS + 1);
      if (around.every((b) => b === bars[k] || b.h < bars[k].h)) came = "high";
      else if (around.every((b) => b === bars[k] || b.l > bars[k].l)) came = "low";
    }
    dates.push({ date: new Date(at).toISOString().slice(0, 10), days: d, expect, came });
    // Polarity: a low on a high date means a high at the next date, and the reverse.
    const flipped = came !== null && came !== expect;
    if (!flipped) expect = expect === "high" ? "low" : "high";
  }
  const next = dates.find((c) => Math.floor(Date.parse(`${c.date}T00:00:00Z`) / DAY_MS) > lastDay) ?? null;
  return { dates, next };
}

const days = (a: Bar, b: Bar) => Math.round((Date.parse(b.t) - Date.parse(a.t)) / DAY_MS);

function nearMultiple(x: number, of: number, tol: number): boolean {
  if (x < of - tol) return false;
  const r = x % of;
  return Math.min(r, of - r) <= tol;
}

export function readTiming(bars: Bar[]): TimingReading {
  const out: TimingReading = { alternation: null, square144: null, projection: null, changeDates: null };
  if (bars.length < 10) return out;
  const last = bars[bars.length - 1];
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;

  const lastPivot = pivots[pivots.length - 1];
  if (lastPivot) {
    const d = days(bars[lastPivot.index], last);
    const mark = ALTERNATION_DAYS.find((m) => Math.abs(d - m) <= 1) ?? null;
    out.alternation = { daysSincePivot: d, mark };
    out.changeDates = labelChangeDates(bars, lastPivot.index, lastPivot.kind);
  }

  // The year's extreme: whichever of the 365-day high and low is more recent.
  const cutoff = Date.parse(last.t) - 365 * DAY_MS;
  let hi = -1;
  let lo = -1;
  for (let i = 0; i < bars.length; i++) {
    if (Date.parse(bars[i].t) < cutoff) continue;
    if (hi < 0 || bars[i].h >= bars[hi].h) hi = i;
    if (lo < 0 || bars[i].l <= bars[lo].l) lo = i;
  }
  const major = Math.max(hi, lo);
  if (major >= 0 && major < bars.length - 1) {
    const d = days(bars[major], last);
    const units: ("days" | "weeks" | "months")[] = [];
    if (nearMultiple(d, 12, 1)) units.push("days");
    if (nearMultiple(d / 7, 12, 0.5)) units.push("weeks");
    if (nearMultiple(d / 30.4375, 12, 0.5)) units.push("months");
    out.square144 = { pivotDate: bars[major].t.slice(0, 10), units };
  }

  // Projection dispersion for the next pivot of the kind opposite to the last one.
  const nextKind: "top" | "bottom" = lastPivot?.kind === "top" ? "bottom" : "top";
  const same = pivots.filter((p) => p.kind === nextKind);
  if (same.length >= 3) {
    const cycles: number[] = [];
    for (let k = Math.max(1, same.length - PROJECTION_CYCLES); k < same.length; k++) {
      cycles.push(days(bars[same[k - 1].index], bars[same[k].index]));
    }
    const base = Date.parse(bars[same[same.length - 1].index].t);
    const projected = cycles.map((c) => base + c * DAY_MS).sort((a, b) => a - b);
    const median = projected[Math.floor(projected.length / 2)];
    out.projection = {
      kind: nextKind,
      medianDate: new Date(median).toISOString().slice(0, 10),
      spreadDays: Math.round((projected[projected.length - 1] - projected[0]) / DAY_MS),
      count: projected.length,
    };
  }
  return out;
}
