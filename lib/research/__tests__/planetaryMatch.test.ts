import { describe, expect, it } from "vitest";
import { matchPlanetaryPeriod } from "../crossSeries";
import { SIDEREAL_DAYS, synodicPeriod } from "../planetaryPeriods";

const BAND = { minPeriod: 30, maxPeriod: 40000 };

describe("matchPlanetaryPeriod (C-ASTRO-03, research only)", () => {
  it("matches 19.875 years to the Jupiter-Saturn synodic period", () => {
    const r = matchPlanetaryPeriod(19.875 * 365.25, BAND);
    expect(r.matches.map((m) => m.label)).toContain("Jupiter-Saturn synodic");
  });

  it("reports the rate at which a random period in the band would match", () => {
    const r = matchPlanetaryPeriod(19.875 * 365.25, BAND);
    expect(r.chanceRate).toBeGreaterThan(0);
    expect(r.chanceRate).toBeLessThan(1);
    // Monte Carlo check of the chance rate: log-uniform random periods over the band.
    let hits = 0;
    const n = 20000;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const p = Math.exp(Math.log(BAND.minPeriod) + rand() * (Math.log(BAND.maxPeriod) - Math.log(BAND.minPeriod)));
      if (matchPlanetaryPeriod(p, BAND).matches.length > 0) hits++;
    }
    expect(Math.abs(hits / n - r.chanceRate)).toBeLessThan(0.02);
  });

  it("finds no match far from every period, and a wider tolerance raises the chance rate", () => {
    const sidereal = Object.values(SIDEREAL_DAYS);
    const r = matchPlanetaryPeriod(1500, { ...BAND, tolerance: 0.01 });
    expect(r.matches).toEqual([]);
    expect(sidereal.length).toBeGreaterThan(0);
    const wide = matchPlanetaryPeriod(1500, { ...BAND, tolerance: 0.1 });
    expect(wide.chanceRate).toBeGreaterThan(r.chanceRate);
  });

  it("matches the synodic period itself and marks the result a hypothesis", () => {
    const r = matchPlanetaryPeriod(synodicPeriod(SIDEREAL_DAYS.Jupiter, SIDEREAL_DAYS.Saturn), BAND);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.hypothesisOnly).toBe(true);
  });
});
