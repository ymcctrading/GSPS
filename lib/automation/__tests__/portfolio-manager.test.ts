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
  type Row = { profile_id: string; symbol: string; state: string; direction: string | null; score: number | null; last_evaluated_at: string };
  /** A fake that applies the filters and the order the reader asks for. */
  function client(rows: Row[] | null, error: { message: string } | null = null) {
    let out = rows ?? [];
    const q = {
      select: () => q,
      eq: (col: keyof Row, v: string) => ((out = out.filter((r) => r[col] === v)), q),
      in: (col: keyof Row, vs: string[]) => ((out = out.filter((r) => vs.includes(String(r[col])))), q),
      order: (col: keyof Row, o: { ascending: boolean }) =>
        Promise.resolve({
          data: error ? null : [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (o.ascending ? 1 : -1)),
          error,
        }),
    };
    return { from: () => q } as unknown as SupabaseClient;
  }
  const row = (o: Partial<Row>): Row => ({
    profile_id: "u1", symbol: "AAPL", state: "EXECUTE", direction: "bullish", score: 7, last_evaluated_at: "2026-10-21T15:00:00Z", ...o,
  });

  it("keys each open monitor's score by symbol and direction, skipping unscored rows and other members", async () => {
    const { scores, error } = await readPlanScores(
      client([
        row({ symbol: "AAPL" }),
        row({ symbol: "MSFT", direction: "bearish", score: null }),
        row({ symbol: "NVDA", direction: null, score: 8 }),
        row({ symbol: "AAPL", profile_id: "u2", score: 9, last_evaluated_at: "2026-10-21T16:00:00Z" }),
      ]),
      "u1",
      ["aapl", "AAPL", "MSFT", "NVDA"],
    );
    expect(error).toBeNull();
    expect([...scores]).toEqual([["AAPL:bullish", 7]]);
  });

  it("never reads a terminal monitor's stale score", async () => {
    // AAA armed at 8, then the scan rejected it: its monitor went NO_SETUP still holding 8.
    const { scores } = await readPlanScores(
      client([row({ symbol: "AAA", state: "NO_SETUP", score: 8 }), row({ symbol: "BBB", score: 7 })]),
      "u1",
      ["AAA", "BBB"],
    );
    expect([...scores]).toEqual([["BBB:bullish", 7]]);
    expect(rankPlansByScore([{ instrument: "AAA", direction: "bullish" }, { instrument: "BBB", direction: "bullish" }], scores).map((p) => p.instrument)).toEqual(["BBB", "AAA"]);
  });

  it("reads the most recently evaluated open row, not the highest", async () => {
    const { scores } = await readPlanScores(
      client([
        row({ score: 9, last_evaluated_at: "2026-10-20T15:00:00Z" }),
        row({ score: 6, last_evaluated_at: "2026-10-21T15:00:00Z" }),
      ]),
      "u1",
      ["AAPL"],
    );
    expect(scores.get("AAPL:bullish")).toBe(6);
  });

  it("returns the error and no scores on a failed read, and reads nothing for no symbols", async () => {
    const failed = await readPlanScores(client(null, { message: "boom" }), "u1", ["AAPL"]);
    expect(failed.scores.size).toBe(0);
    expect(failed.error).toBe("boom");
    expect((await readPlanScores(client([]), "u1", [])).scores.size).toBe(0);
  });
});
