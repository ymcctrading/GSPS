/**
 * CYC-52 (Dewey, W040 p. 4, applied to `decadeCycle.ts`): the decade digit's
 * bull and bear years are a recurrent-event calendar claim, so each digit's
 * hit rate is reported against a base rate from shuffled digits.
 */
import { describe, expect, it } from "vitest";
import { computeDecadeCycle } from "@/lib/gann/decadeCycle";
import { decadeDigitBaseRate } from "@/lib/research/decadeBaseRate";
import { seeded } from "@/lib/research/preregisteredTimeTests";

const years = Array.from({ length: 120 }, (_, i) => 1900 + i);
const bias = (y: number) => computeDecadeCycle(new Date(Date.UTC(y, 6, 1))).bias;

describe("the decade digit against shuffled digits (CYC-52)", () => {
  it("gives returns that follow the digit's bias a small p, and reports each digit", () => {
    const rows = years.map((y) => ({ year: y, ret: bias(y) === "bullish" ? 10 : bias(y) === "bearish" ? -10 : 1 }));
    const r = decadeDigitBaseRate(rows, { draws: 199, seed: 52 });
    expect(r.hitRate).toBe(1);
    expect(r.p).toBeLessThan(0.01);
    expect(r.digits.map((d) => d.digit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const scored = r.digits.filter((d) => d.bias !== "mixed");
    expect(scored.every((d) => d.years === 12 && d.hitRate === 1 && d.baseMean < 1)).toBe(true);
    expect(r.digits.filter((d) => d.bias === "mixed").every((d) => d.hits === 0 && d.hitRate === null)).toBe(true);
  });

  it("gives random returns a large p", () => {
    const rand = seeded(7);
    const rows = years.map((y) => ({ year: y, ret: rand() - 0.5 }));
    expect(decadeDigitBaseRate(rows, { draws: 199, seed: 52 }).p).toBeGreaterThan(0.05);
  });
});
