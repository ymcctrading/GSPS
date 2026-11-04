import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODERN_TESTS, modernAll } from "@/lib/research/modernTiming";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-modern-timing.json"), "utf8"));

describe("the committed modern run still says what the module computes", () => {
  it("every rule, symbol and turn set", { timeout: 120_000 }, () => {
    const r = modernAll();
    expect(run.tests).toBe(MODERN_TESTS);
    expect(r.map((m) => [m.rule, m.symbol, m.set, m.score.hits])).toEqual(
      run.results.map((m: { rule: string; symbol: string; set: string; hits: number }) => [m.rule, m.symbol, m.set, m.hits]),
    );
    // The finding the docs report: nothing times SPY's or DIA's turns after the correction.
    for (const m of r) expect(m.score.p).toBeGreaterThan(0.05 / MODERN_TESTS);
  });
});
