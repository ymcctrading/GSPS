import { describe, expect, it } from "vitest";
import {
  filterDirection,
  hasMassiveVelocity,
  MAX_SETUPS,
  processProtocolReversions,
} from "./waterfall";
import type { Direction, ScannedAsset } from "./types";

let seq = 0;
function asset(overrides: Partial<ScannedAsset> = {}): ScannedAsset {
  seq += 1;
  return {
    symbol: `SYM${seq}`,
    score: 9,
    passesStratBarrier: true,
    direction: "bullish",
    relativeVolume: 1.0,
    atrExpansion: false,
    ...overrides,
  };
}

describe("hasMassiveVelocity", () => {
  it("is true when RVOL >= 2.0", () => {
    expect(hasMassiveVelocity(asset({ relativeVolume: 2.0 }))).toBe(true);
    expect(hasMassiveVelocity(asset({ relativeVolume: 1.99 }))).toBe(false);
  });
  it("is true when ATR is expanding", () => {
    expect(
      hasMassiveVelocity(asset({ relativeVolume: 1.0, atrExpansion: true })),
    ).toBe(true);
  });
});

describe("filterDirection", () => {
  it("drops anything that fails the Strat barrier regardless of score", () => {
    const out = filterDirection([
      asset({ symbol: "FAIL", score: 9, passesStratBarrier: false }),
      asset({ symbol: "PASS", score: 8, passesStratBarrier: true }),
    ]);
    expect(out.map((a) => a.symbol)).toEqual(["PASS"]);
  });

  it("captures score 8 and 9 in tier 1", () => {
    const out = filterDirection([
      asset({ score: 9 }),
      asset({ score: 8 }),
      asset({ score: 6 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((a) => a.setupTier === "PRISTINE")).toBe(true);
  });

  it("does NOT fall back to 7s when 15 pristine setups already exist", () => {
    const pristine = Array.from({ length: 15 }, () => asset({ score: 8 }));
    const velocitySeven = asset({
      score: 7,
      relativeVolume: 5,
      atrExpansion: true,
    });
    const out = filterDirection([...pristine, velocitySeven]);
    expect(out).toHaveLength(15);
    expect(out.every((a) => a.score >= 8)).toBe(true);
  });

  it("falls back to score-7 ONLY with massive velocity when short of 15", () => {
    const fivePristine = Array.from({ length: 5 }, () => asset({ score: 9 }));
    const sevenFast = asset({ score: 7, relativeVolume: 2.5 }); // qualifies
    const sevenSlow = asset({ score: 7, relativeVolume: 1.2 }); // rejected
    const out = filterDirection([...fivePristine, sevenFast, sevenSlow]);
    expect(out).toHaveLength(6);
    expect(out.find((a) => a.symbol === sevenFast.symbol)).toBeDefined();
    expect(out.find((a) => a.symbol === sevenSlow.symbol)).toBeUndefined();
    expect(out.find((a) => a.symbol === sevenFast.symbol)?.setupTier).toBe(
      "VELOCITY",
    );
  });

  it("never returns score < 7", () => {
    const out = filterDirection([
      asset({ score: 6, relativeVolume: 9, atrExpansion: true }),
      asset({ score: 5, relativeVolume: 9, atrExpansion: true }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("sorts by score desc then RVOL desc, and slices to top 15", () => {
    const candidates: ScannedAsset[] = [
      asset({ symbol: "A", score: 8, relativeVolume: 1.0 }),
      asset({ symbol: "B", score: 9, relativeVolume: 1.0 }),
      asset({ symbol: "C", score: 9, relativeVolume: 3.0 }), // highest
      ...Array.from({ length: 20 }, () => asset({ score: 8 })),
    ];
    const out = filterDirection(candidates);
    expect(out).toHaveLength(MAX_SETUPS);
    expect(out[0].symbol).toBe("C"); // 9 + RVOL 3.0 wins
    expect(out[1].symbol).toBe("B"); // 9 + RVOL 1.0
    expect(out.every((a, i) => i === 0 || out[i - 1].score >= a.score)).toBe(
      true,
    );
    expect(out.map((a) => a.rank)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });
});

describe("processProtocolReversions", () => {
  it("splits bullish and bearish and runs the waterfall on each", () => {
    const universe: ScannedAsset[] = [
      asset({ direction: "bullish", score: 9 }),
      asset({ direction: "bullish", score: 8 }),
      asset({ direction: "bearish", score: 9 }),
      asset({
        direction: "bearish",
        score: 7,
        relativeVolume: 3,
        passesStratBarrier: true,
      }),
      asset({ direction: "bearish", score: 4 }), // dropped
    ];
    const { bullishReversions, bearishReversions } =
      processProtocolReversions(universe);
    expect(bullishReversions).toHaveLength(2);
    expect(bearishReversions.map((a) => a.score)).toEqual([9, 7]);
  });

  it("caps each side independently at 15", () => {
    const many = (d: Direction) =>
      Array.from({ length: 40 }, () => asset({ direction: d, score: 8 }));
    const { bullishReversions, bearishReversions } = processProtocolReversions([
      ...many("bullish"),
      ...many("bearish"),
    ]);
    expect(bullishReversions).toHaveLength(15);
    expect(bearishReversions).toHaveLength(15);
  });
});
