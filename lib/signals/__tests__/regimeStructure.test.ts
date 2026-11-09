/**
 * One definition of swing structure (PLAN.md item 6 step 4, A-TREND-02): the
 * regime reads rising or falling tops and bottoms from the same 3-Day Chart
 * swings `readGannTrend` steps through, not from a second fractal-pivot test
 * that compared the last of four pivots with the first.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyRegime } from "../regime";
import { readGannTrend } from "@/lib/gann/trendStrength";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.4): Bar[] {
  const t0 = Date.parse("2026-01-05T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 + (i % 5) * 1e4 }));
}

// An advance with a spike to 120, a reaction to 100, then tops and bottoms
// rising again (110, 112, 115 over 103, 106, 109), all still under the spike.
// Corrected 2026-10-21: the earlier reactions were 6 points in 4 days, so the
// spike's 20-point, 6-day reaction over-balanced the campaign in space and
// time, which stands until price crosses 120 again (Master Course Ch. 8, PDF
// 249). The earlier reactions are now 22 points over 7 days, so the spike's
// reaction is within the greatest, as the test means.
const AFTER_SPIKE = daily([
  ...leg(30, 80, 15), ...leg(80, 58, 7), ...leg(58, 92, 12), ...leg(92, 70, 7),
  ...leg(70, 120, 10), ...leg(120, 100, 6), ...leg(100, 110, 8), ...leg(110, 103, 4),
  ...leg(103, 112, 8), ...leg(112, 106, 4), ...leg(106, 115, 8), ...leg(115, 109, 4), ...leg(109, 113, 4),
]);

describe("the regime's swing structure", () => {
  it("is a clean bullish trend when the 3-Day Chart's tops and bottoms are rising, though the last top is under a spike four swings back", () => {
    expect(readGannTrend(AFTER_SPIKE)).toMatchObject({ confirmed: true, direction: "bullish", structureAgrees: true });
    const r = classifyRegime({ bars: AFTER_SPIKE });
    expect(r).toMatchObject({ regime: "trend", direction: "bullish" });
    expect(r.disqualifiers).toEqual([]);
    expect(r.reasons[0]).toBe("Higher highs and higher lows.");
  });

  it("is mirrored: falling tops and bottoms under a crash low four swings back read as a clean bearish trend", () => {
    const mirror = AFTER_SPIKE.map((b) => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));
    expect(readGannTrend(mirror)).toMatchObject({ confirmed: true, direction: "bearish" });
    const r = classifyRegime({ bars: mirror });
    expect(r).toMatchObject({ regime: "trend", direction: "bearish" });
    expect(r.disqualifiers).toEqual([]);
  });

  it("names the swings, not a disagreement, when both charts point up but the tops are not rising", () => {
    // A top at 125, then a lower one at 118 over a higher bottom.
    const bars = daily([
      ...leg(60, 80, 15), ...leg(80, 74, 4), ...leg(74, 92, 12), ...leg(92, 86, 4),
      ...leg(86, 120, 10), ...leg(120, 100, 6), ...leg(100, 110, 8), ...leg(110, 103, 4),
      ...leg(103, 125, 8), ...leg(125, 106, 4), ...leg(106, 118, 6), ...leg(118, 112, 3), ...leg(112, 113, 2),
    ]);
    expect(readGannTrend(bars)).toMatchObject({ threeDay: "bullish", weekly: "bullish", structureAgrees: false });
    const r = classifyRegime({ bars });
    expect(r.regime).toBe("range");
    expect(r.reasons[0]).toBe("Weekly swing chart bullish, but the 3-day swings are not making higher tops and higher bottoms: no confirmed trend.");
  });

  it("names an over-balance as a changing trend", () => {
    // Pullbacks of 3 sessions, then one of 8 that goes deeper.
    let p = 100;
    const closes: number[] = [];
    for (let i = 0; i < 118; i++) closes.push((p += i % 11 < 8 ? 0.8 : -0.4));
    for (let k = 0; k < 8; k++) closes.push((p -= 0.6));
    const bars = daily(closes, 1);
    expect(readGannTrend(bars)).toMatchObject({ weekly: "bullish", changing: true });
    const r = classifyRegime({ bars });
    expect(r.regime).toBe("range");
    expect(r.reasons[0]).toBe("Weekly swing chart bullish, but the move against it has run larger or longer than any before it: the trend is changing.");
  });
});
