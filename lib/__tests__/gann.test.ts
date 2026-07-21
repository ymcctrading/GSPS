import { describe, expect, it } from "vitest";
import { squareOf9Levels, nearestS9Level } from "@/lib/gann/squareOf9";
import { computeFanLines } from "@/lib/gann/fans";
import { computeScore } from "@/lib/scoring/score";
import type { Bar, TrendReading } from "@/lib/types";

describe("squareOf9Levels", () => {
  it("produces the classic 360° doubling relationship", () => {
    // One full rotation from anchor 100: (sqrt(100) + 2)² = 144
    const levels = squareOf9Levels(100, 100);
    const prices = levels.map((l) => l.price.toFixed(2));
    expect(prices).toContain("144.00");
    // 90° = (10 + 0.5)² = 110.25
    expect(prices).toContain("110.25");
    // 180° = (10 + 1)² = 121
    expect(prices).toContain("121.00");
  });

  it("sorts by distance from current price and respects proximity gate", () => {
    const levels = squareOf9Levels(100, 121.5);
    expect(levels[0].price).toBeCloseTo(121, 0);
    expect(nearestS9Level(levels, 1.0)).not.toBeNull();
    const far = squareOf9Levels(100, 300);
    // nearest may still exist but must be within 1% to pass the gate
    const gate = nearestS9Level(far, 0.0001);
    expect(gate).toBeNull();
  });
});

describe("computeFanLines", () => {
  it("returns fan lines sorted by proximity for a trending series", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 60; i++) {
      const base = 100 + i * 0.5 + Math.sin(i / 5) * 3;
      bars.push({ t: `2026-01-${(i % 28) + 1}T00:00:00Z`, o: base, h: base + 2, l: base - 2, c: base + 1, v: 1000 });
    }
    const lines = computeFanLines(bars, bars[bars.length - 1].c);
    expect(lines.length).toBeGreaterThan(0);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].distancePct).toBeGreaterThanOrEqual(lines[i - 1].distancePct);
    }
  });
});

describe("computeScore", () => {
  const trend = (
    timeframe: TrendReading["timeframe"],
    direction: TrendReading["direction"],
  ): TrendReading => ({ timeframe, direction, support: [], resistance: [] });

  it("maps a full-confluence setup to Execute", () => {
    const decision = computeScore({
      direction: "bullish",
      macroTrends: [trend("1Month", "bearish"), trend("1Week", "bearish"), trend("1Day", "bearish")],
      hourlyTrend: trend("1Hour", "bullish"),
      gann: {
        fanLines: [{ angle: "1x1 (low)", price: 100, distancePct: 0.5 }],
        squareOf9: [{ degree: 90, price: 100.2, distancePct: 0.3 }],
        timeCycleActive: true,
        timeCycleDates: [],
      },
      nearSupportResistance: true,
      pattern: {
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: 100.5,
        stopPrice: 86,
        description: "",
      },
      momentumElevated: true,
      earningsSoon: false,
      levels: {
        entry: 100.5,
        stopLoss: 86,
        takeProfit1: 129.5,
        masterProfit: 144,
        riskPerShare: 14.5,
        rewardToRiskTp1: 2,
        rewardToRiskMaster: 3,
        stopPctOfPrice: 14.4,
        stopBandWarning: null,
      },
    });
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("maps a weak setup to Reject", () => {
    const decision = computeScore({
      direction: "bullish",
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "sideways")],
      hourlyTrend: trend("1Hour", "bearish"),
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      earningsSoon: true,
      levels: null,
    });
    expect(decision.score).toBeLessThanOrEqual(3);
    expect(decision.outputState).toBe("Reject");
  });
});
