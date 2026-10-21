/**
 * Review finding D-05 (2026-10-21): with no trend on any chart and no buying
 * point, the scan took the short side by default. Gann's never-failing rules 5
 * and 6 (never buck the trend; when in doubt, get out) answer it: stand aside.
 */
import { describe, expect, it } from "vitest";
import type { ScanDecision, TrendReading } from "@/lib/types";
import { preferredEntryDirection } from "@/lib/scan/entrySelection";
import { applyStandAsideHold } from "@/lib/scoring/score";

const trend = (timeframe: TrendReading["timeframe"], direction: TrendReading["direction"]): TrendReading =>
  ({ timeframe, direction, support: [], resistance: [] }) as unknown as TrendReading;
const flat = [trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "sideways")];

describe("the reversion side with no buying point", () => {
  it("takes no side when no chart reads a trend", () => {
    expect(preferredEntryDirection(flat)).toBeNull();
  });

  it("still reads against the weighted trend when there is one", () => {
    expect(preferredEntryDirection([trend("1Month", "bullish"), trend("1Week", "sideways"), trend("1Day", "sideways")])).toBe("bearish");
    expect(preferredEntryDirection([trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "bearish")])).toBe("bullish");
  });

  it("follows a direction asked for", () => {
    expect(preferredEntryDirection(flat, { direction: "bearish" })).toBe("bearish");
  });
});

describe("applyStandAsideHold", () => {
  const watch = { outputState: "Watch", score: 4, breakdown: [] } as unknown as ScanDecision;

  it("drops the verdict to Reject with the reason", () => {
    const held = applyStandAsideHold(watch, true);
    expect(held.outputState).toBe("Reject");
    expect(held.breakdown.at(-1)).toMatchObject({ key: "standAside", passed: false });
  });

  it("leaves the verdict alone when there is a side to take", () => {
    expect(applyStandAsideHold(watch, false)).toBe(watch);
  });
});
