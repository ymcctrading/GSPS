import { describe, expect, it, vi } from "vitest";
import {
  MIN_ANNUAL_RANGE_POINTS,
  activityPillar,
  anglesPillar,
  definiteIndicationPillar,
  marketCyclePillar,
  priceLevelsPillar,
  readAngleFacts,
  relativeStrengthPillar,
  timePillar,
  trendPillar,
  volumeActivity,
  volumePillar,
  type PillarFacts,
} from "@/lib/scoring/pillars";
import { computeScore } from "@/lib/scoring/score";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import { CRITERION_KEYS } from "@/lib/scoring/weights";
import type { Bar } from "@/lib/types";

function facts(over: Partial<PillarFacts> = {}): PillarFacts {
  return {
    marketTrend: null,
    yearCycle: null,
    decadeBias: null,
    yearTrend: null,
    leadership: null,
    weak: null,
    queer: null,
    volumeActivity: null,
    annualRangePoints: null,
    zoneActivity: null,
    angles: null,
    base: null,
    capitalWarning: false,
    counterMove: null,
    reactionAbnormal: false,
    campaign: null,
    ...over,
  };
}

const lead = { bottomedFirst: false, toppedFirst: false, crossedTopsFirst: false, brokeBottomsFirst: false, firstYearHighCrossed: null };

describe("market and cycle position", () => {
  it("needs two of the market, the stock's cycle and the year", () => {
    expect(marketCyclePillar(facts({ marketTrend: "bullish", yearCycle: { bullishHits: 0, bearishHits: 0 } }), "bullish").passed).toBe(true);
    expect(marketCyclePillar(facts({ marketTrend: "bullish", decadeBias: "bullish" }), "bullish").passed).toBe(true);
    expect(marketCyclePillar(facts({ yearCycle: { bullishHits: 0, bearishHits: 0 }, yearTrend: "up" }), "bullish").passed).toBe(true);
    expect(marketCyclePillar(facts({ marketTrend: "bullish" }), "bullish").passed).toBe(false);
  });

  it("fails the cycle when a count is due against the side, and mirrors for a short", () => {
    expect(marketCyclePillar(facts({ marketTrend: "bullish", yearCycle: { bullishHits: 0, bearishHits: 1 } }), "bullish").passed).toBe(false);
    expect(marketCyclePillar(facts({ marketTrend: "bearish", yearCycle: { bullishHits: 1, bearishHits: 0 } }), "bearish").passed).toBe(false);
    expect(marketCyclePillar(facts({ marketTrend: "bearish", yearTrend: "down" }), "bearish").passed).toBe(true);
    expect(marketCyclePillar(facts({ marketTrend: "bearish", yearTrend: "up" }), "bearish").passed).toBe(false);
  });

  it("fails with nothing read", () => {
    expect(marketCyclePillar(null, "bullish").passed).toBe(false);
  });
});

describe("trend on every timeframe", () => {
  it("needs the weekly and one of the 3-day or the Rule of Three", () => {
    expect(trendPillar({ side: "bullish", weekly: "bullish", threeDay: "bullish", ruleOfThree: false, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bullish", weekly: "bullish", threeDay: "bearish", ruleOfThree: true, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bullish", weekly: "bullish", threeDay: "bearish", ruleOfThree: false, monthly: null }).passed).toBe(false);
    expect(trendPillar({ side: "bullish", weekly: "bearish", threeDay: "bullish", ruleOfThree: true, monthly: null }).passed).toBe(false);
  });

  it("names the monthly agreeing as every timeframe in line", () => {
    expect(trendPillar({ side: "bearish", weekly: "bearish", threeDay: "bearish", ruleOfThree: false, monthly: "bearish" }).note).toMatch(/every timeframe/);
    expect(trendPillar({ side: "bearish", weekly: "bearish", threeDay: "bearish", ruleOfThree: false, monthly: "bullish" }).note).not.toMatch(/every timeframe/);
  });
});

describe("relative strength and leadership", () => {
  it("needs two of leading, the first-year high and strength, for a long", () => {
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, bottomedFirst: true, firstYearHighCrossed: true } }), "bullish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, crossedTopsFirst: true }, weak: false }), "bullish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, firstYearHighCrossed: true }, weak: true }), "bullish").passed).toBe(false);
  });

  it("mirrors for a short: topped first, failed the first-year high, weak", () => {
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, toppedFirst: true, firstYearHighCrossed: false } }), "bearish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, brokeBottomsFirst: true }, weak: true }), "bearish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, bottomedFirst: true, firstYearHighCrossed: true }, weak: false }), "bearish").passed).toBe(false);
  });
});

