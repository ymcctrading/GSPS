import { describe, expect, it } from "vitest";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { readDisclosedRules, type DisclosedRulesContext } from "@/lib/gann/disclosedRules";

// Review 25, R3-4: the weekly and monthly Rule of Three factors agree with
// the trade's own side, so a bearish signal agrees with a short, not a long.
describe("the Rule of Three factors read the trade's side", () => {
  const daily = Array.from({ length: 60 }, (_, i) => {
    const c = 50 + Math.sin(i / 4) * 3;
    return { t: new Date(Date.UTC(2022, 3, 1 + i, 5)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const base = readDisclosedRules(daily, daily[daily.length - 1].c, { sharesOutstanding: null, inception: null, marketMonthly: [], marketDaily: [] }, new Date(daily[daily.length - 1].t));
  const ctx = {
    ...base,
    ruleOfThree: { ...base.ruleOfThree, weekly: { bullishSignal: false, bearishSignal: true }, monthly: { bullishSignal: true, bearishSignal: false } },
  } as unknown as DisclosedRulesContext;

  it("agrees with a bearish weekly signal on a short and not on a long", () => {
    expect(contextFactorsFor(ctx, "bearish", 50).ruleOfThreeWeeklyAgrees).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).ruleOfThreeWeeklyAgrees).toBe(false);
  });
  it("agrees with a bullish monthly signal on a long and not on a short", () => {
    expect(contextFactorsFor(ctx, "bullish", 50).ruleOfThreeMonthlyAgrees).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 50).ruleOfThreeMonthlyAgrees).toBe(false);
  });
});
