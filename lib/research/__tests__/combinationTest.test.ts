import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHOOSE_YEARS, COMBO_TESTS, DOW_TEST_YEARS, MODERN_YEARS, allCombinations, comboDays, featureDays, runCombinationTest } from "@/lib/research/combinationTest";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-combination-test.json"), "utf8"));

describe("the spans", () => {
  it("never score a combination on a year it was chosen on", () => {
    for (const y of [...DOW_TEST_YEARS, ...MODERN_YEARS]) expect(CHOOSE_YEARS).not.toContain(y);
  });
});

describe("comboDays", () => {
  it("marks a day only when every member marks it", () => {
    const c = { kind: "all" as const, features: ["stations", "latitude"] as ("stations" | "latitude")[] };
    const a = featureDays("stations", 1925, "dowNine");
    const b = featureDays("latitude", 1925, "dowNine");
    expect(comboDays(c, 1925, "dowNine")).toEqual([...a].filter((d) => b.has(d)).sort((x, y) => x - y));
  });
});

describe("the committed run still says what the module computes", () => {
  it("the picks and their out-of-sample scores", { timeout: 300_000 }, () => {
    const r = runCombinationTest();
    expect(run.considered).toBe(allCombinations().length);
    expect(run.kept).toBe(r.kept);
    expect(run.tests).toBe(COMBO_TESTS);
    expect(r.picks.map((p) => [p.label, ...p.tests.map((t) => t.hits)])).toEqual(
      run.picks.map((p: { combination: string; tests: { hits: number }[] }) => [p.combination, ...p.tests.map((t) => t.hits)]),
    );
    // The finding the docs report: no chosen combination times turns it hasn't seen after the correction.
    for (const p of r.picks) for (const t of p.tests) expect(t.p).toBeGreaterThan(0.05 / COMBO_TESTS);
  });
});
