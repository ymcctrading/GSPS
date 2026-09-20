import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeRuleOfThree } from "../ruleOfThree";

function bars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`, o: c, h: c, l: c, c, v: 1000 }));
}

describe("computeRuleOfThree", () => {
  it("reports zero streaks with fewer than two bars", () => {
    expect(computeRuleOfThree(bars([100]))).toEqual({
      consecutiveLowerCloses: 0,
      consecutiveHigherCloses: 0,
      bullishSignal: false,
      bearishSignal: false,
    });
  });

  it("does not signal bullish on only one higher close (needs 2)", () => {
    const result = computeRuleOfThree(bars([100, 101]));
    expect(result.consecutiveHigherCloses).toBe(1);
    expect(result.bullishSignal).toBe(false);
  });

  it("signals bullish on two consecutive higher closes", () => {
    const result = computeRuleOfThree(bars([100, 101, 102]));
    expect(result.consecutiveHigherCloses).toBe(2);
    expect(result.bullishSignal).toBe(true);
    expect(result.bearishSignal).toBe(false);
  });

  it("does not signal bearish on only two lower closes (needs 3)", () => {
    const result = computeRuleOfThree(bars([100, 99, 98]));
    expect(result.consecutiveLowerCloses).toBe(2);
    expect(result.bearishSignal).toBe(false);
  });

  it("signals bearish on three consecutive lower closes", () => {
    const result = computeRuleOfThree(bars([100, 99, 98, 97]));
    expect(result.consecutiveLowerCloses).toBe(3);
    expect(result.bearishSignal).toBe(true);
    expect(result.bullishSignal).toBe(false);
  });

  it("only counts the streak ending at the most recent bar", () => {
    // Three down days, then a higher close — the down streak is broken, the
    // up streak is only 1 bar old.
    const result = computeRuleOfThree(bars([100, 99, 98, 97, 98]));
    expect(result.consecutiveHigherCloses).toBe(1);
    expect(result.consecutiveLowerCloses).toBe(0);
    expect(result.bullishSignal).toBe(false);
    expect(result.bearishSignal).toBe(false);
  });

  it("treats a flat close as ending the streak, same as swingChart's convention", () => {
    const result = computeRuleOfThree(bars([100, 99, 98, 98]));
    expect(result.consecutiveLowerCloses).toBe(0);
    expect(result.bearishSignal).toBe(false);
  });
});
