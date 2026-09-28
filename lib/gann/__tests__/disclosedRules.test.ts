import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  counterMovePhase,
  pricePercentageLevels,
  readBarMidpoint,
  readCounterMove,
  readDayCountBands,
  readDisclosedRules,
  readLevelTests,
  readPricePercentages,
  readRuleOfThreeTimeframes,
  readYearFraction,
  toMonthlyBars,
  toWeeklyBars,
  describeDisclosedRules,
} from "../disclosedRules";

function bar(t: string, c: number, h = c + 1, l = c - 1): Bar {
  return { t, o: c, h, l, c, v: 1000 };
}

/** One bar per calendar day from 2026-01-01. */
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => bar(new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(), c));
}

describe("close vs bar midpoint (Master Course Ch. 13)", () => {
  it("reads a close above the midpoint as up and below as down", () => {
    expect(readBarMidpoint([bar("2026-01-01T00:00:00Z", 10, 11, 8)])?.lastBar).toBe("up");
    expect(readBarMidpoint([bar("2026-01-01T00:00:00Z", 9, 11, 8)])?.lastBar).toBe("down");
  });

  it("counts up closes among the last five", () => {
    const b = [10, 11, 12, 13, 14, 15].map((c, i) => bar(`2026-01-0${i + 1}T00:00:00Z`, c, c + 0.2, c - 1));
    expect(readBarMidpoint(b)?.upOfLast5).toBe(5);
  });
});

describe("percentages of the extreme price (Commodities pp. 32-34)", () => {
  it("builds eighths of the low above it and eighths and thirds of the high", () => {
    const levels = pricePercentageLevels(100, 200);
    const labels = levels.map((l) => l.label);
    expect(labels).toContain("50% above the low");
    expect(labels).toContain("100% above the low");
    expect(labels).toContain("4/8 of the high");
    expect(labels).toContain("1/3 of the high");
    expect(levels.find((l) => l.label === "50% above the low")?.price).toBe(150);
    expect(levels.find((l) => l.label === "100% above the low")?.importance).toBe(1);
    expect(levels.find((l) => l.label === "4/8 of the high")?.importance).toBe(1);
  });

  it("finds the nearest level on each side of price", () => {
    const b = [bar("2026-01-01T00:00:00Z", 100, 100, 100), bar("2026-01-02T00:00:00Z", 200, 200, 200)];
    const r = readPricePercentages(b, 140)!;
    expect(r.nearestBelow?.price).toBeCloseTo(137.5);
    expect(r.nearestAbove?.price).toBe(150);
  });
});

describe("counter-move clock (Master Course Ch. 11B; Stock Selector Ch. IV)", () => {
  it("classifies durations by the source's weeks and months", () => {
    expect(counterMovePhase(14)).toBe("normal");
    expect(counterMovePhase(21)).toBe("normal");
    expect(counterMovePhase(25)).toBe("extended");
    expect(counterMovePhase(45)).toBe("secondMonth");
    expect(counterMovePhase(70)).toBe("thirdMonth");
  });

  it("reports a reaction inside an uptrend with its length in days", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const reaction = [128, 127, 126, 125];
    const r = readCounterMove(daily([...up, ...reaction]))!;
    expect(r.trend).toBe("bullish");
    expect(r.inCounterMove).toBe(true);
    expect(r.days).toBe(4);
    expect(r.phase).toBe("normal");
  });

  it("reports no counter-move while the trend is running", () => {
    const r = readCounterMove(daily(Array.from({ length: 30 }, (_, i) => 100 + i)))!;
    expect(r.inCounterMove).toBe(false);
  });
});

describe("tests of a level (Commodities p. 43)", () => {
  it("counts repeated swing bottoms at the same level", () => {
    // Three reactions that each bottom near 100, then price rallies away.
    const closes = [
      110, 108, 106, 104, 102, 101, 104, 107, 110, 112, 109, 106, 103, 101, 104, 107, 110, 112, 109, 106, 103,
      101, 104, 108, 112, 115,
    ];
    const r = readLevelTests(daily(closes), 115);
    expect(r.support?.tests).toBe(3);
    expect(r.support?.level).toBeCloseTo(100, 0);
  });
});

describe("day-count bands and fractions of the year (A09 Rule 8; Master Course Ch. 13-14)", () => {
  function withPivotLow(daysAfter: number): Bar[] {
    // A clear major low, then a steady rise for `daysAfter` days, plus earlier swings.
    const pre = Array.from({ length: 30 }, (_, i) => 150 - i * 1.5);
    const post = Array.from({ length: daysAfter }, (_, i) => 105 + i * 0.5 + (i % 6 < 3 ? 0 : -1));
    return daily([...pre, ...post]);
  }

  it("flags a day count inside a disclosed band", () => {
    const bands = readDayCountBands(withPivotLow(45));
    expect(bands.some((b) => b.band[0] === 42 && b.band[1] === 49)).toBe(true);
  });

  it("ranks an active year fraction", () => {
    const f = readYearFraction(withPivotLow(90));
    expect(f?.fraction).toBe("1/4 year");
    expect(f?.rank).toBe(3);
  });
});

describe("Rule of Three on weekly and monthly bars (Stock Selector p. 72)", () => {
  it("resamples daily bars into Monday weeks and calendar months", () => {
    const b = daily(Array.from({ length: 70 }, (_, i) => 100 + i));
    expect(toWeeklyBars(b).length).toBe(11); // Jan 1 2026 is a Thursday
    expect(toMonthlyBars(b).length).toBe(3);
  });

  it("reads three lower weekly closes as the bearish signal", () => {
    const weeks = [100, 110, 120, 115, 110, 105];
    const b: Bar[] = [];
    weeks.forEach((c, w) => {
      for (let d = 0; d < 5; d++) b.push(bar(new Date(Date.UTC(2026, 0, 5) + (w * 7 + d) * 86_400_000).toISOString(), c));
    });
    expect(readRuleOfThreeTimeframes(b).weekly?.bearishSignal).toBe(true);
  });
});

describe("readDisclosedRules", () => {
  it("returns a full context and plain-language lines", () => {
    const ctx = readDisclosedRules(daily(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2)), 110);
    expect(ctx.barMidpoint).not.toBeNull();
    expect(ctx.pricePercentages).not.toBeNull();
    expect(Array.isArray(describeDisclosedRules(ctx))).toBe(true);
  });
});
