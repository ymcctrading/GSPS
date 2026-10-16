import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BULLISH_SIGNAL_CLOSES, BEARISH_SIGNAL_CLOSES } from "@/lib/gann/ruleOfThree";
describe("the Rule of Three note names the count the rule uses", () => {
  it("says 3 closes both ways, the same as the constants", () => {
    expect(BULLISH_SIGNAL_CLOSES).toBe(3);
    expect(BEARISH_SIGNAL_CLOSES).toBe(3);
    const src = readFileSync("lib/scoring/score.ts", "utf8");
    expect(src).toMatch(/the Rule of Three needs 3 to confirm an upturn/);
    expect(src).toMatch(/the Rule of Three needs 3 to confirm a downturn/);
    expect(src).not.toMatch(/Rule of Three needs 2/);
  });
});
