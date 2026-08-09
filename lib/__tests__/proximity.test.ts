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
import {
  FALLBACK_FAN_PCT,
  FALLBACK_HARMONIC_PCT,
  FALLBACK_SR_PCT,
  FAN_PROXIMITY_ATR,
  HARMONIC_PROXIMITY_ATR,
  SR_PROXIMITY_ATR,
  atrPercentOfPrice,
  nearAnyLevel,
  proximityBandPct,
} from "@/lib/scoring/proximity";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";

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
    fanLines: [{ angle: "1x1", price: 100, distancePct }],
    squareOf9: [{ degree: 90, price: 100, distancePct }],
    timeCycleActive: false,
    timeCycleDates: [],
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
    levels,
    ...overrides,
  };
}

const passed = (inp: ScoreInputs, key: string) =>
  computeScore(inp).breakdown.find((b) => b.key === key)?.passed;

describe("proximityBandPct", () => {
  it("falls back to the old fixed bands when there is no volatility read", () => {
    expect(proximityBandPct(FAN_PROXIMITY_ATR, FALLBACK_FAN_PCT, undefined)).toBe(FALLBACK_FAN_PCT);
    expect(proximityBandPct(HARMONIC_PROXIMITY_ATR, FALLBACK_HARMONIC_PCT, undefined)).toBe(
      FALLBACK_HARMONIC_PCT,
    );
    expect(proximityBandPct(SR_PROXIMITY_ATR, FALLBACK_SR_PCT, undefined)).toBe(FALLBACK_SR_PCT);
  });

  it("scales the band with the instrument's own range", () => {
    // 5%-ATR name: half a day's range is 2.5%. 1%-ATR name: 0.5%.
    expect(proximityBandPct(FAN_PROXIMITY_ATR, FALLBACK_FAN_PCT, 5)).toBeCloseTo(2.5, 10);
    expect(proximityBandPct(FAN_PROXIMITY_ATR, FALLBACK_FAN_PCT, 1)).toBeCloseTo(0.5, 10);
  });

  it("keeps the harmonic band tighter than the fan band, as the fixed pair did", () => {
    const ratio = HARMONIC_PROXIMITY_ATR / FAN_PROXIMITY_ATR;
    expect(ratio).toBeCloseTo(FALLBACK_HARMONIC_PCT / FALLBACK_FAN_PCT, 2);
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

describe("structural criteria across the universe", () => {
  it("gives the same level different verdicts on a quiet and a volatile name", () => {
    const quiet = inputs({ atrPct: 1 }); // band 0.5% — 1.2% away is not near
    const volatile = inputs({ atrPct: 5 }); // band 2.5% — 1.2% away is near

    expect(passed(quiet, "fanProximity")).toBe(false);
    expect(passed(volatile, "fanProximity")).toBe(true);
  });

  it("stops handing a free point to a 5%-ATR name that the old band gave away", () => {
    // 1.2% cleared the old 1.5% fan band on every symbol regardless of range.
    expect(passed(inputs(), "fanProximity")).toBe(true);
    expect(passed(inputs({ atrPct: 1 }), "fanProximity")).toBe(false);
  });

  it("says which band a criterion was measured against", () => {
    const item = computeScore(inputs({ atrPct: 2 })).breakdown.find(
      (b) => b.key === "fanProximity",
    );
    expect(item?.note).toContain("1.00%");
    expect(item?.note).toContain("daily average range");
  });

  it("names the fallback when no volatility read is available", () => {
    const item = computeScore(inputs()).breakdown.find((b) => b.key === "harmonicProximity");
    expect(item?.note).toContain("fixed fallback band");
  });
});
