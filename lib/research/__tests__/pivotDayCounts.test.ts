import { describe, expect, it } from "vitest";
import { PIVOT_DAY_COUNTS, closeOnlyPivots, clusterBaseRate, clusterOn, projectedDays } from "@/lib/research/pivotDayCounts";

const DAY = 86_400_000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("C-TIME-45: day counts from every 2% pivot (Vera/Ferrera, W035)", () => {
  it("keeps the source's twelve counts, each within 3 days of one of the method's fractions of the year", () => {
    expect(PIVOT_DAY_COUNTS).toEqual([46, 61, 91, 121, 137, 182, 227, 242, 272, 317, 333, 365]);
    const fractions = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 11 / 12, 1];
    PIVOT_DAY_COUNTS.forEach((n, i) => expect(Math.abs(n - fractions[i] * 365.25)).toBeLessThan(3));
  });

  it("marks a pivot only on a 2% reversal of the close", () => {
    expect(closeOnlyPivots([100, 101, 103, 101.5, 100.8, 103, 99])).toEqual([0, 2, 4, 5]);
    expect(closeOnlyPivots([100, 101, 100.5, 101.2])).toEqual([]);
  });

  it("counts projections landing together", () => {
    const proj = projectedDays([0, 91 - 46]);
    expect(clusterOn(91, proj)).toBe(2); // 0 + 91 and 45 + 46
  });

  it("measures how common each cluster is on random walks before any date is shown", () => {
    const rnd = mulberry32(7);
    const sessions: number[] = [];
    const closes: number[] = [];
    let c = 100;
    for (let i = 0, t = Date.parse("2010-01-04T00:00:00Z"); i < 2500; i++, t += DAY) {
      if (new Date(t).getUTCDay() % 6 === 0) continue;
      c *= 1 + (rnd() - 0.5) * 0.03;
      sessions.push(t);
      closes.push(c);
    }
    const r = clusterBaseRate(sessions, closes);
    expect(r.days).toBeGreaterThan(1000);
    // Shares only fall as the cluster grows; the figures are the base rate a
    // cluster on real turns has to beat.
    for (let k = 2; k <= 6; k++) expect(r.atLeast[k]).toBeLessThanOrEqual(r.atLeast[k - 1]);
    expect(r.atLeast[1]).toBeGreaterThan(0.5);
  });
});
