/**
 * Gann's double and triple bottoms and tops as buying and selling points
 * (PLAN.md item 5, step 2; W006 pp.20, 46: buy at a double or triple bottom
 * with a stop 1-3 points under it, never more than 3; W006 p.11: a triple
 * bottom that holds the third time; W006 pp.22, 47: sell against a single,
 * double or triple top with a stop 3 points above it). The order rests at the
 * old level; the test of it that fills is the second (or third) bottom.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannOldLevelEntry, selectGannEntry } from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-03-02T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

// Down to a bottom near 40, rally to 48, react toward it but not yet to it.
const FALL = [...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 44, 4)];

describe("computeGannOldLevelEntry", () => {
  it("rests a buy at the old bottom with the stop 3 points under it", () => {
    const t = computeGannOldLevelEntry(bars(FALL), "bullish")!;
    expect(t.kind).toBe("oldLevel");
    expect(t.level).toBeCloseTo(39.7, 8);
    expect(t.reactionEntry).toBe(t.level);
    expect(t.reactionStop).toBeCloseTo(t.level - gannThreePoints(t.level), 8);
    expect(t.stopPrice).toBe(t.reactionStop);
    // Never more than 3 points of risk (A-ENTRY-02), inside the 5-point cap.
    expect(t.reactionEntry - t.reactionStop).toBeCloseTo(gannThreePoints(t.level), 8);
    expect(t.tests).toBe(1);
  });

  it("is the mirror for a short against an old top", () => {
    const mirror = FALL.map((x) => 100 - x);
    const t = computeGannOldLevelEntry(bars(mirror), "bearish")!;
    expect(t.level).toBeCloseTo(60.3, 8);
    expect(t.reactionEntry).toBe(t.level);
    expect(t.reactionStop).toBeCloseTo(t.level + gannThreePoints(t.level), 8);
  });

  it("offers nothing once a later bar has tested the bottom, until that test completes its own bottom", () => {
    // The reaction trades down to the bottom: that test is the buy.
    const tested = [...FALL, ...leg(44, 39.9, 2)];
    expect(computeGannOldLevelEntry(bars(tested), "bullish")).toBeNull();
    // The test holds and rallies: the new bottom is the level for a third test,
    // which counts the earlier bottom at the same level.
    const held = [...tested, ...leg(39.9, 47, 5)];
    const t = computeGannOldLevelEntry(bars(held), "bullish")!;
    expect(t.level).toBeCloseTo(39.6, 8);
    expect(t.tests).toBe(2);
  });

  it("does not count a bottom more than 3 points away as the same level", () => {
    const xs = [...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 44.5, 4), ...leg(44.5, 50, 5), ...leg(50, 47, 4)];
    const t = computeGannOldLevelEntry(bars(xs), "bullish")!;
    expect(t.level).toBeCloseTo(44.2, 8);
    expect(t.tests).toBe(1);
  });

  it("offers no buy for a fourth test once three bottoms have held at the level", () => {
    // Bottoms near 39.7, 39.6 and 39.5 are the triple bottom already made; an
    // order at the level now would buy a fourth test, which double and triple
    // bottoms do not cover.
    const xs = [
      ...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 39.9, 6),
      ...leg(39.9, 48, 6), ...leg(48, 39.8, 6), ...leg(39.8, 48, 6), ...leg(48, 44, 4),
    ];
    expect(computeGannOldLevelEntry(bars(xs), "bullish")).toBeNull();
    expect(selectGannEntry(bars(xs), "bullish")?.kind).not.toBe("oldLevel");
    // The mirror: no sale against a fourth test of a top.
    expect(computeGannOldLevelEntry(bars(xs.map((x) => 100 - x)), "bearish")).toBeNull();
  });

  it("counts only the bottoms since the level last broke by 3 points", () => {
    // A bottom near 40, a break to 35 (more than 3 points under it), then a
    // bottom near 40 again: the break ended the first one, so this is the
    // first bottom of a new level and the order buys its second test.
    const xs = [...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 35, 8), ...leg(35, 48, 8), ...leg(48, 40, 6), ...leg(40, 48, 6), ...leg(48, 44, 4)];
    const t = computeGannOldLevelEntry(bars(xs), "bullish")!;
    expect(t.level).toBeCloseTo(39.7, 8);
    expect(35 - 0.3).toBeLessThan(t.level - gannThreePoints(t.level));
    expect(t.tests).toBe(1);
    // Three bottoms before the break do not make this one a fourth test.
    const triple = [
      ...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 39.9, 6), ...leg(39.9, 48, 6), ...leg(48, 39.8, 6),
      ...leg(39.8, 48, 6), ...leg(48, 35, 8), ...leg(35, 48, 8), ...leg(48, 40, 6), ...leg(40, 48, 6), ...leg(48, 44, 4),
    ];
    expect(computeGannOldLevelEntry(bars(triple), "bullish")).toMatchObject({ kind: "oldLevel", tests: 1 });
  });

  it("counts a bottom a little under the level as a test of it, not a break", () => {
    // Near 39.7, then 38.2 (under it by less than 3 points), then 39.7 again:
    // three tests of one level, so no buy for a fourth.
    const xs = [...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 38.5, 6), ...leg(38.5, 48, 6), ...leg(48, 40, 6), ...leg(40, 48, 6), ...leg(48, 44, 4)];
    expect(38.2).toBeGreaterThan(39.7 - gannThreePoints(39.7));
    expect(computeGannOldLevelEntry(bars(xs), "bullish")).toBeNull();
  });

  it("returns null without a completed bottom", () => {
    expect(computeGannOldLevelEntry(bars(leg(40, 60, 20)), "bullish")).toBeNull();
  });
});

describe("selectGannEntry", () => {
  it("takes the buying point nearer the price", () => {
    // Price 44 sits nearer the old bottom (~39.7) than the crossing line over
    // the 48.3 top (~50.8).
    const near = selectGannEntry(bars(FALL), "bullish")!;
    expect(near.kind).toBe("oldLevel");
    // Price 47.5 sits nearer the crossing line.
    const up = selectGannEntry(bars([...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 47, 3), 47.5]), "bullish")!;
    expect(up.kind).toBe("crossing");
  });

  it("measures a crossing from its 3-point line until it is crossed, not from its buy", () => {
    // Price 45: the old bottom (~39.7) is 5.3 away and the crossing line over
    // the 48.3 top (~51.5) is 6.5 away, but its buy (~49.4) is only 4.4 away.
    // Price has to reach the line first, so the old bottom is nearer.
    const t = selectGannEntry(bars([...leg(60, 40, 8), ...leg(40, 48, 6), ...leg(48, 45, 4)]), "bullish")!;
    expect(t.kind).toBe("oldLevel");
  });
});
