/**
 * The replay splits held entries by which form of the hold priced them, so
 * the bear-market rally sell can be read apart from the bottoms that held
 * (step 4b review R7).
 */
import { describe, expect, it } from "vitest";
import { byHoldBasis, summarise, type ReplayTrade } from "@/lib/backtest/replay";

const trade = (entryKind: ReplayTrade["entryKind"], holdBasis: ReplayTrade["holdBasis"], r: number) =>
  ({ entryKind, holdBasis, rMultiple: r, outcome: r > 0 ? "win" : "loss", bars: 3 }) as unknown as ReplayTrade;

describe("the hold basis split", () => {
  it("puts each held trade under its form and leaves the other entries out", () => {
    const result = summarise([
      trade("hold", "rally", 2),
      trade("hold", "rally", -1),
      trade("hold", "weeks", -1),
      trade("hold", "days", 2),
      trade("crossing", undefined, 1),
    ]);
    const split = byHoldBasis(result);
    expect(split.rally.trades.length).toBe(2);
    expect(split.rally.expectancyR).toBeCloseTo(0.5, 8);
    expect(split.weeks.trades.length).toBe(1);
    expect(split.days.trades.length).toBe(1);
    expect(split.record.trades.length).toBe(0);
  });
});
