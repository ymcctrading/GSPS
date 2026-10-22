import { describe, expect, it } from "vitest";
import { compareMaleficCycles } from "@/lib/research/maleficCycles";

describe("A-ASTRO-11: Jensen's square family on the W036 malefic dates (W036, 1919-1921)", () => {
  it("is no more common on the malefic days than off them, so it does not reconstruct them", () => {
    const { inside, outside } = compareMaleficCycles();
    expect(inside.days).toBe(185);
    expect(outside.days).toBe(911);
    // Pinned from the deterministic ephemeris, 2026-10-21.
    expect([inside.bearishBias, inside.anySquare, inside.triggeredSquare]).toEqual([106, 110, 4]);
    expect([outside.bearishBias, outside.anySquare, outside.triggeredSquare]).toEqual([505, 665, 25]);
    const share = (n: number, d: number) => n / d;
    // No lift on any reading: within 3 points for the bias, below for the rest.
    expect(share(inside.bearishBias, inside.days) - share(outside.bearishBias, outside.days)).toBeLessThan(0.03);
    expect(share(inside.anySquare, inside.days)).toBeLessThan(share(outside.anySquare, outside.days));
    expect(share(inside.triggeredSquare, inside.days)).toBeLessThan(share(outside.triggeredSquare, outside.days));
  });
});
