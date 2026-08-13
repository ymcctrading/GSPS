import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLES_PER_ARM,
  attributeByAtrMultiple,
  attributeFactors,
} from "@/lib/backtest/attribution";
import type { ReplayTrade } from "@/lib/backtest/replay";

const trade = (over: Partial<ReplayTrade> = {}): ReplayTrade => ({
  symbol: "TEST",
  openedAt: "2025-01-02T15:00:00Z",
  pattern: "2-2",
  direction: "bullish",
  entry: 100,
  stop: 99,
  target: 102,
  barsHeld: 3,
  outcome: "win",
  rMultiple: 2,
  ambiguous: false,
  atrMultiple: 1,
  ...over,
});

/** `n` trades, all with the same criteria map and result. */
function block(n: number, criteria: Record<string, boolean>, over: Partial<ReplayTrade> = {}) {
  return Array.from({ length: n }, () => trade({ criteria, ...over }));
}

const winner = { outcome: "win" as const, rMultiple: 2 };
const loser = { outcome: "loss" as const, rMultiple: -1 };

describe("attributeFactors", () => {
  it("splits a criterion into pass and fail arms and reports the expectancy gap", () => {
    const trades = [
      ...block(12, { Momentum: true }, winner),
      ...block(12, { Momentum: false }, loser),
    ];
    const [factor] = attributeFactors(trades);

    expect(factor.criterion).toBe("Momentum");
    expect(factor.verdict).toBe("informative");
    expect(factor.observed).toBe(24);
    expect(factor.passed.n).toBe(12);
    expect(factor.failed.n).toBe(12);
    expect(factor.passed.expectancyR).toBeCloseTo(2, 10);
    expect(factor.failed.expectancyR).toBeCloseTo(-1, 10);
    expect(factor.deltaExpectancyR).toBeCloseTo(3, 10);
    expect(factor.deltaWinRate).toBeCloseTo(1, 10);
    // Perfectly separated, so the correlation is perfect too.
    expect(factor.correlation).toBeCloseTo(1, 10);
  });

  it("treats an absent criterion as unevaluated, not as a failure", () => {
    // The score appends two criteria only in the cases that trigger them.
    // Counting the trades that never saw one as failures would invent a large
    // sample of losers for it and rank it as the strongest factor on the board.
    const trades = [
      ...block(12, { Conditional: true }, winner),
      ...block(30, { Other: true }, loser),
    ];
    const factor = attributeFactors(trades).find((f) => f.criterion === "Conditional")!;

    expect(factor.observed).toBe(12);
    expect(factor.failed.n).toBe(0);
    expect(factor.verdict).toBe("constant");
  });

  it("refuses a correlation for a criterion that never varied", () => {
    // Inside a single verdict bucket several criteria are constant by
    // construction. A zero here would read as "measured, no effect".
    const trades = [...block(20, { Always: true }, winner), ...block(20, { Always: true }, loser)];
    const [factor] = attributeFactors(trades);

    expect(factor.verdict).toBe("constant");
    expect(factor.correlation).toBeUndefined();
    expect(factor.passed.n).toBe(40);
    // The empty arm's expectancy is zero, so a delta here would report the
    // bucket's own expectancy as this criterion's effect.
    expect(factor.deltaExpectancyR).toBeUndefined();
    expect(factor.deltaWinRate).toBeUndefined();
  });

  it("withholds a verdict when one arm is below the sample floor", () => {
    const trades = [
      ...block(MIN_SAMPLES_PER_ARM - 1, { Thin: true }, winner),
      ...block(40, { Thin: false }, loser),
    ];
    const [factor] = attributeFactors(trades);

    expect(factor.verdict).toBe("insufficient");
    // The split is still reported — it just carries no recommendation.
    expect(factor.deltaExpectancyR).toBeCloseTo(3, 10);
  });

  it("gives no correlation when every trade returned the same R", () => {
    // No spread in the outcome means nothing to correlate against. Dividing by
    // a zero standard deviation would yield NaN.
    const trades = [...block(12, { Split: true }, winner), ...block(12, { Split: false }, winner)];
    const [factor] = attributeFactors(trades);

    expect(factor.correlation).toBeUndefined();
    expect(factor.deltaExpectancyR).toBeCloseTo(0, 10);
  });

  it("ranks informative factors above unreadable ones, best lever first", () => {
    const trades = [
      ...block(12, { Weak: true, Strong: false, Constant: true }, { ...winner, rMultiple: 0.5 }),
      ...block(12, { Weak: false, Strong: true, Constant: true }, { ...winner, rMultiple: 3 }),
      ...block(12, { Weak: true, Strong: false, Constant: true }, loser),
      ...block(12, { Weak: false, Strong: true, Constant: true }, winner),
    ];
    const order = attributeFactors(trades).map((f) => f.criterion);

    expect(order).toEqual(["Strong", "Weak", "Constant"]);
    expect(attributeFactors(trades)[2].verdict).toBe("constant");
  });

  it("returns nothing when no trade carried a scored breakdown", () => {
    expect(attributeFactors([trade(), trade()])).toEqual([]);
  });

  it("counts a timeout as the trade it was, not as a win", () => {
    const trades = [
      ...block(12, { Factor: true }, { outcome: "timeout", rMultiple: -0.2 }),
      ...block(12, { Factor: false }, loser),
    ];
    const [factor] = attributeFactors(trades);

    expect(factor.passed.wins).toBe(0);
    expect(factor.passed.winRate).toBe(0);
    // Still counted in expectancy, because it was a trade that was taken.
    expect(factor.passed.expectancyR).toBeCloseTo(-0.2, 10);
  });
});

describe("attributeByAtrMultiple", () => {
  it("puts each trade in exactly one band and leaves the last open-ended", () => {
    const trades = [
      trade({ atrMultiple: 0.2 }),
      trade({ atrMultiple: 0.7 }),
      trade({ atrMultiple: 1.2 }),
      trade({ atrMultiple: 9 }), // far beyond the last edge
    ];
    const bands = attributeByAtrMultiple(trades);

    expect(bands.reduce((n, b) => n + b.arm.n, 0)).toBe(trades.length);
    expect(bands[bands.length - 1].to).toBeNull();
    expect(bands[bands.length - 1].arm.n).toBe(1);
  });

  it("reports an empty band as zero rather than dropping it", () => {
    const bands = attributeByAtrMultiple([trade({ atrMultiple: 0.1 })]);
    expect(bands.length).toBeGreaterThan(1);
    expect(bands[1].arm.n).toBe(0);
    expect(Number.isNaN(bands[1].arm.expectancyR)).toBe(false);
  });
});
