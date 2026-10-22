import { describe, expect, it } from "vitest";
import { fitIntervals, mixAverage } from "@/lib/research/intervalMix";

const YEAR_MS = 365.25 * 86_400_000;

describe("CYC-43: an irregular cycle as a mix of specific intervals (Tomes, W045)", () => {
  it("averages Tomes' two mixes to his long-run figures", () => {
    // 3.244 and 4.542 years in the share that averages 3.446.
    const w = (4.542 - 3.446) / (4.542 - 3.244);
    expect(mixAverage([{ years: 3.244, weight: w }, { years: 4.542, weight: 1 - w }])).toBeCloseTo(3.446, 3);
    // 10.38 and 12.00 years in about 4:3.
    expect(mixAverage([{ years: 10.38, weight: 4 }, { years: 12.0, weight: 3 }])).toBeCloseTo(11.07, 1);
  });

  it("catches turns spaced at 3.244 or 4.542 years that a single 3.446-year count misses", () => {
    const spacings = [3.244, 3.244, 4.542, 3.244, 3.244, 3.244, 4.542, 3.244];
    const turns = [0];
    for (const s of spacings) turns.push(turns[turns.length - 1] + s * YEAR_MS);
    const mix = fitIntervals(turns, [3.244, 4.542]);
    const single = fitIntervals(turns, [3.446]);
    expect(mix.caught).toBe(spacings.length);
    // 3.244 sits 5.9% from 3.446 and 4.542 32%, both outside the 5% tolerance.
    expect(single.caught).toBe(0);
  });
});
