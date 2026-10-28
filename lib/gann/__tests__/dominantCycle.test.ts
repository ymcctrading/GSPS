import { describe, expect, it } from "vitest";
import { readDominantCycle, ALIGNMENT_MONTHS } from "@/lib/gann/dominantCycle";
import { marketMonth } from "@/lib/gann/massPressure";
import type { Bar } from "@/lib/types";

/** Daily bars whose New York monthly averages copy the record `back` years earlier, Sep 2025 to Sep 2026. */
function copyOfYearsBack(back: number): Bar[] {
  const out: Bar[] = [];
  for (let k = 0; k < 13; k += 1) {
    const n = 2025 * 12 + 8 + k; // September 2025 onward
    const y = Math.floor(n / 12);
    const m = (n % 12) + 1;
    const c = marketMonth("stocks", y - back, m)!;
    for (const d of [5, 12, 19]) {
      out.push({ t: new Date(Date.UTC(y, m - 1, d, 20)).toISOString(), o: c, h: c, l: c, c, v: 1 });
    }
  }
  return out;
}

const asOf = new Date("2026-10-15T16:00:00Z");

describe("the dominant cycle (the decade back the market follows)", () => {
  it("picks the decade whose months the market has followed, and reads its move this month", () => {
    const r = readDominantCycle(asOf, copyOfYearsBack(40));
    expect(r).not.toBeNull();
    expect(r!.yearsBack).toContain(40);
    expect(r!.agreed).toBe(ALIGNMENT_MONTHS);
    const before = marketMonth("stocks", 1986, 9)!;
    const after = marketMonth("stocks", 1986, 11)!;
    expect(r!.direction).toBe(after > before ? "bullish" : "bearish");
  });

  it("reads only the months before the month read", () => {
    // Bars inside October 2026 change nothing.
    const bars = copyOfYearsBack(40);
    const extra = [{ t: "2026-10-05T20:00:00.000Z", o: 1, h: 1, l: 1, c: 1, v: 1 }];
    expect(readDominantCycle(asOf, [...bars, ...extra])).toEqual(readDominantCycle(asOf, bars));
  });

  it("reads nothing without enough months, or without the market", () => {
    expect(readDominantCycle(asOf, copyOfYearsBack(40).slice(-12))).toBeNull();
    expect(readDominantCycle(asOf, null)).toBeNull();
  });

  it("reads nothing when no decade agrees on two thirds of the months", () => {
    // A flat market moves neither way, so no month agrees with any decade.
    const flat = copyOfYearsBack(40).map((b) => ({ ...b, o: 100, h: 100, l: 100, c: 100 }));
    expect(readDominantCycle(asOf, flat)).toBeNull();
  });
});
