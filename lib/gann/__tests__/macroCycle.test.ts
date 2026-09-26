import { describe, expect, it } from "vitest";
import { computeMacroCycle, MACRO_CYCLE_ANCHORS } from "../macroCycle";
import { monthsElapsed } from "../angleMonthCounts";

const utc = (y: number, m: number) => new Date(Date.UTC(y, m, 1));

describe("MACRO_CYCLE_ANCHORS", () => {
  const byLabel = (label: string) => MACRO_CYCLE_ANCHORS.find((a) => a.label === label)!;
  const asDate = (label: string) => utc(byLabel(label).year, byLabel(label).month);

  it("reproduces A2.1 Ch. 7's own elapsed counts between the cited turns", () => {
    expect(monthsElapsed(asDate("August 1896 bottom"), asDate("November 1907 low"))).toBe(135);
    expect(monthsElapsed(asDate("April 1897 low"), asDate("November 1907 low"))).toBe(127);
    expect(monthsElapsed(asDate("September 1909 top"), asDate("September 1929 top"))).toBe(240);
  });
});

describe("computeMacroCycle", () => {
  it("keeps projecting past 1989 — cycles recur rather than firing once", () => {
    const result = computeMacroCycle(new Date("2026-09-26T00:00:00Z"));
    expect(result.upcomingMajor.length).toBe(5);
    expect(result.upcomingMajor[0].month > "2026-09").toBe(true);
  });

  it("reads September 2026 as a minor-only bearish window", () => {
    // 1909 top + 117y (divisible by 3, not by any major length); 1929 top + 97y.
    const result = computeMacroCycle(new Date("2026-09-26T00:00:00Z"));
    expect(result.active).toBe(true);
    expect(result.majorActive).toBe(false);
    expect(result.bearishActive).toBe(true);
    expect(result.bullishActive).toBe(false);
  });

  it("lists the next major windows in order from September 2026", () => {
    const months = computeMacroCycle(new Date("2026-09-26T00:00:00Z")).upcomingMajor.map(
      (w) => `${w.month} ${w.anchor} ${w.majorCycleYears.join("/")}`,
    );
    expect(months).toEqual([
      "2026-11 November 1907 low 7",
      "2027-04 April 1897 low 5/10",
      "2027-09 September 1929 top 7",
      "2027-11 November 1907 low 5/10/15/20/30/60",
      "2028-09 September 1909 top 7",
    ]);
  });

  it("finds the September 2029 convergence of both cited tops", () => {
    // 1909 top + 120y = two 60-year Great Cycles; 1929 top + 100y.
    const result = computeMacroCycle(new Date("2029-09-15T00:00:00Z"));
    expect(result.majorActive).toBe(true);
    expect(result.bearishActive).toBe(true);
    expect(result.activeWindows).toEqual([
      expect.objectContaining({ anchor: "September 1909 top", yearsElapsed: 120, majorCycleYears: [5, 10, 15, 20, 30, 60] }),
      expect.objectContaining({ anchor: "September 1929 top", yearsElapsed: 100, majorCycleYears: [5, 10, 20, 50] }),
    ]);
  });

  it("is month-granular: any day of the anniversary month is in the window, the next month is not", () => {
    expect(computeMacroCycle(new Date("2027-11-30T23:00:00Z")).majorActive).toBe(true);
    expect(computeMacroCycle(new Date("2027-12-01T00:00:00Z")).active).toBe(false);
  });

  it("never activates an anchor before it happened", () => {
    expect(computeMacroCycle(new Date("1896-08-15T00:00:00Z")).active).toBe(false);
  });
});
