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
      levels: {
        entry: 100.5,
        stopLoss: 86,
        takeProfit1: 129.5,
        takeProfit2: 144,
        masterProfit: 144,
        riskPerShare: 14.5,
        rewardToRiskTp1: 2,
        rewardToRiskTp2: 3,
        rewardToRiskMaster: 3,
        masterFromStructure: true,
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
      levels: null,
    });
    expect(decision.score).toBeLessThanOrEqual(3);
    expect(decision.outputState).toBe("Reject");
  });

  it("awards the structural-confirmation point regardless of the stop's share of price", () => {
    const item = (stopPctOfPrice: number) =>
      computeScore({
        direction: "bullish",
        macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
        hourlyTrend: trend("1Hour", "bearish"),
        gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
        nearSupportResistance: false,
        pattern: null,
        momentumElevated: false,
        levels: {
          entry: 100,
          stopLoss: 95,
          takeProfit1: 110,
          takeProfit2: 115,
          masterProfit: 115,
          riskPerShare: 5,
          rewardToRiskTp1: 2,
          rewardToRiskTp2: 3,
          rewardToRiskMaster: 3,
          masterFromStructure: true,
          stopPctOfPrice,
          stopBandWarning: null,
        },
      }).breakdown.find((b) => b.criterion.startsWith("Master target"));

    // 5% and 30% both sit outside the old 12–18% band; only whether a
    // structural level confirms the master target matters now.
    expect(item(5)?.passed).toBe(true);
    expect(item(30)?.passed).toBe(true);
    expect(item(14.4)?.passed).toBe(true);
  });

  it("scores the cyclical turn window and no longer scores earnings", () => {
    const base = {
      direction: "bullish" as const,
      macroTrends: [trend("1Month", "bearish"), trend("1Week", "bearish"), trend("1Day", "bearish")],
      hourlyTrend: trend("1Hour", "bullish"),
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      levels: null,
    };
    const active = computeScore({
      ...base,
      gann: { fanLines: [], squareOf9: [], timeCycleActive: true, timeCycleDates: ["2026-08-05"] },
    });
    const inactive = computeScore({
      ...base,
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    });

    expect(active.score).toBe(inactive.score + 1);
    expect(active.breakdown.find((b) => b.criterion === "Cyclical turn window active")?.passed).toBe(true);
    expect(active.breakdown.map((b) => b.criterion)).toHaveLength(9);
    expect(active.breakdown.some((b) => /earnings/i.test(b.criterion))).toBe(false);
  });
});
