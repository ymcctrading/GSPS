/**
 * A-RISK-04 and M-K3 (owner, 2026-10-16, Q7): the trading unit stays at the
 * starting capital until profits equal it, then doubles (Master Course,
 * "when your profits equal your capital, double your unit"); it is never
 * raised during a long run of wins (rule 24). Losses shrink it: the unit is
 * never more than the equity that is left.
 */
import { describe, expect, it } from "vitest";
import { GANN_LONG_RUN_WINS, gannRiskCapital } from "@/lib/risk/dynamic-risk";

const base = { startingCapital: 100_000, consecutiveWins: 0, streakProfitUsd: 0 };

describe("gannRiskCapital", () => {
  it("sizes off the starting capital while profits are short of it", () => {
    expect(gannRiskCapital({ ...base, equity: 150_000 }).capital).toBe(100_000);
    expect(gannRiskCapital({ ...base, equity: 199_999 }).doubled).toBe(false);
  });

  it("doubles the unit once profits equal the starting capital, and again at four times", () => {
    expect(gannRiskCapital({ ...base, equity: 200_000 })).toMatchObject({ capital: 200_000, doubled: true });
    expect(gannRiskCapital({ ...base, equity: 350_000 }).capital).toBe(200_000);
    expect(gannRiskCapital({ ...base, equity: 400_000 }).capital).toBe(400_000);
  });

  it("never sizes off more than the equity left after losses", () => {
    expect(gannRiskCapital({ ...base, equity: 80_000 }).capital).toBe(80_000);
  });

  it("does not step the unit up on the gains of a long run of wins", () => {
    const run = { ...base, equity: 210_000, consecutiveWins: GANN_LONG_RUN_WINS, streakProfitUsd: 30_000 };
    expect(gannRiskCapital(run)).toMatchObject({ capital: 100_000, doubled: false, frozen: true });
    // A shorter run steps up as usual.
    expect(gannRiskCapital({ ...run, consecutiveWins: GANN_LONG_RUN_WINS - 1 }).capital).toBe(200_000);
    // A step-up earned before the run began stands.
    expect(gannRiskCapital({ ...run, equity: 240_000, streakProfitUsd: 30_000 }).capital).toBe(200_000);
  });

  it("with no starting capital on record, sizes off equity but still holds it through a long run", () => {
    expect(gannRiskCapital({ ...base, startingCapital: 0, equity: 5_000 }).capital).toBe(5_000);
    const run = { startingCapital: 0, equity: 6_000, consecutiveWins: GANN_LONG_RUN_WINS, streakProfitUsd: 1_000 };
    expect(gannRiskCapital(run)).toMatchObject({ capital: 5_000, frozen: true });
  });
});