describe("activity and character", () => {
  const lively = { volumeActivity: 1, annualRangePoints: MIN_ANNUAL_RANGE_POINTS, zoneActivity: 1 };
  it("needs the rules followed and two of volume, range and liveliness", () => {
    expect(activityPillar(facts(lively)).passed).toBe(true);
    expect(activityPillar(facts({ ...lively, queer: true })).passed).toBe(false);
    expect(activityPillar(facts({ volumeActivity: 1, zoneActivity: 1 })).passed).toBe(true);
    expect(activityPillar(facts({ annualRangePoints: MIN_ANNUAL_RANGE_POINTS })).passed).toBe(false);
    expect(activityPillar(null).passed).toBe(false);
  });

  it("reads each threshold at its edge", () => {
    expect(activityPillar(facts({ volumeActivity: 0.99, annualRangePoints: MIN_ANNUAL_RANGE_POINTS })).passed).toBe(false);
    expect(activityPillar(facts({ volumeActivity: 1, annualRangePoints: MIN_ANNUAL_RANGE_POINTS - 0.1 })).passed).toBe(false);
    expect(activityPillar(facts({ volumeActivity: 1, annualRangePoints: MIN_ANNUAL_RANGE_POINTS })).passed).toBe(true);
    expect(activityPillar(facts({ volumeActivity: 1, zoneActivity: 0.99 })).passed).toBe(false);
  });
});

describe("price levels", () => {
  it("passes on an old level or a percentage level", () => {
    expect(priceLevelsPillar(true, false).passed).toBe(true);
    expect(priceLevelsPillar(false, true).passed).toBe(true);
    expect(priceLevelsPillar(false, false).passed).toBe(false);
  });
});

describe("angles", () => {
  const free = { holds45: { bullish: true, bearish: false }, squeezed: false };
  it("needs the 45° held and room between the angles", () => {
    expect(anglesPillar(facts({ angles: free }), "bullish", false).passed).toBe(true);
    expect(anglesPillar(facts({ angles: { ...free, squeezed: true } }), "bullish", false).passed).toBe(false);
    expect(anglesPillar(facts({ angles: free }), "bearish", false).passed).toBe(false);
    expect(anglesPillar(null, "bullish", true).passed).toBe(false);
  });

  it("reads the 45° from the latest bottom as position", () => {
    // A bottom at 100 on bar 5, then a rise of one point a bar.
    const bars: Bar[] = Array.from({ length: 40 }, (_, i) => {
      const p = i < 5 ? 110 - i * 2 : 100 + (i - 5);
      return { t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: p, h: p + 0.5, l: i === 5 ? 100 : p - 0.5, c: p, v: 1000 };
    });
    const unit = 1;
    const above = readAngleFacts(bars, 140, unit)!;
    const below = readAngleFacts(bars, 120, unit)!;
    expect(above.holds45.bullish).toBe(true);
    expect(below.holds45.bullish).toBe(false);
  });

  it("calls two important angles within 5 points a squeeze", () => {
    const rising: Bar[] = Array.from({ length: 12 }, (_, i) => {
      const p = 100 + i;
      return { t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: p, h: p, l: p, c: p, v: 1000 };
    });
    // From the bottom at 100 eleven bars back: the 1x2 at 105.5 and the 1x1 at 111, 5.5 points apart.
    expect(readAngleFacts(rising, 108, 1)!.squeezed).toBe(false);
    // A top at 110 four bars back: its 1x1 down at 106 and the bottom's 1x2 up at 107.
    const peaked: Bar[] = Array.from({ length: 15 }, (_, i) => {
      const p = i <= 10 ? 100 + i : 110 - (i - 10);
      return { t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: p, h: p, l: p, c: p, v: 1000 };
    });
    expect(readAngleFacts(peaked, 106.5, 1)!.squeezed).toBe(true);
  });
});

describe("time", () => {
  const withTrend = (phase: "normal" | "secondMonth", inCounterMove = true) =>
    facts({ counterMove: { trend: "bullish", inCounterMove, phase } });

  it("passes on price and time squared with the reaction in its limit, without reading the window", () => {
    const windowTurn = vi.fn(() => null);
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("normal"), windowTurn }).passed).toBe(true);
    expect(windowTurn).not.toHaveBeenCalled();
  });

  it("reads the window only when it decides the point", () => {
    const open = vi.fn(() => ({ kind: "bottom" as const, date: "2026-10-01", price: 1, windows: ["90 days"] }));
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("secondMonth"), windowTurn: open }).passed).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    const shut = vi.fn(() => null);
    expect(timePillar({ side: "bullish", squared: false, facts: withTrend("normal"), windowTurn: shut }).passed).toBe(false);
    expect(shut).toHaveBeenCalledTimes(1);
    const none = vi.fn(() => null);
    expect(timePillar({ side: "bullish", squared: false, facts: withTrend("secondMonth"), windowTurn: none }).passed).toBe(false);
    expect(none).not.toHaveBeenCalled();
  });

  it("counts a with-trend reaction into its second month, or an abnormal one, as out of its limit", () => {
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("secondMonth") }).passed).toBe(false);
    expect(timePillar({ side: "bullish", squared: true, facts: { ...withTrend("normal"), reactionAbnormal: true } }).passed).toBe(false);
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("normal", false) }).passed).toBe(true);
    // No reaction under way: nothing has run past its limit.
    expect(timePillar({ side: "bullish", squared: true, facts: { ...withTrend("normal", false), reactionAbnormal: true } }).passed).toBe(true);
  });

  it("wants the move against the trend to have outrun its limit", () => {
    const against = (phase: "normal" | "thirdMonth") => facts({ counterMove: { trend: "bearish", inCounterMove: true, phase } });
    expect(timePillar({ side: "bullish", squared: true, facts: against("thirdMonth") }).passed).toBe(true);
    expect(timePillar({ side: "bullish", squared: true, facts: against("normal") }).passed).toBe(false);
    expect(timePillar({ side: "bullish", squared: true, facts: facts({ counterMove: { trend: "bearish", inCounterMove: false, phase: null }, reactionAbnormal: true }) }).passed).toBe(false);
  });
});

