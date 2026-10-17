/**
 * A-TIME-20, the part Gann discloses: the ranges of January 2-7 and January
 * 15-21 set the year's trend, and July 3-7 and July 20-27 are read the same
 * way for the second half (Master Course Ch.7 PDF 221-223, November 1935;
 * confirmed in the W023 reading notes, 2026-10-16). Context only: nothing
 * here moves a score, gate, plan or order.
 *
 * What he does not disclose, and so is not built: the "two bull and two bear
 * campaigns in a year" structure the rule's secondary statement (W036) adds.
 *
 * Engineering choice, labelled as such: a window is read only once it has
 * closed, and the year's trend is where the latest close sits against the
 * latest closed window, above its high (up), below its low (down) or inside.
 * Gann says the ranges set the trend, not how a close is tested against them.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: the yearly calendar is a recurrence claim; Dewey's checklist is
 *    not cleared, so it stays context and is measured.
 * 3. Hermetic: Rhythm (the year's opening swing sets its tide) and
 *    Correspondence (the first days stand for the year, as above, so below).
 */
import type { Bar } from "@/lib/types";

export interface YearRange {
  window: "Jan 2-7" | "Jan 15-21" | "Jul 3-7" | "Jul 20-27";
  high: number;
  low: number;
  position: "above" | "below" | "inside";
}

export interface YearRangesReading {
  year: number;
  ranges: YearRange[];
  /** From the latest closed window. */
  yearTrend: "up" | "down" | "inside";
}

const WINDOWS: { window: YearRange["window"]; from: string; to: string }[] = [
  { window: "Jan 2-7", from: "01-02", to: "01-07" },
  { window: "Jan 15-21", from: "01-15", to: "01-21" },
  { window: "Jul 3-7", from: "07-03", to: "07-07" },
  { window: "Jul 20-27", from: "07-20", to: "07-27" },
];

export function readYearRanges(daily: Bar[], asOf: Date): YearRangesReading | null {
  if (daily.length === 0) return null;
  const key = asOf.toISOString().slice(0, 10);
  const year = Number(key.slice(0, 4));
  const today = key.slice(5);
  const close = daily[daily.length - 1].c;
  const ranges: YearRange[] = [];
  for (const w of WINDOWS) {
    if (today <= w.to) continue;
    const inWindow = daily.filter((b) => {
      const d = b.t.slice(0, 10);
      return d.startsWith(`${year}-`) && d.slice(5) >= w.from && d.slice(5) <= w.to;
    });
    if (inWindow.length === 0) continue;
    const high = Math.max(...inWindow.map((b) => b.h));
    const low = Math.min(...inWindow.map((b) => b.l));
    ranges.push({ window: w.window, high, low, position: close > high ? "above" : close < low ? "below" : "inside" });
  }
  if (ranges.length === 0) return null;
  const latest = ranges[ranges.length - 1].position;
  return { year, ranges, yearTrend: latest === "above" ? "up" : latest === "below" ? "down" : "inside" };
}

export function describeYearRanges(r: YearRangesReading): string[] {
  const w = r.ranges[r.ranges.length - 1];
  const half = w.window.startsWith("Jan") ? "January" : "July";
  if (r.yearTrend === "inside") return [`Price is inside the ${half} ${w.window.slice(4)} range, which sets the year's trend: no trend set yet.`];
  return [`Price is ${w.position} the ${half} ${w.window.slice(4)} range, which sets the year's trend: the year reads ${r.yearTrend}.`];
}
