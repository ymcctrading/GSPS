import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("review 24: the daily Rule of Three reaches the score on both surfaces", () => {
  it("reads the daily closes and passes them to computeScore, live and replay", () => {
    const live = readFileSync("lib/scanTicker.ts", "utf8");
    expect(live).toMatch(/const ruleOfThree = computeRuleOfThree\(daily\);/);
    const replay = readFileSync("lib/backtest/replay.ts", "utf8");
    expect(replay).toMatch(/const ruleOfThree = computeRuleOfThree\(daily\);/);
    expect(replay).toMatch(/ruleOfThree: context\.ruleOfThree,\s*\n\s*ruleOfThreeWeekly: context\.ruleOfThreeWeekly,/);
  });
});
