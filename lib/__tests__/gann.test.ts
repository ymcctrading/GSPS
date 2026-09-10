import { describe, expect, it } from "vitest";
import { squareOf9Levels, nearestS9Level, recentSquareOf9Levels } from "@/lib/gann/squareOf9";
import { computeFanLines } from "@/lib/gann/fans";
import { timeCycles } from "@/lib/gann/timeCycles";
import { computeScore } from "@/lib/scoring/score";
import type { Bar, TrendReading } from "@/lib/types";

function bar(t: string, h: number, l: number): Bar {
  return { t, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1000 };
}

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

describe("recentSquareOf9Levels", () => {
  it("anchors from the most recent high AND low, not a single stale window-wide low", () => {
    // A deep low early in the window (bar 0, low 50) that's long since
    // irrelevant, then a recent, shallower low (bar 8) and a recent high
    // (bar 5) that actually govern the current move.
    const bars: Bar[] = [
      bar("2026-01-01", 55, 50), // stale window-wide low — must NOT anchor
      bar("2026-01-02", 65, 60),
      bar("2026-01-03", 75, 70),
      bar("2026-01-04", 85, 80),
      bar("2026-01-05", 95, 90),
      bar("2026-01-06", 105, 100), // recent pivot high
      bar("2026-01-07", 95, 90),
      bar("2026-01-08", 85, 80),
      bar("2026-01-09", 75, 70), // recent pivot low
      bar("2026-01-10", 85, 80),
      bar("2026-01-11", 95, 90),
    ];
    const stale = squareOf9Levels(50, 90);
    const recent = recentSquareOf9Levels(bars, 90);
    // A level unique to spiraling off the stale low should not appear.
    const staleOnlyPrice = stale.find((l) => l.rotation === 3)?.price;
    expect(staleOnlyPrice).toBeDefined();
    expect(recent.some((l) => Math.abs(l.price - staleOnlyPrice!) < 0.01)).toBe(false);
  });

  it("returns nothing below the minimum bar count", () => {
    expect(recentSquareOf9Levels([bar("2026-01-01", 105, 100)], 100)).toEqual([]);
  });
});

describe("timeCycles", () => {
  it("tags a low-anchored window bullish and a high-anchored window bearish", () => {
    const dayMs = 24 * 3600 * 1000;
    const bars: Bar[] = [];
    const start = new Date("2025-01-01T00:00:00Z");
    for (let i = 0; i < 40; i++) {
      const t = new Date(start.getTime() + i * dayMs).toISOString();
      // A pivot low at i=20, flanked by a deep swing either side.
      const l = i === 20 ? 50 : 100 - Math.abs(i - 20);
      bars.push(bar(t, l + 10, l));
    }
    const asOf = new Date(bars[20].t.slice(0, 10) + "T00:00:00Z");
    asOf.setDate(asOf.getDate() + 90); // one of the fixed wheel counts
    const result = timeCycles(bars, asOf);
    expect(result.bullishActive).toBe(true);
    expect(result.bearishActive).toBe(false);
    expect(result.active).toBe(true);
  });

  it("reports inactive with too little daily history", () => {
    const result = timeCycles([bar("2026-01-01", 101, 100)]);
    expect(result).toEqual({ active: false, bullishActive: false, bearishActive: false, dates: [] });
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
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      gann: {
        fanLines: [],
        squareOf9: [{ degree: 90, price: 100.2, distancePct: 0.3, role: "support" }],
        timeCycleActive: true,
        timeCycleBullishActive: true,
        timeCycleBearishActive: false,
        timeCycleDates: [],
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
        ],
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "support" }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
      nearSupportResistance: true,
      srMatch: { price: 99.8, timeframe: "1Day", role: "support" },
      pattern: {
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: 100.5,
        stopPrice: 86,
        description: "",
      },
      momentumElevated: true,
      stopAtrMultiple: 2,
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

  it("does not award structural-proximity points for a level on the wrong side of the trade", () => {
    // Same setup as full-confluence above, but every structural level is a
    // resistance ceiling overhead instead of a support floor underneath —
    // the opposite of what a bullish (long) trade wants. Proximity alone
    // used to score this identically to the supportive case; role must now
    // gate it.
    const decision = computeScore({
      direction: "bullish",
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      gann: {
        fanLines: [],
        squareOf9: [{ degree: 90, price: 100.2, distancePct: 0.3, role: "resistance" }],
        timeCycleActive: true,
        timeCycleBullishActive: true,
        timeCycleBearishActive: false,
        timeCycleDates: [],
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
        ],
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "resistance" }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
      nearSupportResistance: true,
      srMatch: { price: 100.4, timeframe: "1Day", role: "resistance" },
      pattern: {
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: 100.5,
        stopPrice: 86,
        description: "",
      },
      momentumElevated: true,
      stopAtrMultiple: 2,
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
    const byKey = Object.fromEntries(decision.breakdown.map((b) => [b.key, b.passed]));
    expect(byKey.gannRetracementConfluence).toBe(false);
    expect(byKey.harmonicProximity).toBe(false);
    expect(byKey.historicalSR).toBe(false);
    // gannAngleSlope isn't a level-role check (it reads realized slope, not a
    // structural level), so it still passes here — only the three role-gated
    // criteria lose their point, and score drops by exactly 3.
    expect(byKey.gannAngleSlope).toBe(true);
    expect(decision.score).toBe(6);
    expect(decision.outputState).toBe("Watch");
  });

  it("maps a weak setup to Reject", () => {
    const decision = computeScore({
      direction: "bullish",
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "sideways")],
      hourlyTrend: trend("1Hour", "bearish"),
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    });
    expect(decision.score).toBeLessThanOrEqual(3);
    expect(decision.outputState).toBe("Reject");
  });

  it("awards the retracement-confluence point regardless of the stop's share of price", () => {
    const item = (stopPctOfPrice: number) =>
      computeScore({
        direction: "bullish",
        macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
        hourlyTrend: trend("1Hour", "bearish"),
        gann: {
          fanLines: [],
          squareOf9: [],
          timeCycleActive: false,
          timeCycleBullishActive: false,
          timeCycleBearishActive: false,
          timeCycleDates: [],
          angleSlopes: [],
          retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "support" }],
          digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
        },
        nearSupportResistance: false,
        pattern: null,
        momentumElevated: false,
        stopAtrMultiple: 0.8,
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
      }).breakdown.find((b) => b.key === "gannRetracementConfluence");

    // 5% and 30% both sit outside the old 12–18% band; only whether the
    // retracement zone + digital-root confluence holds matters now.
    expect(item(5)?.passed).toBe(true);
    expect(item(30)?.passed).toBe(true);
    expect(item(14.4)?.passed).toBe(true);
  });

  it("scores the cyclical turn window and no longer scores earnings", () => {
    const base = {
      direction: "bullish" as const,
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
    const active = computeScore({
      ...base,
      gann: { fanLines: [], squareOf9: [], timeCycleActive: true, timeCycleBullishActive: true, timeCycleBearishActive: true, timeCycleDates: ["2026-08-05"], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
    });
    const inactive = computeScore({
      ...base,
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
    });

    expect(active.score).toBe(inactive.score + 1);
    expect(active.breakdown.find((b) => b.criterion === "Cyclical turn window active")?.passed).toBe(true);
    expect(active.breakdown.map((b) => b.criterion)).toHaveLength(9);
    expect(active.breakdown.some((b) => /earnings/i.test(b.criterion))).toBe(false);
  });

});