describe("volume and accumulation", () => {
  it("passes on volume at the turn or a base, with no warning against a long", () => {
    expect(volumePillar(facts(), "bullish", true).passed).toBe(true);
    expect(volumePillar(facts({ base: { long: true, breakout: null } }), "bullish", false).passed).toBe(true);
    expect(volumePillar(facts({ base: { long: false, breakout: null } }), "bullish", false).passed).toBe(false);
    expect(volumePillar(facts({ capitalWarning: true }), "bullish", true).passed).toBe(false);
    expect(volumePillar(facts({ capitalWarning: true }), "bearish", true).passed).toBe(true);
  });

  it("does not count a base the market has left against the side", () => {
    expect(volumePillar(facts({ base: { long: true, breakout: "down" } }), "bullish", false).passed).toBe(false);
    expect(volumePillar(facts({ base: { long: true, breakout: "up" } }), "bearish", false).passed).toBe(false);
    expect(volumePillar(facts({ base: { long: true, breakout: "down" } }), "bearish", false).passed).toBe(true);
  });
});

describe("definite indication with the stop placed", () => {
  const campaign = (trend: "bullish" | "bearish", over = false) => facts({ campaign: { trend, spaceOverbalanced: over, timeOverbalanced: false } });

  it("needs the trigger, the stop and the reaction", () => {
    expect(definiteIndicationPillar(campaign("bullish"), "bullish", true, true).passed).toBe(true);
    expect(definiteIndicationPillar(campaign("bullish"), "bullish", false, true).passed).toBe(false);
    expect(definiteIndicationPillar(campaign("bullish"), "bullish", true, false).passed).toBe(false);
    expect(definiteIndicationPillar(null, "bullish", true, true).passed).toBe(false);
  });

  it("fails a with-trend trade whose reaction exceeded the greatest, and wants it exceeded against the trend", () => {
    expect(definiteIndicationPillar(campaign("bullish", true), "bullish", true, true).passed).toBe(false);
    expect(definiteIndicationPillar(campaign("bearish", true), "bullish", true, true).passed).toBe(true);
    expect(definiteIndicationPillar(campaign("bearish", false), "bullish", true, true).passed).toBe(false);
    expect(definiteIndicationPillar(facts({ campaign: { trend: "bullish", spaceOverbalanced: false, timeOverbalanced: true } }), "bullish", true, true).passed).toBe(false);
  });
});

describe("volume activity", () => {
  it("is the recent median volume over the year before", () => {
    const bars = (recent: number) =>
      Array.from({ length: 100 }, (_, i) => ({ t: String(i), o: 1, h: 1, l: 1, c: 1, v: i >= 80 ? recent : 100 }));
    expect(volumeActivity(bars(150))).toBeCloseTo(1.5);
    expect(volumeActivity(bars(50))).toBeCloseTo(0.5);
    expect(volumeActivity(bars(150).slice(-30))).toBeNull();
  });
});

describe("the score out of nine", () => {
  it("scores the nine points and keeps the checks as explained detail", () => {
    const decision = computeScore({
      direction: "bullish",
      macroTrends: [],
      hourlyTrend: { timeframe: "1Hour", direction: "sideways", support: [], resistance: [] },
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
      nearSupportResistance: true,
      pattern: null,
      momentumElevated: false,
      levels: null,
    } as unknown as Parameters<typeof computeScore>[0]);
    const points = decision.breakdown.filter((b) => b.pillar);
    expect(points.map((b) => b.key)).toEqual([...CRITERION_KEYS]);
    const checks = decision.breakdown.filter((b) => b.checkOf);
    expect(checks.length).toBe(9);
    expect(checks.every((b) => b.pillar === undefined)).toBe(true);
    // The old level passes as a check and earns the price-levels point, and nothing else.
    expect(checks.find((b) => b.key === "historicalSR")?.passed).toBe(true);
    expect(decision.score).toBe(1);
    const summary = toPublicScoreSummary(decision);
    expect(summary.max).toBe(9);
    expect(summary.stateNote).toBeNull();
  });
});
