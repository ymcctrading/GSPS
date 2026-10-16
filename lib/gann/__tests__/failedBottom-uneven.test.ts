import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { beyondByThreePoints } from "@/lib/gann/pointScale";
function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
describe("review 24: the bottom mirror of A-LEVELS-04 / C-LEVELS-06 on uneven bottoms", () => {
  const leg = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * (i + 1)) / n) * 100) / 100);
  // Tests at ~89.5 and ~86.5 (mean 88), then a bounce that holds.
  const bottoms = [...leg(110, 90, 6), ...leg(90, 98, 5), ...leg(98, 87, 6), ...leg(87, 90, 3)];
  it("fails 3 points over the tests' mean, not over the lowest test", () => {
    const between = (beyondByThreePoints(88, 1) + beyondByThreePoints(86.5, 1)) / 2;
    expect(readMultipleTops(bars([...bottoms, between])).bottom?.state).not.toBe("failed");
    const over = beyondByThreePoints(88, 1) + 0.3;
    expect(readMultipleTops(bars([...bottoms, over])).bottom).toMatchObject({ state: "failed", level: 86.5 });
  });
  it("is crossed only 3 points under the lowest test", () => {
    const between = (beyondByThreePoints(88, -1) + beyondByThreePoints(86.5, -1)) / 2;
    expect(readMultipleTops(bars([...bottoms, between])).bottom?.state).not.toBe("crossed");
    expect(readMultipleTops(bars([...bottoms, beyondByThreePoints(86.5, -1) - 0.3])).bottom?.state).toBe("crossed");
  });
});
