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
import { gannThreePoints, gannThreePointsPct } from "@/lib/gann/pointScale";

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-03-02T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

// Up to an old top near 50, react to 44, then a rally that closes at 56
// (well past 50 + 3 points) and a 4-day reaction back to 52, which stays
// above the buy 1 point over the level (about 51.2).
const BASE = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 56, 8)];
const REACTION = leg(56, 52, 4);

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

describe("which crossed level is held, and when it ends", () => {
  it("keeps the held level's trade when the swing low since the crossing sits above it", () => {
    // Cross 50 on the way to 62, react only to 58 (its bottom is far above the
    // level's 3-point line), then edge up to 61. The protective swing would
    // put the stop above the crossing line; the held level must still trade.
    const xs = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 62, 8), ...leg(62, 58, 4), ...leg(58, 61, 4)];
    const t = computeGannEntryTrigger(bars(xs), "bullish")!;
    expect(t).not.toBeNull();
    expect(t.held).toBe(true);
    expect(t.level).toBeLessThan(51);
    expect(t.stopPrice).toBeCloseTo(t.level - gannThreePoints(t.level), 8);
    expect(t.crossedAt).not.toBeNull();
  });

  it("holds the level crossed most recently, not the top formed most recently", () => {
    // Older top near 50, newer lower top near 47. One rally crosses 47 first
    // and 50 later, so 50 is the live level.
    const xs = [...leg(40, 50, 6), ...leg(50, 40, 6), ...leg(40, 47, 5), ...leg(47, 43, 4), ...leg(43, 56, 13)];
    const t = computeGannEntryTrigger(bars(xs), "bullish")!;
    expect(t.held).toBe(true);
    expect(t.level).toBeCloseTo(50.3, 8);
  });

  it("holds the higher top when one close crosses two", () => {
    const xs = [...leg(40, 50, 6), ...leg(50, 40, 6), ...leg(40, 47, 5), ...leg(47, 43, 4), 44, 56];
    const t = computeGannEntryTrigger(bars(xs), "bullish")!;
    expect(t.held).toBe(true);
    expect(t.level).toBeCloseTo(50.3, 8);
  });

  it("lets the level go once a reaction reaches the buy 1 point past it", () => {
    // The reaction to 51.5 trades through the buy near 51.2: the level is bought.
    const t = computeGannEntryTrigger(bars([...BASE, ...leg(56, 51.5, 4)]), "bullish")!;
    expect(t.held).toBe(false);
    expect(t.level).toBeGreaterThan(56);
  });

  it("does not count the crossing bar's own range as the reaction", () => {
    // One bar from 50 to 54.5 whose low sits under the buy: not yet bought.
    const xs = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 50, 4)];
    const wide: Bar[] = [...bars(xs), { t: "2026-04-01T00:00:00Z", o: 50, h: 54.8, l: 49.8, c: 54.5, v: 1e6 }];
    const t = computeGannEntryTrigger(wide, "bullish")!;
    expect(t.held).toBe(true);
    expect(t.level).toBeCloseTo(50.3, 8);
  });

  it("does not revive an older crossed level once the newest is broken", () => {
    // 50 is crossed and held, then 62 is crossed and broken back by 3 points
    // while price stays well above 50's buy.
    const xs = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 62, 8), ...leg(62, 55, 4), ...leg(55, 67, 6), ...leg(67, 57, 3)];
    const t = computeGannEntryTrigger(bars(xs), "bullish")!;
    expect(t.held).toBe(false);
    expect(t.level).toBeGreaterThan(62);
  });

  it("ignores closes made before the top formed", () => {
    // Closes near 60 come before the top at 50; they did not cross it.
    const xs = [...leg(30, 60, 6), ...leg(60, 40, 6), ...leg(40, 50, 5), ...leg(50, 45, 4)];
    const t = computeGannEntryTrigger(bars(xs), "bullish")!;
    expect(t.held).toBe(false);
  });

  it("counts a close exactly on the 3-point line as the crossing", () => {
    const head = [...leg(40, 50, 6), ...leg(50, 44, 4), ...leg(44, 49, 4)];
    const level = 50.3;
    const line = level * (1 + gannThreePointsPct(level) / 100);
    const t = computeGannEntryTrigger(bars([...head, line]), "bullish")!;
    expect(t.level).toBe(level);
    expect(t.held).toBe(true);
  });
});
