import { walkWeeklyOneBar } from "@/lib/gann/weeklyOneBar";
import { toWeeklyBars } from "@/lib/gann/disclosedRules";
import { computeSwingChart } from "@/lib/gann/swingChart";
import { describe, expect, it } from "vitest";
import {
  MIN_ANNUAL_RANGE_POINTS,
  TIME_PILLAR_COMBINE,
  activityPillar,
  anglesPillar,
  definiteIndicationPillar,
  marketCyclePillar,
  priceLevelsPillar,
  reactionInTimeLimit,
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
    weeklyLine: null,
    decadeBias: null,
    yearTrend: null,
    leadership: null,
    universeRank: null,
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
    rangeLevels: { bullish: null, bearish: null },
    heldLevels: { bullish: null, bearish: null },
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
  it("needs the weekly line and one of the 3-day or the Rule of Three", () => {
    expect(trendPillar({ side: "bullish", weeklyLine: "green", threeDay: "bullish", ruleOfThree: false, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bullish", weeklyLine: "green", threeDay: "bearish", ruleOfThree: true, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bullish", weeklyLine: "green", threeDay: "bearish", ruleOfThree: false, monthly: null }).passed).toBe(false);
    expect(trendPillar({ side: "bullish", weeklyLine: "red", threeDay: "bullish", ruleOfThree: true, monthly: null }).passed).toBe(false);
    expect(trendPillar({ side: "bullish", weeklyLine: null, threeDay: "bullish", ruleOfThree: true, monthly: null }).passed).toBe(false);
  });

  it("mirrors for a short: the red line, and the 3-day or three lower closes", () => {
    expect(trendPillar({ side: "bearish", weeklyLine: "red", threeDay: "bearish", ruleOfThree: false, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bearish", weeklyLine: "red", threeDay: "bullish", ruleOfThree: true, monthly: null }).passed).toBe(true);
    expect(trendPillar({ side: "bearish", weeklyLine: "red", threeDay: "bullish", ruleOfThree: false, monthly: null }).passed).toBe(false);
    expect(trendPillar({ side: "bearish", weeklyLine: "green", threeDay: "bearish", ruleOfThree: true, monthly: null }).passed).toBe(false);
  });

  it("names the monthly agreeing as every timeframe in line", () => {
    expect(trendPillar({ side: "bearish", weeklyLine: "red", threeDay: "bearish", ruleOfThree: false, monthly: "bearish" }).note).toMatch(/every timeframe/);
    expect(trendPillar({ side: "bearish", weeklyLine: "red", threeDay: "bearish", ruleOfThree: false, monthly: "bullish" }).note).not.toMatch(/every timeframe/);
  });

  // The defect fixed 2026-10-21: the weekly reading was the 7-day chart's
  // trend, which stays against a long until the last weekly swing top is
  // crossed. Gann's weekly line turns green on the first week with a higher
  // top and bottom, before that.
  const day = (i: number, h: number, l: number) => ({
    t: new Date(Date.UTC(2026, 0, 5 + i)).toISOString(), o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1000,
  });
  const turn = (long: boolean) => {
    // Weeks of a decline to a low, then two weeks of higher tops and bottoms
    // that stay under the top the decline started from.
    const path = [100, 96, 92, 88, 84, 80, 84, 88];
    const bars = [];
    for (let w = 0; w < path.length; w++) {
      for (let d = 0; d < 5; d++) {
        const mid = path[w] + ((w + 1 < path.length ? path[w + 1] : path[w]) - path[w]) * (d / 5);
        const m = long ? mid : 200 - mid;
        bars.push(day(w * 7 + d, m + 1, m - 1));
      }
    }
    return bars;
  };
  it("reads the green line where the 7-day chart still reads the old trend (long and short)", () => {
    for (const long of [true, false]) {
      const bars = turn(long);
      const line = walkWeeklyOneBar(toWeeklyBars(bars)).colour;
      expect(line).toBe(long ? "green" : "red");
      expect(computeSwingChart(bars).weekly).toBe(long ? "bearish" : "bullish");
      const side = long ? "bullish" : "bearish";
      expect(trendPillar({ side, weeklyLine: line, threeDay: side, ruleOfThree: false, monthly: null }).passed).toBe(true);
    }
  });
});

describe("relative strength and leadership", () => {
  it("needs two of leading, the first-year high and strength, for a long", () => {
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, bottomedFirst: true, firstYearHighCrossed: true } }), "bullish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, crossedTopsFirst: true }, universeRank: { percentile: 0.9, peers: 700, strongest: true, weakest: false, group: null } }), "bullish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, firstYearHighCrossed: true }, universeRank: { percentile: 0.1, peers: 700, strongest: false, weakest: true, group: null } }), "bullish").passed).toBe(false);
  });

  it("counts the strongest of its industry group as strength when the universe rank does not", () => {
    const group = { label: "MOTOR VEHICLES", percentile: 0.9, peers: 6, strongest: true, weakest: false };
    const rank = { percentile: 0.6, peers: 700, strongest: false, weakest: false, group };
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, crossedTopsFirst: true }, universeRank: rank }), "bullish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, brokeBottomsFirst: true }, universeRank: rank }), "bearish").passed).toBe(false);
    const weakGroup = { ...rank, group: { ...group, percentile: 0.1, strongest: false, weakest: true } };
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, brokeBottomsFirst: true }, universeRank: weakGroup }), "bearish").passed).toBe(true);
  });

  it("mirrors for a short: topped first, failed the first-year high, weak", () => {
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, toppedFirst: true, firstYearHighCrossed: false } }), "bearish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, brokeBottomsFirst: true }, universeRank: { percentile: 0.1, peers: 700, strongest: false, weakest: true, group: null } }), "bearish").passed).toBe(true);
    expect(relativeStrengthPillar(facts({ leadership: { ...lead, bottomedFirst: true, firstYearHighCrossed: true }, universeRank: { percentile: 0.9, peers: 700, strongest: true, weakest: false, group: null } }), "bearish").passed).toBe(false);
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

  it("needs both price and time squared and the reaction in its limit; the dated window is not a check", () => {
    expect(TIME_PILLAR_COMBINE).toBe("and");
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("normal") }).passed).toBe(true);
    expect(timePillar({ side: "bullish", squared: false, facts: withTrend("normal") }).passed).toBe(false);
    expect(timePillar({ side: "bullish", squared: true, facts: withTrend("secondMonth") }).passed).toBe(false);
    const note = timePillar({ side: "bullish", squared: true, facts: withTrend("normal") }).note;
    expect(note).toContain("Both are needed");
    expect(note).not.toMatch(/window/i);
  });

  it("reads a counter-trend move that has outrun its limit as in time, mirrored for a short", () => {
    const against = facts({ counterMove: { trend: "bearish", inCounterMove: true, phase: "secondMonth" } });
    expect(reactionInTimeLimit("bullish", against)).toBe(true);
    expect(reactionInTimeLimit("bearish", against)).toBe(false);
    expect(reactionInTimeLimit("bullish", null)).toBe(false);
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
      // Since 2026-10-21 the old level is the one the last reaction held at, read in the facts.
      pillarFacts: facts({ heldLevels: { bullish: { price: 98, timeframe: "1Week", extreme: 97.5, sessionsAgo: 3 }, bearish: null } }),
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

describe("P1's year check reads the decade digit at the session's month (2026-10-21)", () => {
  it("in the fall of a '6' year neither side takes the year point from the digit", async () => {
    const { readDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { readPillarFacts } = await import("@/lib/scoring/pillars");
    const bars: Bar[] = Array.from({ length: 80 }, (_, i) => {
      const c = 50 + (i % 10);
      return { t: new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1_000_000 };
    });
    const read = (iso: string) => {
      const asOf = new Date(iso);
      const daily = bars.filter((b) => b.t < iso);
      const rules = readDisclosedRules(daily, daily[daily.length - 1].c, null, asOf);
      return readPillarFacts({ rules, daily, monthly: [], marketDaily: null, universe: null, oldLevels: [], price: daily[daily.length - 1].c, asOf });
    };
    // July 2026: the bull year; the digit gives a long its point.
    expect(read("2026-07-25T12:00:00Z").decadeBias).toBe("bullish");
    // September 2026: the fall culmination. Before the fix this read
    // "bullish", so every long took the point free and no short could.
    const fall = read("2026-09-15T12:00:00Z");
    expect(fall.decadeBias).toBe("mixed");
    const long = marketCyclePillar({ ...fall, marketTrend: "bullish", yearTrend: "inside" }, "bullish");
    const short = marketCyclePillar({ ...fall, marketTrend: "bearish", yearTrend: "inside" }, "bearish");
    expect(long.passed).toBe(short.passed);
  });
});
