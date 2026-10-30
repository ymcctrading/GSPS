import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REBUILD_METHODS, methodDays, rebuildAll, yearlyExtremes } from "@/lib/research/forecastRebuild";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-forecast-rebuild.json"), "utf8"));

describe("methodDays", () => {
  it("reads no turn on or after the issue date", () => {
    // 1929's forecast was issued 23 Nov 1928. A swing on 28 Nov 1928 (299.35) must not move its days.
    const before = methodDays("wheel", "1928-11-23", 1929);
    const after = methodDays("wheel", "1928-12-31", 1929);
    expect([...before].sort()).not.toEqual([...after].sort());
    expect(methodDays("wheel", "1928-11-23", 1929)).toEqual(before);
  });

  it("marks the calendar methods the same days every year", () => {
    expect(methodDays("fixedCalendar", "1918-12-16", 1919).size).toBe(methodDays("fixedCalendar", "1921-11-30", 1922).size);
    // Mar 21 (the full seasonal year) is day 79 of 1919, and the tolerance is two days.
    expect(methodDays("seasonal", "1918-12-16", 1919).has(79)).toBe(true);
    expect(methodDays("seasonal", "1918-12-16", 1919).has(77)).toBe(true);
  });

  it("takes a year's extremes only from finished years", () => {
    const ys = yearlyExtremes();
    expect(ys.find((x) => x.date === "1929-09-03")?.kind).toBe("high");
    expect(ys.find((x) => x.date === "1921-08-24")?.kind).toBe("low");
  });
});

describe("the committed run still says what the module computes", () => {
  it("both anchor sets, every method", { timeout: 60_000 }, () => {
    for (const [key, set] of [
      ["primary", "nine"],
      ["yearlyAnchors", "yearly"],
    ] as const) {
      const r = rebuildAll(set);
      expect(run[key].map((m: { method: string }) => m.method)).toEqual([...REBUILD_METHODS]);
      expect(run[key].map((m: { calls: { hits: number } }) => m.calls.hits)).toEqual(r.map((m) => m.calls.hits));
      expect(run[key].map((m: { turns: { hits: number } }) => m.turns.hits)).toEqual(r.map((m) => m.turns.hits));
      // The finding the docs report: no built method rebuilds the published calls beyond chance.
      for (const m of r) expect(m.calls.p).toBeGreaterThan(0.05);
    }
  });
});
