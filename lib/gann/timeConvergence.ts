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
}

const days = (a: Bar, b: Bar) => Math.round((Date.parse(b.t) - Date.parse(a.t)) / DAY_MS);

function nearMultiple(x: number, of: number, tol: number): boolean {
  if (x < of - tol) return false;
  const r = x % of;
  return Math.min(r, of - r) <= tol;
}

export function readTiming(bars: Bar[]): TimingReading {
  const out: TimingReading = { alternation: null, square144: null, projection: null };
  if (bars.length < 10) return out;
  const last = bars[bars.length - 1];
  const pivots = walkSwingChart(bars, THREE_DAY_CHART).pivots;

  const lastPivot = pivots[pivots.length - 1];
  if (lastPivot) {
    const d = days(bars[lastPivot.index], last);
    const mark = ALTERNATION_DAYS.find((m) => Math.abs(d - m) <= 1) ?? null;
    out.alternation = { daysSincePivot: d, mark };
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
