import { describe, expect, it } from "vitest";
import { pillarYearCycleConvergence, yearCycleConvergence } from "@/lib/gann/timeCycles";
import type { Bar } from "@/lib/types";

/** Monthly bars from January 1980 with one major high in `highMonth` (index) on a quiet base. */
function withHighAt(highMonth: number, months = 600): Bar[] {
  return Array.from({ length: months }, (_, i) => {
    const wobble = (i % 2 === 0 ? 0.3 : -0.3) + (i % 5) * 0.05;
    const c = 50 + wobble + (i === highMonth ? 30 : 0);
    const t = new Date(Date.UTC(1980 + Math.floor(i / 12), i % 12, 1)).toISOString();
    return { t, o: c, h: c + 0.5 + (i % 3) * 0.01, l: c - 0.5 - (i % 4) * 0.01, c, v: 1 };
  });
}

describe("P1's yearly counts add the 9-, 14- and 40-year cycles (2026-10-28)", () => {
  for (const years of [9, 14, 40]) {
    it(`counts a major high exactly ${years} years back against a long`, () => {
      const bars = withHighAt(12); // January 1981
      const asOf = new Date(Date.UTC(1981 + years, 0, 15));
      const closed = bars.filter((b) => b.t < asOf.toISOString().slice(0, 7));
      expect(yearCycleConvergence(closed, asOf).bearishHits).toBe(0);
      expect(pillarYearCycleConvergence(closed, asOf).bearishHits).toBeGreaterThanOrEqual(1);
    });
  }

  it("does not count a 13-year cycle, which the 1955 list does not hold", () => {
    const bars = withHighAt(12);
    const asOf = new Date(Date.UTC(1994, 0, 15));
    const closed = bars.filter((b) => b.t < "1994-01");
    expect(pillarYearCycleConvergence(closed, asOf).bearishHits).toBe(0);
  });
});
