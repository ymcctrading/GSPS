import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeCampaignLeg, computeSwingChart, swingChartDirection } from "../swingChart";

function bars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, o: c, h: c, l: c, c, v: 1000 }));
}

describe("swingChartDirection", () => {
  it("returns null with fewer than days + 2 bars", () => {
    expect(swingChartDirection(bars([1, 2, 3, 4]), 3)).toBeNull();
  });

  it("picks up the initial direction from the first non-flat close", () => {
    expect(swingChartDirection(bars([10, 11, 12, 13, 14]), 3)).toBe("bullish");
    expect(swingChartDirection(bars([10, 9, 8, 7, 6]), 3)).toBe("bearish");
  });

  it("ignores an opposing run shorter than the reversal count", () => {
    // Up, up, then only 2 down days (< 3) before resuming up — never flips.
    expect(swingChartDirection(bars([10, 11, 12, 11, 10, 13, 14]), 3)).toBe("bullish");
  });

  it("flips once the opposing run reaches the reversal count", () => {
    // Up, up, then 3 consecutive down days — flips to bearish.
    expect(swingChartDirection(bars([10, 11, 12, 11, 10, 9]), 3)).toBe("bearish");
  });

  it("resets the opposing run on any day that agrees with the swing", () => {
    // Two down days, one up day (resets), two more down days — never reaches 3 in a row.
    expect(swingChartDirection(bars([10, 11, 10, 9, 10, 9, 8]), 3)).toBe("bullish");
  });

  it("does not let a flat close break up an opposing run", () => {
    // Up, then down, flat, down, down — the flat close doesn't reset the 3-day-down count.
    expect(swingChartDirection(bars([10, 11, 10, 9, 9, 8]), 3)).toBe("bearish");
  });

  it("requires a longer opposing run for the 9-day chart than the 3-day chart", () => {
    // 8 up days to 18, then 8 down days back to 10 — the 3-day chart flips on
    // the 3rd down day; the 9-day chart never sees 9 consecutive down days.
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    expect(swingChartDirection(bars(closes), 3)).toBe("bearish");
    expect(swingChartDirection(bars(closes), 9)).toBe("bullish");
  });
});

describe("computeSwingChart", () => {
  it("reports both the 3-day and 9-day readings", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    expect(computeSwingChart(bars(closes))).toEqual({ threeDay: "bearish", nineDay: "bullish" });
  });

  it("returns null legs when there isn't enough history for either window", () => {
    expect(computeSwingChart(bars([10, 11, 12]))).toEqual({ threeDay: null, nineDay: null });
  });
});

describe("computeCampaignLeg", () => {
  it("returns null when there isn't enough history for the 9-day chart", () => {
    expect(computeCampaignLeg(bars([10, 11, 12]))).toEqual({ legNumber: null, confidence: null });
  });

  it("reads a monotonic run with no 3-day reversal as leg 1 (low confidence)", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    expect(computeCampaignLeg(bars(closes))).toEqual({ legNumber: 1, confidence: "low" });
  });

  it("counts two 3-day flips (never enough for a 9-day major change) as leg 3 (high confidence)", () => {
    const closes = [10, 11, 12, 11, 10, 9, 12, 13, 14, 15, 16];
    expect(computeCampaignLeg(bars(closes))).toEqual({ legNumber: 3, confidence: "high" });
  });

  it("counts four 3-day flips as leg 5 (extended, outside the classic 3-4-leg pattern)", () => {
    const closes = [10, 11, 12, 11, 10, 9, 12, 13, 14, 13, 12, 11, 14, 15, 16];
    expect(computeCampaignLeg(bars(closes))).toEqual({ legNumber: 5, confidence: "extended" });
  });

  it("resets the leg count after a genuine 9-day major trend change, ignoring legs from before it", () => {
    // Bullish start, then 9 consecutive down closes (flips the 9-day chart
    // bearish), then 3 up closes (one 3-day flip back to bullish since the
    // major change) -- only that one flip since the major change counts.
    const closes = [10, 11, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 4, 5, 6];
    expect(computeCampaignLeg(bars(closes))).toEqual({ legNumber: 2, confidence: "low" });
  });
});
