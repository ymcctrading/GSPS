import { describe, expect, it } from "vitest";
import {
  PLANETARY_AVERAGES,
  averageDegree,
  familyDegrees,
  meanAndStep,
  planetLongitudes,
  planetaryLevels,
  readAverage,
} from "../planetaryAverages";

// Fixtures from Gann's own records (source note A12): the March 1954 letter's
// heliocentric Uranus, and the Dec 1 1948 Jupiter–Mars conjunction marked on
// his May soy bean chart (B03). Walker's worked average: 90° and 180° → 135°.

describe("the ephemeris against the positions in the 1954 letter and the 1948 chart", () => {
  it("gives heliocentric Uranus 21°52′ Cancer (111.87°) on March 20, 1954", () => {
    const lon = planetLongitudes(new Date("1954-03-20T00:00:00Z"));
    expect(lon.helio.Uranus).toBeCloseTo(111.87, 0);
    expect(Math.abs(lon.helio.Uranus - 111.87)).toBeLessThan(0.2);
  });

  it("gives heliocentric Jupiter near 29°35′ Gemini on the same date (the letter's 60° from 28° Aries)", () => {
    const lon = planetLongitudes(new Date("1954-03-20T00:00:00Z"));
    expect(Math.abs(lon.helio.Jupiter - 89.58)).toBeLessThan(0.5);
  });

  it("puts geocentric Jupiter conjunct Mars on December 1, 1948", () => {
    const lon = planetLongitudes(new Date("1948-12-01T00:00:00Z"));
    expect(Math.abs(lon.geo.Jupiter - lon.geo.Mars)).toBeLessThan(0.5);
  });
});

describe("averages and their resistance points", () => {
  it("averages 90° and 180° to 135° (Walker's worked example)", () => {
    expect(meanAndStep([90, 180])).toEqual({ mean: 135, step: 180 });
    expect(familyDegrees(135, 180)).toEqual([135, 315]);
  });

  it("spaces the six every 60°, the MOF every 72° and the COE every 45°", () => {
    const d = new Date("2026-09-30T00:00:00Z");
    const step = (id: string) => averageDegree(PLANETARY_AVERAGES.find((s) => s.id === id)!, d).step;
    expect(step("six-helio")).toBe(60);
    expect(step("mof-geo")).toBe(72);
    expect(step("coe-helio")).toBe(45);
  });

  it("gives the same resistance points however a planet's 360° wrap is taken", () => {
    const a = [10, 100, 200, 300, 350];
    const b = [370, 100, 200, 300, 350]; // first planet counted past the wrap
    const fa = familyDegrees(meanAndStep(a).mean, 72).map((x) => x.toFixed(6));
    const fb = familyDegrees(meanAndStep(b).mean, 72).map((x) => x.toFixed(6));
    expect(fb).toEqual(fa);
  });

  it("brackets price between two resistance points a step apart", () => {
    const spec = PLANETARY_AVERAGES.find((s) => s.id === "coe-geo")!;
    const r = readAverage(spec, new Date("2026-09-30T00:00:00Z"), 150, 1)!;
    expect(r.below!).toBeLessThanOrEqual(150);
    expect(r.above).toBeGreaterThan(150);
    expect(r.above - r.below!).toBeCloseTo(45, 6);
  });

  it("puts only the Tier A averages into the level list", () => {
    const levels = planetaryLevels(new Date("2026-09-30T00:00:00Z"), 150, 1);
    expect(levels.length).toBe(12);
    expect(levels.some((l) => l.label.startsWith("Jupiter, Saturn, Uranus"))).toBe(false);
  });
});
