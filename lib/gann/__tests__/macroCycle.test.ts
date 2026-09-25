import { describe, expect, it } from "vitest";
import { computeMacroCycle, MACRO_CYCLE_ANCHORS } from "../macroCycle";

describe("computeMacroCycle", () => {
  it("carries exactly the four anchors cited in A2.1 Ch. 7's worked DJIA case study", () => {
    expect(MACRO_CYCLE_ANCHORS.map((a) => a.date)).toEqual([
      "1896-08-01",
      "1907-11-01",
      "1909-01-01",
      "1929-09-01",
    ]);
  });

  it("is inactive far from any projected macro turn", () => {
    const result = computeMacroCycle(new Date("2000-03-15T00:00:00Z"));
    expect(result.active).toBe(false);
    expect(result.bullishActive).toBe(false);
    expect(result.bearishActive).toBe(false);
  });

  it("projects the 60-year 'Great Cycle' bullish window forward from the 1896 low", () => {
    // 1896-08-01 low + 60 years = 1956-08-01.
    const result = computeMacroCycle(new Date("1956-08-01T00:00:00Z"));
    expect(result.active).toBe(true);
    expect(result.bullishActive).toBe(true);
    expect(result.activeWindows).toContainEqual(
      expect.objectContaining({ anchor: "August 1896 bottom", years: 60, bullish: true }),
    );
  });

  it("projects the 20-year cycle bearish window forward from the 1909 top", () => {
    // 1909-01-01 high + 20 years = 1929-01-01 — the same 20-year cycle Gann
    // calls out as the one "most stocks work closer to... than any other".
    const result = computeMacroCycle(new Date("1929-01-01T00:00:00Z"));
    expect(result.active).toBe(true);
    expect(result.bearishActive).toBe(true);
    expect(result.activeWindows).toContainEqual(
      expect.objectContaining({ anchor: "1909 top", years: 20, bullish: false }),
    );
  });

  it("returns upcoming dates sorted ascending and never in the past", () => {
    const asOf = new Date("2026-09-25T00:00:00Z");
    const result = computeMacroCycle(asOf);
    const times = result.dates.map((d) => new Date(`${d}T00:00:00Z`).getTime());
    for (const t of times) expect(t).toBeGreaterThanOrEqual(asOf.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("widens to catch a window just outside the default 3-day tolerance", () => {
    // 1896-08-01 low + 60 years = 1956-08-01. Five days off with the default
    // 3-day window should miss; a wider explicit window should catch it.
    const asOf = new Date("1956-08-06T00:00:00Z");
    expect(computeMacroCycle(asOf).active).toBe(false);
    expect(computeMacroCycle(asOf, 7).active).toBe(true);
  });
});
