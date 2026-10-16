/**
 * Class A time counts, as context only (2026-10-16, the re-check of the held
 * time rules against Gann's own books). Class A means Gann's own text states
 * the rule. Each reading here is a count his books give that GSPS did not yet
 * read, or read under a class C label. None of them gates a verdict, enters a
 * scored criterion, or joins the lists the live readings use (`WHEEL_COUNTS`,
 * `DAY_COUNT_BANDS` and `MAJOR_CYCLE_YEARS` feed `timeCycles()`, which the
 * coarse cycle bonus and the time-window hold read), so adding a count here
 * cannot move a verdict. Each is recorded on every replayed trade as a
 * context factor (`contextFactors.ts`) and shown in the explanation trace,
 * live and in the replay alike (both read it through `readDisclosedRules`).
 * Promotion past context needs a replay and an owner decision.
 *
 * Sources, per reading (page as the reading notes give it):
 * - Cycles by lesson: see `timeCycles.ts`'s `CYCLE_YEARS_1955` and
 *   `MINOR_CYCLE_YEARS_1931` (M-T3, C-TIME-20, C-TIME-26).
 * - The Ch.5 wheel counts (C-TIME-06): Master Course Ch.5 PDF 162, "monthly
 *   changes at 30, 60, 120, 150, 210, 240, 300, 330 and 360 days or degrees".
 *   120, 240 and 360 are in `WHEEL_COUNTS` already; the other six are read
 *   here (150 left the class C finer divisions for this list).
 * - Time balance from top to top and bottom to bottom (M-T11): *How to Make
 *   Profits Trading in Commodities* p.311, "always figure the time from any
 *   top ... to the next top, and from any low ... to the next low. This is
 *   BALANCING OF TIME"; p.312, carry the periods forward. Moved here from
 *   the class C counts (`secondaryTime.ts`, where W032 also gives it).
 *
 * Engineering choices, labelled as such: the anchors and windows follow the
 * class A reader each list sits beside (major daily pivots and ±2 days for the
 * wheel, as `timeCycles()`); the time balance keeps its weekly swing chart and
 * one-week tolerance unchanged from its class C build.
 *
 * Three-question basis:
 * 1. Gann: as cited per reading, class A.
 * 2. Cycles: each is a recurrence claim, and none has cleared Dewey's
 *    checklist (repetition against a base rate, dominance and regularity are
 *    untested). The replay's factor table is that base-rate test.
 * 3. Hermetic: Correspondence. The same divisions of time are read in days,
 *    weeks, months and years, from the market's own tops and bottoms.
 */

import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { lessonCycleHits, type LessonCycleHit } from "@/lib/gann/timeCycles";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import type { PivotCountHit } from "@/lib/gann/secondaryTime";

const DAY_MS = 86_400_000;

/** C-TIME-06: the Ch.5 day counts `WHEEL_COUNTS` does not carry (Master Course Ch.5 PDF 162). */
export const WHEEL_COUNTS_CH5: readonly number[] = [30, 60, 150, 210, 300, 330];

/** The window either side of a projected count, in days (as `timeCycles()`). */
const WINDOW_DAYS = 2;

export interface TimeBalanceSpan {
  kind: "top" | "bottom";
  priorWeeks: number;
  openWeeks: number;
  /** The last session traded past the prior swing extreme and closed back inside it (C-STOP-03, class C). */
  falseBreak: boolean;
}

export interface TimeCountsReading {
  /** The 1955 and 1931 lessons' cycles the 1935 list lacks, due this month. Null without monthly bars. */
  lessonCycles: LessonCycleHit[] | null;
  /** The Ch.5 wheel counts due within two days, from major daily pivots. */
  wheelCountsCh5: PivotCountHit[];
  /** Top-to-top and bottom-to-bottom balances due now (Commodities p.311). */
  timeBalanceSpans: TimeBalanceSpan[];
}

function hit(p: { bar: Bar; kind: "high" | "low" }, count: number, label: string): PivotCountHit {
  return { pivotDate: p.bar.t.slice(0, 10), pivotKind: p.kind, count, label };
}

/** Counts in days projected from `timeCycles()`' anchors, active within ±2 days of `asOf`. */
function projectedDayHits(bars: Bar[], asOf: Date, counts: readonly number[], unitDays: number, unit: string): PivotCountHit[] {
  if (bars.length < 30) return [];
  const out: PivotCountHit[] = [];
  for (const p of majorPivots(findPivots(bars, 5)).slice(-12)) {
    for (const c of counts) {
      const at = Date.parse(p.bar.t) + c * unitDays * DAY_MS;
      if (Math.abs(at - asOf.getTime()) <= WINDOW_DAYS * DAY_MS) out.push(hit(p, c, `${c} ${unit}`));
    }
  }
  return out;
}

