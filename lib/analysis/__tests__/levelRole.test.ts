import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { countLevelTests, levelRole, levelTestConfidence } from "../levelRole";

function bar(price: number, rangeHalf = 0.5): Bar {
  return { t: "2026-01-01T00:00:00Z", o: price, h: price + rangeHalf, l: price - rangeHalf, c: price, v: 1000 };
}

describe("countLevelTests", () => {
  it("returns 0 for an invalid level or band", () => {
    expect(countLevelTests([bar(100)], 0, 1)).toBe(0);
    expect(countLevelTests([bar(100)], 100, 0)).toBe(0);
  });

  it("counts a single sustained touch as one test, not one per bar", () => {
    const bars = [bar(100), bar(100), bar(100), bar(100)];
    expect(countLevelTests(bars, 100, 1)).toBe(1);
  });

  it("requires price to leave the band before counting a new test", () => {
    // Touch, leave, touch, leave, touch -- 3 distinct tests.
    const bars = [bar(100), bar(120), bar(100), bar(120), bar(100)];
    expect(countLevelTests(bars, 100, 1)).toBe(3);
  });

  it("counts a fourth distinct approach", () => {
    const bars = [bar(100), bar(120), bar(100), bar(120), bar(100), bar(120), bar(100)];
    expect(countLevelTests(bars, 100, 1)).toBe(4);
  });
});

describe("levelTestConfidence", () => {
  it("reads 0 tests as untested", () => {
    expect(levelTestConfidence(0)).toBe("untested");
  });

  it("reads 1-3 tests as reliable", () => {
    expect(levelTestConfidence(1)).toBe("reliable");
    expect(levelTestConfidence(3)).toBe("reliable");
  });

  it("reads the 4th test onward as caution, per Gann's own rule", () => {
    expect(levelTestConfidence(4)).toBe("caution");
    expect(levelTestConfidence(9)).toBe("caution");
  });
});

describe("levelRole", () => {
  it("still reads support at or above the level and resistance below", () => {
    expect(levelRole(100, 100)).toBe("support");
    expect(levelRole(101, 100)).toBe("support");
    expect(levelRole(99, 100)).toBe("resistance");
  });
});
