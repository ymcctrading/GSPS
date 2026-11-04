import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASPECT_RULES, ASPECT_TESTS, aspectEvents, aspectRule, callAspectMatches, grandFigures } from "@/lib/research/aspectTiming";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-aspect-timing.json"), "utf8"));

describe("aspectEvents", () => {
  it("dates the slow conjunctions the almanacs record", () => {
    const has = (year: number, a: string, b: string, angle: number, date: string) =>
      aspectEvents(year).some((e) => e.a === a && e.b === b && e.angle === angle && e.date === date);
    // The Jupiter-Saturn conjunction of 10 Sep 1921 and the 1919 Saturn-Uranus opposition.
    expect(has(1921, "Jupiter", "Saturn", 0, "1921-09-10")).toBe(true);
    expect(has(1919, "Saturn", "Uranus", 180, "1919-01-26")).toBe(true);
  });

  it("finds no grand cross with a grand trine on the two dates the videos name", () => {
    for (const d of ["1908-08-08", "1909-09-30"]) {
      for (const wide of [false, true]) {
        const g = grandFigures(d, wide);
        expect(g.trines.length > 0 && g.crosses.length > 0).toBe(false);
      }
    }
  });
});

describe("the committed run still says what the module computes", () => {
  it("every rule", { timeout: 120_000 }, () => {
    expect(run.tests).toBe(ASPECT_TESTS);
    expect(run.rules.map((r: { rule: string }) => r.rule)).toEqual([...ASPECT_RULES]);
    for (const row of run.rules) {
      const r = aspectRule(row.rule);
      expect([r.calls.hits, r.nine.hits, r.three.hits]).toEqual([row.calls.hits, row.nine.hits, row.three.hits]);
      // The finding the docs report: no rule times the Dow's turns beyond chance after the correction.
      expect(r.nine.p).toBeGreaterThan(0.05 / ASPECT_TESTS);
      expect(r.three.p).toBeGreaterThan(0.05 / ASPECT_TESTS);
    }
    // And the one that clears it: the published calls sit on slow-planet aspects more often than chance,
    // while the calls that do caught few turns.
    const slow = run.rules.find((r: { rule: string }) => r.rule === "slowPairs");
    expect(slow.calls.p).toBeLessThan(0.05 / ASPECT_TESTS);
    const matched = callAspectMatches("slowPairs");
    expect(matched.length).toBe(run.callMatches.slowPairs.length);
    expect(matched.filter((m) => m.hit).length).toBe(2);
  });
});