/** The Ch.5 wheel counts (C-TIME-06) from major daily pivots. */
export function readWheelCountsCh5(bars: Bar[], asOf: Date): PivotCountHit[] {
  return projectedDayHits(bars, asOf, WHEEL_COUNTS_CH5, 1, "days");
}

/** M-T11: the tolerance, in weeks, for two spans to balance (an engineering choice). */
export const TIME_BALANCE_TOLERANCE_WEEKS = 1;

/**
 * Top-to-top and bottom-to-bottom balances on the weekly swing chart (M-T11,
 * Commodities p.311): the open span since the last top (or bottom) within a
 * week of the last completed top-to-top (or bottom-to-bottom) span points to
 * the next top (or bottom). The matching-leg balance (high to low, low to
 * high) is the campaign ledger's `timeBalanceDates`.
 */
export function readTimeBalanceSpans(bars: Bar[]): TimeBalanceSpan[] {
  if (bars.length === 0) return [];
  const pivots = walkSwingChart(bars, WEEKLY_SWING_CHART).pivots;
  const lastPivot = pivots[pivots.length - 1];
  if (!lastPivot) return [];
  const weeks = (a: number, b: number) => (Date.parse(bars[b].t) - Date.parse(bars[a].t)) / (7 * DAY_MS);
  const out: TimeBalanceSpan[] = [];
  for (const kind of ["top", "bottom"] as const) {
    // A top is next only while the swing runs up from a bottom, and the mirror.
    if (lastPivot.kind === kind) continue;
    const same = pivots.filter((p) => p.kind === kind);
    if (same.length < 2) continue;
    const priorWeeks = weeks(same[same.length - 2].index, same[same.length - 1].index);
    const openWeeks = weeks(same[same.length - 1].index, bars.length - 1);
    if (Math.abs(openWeeks - priorWeeks) <= TIME_BALANCE_TOLERANCE_WEEKS) {
      out.push({ kind, priorWeeks: Math.round(priorWeeks * 10) / 10, openWeeks: Math.round(openWeeks * 10) / 10, falseBreak: falseBreakAt(bars, same[same.length - 1].price, kind) });
    }
  }
  return out;
}

/**
 * C-STOP-03 (W032 pp.5-6, class C): time alone is not enough; a false break
 * confirms it. For a bottom due, the last session traded under the prior
 * swing bottom (`line`, the bottom the bottom-to-bottom span is counted from)
 * and closed back over it; the mirror for a top. Context only.
 */
export function falseBreakAt(bars: Bar[], line: number, kind: "top" | "bottom"): boolean {
  const last = bars[bars.length - 1];
  if (!last) return false;
  return kind === "bottom" ? last.l < line && last.c > line : last.h > line && last.c < line;
}

export function readTimeCounts(daily: Bar[], monthly: Bar[] | null | undefined, asOf: Date): TimeCountsReading {
  return {
    lessonCycles: monthly ? lessonCycleHits(monthly, asOf) : null,
    wheelCountsCh5: readWheelCountsCh5(daily, asOf),
    timeBalanceSpans: readTimeBalanceSpans(daily),
  };
}

const CONTEXT = "Shown for context; it does not change the setup.";

/** Plain-language lines for the explanation trace. */
export function describeTimeCounts(r: TimeCountsReading): string[] {
  const lines: string[] = [];
  const lc = r.lessonCycles?.[0];
  if (lc) {
    lines.push(`${lc.years} years from the ${lc.kind === "low" ? "bottom" : "top"} of ${lc.pivotMonth}: a cycle in the ${lc.lesson} lesson's list. ${CONTEXT}`);
  }
  const w = r.wheelCountsCh5[0];
  if (w) lines.push(`${w.label} from the ${w.pivotKind} of ${w.pivotDate}: a count of the circle in days. ${CONTEXT}`);
  for (const b of r.timeBalanceSpans) {
    lines.push(`${b.openWeeks} weeks since the last ${b.kind}, against ${b.priorWeeks} weeks from ${b.kind} to ${b.kind} before it: time balances, so a ${b.kind} may be due${b.falseBreak ? `, and the last session made a false break past the prior ${b.kind}, which confirms it` : ""}. ${CONTEXT}`);
  }
  return lines;
}
