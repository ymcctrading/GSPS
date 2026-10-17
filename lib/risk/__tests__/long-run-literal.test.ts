import { describe, expect, it } from "vitest";
import { GANN_LONG_RUN_WINS, gannRiskCapital } from "@/lib/risk/dynamic-risk";
describe("a long run of wins is three closed wins, as the series-of-losses rule counts", () => {
  it("holds the unit on the third win in a row, not before", () => {
    expect(GANN_LONG_RUN_WINS).toBe(3);
    const run = { startingCapital: 100_000, equity: 210_000, streakProfitUsd: 30_000 };
    expect(gannRiskCapital({ ...run, consecutiveWins: 3 })).toMatchObject({ capital: 100_000, frozen: true });
    expect(gannRiskCapital({ ...run, consecutiveWins: 2 })).toMatchObject({ capital: 200_000, frozen: false });
  });
});
