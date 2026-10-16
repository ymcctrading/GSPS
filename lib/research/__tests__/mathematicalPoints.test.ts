/**
 * C-LEVELS-13 (Awodele, W007 p. 67, quoting the method without a source):
 * every stopping price is a mathematical point, a division of 360°, the
 * square of 12, the square of 20, or the square or halfway point of another
 * number. Research: the share of swing extremes near such a point against
 * prices placed at random.
 */
import { describe, expect, it } from "vitest";
import { isMathematicalPoint, mathematicalPointLevels, mathematicalPointsBaseRate } from "@/lib/research/mathematicalPoints";
import { seeded } from "@/lib/research/preregisteredTimeTests";

describe("mathematical points (C-LEVELS-13)", () => {
  it("lists divisions of 360, multiples of 144 and 400, and squares with their halfway points", () => {
    const near150 = mathematicalPointLevels(100, 200);
    for (const x of [135, 144, 120, 180, 121, 144, 169, 196, 132.5, 156.5]) expect(near150).toContain(x);
    expect(mathematicalPointLevels(380, 420)).toContain(400);
    expect(isMathematicalPoint(169.4, 0.5)).toBe(true);
    expect(isMathematicalPoint(127, 0.5)).toBe(false);
  });

  it("gives a small p to extremes planted on the points and a large one to random extremes", () => {
    const rand = seeded(13);
    const planted = Array.from({ length: 60 }, () => {
      const n = 8 + Math.floor(rand() * 20);
      return n * n;
    });
    const r1 = mathematicalPointsBaseRate(planted, { draws: 199, seed: 1 });
    expect(r1.observed).toBe(1);
    expect(r1.p).toBeLessThan(0.01);
    const random = Array.from({ length: 60 }, () => 50 + rand() * 400);
    const r2 = mathematicalPointsBaseRate(random, { draws: 199, seed: 1 });
    expect(r2.p).toBeGreaterThan(0.05);
    expect(r2.baseMean).toBeGreaterThan(0);
  });
});
