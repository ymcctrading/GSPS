import { describe, expect, it } from "vitest";
import { selectVisibleResults, type RankedSetup } from "@/lib/entitlements/result-selection";

function setup(side: "buy" | "sell", rank: number): RankedSetup<string> {
  return { side, rank, value: `${side}-${rank}` };
}

describe("selectVisibleResults", () => {
  it("caps a non-Novice tier at maxSetupsPerScan by rank, no directional preference", () => {
    const qualifying = [
      setup("buy", 9),
      setup("sell", 8),
      setup("buy", 7),
      setup("sell", 6),
      setup("buy", 5),
    ];
    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 3,
      noviceDirectionalBackfill: false,
      isTopTier: false,
    });

    expect(visible.map((v) => v.value)).toEqual(["buy-9", "sell-8", "buy-7"]);
    expect(metadata).toEqual({
      qualifyingSetupCount: 5,
      returnedSetupCount: 3,
      maxSetupsPerScan: 3,
      resultLimitApplied: true,
      directionalAllocation: { buy: 2, sell: 1 },
      upgradeAvailable: true,
    });
  });

  it("does not apply the cap or flag a limit when everything qualifying fits", () => {
    const qualifying = [setup("buy", 9), setup("sell", 8)];
    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 12,
      noviceDirectionalBackfill: false,
      isTopTier: false,
    });

    expect(visible).toHaveLength(2);
    expect(metadata.resultLimitApplied).toBe(false);
    expect(metadata.upgradeAvailable).toBe(false);
  });

  it("Novice: prefers up to 3 Buy and 3 Sell by rank", () => {
    const qualifying = [
      setup("buy", 9), setup("buy", 8), setup("buy", 7), setup("buy", 6),
      setup("sell", 5), setup("sell", 4), setup("sell", 3),
    ];
    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 6,
      noviceDirectionalBackfill: true,
      isTopTier: false,
    });

    expect(visible.map((v) => v.value)).toEqual([
      "buy-9", "buy-8", "buy-7", "sell-5", "sell-4", "sell-3",
    ]);
    expect(metadata.directionalAllocation).toEqual({ buy: 3, sell: 3 });
    expect(metadata.resultLimitApplied).toBe(true);
  });

  it("Novice: backfills from the other side when one direction has too few candidates, without fabricating", () => {
    const qualifying = [
      setup("buy", 9), setup("buy", 8), setup("buy", 7), setup("buy", 6), setup("buy", 5),
      setup("sell", 4),
    ];
    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 6,
      noviceDirectionalBackfill: true,
      isTopTier: false,
    });

    // Only 1 sell qualified; the other 5 slots come from the highest-ranked
    // buys rather than being left empty or padded with a fake sell.
    expect(visible.map((v) => v.value)).toEqual([
      "buy-9", "buy-8", "buy-7", "buy-6", "buy-5", "sell-4",
    ]);
    expect(metadata.directionalAllocation).toEqual({ buy: 5, sell: 1 });
  });

  it("Novice: never pads when fewer setups qualify than the cap", () => {
    const qualifying = [setup("buy", 9), setup("sell", 8)];
    const { visible, metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 6,
      noviceDirectionalBackfill: true,
      isTopTier: false,
    });

    expect(visible).toHaveLength(2);
    expect(metadata.qualifyingSetupCount).toBe(2);
    expect(metadata.returnedSetupCount).toBe(2);
    expect(metadata.resultLimitApplied).toBe(false);
  });

  it("does not offer an upgrade when the top tier itself truncates at the scanner maximum", () => {
    const qualifying = Array.from({ length: 40 }, (_, i) => setup(i % 2 === 0 ? "buy" : "sell", i));
    const { metadata } = selectVisibleResults(qualifying, {
      maxSetupsPerScan: 30,
      noviceDirectionalBackfill: false,
      isTopTier: true,
    });

    expect(metadata.resultLimitApplied).toBe(true);
    expect(metadata.upgradeAvailable).toBe(false);
  });
});
