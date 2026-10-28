import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { factorName, publicFactors, planLevelsParam } from "@/lib/backtest/factorLabels";
import type { FactorAttribution } from "@/lib/backtest/attribution";
import { CRITERION_KEYS } from "@/lib/scoring/weights";

/** Every id the score breakdown can put on a backtest factor row. */
function breakdownKeys(): string[] {
  const source = readFileSync(path.resolve(__dirname, "../../scoring/score.ts"), "utf8");
  return [...new Set([...source.matchAll(/\bkey: "([A-Za-z]+)"/g)].map((m) => m[1]))];
}

const arm = { n: 1, winRate: 0, expectancyR: 0 } as FactorAttribution["passed"];
const row = (criterion: string): FactorAttribution => ({ criterion, observed: 2, passed: arm, failed: arm, verdict: "insufficient" });

describe("factorName", () => {
  it("names every breakdown id, so no internal id reaches the browser", () => {
    const keys = [...CRITERION_KEYS, ...breakdownKeys()];
    expect(keys.length).toBeGreaterThan(CRITERION_KEYS.length + 10);
    for (const key of keys) {
      const { id, label, kind } = factorName(key);
      expect(kind, key).not.toBe("other");
      expect(`${id} ${label}`, key).not.toMatch(/gann|rule ?of ?three|square|swing|historical|close|balance|halfway|percent|window|round/i);
      if (kind !== "point") expect(label, key).toMatch(/^(Check \d+ under |Execute condition \d+$)/);
    }
  });

  it("falls back to a neutral name for an unknown id", () => {
    expect(factorName("someNewCheck", 4)).toEqual({ id: "other4", label: "Other check", kind: "other" });
  });
});

describe("publicFactors", () => {
  it("drops the internal id, ties each check to its point, and puts the points first", () => {
    const out = publicFactors([row("readyNow"), row("ruleOfThree"), row("relativeStrength")]);
    expect(out.map((f) => f.id)).toEqual(["relativeStrength", "trendAllTimeframes-check-2", "hold-13"]);
    expect(out[1].label).toBe("Check 2 under Trend on every timeframe");
    expect(out[1].partOf).toBe("Trend on every timeframe");
    expect(JSON.stringify(out)).not.toMatch(/ruleOfThree|criterion/);
  });
});

describe("planLevelsParam", () => {
  it("trades production's plan unless the caller opts out", () => {
    expect(planLevelsParam(null)).toBe(true);
    expect(planLevelsParam("1")).toBe(true);
    expect(planLevelsParam("0")).toBe(false);
    expect(planLevelsParam("false")).toBe(false);
  });
});
