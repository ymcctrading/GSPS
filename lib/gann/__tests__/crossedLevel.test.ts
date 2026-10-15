/**
 * The crossed level holds until it is bought or broken (PLAN.md item 5, the
 * map's defect 1; W006 pp.20, 46-47: "old top 50, advance to 53, buy 51 down
 * to 48, stop 47"). A reaction long enough to complete a new swing top must
 * not move the buying point off the level that was crossed; only a close 3
 * points through it ends it.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-03-02T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

// Up to an old top near 50, react to 44, then a rally that closes at 56
// (well past 50 + 3 points) and a 4-day reaction back to 51.5.
const BASE = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 56, 8)];
const REACTION = leg(56, 51.5, 4);

describe("the crossed level persists through the reaction", () => {
  it("keeps buying the crossed top after a reaction completes a new top", () => {
    const before = computeGannEntryTrigger(bars(BASE), "bullish")!;
    const t = computeGannEntryTrigger(bars([...BASE, ...REACTION]), "bullish")!;
    expect(t.level).toBeCloseTo(before.level, 8);
    expect(t.level).toBeLessThan(51);
    expect(t.reactionEntry).toBeCloseTo(t.level + gannThreePoints(t.level) / 3, 8);
  });

  it("does not hold a level that closes past it by less than 3 points", () => {
    // Closes reach 53, past the 50.3 top but short of its 3-point line (~54).
    const shy = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 53, 8), ...leg(53, 51.5, 4)];
    const t = computeGannEntryTrigger(bars(shy), "bullish")!;
    expect(t.level).toBeGreaterThan(53);
  });

  it("lets the level go once a close breaks it by 3 points", () => {
    const broken = [...BASE, ...REACTION, ...leg(51.5, 45, 3)];
    const t = computeGannEntryTrigger(bars(broken), "bullish");
    expect(t?.level).not.toBeCloseTo(computeGannEntryTrigger(bars(BASE), "bullish")!.level, 4);
  });

  it("holds the broken bottom for a short in the mirror case", () => {
    const mirror = (xs: number[]) => xs.map((x) => 100 - x);
    const before = computeGannEntryTrigger(bars(mirror(BASE)), "bearish")!;
    const t = computeGannEntryTrigger(bars(mirror([...BASE, ...REACTION])), "bearish")!;
    expect(t.level).toBeCloseTo(before.level, 8);
    expect(t.reactionEntry).toBeCloseTo(t.level - gannThreePoints(t.level) / 3, 8);
  });
});
