import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPER_TESTS, figuresOn, superTimingAll, superTimingDays } from "@/lib/research/superTiming";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-super-timing.json"), "utf8"));
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

describe("figuresOn", () => {
  it("finds the figures the book reads on its own dates", () => {
    // 4 Dec 1926: Mercury trine Uranus with Saturn conjunct (p.145).
    expect(figuresOn(dayNo("1926-12-04")).some((f) => f.trine.includes("Mercury") && f.trine.includes("Uranus") && f.third === "Saturn")).toBe(true);
    // 8 Sep 1927: Mars opposite the Jupiter-Uranus conjunction, which is trine Saturn (p.145).
    expect(figuresOn(dayNo("1927-09-08")).some((f) => f.third === "Mars" && f.link === "opposition" && f.trine.includes("Saturn"))).toBe(true);
  });
});

describe("superTimingDays", () => {
  it("marks days inside the year only, sorted and unique", () => {
    for (const rule of ["figure", "jupiterIngress"] as const) {
      const d = superTimingDays(rule, 1927);
      expect(d.length).toBeGreaterThan(0);
      expect(new Set(d).size).toBe(d.length);
      expect(d.every((x, i) => x >= 0 && x < 365 && (i === 0 || x > d[i - 1]))).toBe(true);
    }
  });
});

describe("the committed run still says what the module computes", () => {
  it("every rule and outcome set", { timeout: 120_000 }, () => {
    const r = superTimingAll();
    expect(run.tests).toBe(SUPER_TESTS);
    expect(r.map((m) => [m.rule, m.set, m.score.hits])).toEqual(
      run.results.map((m: { rule: string; set: string; hits: number }) => [m.rule, m.set, m.hits]),
    );
    // The finding the docs report: no rule from the book beats chance after the correction.
    for (const m of r) expect(m.score.p).toBeGreaterThan(0.05 / SUPER_TESTS);
  });
});
