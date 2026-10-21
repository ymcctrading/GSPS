import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocatedDollarRiskFor,
  matchesDirectionalBias,
  matchesVolatilityTrigger,
  rankPlansByScore,
  readPlanScores,
} from "@/lib/automation/portfolio-manager";

describe("matchesDirectionalBias", () => {
  it("BOTH allows either direction", () => {
    expect(matchesDirectionalBias("bullish", "BOTH")).toBe(true);
    expect(matchesDirectionalBias("bearish", "BOTH")).toBe(true);
  });

  it("BULLISH_ONLY blocks a bearish plan", () => {
    expect(matchesDirectionalBias("bullish", "BULLISH_ONLY")).toBe(true);
    expect(matchesDirectionalBias("bearish", "BULLISH_ONLY")).toBe(false);
  });

  it("BEARISH_ONLY blocks a bullish plan", () => {
    expect(matchesDirectionalBias("bearish", "BEARISH_ONLY")).toBe(true);
    expect(matchesDirectionalBias("bullish", "BEARISH_ONLY")).toBe(false);
  });
});

describe("matchesVolatilityTrigger", () => {
  const plan = { entry_trigger: 100, invalidation: 97 };

  it("PERCENTAGE trigger compares stop distance as a % of entry", () => {
    // 3% stop distance
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 2)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 3)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 4)).toBe(false);
  });

  it("DOLLAR_AMOUNT trigger compares the raw entry-to-stop distance", () => {
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 2)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 3)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 3.5)).toBe(false);
  });

  it("never divides by zero on a degenerate entry price", () => {
    expect(matchesVolatilityTrigger({ entry_trigger: 0, invalidation: -1 }, "PERCENTAGE", 1)).toBe(false);
  });
});

describe("allocatedDollarRiskFor: never more than a tenth of the capital (never-failing rule 1)", () => {
  it("sizes from the dial's percent of the trading capital", () => {
    expect(allocatedDollarRiskFor(100_000, "MODERATE")).toBe(1_000);
  });
  it("holds the minimum allocation under a tenth of a small account", () => {
    // The $25 floor would risk an eighth of $200; a tenth is $20.
    expect(allocatedDollarRiskFor(200, "PASSIVE")).toBeCloseTo(20, 9);
  });
  it("allocates nothing with no capital", () => {
    expect(allocatedDollarRiskFor(0, "AGGRESSIVE")).toBe(0);
  });
});

describe("allocatedDollarRiskFor: a tenth of the profits after large profits (A-RISK-07)", () => {
  it("is held to the profit ceiling when that is lower", () => {
    expect(allocatedDollarRiskFor(200_000, "MODERATE")).toBe(2_000);
    expect(allocatedDollarRiskFor(200_000, "MODERATE", 1_500)).toBe(1_500);
    expect(allocatedDollarRiskFor(200_000, "MODERATE", 5_000)).toBe(2_000);
  });
});

describe("rankPlansByScore: Gann's score first", () => {
  const plan = (instrument: string, direction: string, id: string) => ({ instrument, direction, id });
  it("puts the higher score first, unscored plans last, ties in query order", () => {
    const plans = [plan("AAA", "bullish", "1"), plan("BBB", "bullish", "2"), plan("CCC", "bearish", "3"), plan("DDD", "bullish", "4")];
    const scores = new Map([["BBB:bullish", 8], ["CCC:bearish", 6], ["AAA:bullish", 6]]);
    expect(rankPlansByScore(plans, scores).map((p) => p.id)).toEqual(["2", "1", "3", "4"]);
  });
  it("does not lend one direction's score to the other", () => {
    const plans = [plan("AAA", "bearish", "1"), plan("BBB", "bullish", "2")];
    const scores = new Map([["AAA:bullish", 9], ["BBB:bullish", 5]]);
    expect(rankPlansByScore(plans, scores).map((p) => p.id)).toEqual(["2", "1"]);
  });
});

describe("readPlanScores", () => {
  function client(result: { data: unknown; error: unknown }, seen: { symbols?: string[] } = {}) {
    const q = {
      select: () => q,
      eq: () => q,
      in: (_col: string, symbols: string[]) => {
        seen.symbols = symbols;
        return Promise.resolve(result);
      },
    };
    return { from: () => q } as unknown as SupabaseClient;
  }
  it("keys each monitor's score by symbol and direction, skipping unscored rows", async () => {
    const seen: { symbols?: string[] } = {};
    const scores = await readPlanScores(
      client({
        data: [
          { symbol: "aapl", direction: "bullish", score: 7 },
          { symbol: "MSFT", direction: "bearish", score: null },
          { symbol: "NVDA", direction: null, score: 8 },
        ],
        error: null,
      }, seen),
      "u1",
      ["aapl", "AAPL", "MSFT"],
    );
    expect(seen.symbols).toEqual(["AAPL", "MSFT"]);
    expect([...scores]).toEqual([["AAPL:bullish", 7]]);
  });
  it("reads nothing, and fails soft, on an error or no symbols", async () => {
    expect((await readPlanScores(client({ data: null, error: { message: "x" } }), "u1", ["AAPL"])).size).toBe(0);
    expect((await readPlanScores(client({ data: [], error: null }), "u1", [])).size).toBe(0);
  });
});
