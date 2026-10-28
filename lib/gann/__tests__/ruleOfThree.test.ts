import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
      trend: null,
    });
  });

  it("does not signal bullish on only one higher close (needs 2)", () => {
    const result = computeRuleOfThree(bars([100, 101]));
    expect(result.consecutiveHigherCloses).toBe(1);
    expect(result.bullishSignal).toBe(false);
  });

  it("does not signal bullish on two higher closes: a decline never closes more than 2 days with gains (M-R3)", () => {
    const result = computeRuleOfThree(bars([100, 101, 102]));
    expect(result.consecutiveHigherCloses).toBe(2);
    expect(result.bullishSignal).toBe(false);
  });

  it("signals bullish on the third consecutive higher close", () => {
    const result = computeRuleOfThree(bars([100, 101, 102, 103]));
    expect(result.consecutiveHigherCloses).toBe(3);
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

describe("M-R3 on every surface (review 23)", () => {
  it("still signals on a fourth lower close in a row", () => {
    const r = computeRuleOfThree(bars([10, 9, 8, 7, 6]));
    expect(r.consecutiveLowerCloses).toBe(4);
    expect(r.bearishSignal).toBe(true);
  });

  it("reads the weekly and monthly charts on the live scan and the replay alike", () => {
    const live = readFileSync("lib/scanTicker.ts", "utf8");
    expect(live).toMatch(/const ruleOfThreeWeekly = charts\.weekly\.length >= 4 \? computeRuleOfThree\(charts\.weekly\) : null;/);
    expect(live).toMatch(/const ruleOfThreeMonthly = charts\.monthly\.length >= 4 \? computeRuleOfThree\(charts\.monthly\) : null;/);
    expect(live).toMatch(/ruleOfThree,\s*\n\s*ruleOfThreeWeekly,\s*\n\s*ruleOfThreeMonthly,/);
    const replay = readFileSync("lib/backtest/replay.ts", "utf8");
    expect(replay).toMatch(/ruleOfThreeWeekly: weekly\.length >= 4 \? computeRuleOfThree\(weekly\) : null,/);
    expect(replay).toMatch(/ruleOfThreeMonthly: monthly\.length >= 4 \? computeRuleOfThree\(monthly\) : null,/);
    expect(replay).toMatch(/ruleOfThreeWeekly: context\.ruleOfThreeWeekly,\s*\n\s*ruleOfThreeMonthly: context\.ruleOfThreeMonthly,/);
  });

describe("computeRuleOfThree trend", () => {
  it("holds the trend through a one- or two-day reaction after three higher closes", () => {
    expect(computeRuleOfThree(bars([100, 101, 102, 103])).trend).toBe("bullish");
    expect(computeRuleOfThree(bars([100, 101, 102, 103, 102, 101])).trend).toBe("bullish");
  });

  it("turns on the third close the other way, and not before", () => {
    expect(computeRuleOfThree(bars([100, 101, 102, 103, 102, 101, 100])).trend).toBe("bearish");
    expect(computeRuleOfThree(bars([100, 101, 100, 101, 100])).trend).toBe(null);
  });

  it("lets a flat close end a run", () => {
    expect(computeRuleOfThree(bars([100, 101, 102, 102, 103])).trend).toBe(null);
  });
});
});
