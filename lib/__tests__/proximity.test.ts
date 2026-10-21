/**
 * "Near a level" has to mean the same thing on a quiet name and a violent one.
 *
 * The old fixed bands (1.5% fan, 1.0% harmonic, 1.5% S/R) handed the structural
 * points away on a high-ATR symbol and made them nearly unreachable on a low-ATR
 * one, so a 7/9 did not compare across the universe. These pin the ATR-relative
 * replacement, and pin the fallback to the old numbers so a caller with no
 * volatility read is not silently scored on a different rule.
 */

import { describe, expect, it } from "vitest";
import type { GannLevels, StratPattern, TradeLevels, TrendReading } from "@/lib/types";
import { atrPercentOfPrice, levelBandPct, nearAnyLevel, proximityBandPct } from "@/lib/scoring/proximity";
import { gannThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";
import { rangeDivisionMatch, type RangeDivisionLevel } from "@/lib/gann/rangeDivisions";
import { passingPillarFacts } from "@/lib/scoring/__tests__/pillarFixtures";

function trend(
  timeframe: TrendReading["timeframe"],
  direction: TrendReading["direction"],
): TrendReading {
  return { timeframe, direction, support: [99], resistance: [101] };
}

const pattern: StratPattern = {
  name: "2-1-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 99,
  description: "",
};

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 99,
  takeProfit1: 102,
  takeProfit2: 103,
  masterProfit: 103,
  riskPerShare: 1,
  rewardToRiskTp1: 2,
  rewardToRiskTp2: 3,
  rewardToRiskMaster: 3,
  masterFromStructure: true,
  stopPctOfPrice: 1,
  stopBandWarning: null,
};

/** Both structural levels sit 1.2% away — inside the old fixed fan band. */
function gannAt(distancePct: number): GannLevels {
  return {
    fanLines: [],
    squareOf9: [{ degree: 90, price: 100, distancePct, role: "support" }],
    timeCycleActive: false,
    timeCycleBullishActive: false,
    timeCycleBearishActive: false,
    timeCycleDates: [],
    angleSlopes: [],
    retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct, role: "support", importance: 1 }],
    digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
  };
}

function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    direction: "bullish",
    macroTrends: [
      trend("1Month", "bearish"),
      trend("1Week", "bearish"),
      trend("1Day", "bearish"),
    ],
    hourlyTrend: trend("1Hour", "bullish"),
    gann: gannAt(1.2),
    nearSupportResistance: true,
    pattern,
    momentumElevated: true,
    stopAtrMultiple: 2,
    levels,
    ...overrides,
  };
}

const passed = (inp: ScoreInputs, key: string) =>
  computeScore(inp).breakdown.find((b) => b.key === key)?.passed;

describe("proximityBandPct", () => {
  it("falls back to the fixed band when there is no volatility read, and scales with it otherwise", () => {
    expect(proximityBandPct(1, 2, undefined)).toBe(2);
    expect(proximityBandPct(0.5, 2, 5)).toBeCloseTo(2.5, 10);
  });
});

describe("atrPercentOfPrice", () => {
  it("reports a day's range as a percentage of price", () => {
    expect(atrPercentOfPrice(2, 100)).toBeCloseTo(2, 10);
  });

  it("is undefined rather than zero when it cannot be computed", () => {
    // Zero would close every band and fail all three structural criteria; the
    // absent reading is what makes the caller fall back instead.
    expect(atrPercentOfPrice(0, 100)).toBeUndefined();
    expect(atrPercentOfPrice(2, 0)).toBeUndefined();
    expect(atrPercentOfPrice(Number.NaN, 100)).toBeUndefined();
  });
});

describe("nearAnyLevel", () => {
  it("measures distance as a percentage of price", () => {
    expect(nearAnyLevel(100, [101], 1.5)).toBe(true);
    expect(nearAnyLevel(100, [103], 1.5)).toBe(false);
    expect(nearAnyLevel(100, [], 1.5)).toBe(false);
  });

  it("refuses to divide by a price of zero", () => {
    expect(nearAnyLevel(0, [0], 1.5)).toBe(false);
  });
});

describe("at a level means within Gann's 3 points of it (N#27)", () => {
  const band = gannThreePointsPct(100);

  // P5(b)'s levels are the major-range divisions (2026-10-21), matched in
  // `rangeDivisionMatch` at the level's own allowance.
  const level: RangeDivisionLevel = { price: 100, label: "1/2 of the extreme range (50.00-150.00)", basis: "extremeRange", importance: 1 };
  const priceAbove = (d: number) => 100 / (1 - d / 100);

  it("passes inside the level's 3-point allowance and fails just past it", () => {
    expect(rangeDivisionMatch([level], priceAbove(band - 0.1), "support")).not.toBeNull();
    expect(rangeDivisionMatch([level], priceAbove(band + 0.1), "support")).toBeNull();
  });

  it("does not move with the day's range", () => {
    const match = rangeDivisionMatch([level], priceAbove(band - 0.1), "support");
    const facts = { ...passingPillarFacts(), rangeLevels: { bullish: match, bearish: null } };
    expect(passed(inputs({ pillarFacts: facts, atrPct: 1 }), "gannRetracementConfluence")).toBe(true);
    expect(passed(inputs({ pillarFacts: facts, atrPct: 5 }), "gannRetracementConfluence")).toBe(true);
  });

  it("says which allowance a criterion was measured against", () => {
    const match = rangeDivisionMatch([level], priceAbove(1), "support");
    const facts = { ...passingPillarFacts(), rangeLevels: { bullish: match, bearish: null } };
    const item = computeScore(inputs({ pillarFacts: facts })).breakdown.find((b) => b.key === "gannRetracementConfluence");
    expect(item?.note).toContain(`${band.toFixed(2)}%`);
    expect(item?.note).toContain("3-point allowance");
  });

  it("puts the S/R band at the price's own 3-point allowance", () => {
    expect(levelBandPct(100)).toBeCloseTo(band, 10);
    expect(levelBandPct(42.5)).toBeCloseTo((gannThreePoints(42.5) / 42.5) * 100, 10);
  });
});
