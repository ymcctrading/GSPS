import { describe, expect, it } from "vitest";
import { planetLongitudes } from "@/lib/gann/planetaryAverages";
import { saturnReturn, SATURN_RETURN_LABEL } from "../saturnReturn";

describe("saturnReturn (C-ASTRO-02, research only)", () => {
  it("finds the day Saturn comes back to its place at the anchor, about 29.4 years on", () => {
    const anchor = new Date("2000-01-03T00:00:00Z");
    const r = saturnReturn(anchor)!;
    expect(r.years).toBeGreaterThan(29.2);
    expect(r.years).toBeLessThan(29.7);
    const back = planetLongitudes(new Date(`${r.returnDate}T12:00:00Z`)).helio.Saturn;
    const off = Math.abs(((back - r.anchorLongitude + 540) % 360) - 180);
    expect(off).toBeLessThan(0.05);
  });

  it("reports how far the return falls before the 30-year count", () => {
    const r = saturnReturn(new Date("1987-10-19T00:00:00Z"))!;
    expect(r.thirtyYearDate).toBe("2017-10-19");
    expect(r.daysBeforeThirtyYear).toBeGreaterThan(100);
    expect(r.daysBeforeThirtyYear).toBeLessThan(300);
  });

  it("carries the research-only label", () => {
    const r = saturnReturn(new Date("2000-01-03T00:00:00Z"))!;
    expect(r.label).toBe(SATURN_RETURN_LABEL);
    expect(r.hypothesisOnly).toBe(true);
    expect(SATURN_RETURN_LABEL).toMatch(/research only/i);
  });

  it("returns null for an invalid date", () => {
    expect(saturnReturn(new Date("nope"))).toBeNull();
  });
});
