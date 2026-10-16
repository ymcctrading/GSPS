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
import { lessonCycleHits, type LessonCycleHit } from "@/lib/gann/timeCycles";

export interface TimeCountsReading {
  /** The 1955 and 1931 lessons' cycles the 1935 list lacks, due this month. Null without monthly bars. */
  lessonCycles: LessonCycleHit[] | null;
}

export function readTimeCounts(daily: Bar[], monthly: Bar[] | null | undefined, asOf: Date): TimeCountsReading {
  void daily;
  return {
    lessonCycles: monthly ? lessonCycleHits(monthly, asOf) : null,
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
  return lines;
}
