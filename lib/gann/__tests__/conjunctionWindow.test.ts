/**
 * C-TIME-35 (class C, not from the method's own books; Awodele 2013 p. 44):
 * run the cycle analysis only on bars between two heliocentric Jupiter-Saturn
 * conjunctions. Research only: nothing here is read by a score, gate, plan or
 * the setup's context.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bar } from "@/lib/types";
import { barsBetween, jupiterSaturnConjunctions, spectralCycleBetween } from "@/lib/gann/conjunctionWindow";
import { detectSpectralCycle } from "@/lib/gann/spectralCycle";

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

describe("heliocentric Jupiter-Saturn conjunctions", () => {
  it("dates the conjunctions the source names (1981, 2000, 2020) to within a day or two", () => {
    const found = jupiterSaturnConjunctions(new Date("1975-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
    expect(found).toHaveLength(3);
    // The source's dates: 16 Apr 1981, 22 Jun 2000, 2 Nov 2020.
    expect(days(found[0], "1981-04-16")).toBeLessThanOrEqual(2);
    expect(days(found[1], "2000-06-22")).toBeLessThanOrEqual(2);
    expect(days(found[2], "2020-11-02")).toBeLessThanOrEqual(2);
  });
});

describe("the cycle window (C-TIME-35)", () => {
  const bars: Bar[] = Array.from({ length: 900 }, (_, i) => {
    const c = 100 + 10 * Math.sin((2 * Math.PI * i) / 60);
    return { t: new Date(Date.UTC(2020, 0, 1) + i * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });

  it("keeps only the bars inside the two dates", () => {
    const inside = barsBetween(bars, "2020-06-01", "2021-06-01");
    expect(inside[0].t.slice(0, 10)).toBe("2020-06-01");
    expect(inside[inside.length - 1].t.slice(0, 10)).toBe("2021-06-01");
    expect(inside.every((b) => b.t.slice(0, 10) >= "2020-06-01" && b.t.slice(0, 10) <= "2021-06-01")).toBe(true);
  });

  it("analyses exactly those bars", () => {
    const r = spectralCycleBetween(bars, "2020-03-01", "2021-12-31");
    expect(r.window).toEqual({ from: "2020-03-01", to: "2021-12-31", bars: barsBetween(bars, "2020-03-01", "2021-12-31").length });
    expect(r.reading).toEqual(detectSpectralCycle(barsBetween(bars, "2020-03-01", "2021-12-31")));
  });

  it("is research only: no scoring, gating or context module imports it", () => {
    for (const f of ["lib/gann/disclosedRules.ts", "lib/gann/contextFactors.ts", "lib/scoring/score.ts", "lib/scanTicker.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/conjunctionWindow/);
    }
  });
});
