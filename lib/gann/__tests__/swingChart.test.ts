/**
 * Guards Gann's own swing-chart construction (rebuilt 2026-09-27, conflict X3):
 * highs and lows, a line reversed by a counter-move of the chart's length,
 * and a trend that turns only when the last swing extreme breaks.
 * Sources: 45 Years in Wall Street (1949) Ch. VII; How to Make Profits in
 * Commodities (1951) pp. 316-317.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  THREE_DAY_CHART,
  WEEKLY_SWING_CHART,
  computeCampaignLeg,
  computeSwingChart,
  swingChartDirection,
  walkSwingChart,
} from "../swingChart";

/** One bar per calendar day; each bar spans close ± 1. */
function bars(closes: number[], stepDays = 1): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * stepDays * 86_400_000).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1000,
  }));
}

describe("walkSwingChart: the line", () => {
  it("is empty for fewer than two bars", () => {
    expect(walkSwingChart(bars([10]), THREE_DAY_CHART).trend).toBeNull();
  });

  it("takes its first direction from the first bar outside the opening range", () => {
    expect(walkSwingChart(bars([10, 11, 12]), THREE_DAY_CHART).swingDirection).toBe("bullish");
    expect(walkSwingChart(bars([10, 9, 8]), THREE_DAY_CHART).swingDirection).toBe("bearish");
  });

  it("ignores a 2-day counter-move on the 3-Day Chart", () => {
    const w = walkSwingChart(bars([10, 11, 12, 11, 10, 13, 14]), THREE_DAY_CHART);
    expect(w.reversals).toEqual([]);
    expect(w.swingDirection).toBe("bullish");
  });

  it("reverses after 3 consecutive lower lows and records the top", () => {
    const w = walkSwingChart(bars([10, 11, 12, 11, 10, 9]), THREE_DAY_CHART);
    expect(w.swingDirection).toBe("bearish");
    expect(w.pivots.filter((p) => p.kind === "top")).toEqual([{ index: 2, price: 13, kind: "top" }]);
  });

  it("needs the counter-run to be consecutive", () => {
    // Two lower lows, a higher low (not a new high), two more lower lows.
    const w = walkSwingChart(bars([10, 11, 12, 11, 10, 10.5, 10, 9.5]), THREE_DAY_CHART);
    expect(w.reversals).toEqual([]);
  });

  it("reads highs and lows, not closes", () => {
    // Closes rise every day, but the lows fall three days running (wide bars).
    const b: Bar[] = [
      { t: "2026-01-01T00:00:00.000Z", o: 10, h: 11, l: 9, c: 10, v: 1 },
      { t: "2026-01-02T00:00:00.000Z", o: 11, h: 12, l: 10, c: 11, v: 1 },
      { t: "2026-01-03T00:00:00.000Z", o: 11, h: 11.9, l: 9.5, c: 11.2, v: 1 },
      { t: "2026-01-04T00:00:00.000Z", o: 11, h: 11.8, l: 9, c: 11.3, v: 1 },
      { t: "2026-01-05T00:00:00.000Z", o: 11, h: 11.7, l: 8.5, c: 11.4, v: 1 },
    ];
    expect(walkSwingChart(b, THREE_DAY_CHART).swingDirection).toBe("bearish");
  });

  it("reverses the weekly chart only on a counter-move of 7+ calendar days", () => {
    const up = [10, 11, 12, 13, 14, 15];
    // A 5-day reaction: no reversal.
    expect(walkSwingChart(bars([...up, 14, 13, 12, 11, 10, 16]), WEEKLY_SWING_CHART).reversals).toEqual([]);
    // A 7-day reaction: the line moves down.
    expect(walkSwingChart(bars([...up, 14, 13, 12, 11, 10, 9, 8]), WEEKLY_SWING_CHART).swingDirection).toBe(
      "bearish",
    );
  });

  it("counts calendar days, so a one-bar reaction on weekly bars is enough", () => {
    // Weekly bars: one week lower reverses the weekly chart (Gann's weekly 1-bar swing chart).
    const w = walkSwingChart(bars([10, 11, 12, 11], 7), WEEKLY_SWING_CHART);
    expect(w.swingDirection).toBe("bearish");
  });
});

describe("walkSwingChart: the trend", () => {
  it("keeps the trend through a reversal of the line until the last bottom breaks", () => {
    // Up to 16, a 3-day reaction to 13 (line reverses), then a rally.
    const w = walkSwingChart(bars([10, 12, 14, 16, 15, 14, 13, 15, 17]), THREE_DAY_CHART);
    expect(w.trend).toBe("bullish");
  });

  it("turns bearish when price breaks the last completed swing bottom", () => {
    // Up, reaction (bottom completes at 12), rally that fails, then a break under 12's low.
    const closes = [10, 12, 14, 16, 15, 14, 13, 12, 13, 14, 15, 14, 13, 12, 11, 10];
    expect(swingChartDirection(bars(closes), THREE_DAY_CHART)).toBe("bearish");
  });

  it("turns bullish when price crosses the last completed swing top", () => {
    const closes = [20, 18, 16, 14, 15, 16, 17, 16, 15, 14, 13, 14, 15, 16, 17, 18, 19];
    expect(swingChartDirection(bars(closes), THREE_DAY_CHART)).toBe("bullish");
  });

  it("mirrors exactly for the down side", () => {
    const upCloses = [10, 12, 14, 16, 15, 14, 13, 12, 13, 14, 15, 14, 13, 12, 11, 10];
    const downCloses = upCloses.map((c) => 30 - c);
    expect(swingChartDirection(bars(upCloses), THREE_DAY_CHART)).toBe("bearish");
    expect(swingChartDirection(bars(downCloses), THREE_DAY_CHART)).toBe("bullish");
  });
});

describe("computeSwingChart", () => {
  it("reports the 3-Day and weekly trends", () => {
    // A long advance with only short reactions: both charts read bullish.
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i - (i % 5 === 4 ? 2 : 0));
    expect(computeSwingChart(bars(closes))).toEqual({ threeDay: "bullish", weekly: "bullish" });
  });

  it("returns nulls when the bars never leave the opening range", () => {
    expect(computeSwingChart(bars([10, 10, 10]))).toEqual({ threeDay: null, weekly: null });
  });
});

describe("computeCampaignLeg", () => {
  it("returns null until the weekly chart has a trend", () => {
    expect(computeCampaignLeg(bars([10, 10, 10]))).toEqual({ legNumber: null, confidence: null });
  });

  it("reads a run with no 3-day reversal as leg 1 (low confidence)", () => {
    expect(computeCampaignLeg(bars([10, 11, 12, 13, 14, 15, 16, 17]))).toEqual({ legNumber: 1, confidence: "low" });
  });

  it("counts 3-Day Chart legs since the weekly chart's trend began", () => {
    // One 3-day reaction and the rally after it (two line reversals) inside
    // one weekly up-trend: the open rally is leg 3.
    const closes = [10, 11, 12, 13, 12, 11, 10, 11, 12, 13, 14, 15];
    const leg = computeCampaignLeg(bars(closes));
    expect(leg.legNumber).toBe(3);
    expect(leg.confidence).toBe("high");
  });
});
