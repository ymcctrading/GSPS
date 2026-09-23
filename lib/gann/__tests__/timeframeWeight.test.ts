import { describe, expect, it } from "vitest";
import { weightedTrendAgreement } from "../timeframeWeight";
import type { TrendReading } from "@/lib/types";

function trend(timeframe: TrendReading["timeframe"], direction: TrendReading["direction"]): TrendReading {
  return { timeframe, direction, support: [], resistance: [] };
}

describe("weightedTrendAgreement", () => {
  it("lets a single monthly trend outweigh two flat 2-of-3 daily/weekly votes against it", () => {
    // Flat majority vote would read "bearish" (2 of 3), but Gann's power
    // ratio (monthly=30 vs daily=1 + weekly=7) should flip it bullish.
    const trends = [trend("1Month", "bullish"), trend("1Week", "bearish"), trend("1Day", "bearish")];
    const result = weightedTrendAgreement(trends, "bullish");
    expect(result.agrees).toBe(true);
    expect(result.weightedScore).toBe(30 - 7 - 1);
  });

  it("reads unanimous agreement as agreeing", () => {
    const trends = [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")];
    const result = weightedTrendAgreement(trends, "bullish");
    expect(result.agrees).toBe(true);
    expect(result.weightedScore).toBe(30 + 7 + 1);
  });

  it("treats a sideways reading as contributing zero weight", () => {
    const trends = [trend("1Month", "sideways"), trend("1Week", "bullish"), trend("1Day", "bullish")];
    const result = weightedTrendAgreement(trends, "bullish");
    expect(result.weightedScore).toBe(7 + 1);
  });

  it("falls back to weight 1 for a timeframe not in the power-ratio table", () => {
    const trends = [trend("1Hour", "bearish")];
    const result = weightedTrendAgreement(trends, "bullish");
    expect(result.breakdown[0].weight).toBe(1);
    expect(result.weightedScore).toBe(-1);
  });

  it("reads a tied score as not agreeing", () => {
    const tied = [trend("1Day", "bullish"), trend("1Day", "bearish")];
    const result = weightedTrendAgreement(tied, "bullish");
    expect(result.weightedScore).toBe(0);
    expect(result.agrees).toBe(false);
  });
});
