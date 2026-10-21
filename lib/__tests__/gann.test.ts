import { describe, expect, it } from "vitest";
import { passingPillarFacts } from "@/lib/scoring/__tests__/pillarFixtures";
import { squareOf9Levels, nearestS9Level, recentSquareOf9Levels } from "@/lib/gann/squareOf9";
import { computeFanLines } from "@/lib/gann/fans";
import { RETRACEMENT_ANGLE_PAIRS } from "@/lib/gann/secondaryTime";
import { timeCycles } from "@/lib/gann/timeCycles";
import { computeScore } from "@/lib/scoring/score";
import { CRITERION_KEYS, type CriterionWeights } from "@/lib/scoring/weights";

/**
 * These `computeScore` tests check raw pass/fail arithmetic (does a
 * full-confluence setup reach 9, does losing one criterion drop the score by
 * exactly 1) — only true when every criterion is worth one point.
 * `DEFAULT_CRITERION_WEIGHTS` (the fallback `computeScore` uses when no
 * `weights` is supplied) is uniform again as of 2026-09-16, so it matches
 * this today — see its own doc comment in lib/scoring/weights.ts. Pass this
 * explicitly anyway, so the arithmetic below stays meaningful regardless of
 * what the live default becomes later.
 */
const UNIFORM_WEIGHTS: CriterionWeights = Object.fromEntries(
  CRITERION_KEYS.map((k) => [k, 1]),
) as CriterionWeights;
import type { Bar, TrendReading } from "@/lib/types";

function bar(t: string, h: number, l: number): Bar {
  return { t, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1000 };
}

describe("squareOf9Levels", () => {
  it("produces the classic 360° doubling relationship", () => {
    // One full rotation from anchor 100: (sqrt(100) + 2)² = 144
    const levels = squareOf9Levels(100, 100);
    const prices = levels.map((l) => l.price.toFixed(2));
    expect(prices).toContain("144.00");
    // 90° = (10 + 0.5)² = 110.25
    expect(prices).toContain("110.25");
    // 180° = (10 + 1)² = 121
    expect(prices).toContain("121.00");
  });

  it("reads all 16 lines of the square, one every 22.5° (Gann's plate, Vol. 3 p. 34)", () => {
    const first = squareOf9Levels(100, 100, 0).filter((l) => l.price > 100);
    expect(new Set(first.map((l) => l.degree)).size).toBe(15); // 22.5 to 337.5; 0 is the anchor itself
    // 22.5° = (10 + 0.125)² = 102.515625
    expect(first.some((l) => Math.abs(l.price - 102.515625) < 1e-9 && l.degree === 22.5)).toBe(true);
  });

  it("sorts by distance from current price and respects proximity gate", () => {
    const levels = squareOf9Levels(100, 121.5);
    expect(levels[0].price).toBeCloseTo(121, 0);
    expect(nearestS9Level(levels, 1.0)).not.toBeNull();
    const far = squareOf9Levels(100, 300);
    // nearest may still exist but must be within 1% to pass the gate
    const gate = nearestS9Level(far, 0.0001);
    expect(gate).toBeNull();
  });
});

describe("recentSquareOf9Levels", () => {
  it("anchors from the most recent high AND low, not a single stale window-wide low", () => {
    // A deep low early in the window (bar 0, low 50) that's long since
    // irrelevant, then a recent, shallower low (bar 8) and a recent high
    // (bar 5) that actually govern the current move.
    const bars: Bar[] = [
      bar("2026-01-01", 55, 50), // stale window-wide low — must NOT anchor
      bar("2026-01-02", 65, 60),
      bar("2026-01-03", 75, 70),
      bar("2026-01-04", 85, 80),
      bar("2026-01-05", 95, 90),
      bar("2026-01-06", 105, 100), // recent pivot high
      bar("2026-01-07", 95, 90),
      bar("2026-01-08", 85, 80),
      bar("2026-01-09", 75, 70), // recent pivot low
      bar("2026-01-10", 85, 80),
      bar("2026-01-11", 95, 90),
    ];
    const stale = squareOf9Levels(50, 90);
    const recent = recentSquareOf9Levels(bars, 90);
    // A level unique to spiraling off the stale low should not appear.
    const staleOnlyPrice = stale.find((l) => l.rotation === 3)?.price;
    expect(staleOnlyPrice).toBeDefined();
    expect(recent.some((l) => Math.abs(l.price - staleOnlyPrice!) < 0.01)).toBe(false);
  });

  it("returns nothing below the minimum bar count", () => {
    expect(recentSquareOf9Levels([bar("2026-01-01", 105, 100)], 100)).toEqual([]);
  });
});

describe("timeCycles", () => {
  /** 40 daily bars from 2025-01-01 with one deep pivot low at i=20 (2025-01-21). */
  function pivotLowBars(): Bar[] {
    const dayMs = 24 * 3600 * 1000;
    const bars: Bar[] = [];
    const start = new Date("2025-01-01T00:00:00Z");
    for (let i = 0; i < 40; i++) {
      const t = new Date(start.getTime() + i * dayMs).toISOString();
      const l = i === 20 ? 50 : 100 - Math.abs(i - 20);
      bars.push(bar(t, l + 10, l));
    }
    return bars;
  }

  // One day = one degree; the key counts are 45, 90, 120, 135, 180, 225, 240,
  // 270, 315 and 360 days (W003 p.18; W022 p.371: a "time" is 360, half 180).
  it("opens a window on each of the ten degree counts from a pivot, and not between them", () => {
    const bars = pivotLowBars();
    for (const count of [45, 90, 120, 135, 180, 225, 240, 270, 315, 360]) {
      const asOf = new Date("2025-01-21T00:00:00Z");
      asOf.setUTCDate(asOf.getUTCDate() + count);
      const r = timeCycles(bars, asOf);
      expect(r.active, `${count} days`).toBe(true);
      expect(r.bullishActive, `${count} days`).toBe(true);
      // The count's own date, not only an overlapping day-count band.
      expect(r.dates, `${count} days`).toContain(asOf.toISOString().slice(0, 10));
    }
    const between = new Date("2025-01-21T00:00:00Z");
    between.setUTCDate(between.getUTCDate() + 100); // outside every count and day-count band
    expect(timeCycles(bars, between).active).toBe(false);
  });

  // The anniversary of a major low, the same calendar date a year later, is a
  // time to watch (W033 p.4; the 1-year cycle in MAJOR_CYCLE_YEARS).
  it("opens a window on the same calendar date a year after a pivot", () => {
    const bars = pivotLowBars();
    expect(timeCycles(bars, new Date("2026-01-21T00:00:00Z")).active).toBe(true);
    expect(timeCycles(bars, new Date("2026-01-31T00:00:00Z")).active).toBe(false);
  });


  it("tags a low-anchored window bullish and a high-anchored window bearish", () => {
    const dayMs = 24 * 3600 * 1000;
    const bars: Bar[] = [];
    const start = new Date("2025-01-01T00:00:00Z");
    for (let i = 0; i < 40; i++) {
      const t = new Date(start.getTime() + i * dayMs).toISOString();
      // A pivot low at i=20, flanked by a deep swing either side.
      const l = i === 20 ? 50 : 100 - Math.abs(i - 20);
      bars.push(bar(t, l + 10, l));
    }
    const asOf = new Date(bars[20].t.slice(0, 10) + "T00:00:00Z");
    asOf.setDate(asOf.getDate() + 90); // one of the fixed wheel counts
    const result = timeCycles(bars, asOf);
    expect(result.bullishActive).toBe(true);
    expect(result.bearishActive).toBe(false);
    expect(result.active).toBe(true);
  });

  it("catches a major cycle-year anniversary (10 years), not just 1-3 years out", () => {
    // A2.1 Ch. 7's full disclosed cycle hierarchy (2026-09-16) replaced the
    // old 1-3-year-only anniversary loop with MAJOR_CYCLE_YEARS
    // (1,2,3,5,7,10,15,20,30,50,60) — this pins the 10-year case.
    const dayMs = 24 * 3600 * 1000;
    const bars: Bar[] = [];
    const start = new Date("2025-01-01T00:00:00Z");
    for (let i = 0; i < 40; i++) {
      const t = new Date(start.getTime() + i * dayMs).toISOString();
      const l = i === 20 ? 50 : 100 - Math.abs(i - 20);
      bars.push(bar(t, l + 10, l));
    }
    const asOf = new Date(bars[20].t.slice(0, 10) + "T00:00:00Z");
    asOf.setFullYear(asOf.getFullYear() + 10);
    const result = timeCycles(bars, asOf);
    expect(result.bullishActive).toBe(true);
    expect(result.active).toBe(true);
  });

  it("reports inactive with too little daily history", () => {
    // Fixed asOf, safely between fixed-calendar windows (A4), so this
    // assertion doesn't flake near one of them (see FIXED_CALENDAR_WINDOWS).
    const asOf = new Date("2026-01-20T00:00:00Z");
    const result = timeCycles([bar("2026-01-01", 101, 100)], asOf);
    expect(result).toEqual({
      active: false,
      bullishActive: false,
      bearishActive: false,
      dates: [],
      fixedCalendarActive: false,
      fixedCalendarDates: [],
    });
  });

  describe("fixed annual calendar cycle (A4)", () => {
    it("marks the window active inside a disclosed window", () => {
      const result = timeCycles([], new Date("2026-02-09T00:00:00Z"));
      expect(result.fixedCalendarActive).toBe(true);
      expect(result.fixedCalendarDates[0]).toBe("2026-02-08");
    });

    it("uses Gann's late-month windows for Mar/Jun/Sep/Dec, not the 5th", () => {
      // The pre-2026-09-27 code fired on the 5th of these months.
      expect(timeCycles([], new Date("2026-03-05T00:00:00Z")).fixedCalendarActive).toBe(false);
      expect(timeCycles([], new Date("2026-03-22T00:00:00Z")).fixedCalendarActive).toBe(true);
      expect(timeCycles([], new Date("2026-06-22T00:00:00Z")).fixedCalendarActive).toBe(true);
      expect(timeCycles([], new Date("2026-09-23T00:00:00Z")).fixedCalendarActive).toBe(true);
      expect(timeCycles([], new Date("2026-12-24T12:00:00Z")).fixedCalendarActive).toBe(true);
    });

    it("widens each window by windowDays at both ends", () => {
      // Aug 3-8, default windowDays 2: Aug 1 and Aug 10 in, Jul 31 and Aug 11 out.
      expect(timeCycles([], new Date("2026-08-01T00:00:00Z")).fixedCalendarActive).toBe(true);
      expect(timeCycles([], new Date("2026-08-10T23:00:00Z")).fixedCalendarActive).toBe(true);
      expect(timeCycles([], new Date("2026-07-31T00:00:00Z")).fixedCalendarActive).toBe(false);
      expect(timeCycles([], new Date("2026-08-11T00:00:00Z")).fixedCalendarActive).toBe(false);
    });

    it("lists upcoming window starts within 14 days", () => {
      const result = timeCycles([], new Date("2026-03-10T00:00:00Z"));
      expect(result.fixedCalendarActive).toBe(false);
      expect(result.fixedCalendarDates).toEqual(["2026-03-21"]);
    });

    it("rolls over the year end", () => {
      const result = timeCycles([], new Date("2026-12-30T00:00:00Z"));
      expect(result.fixedCalendarActive).toBe(false);
      expect(result.fixedCalendarDates).toEqual([]);
      expect(timeCycles([], new Date("2027-02-06T00:00:00Z")).fixedCalendarActive).toBe(true);
    });

    it("does not mark the window active far from any named date", () => {
      const result = timeCycles([], new Date("2026-01-20T00:00:00Z"));
      expect(result.fixedCalendarActive).toBe(false);
    });
  });
});

describe("computeFanLines", () => {
  it("returns fan lines sorted by proximity for a trending series", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 60; i++) {
      const base = 100 + i * 0.5 + Math.sin(i / 5) * 3;
      bars.push({ t: `2026-01-${(i % 28) + 1}T00:00:00Z`, o: base, h: base + 2, l: base - 2, c: base + 1, v: 1000 });
    }
    const lines = computeFanLines(bars, bars[bars.length - 1].c);
    expect(lines.length).toBeGreaterThan(0);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].distancePct).toBeGreaterThanOrEqual(lines[i - 1].distancePct);
    }
  });

  it("projects the 1x1 angle's time target as exactly one base-swing interval forward, and 2x1 as double", () => {
    // A confirmed low pivot at i=19, then a confirmed high pivot at i=39 --
    // the down-swing into the low (20 calendar days) is the "base interval"
    // B10's rule projects forward from the high anchor.
    const price = (i: number) => (i <= 19 ? 140 - i : i <= 39 ? 122 + (i - 20) : 140 - (i - 40));
    const bars: Bar[] = Array.from({ length: 50 }, (_, i) => ({
      t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      o: price(i),
      h: price(i) + 1,
      l: price(i) - 1,
      c: price(i),
      v: 1000,
    }));

    const lines = computeFanLines(bars, bars[bars.length - 1].c);
    const highAnchorLines = lines.filter((l) => l.angle.includes("(high)"));
    expect(highAnchorLines.length).toBeGreaterThan(0);
    const oneByOne = highAnchorLines.find((l) => l.angle.startsWith("1x1"));
    const twoByOne = highAnchorLines.find((l) => l.angle.startsWith("2x1"));
    expect(oneByOne?.timeProjectionDate).not.toBeNull();
    expect(twoByOne?.timeProjectionDate).not.toBeNull();
    const anchorMs = new Date("2026-02-09T00:00:00Z").getTime(); // day index 39
    const oneByOneMs = new Date(oneByOne!.timeProjectionDate!).getTime();
    const twoByOneMs = new Date(twoByOne!.timeProjectionDate!).getTime();
    // 2x1's projected interval forward from the anchor should be exactly
    // double 1x1's (ratio 2 vs ratio 1, same base interval).
    expect(twoByOneMs - anchorMs).toBe(2 * (oneByOneMs - anchorMs));
  });
});

describe("computeScore", () => {
  const trend = (
    timeframe: TrendReading["timeframe"],
    direction: TrendReading["direction"],
  ): TrendReading => ({ timeframe, direction, support: [], resistance: [] });

  it("maps a full-confluence setup to Execute", () => {
    const decision = computeScore({
      direction: "bullish",
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      swingChart: { threeDay: "bullish", weekly: "bullish" },
      timePriceSquare: [
        { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, priceMove: 10, priceMovePoints: 10, squared: true },
      ],
      volumeClimax: [
        { anchorKind: "low", anchorPrice: 90, anchorIndex: 0, relativeVolume: 2, bestRecentRelativeVolume: 2, climax: true, dryingUp: false, retestOnLowerVolume: false, confirms: true },
      ],
      gann: {
        fanLines: [],
        squareOf9: [{ degree: 90, price: 100.2, distancePct: 0.3, role: "support" }],
        timeCycleActive: true,
        timeCycleBullishActive: true,
        timeCycleBearishActive: false,
        timeCycleDates: [],
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
        ],
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "support", importance: 1 }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
      nearSupportResistance: true,
      srMatch: { price: 99.8, timeframe: "1Day", role: "support" },
      pattern: {
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: 100.5,
        stopPrice: 86,
        description: "",
      },
      // The trade is armed by the swing-level crossing now, not by this
      // bar sequence. Same values, so the fixture's intent is unchanged.
      gannTrigger: { direction: "bullish", triggerPrice: 100.5, stopPrice: 86 },
      momentumElevated: true,
      stopAtrMultiple: 2,
      levels: {
        entry: 100.5,
        stopLoss: 86,
        stopBehindOldLevel: true,
        takeProfit1: 129.5,
        takeProfit2: 144,
        masterProfit: 144,
        riskPerShare: 14.5,
        rewardToRiskTp1: 2,
        rewardToRiskTp2: 3,
        rewardToRiskMaster: 3,
        masterFromStructure: true,
        stopPctOfPrice: 14.4,
        stopBandWarning: null,
      },
      weights: UNIFORM_WEIGHTS,
      pillarFacts: passingPillarFacts(),
    });
    expect(decision.score).toBe(9);
    expect(decision.outputState).toBe("Execute");
  });

  it("does not award structural-proximity points for a level on the wrong side of the trade", () => {
    // Same setup as full-confluence above, but every structural level is a
    // resistance ceiling overhead instead of a support floor underneath —
    // the opposite of what a bullish (long) trade wants. Proximity alone
    // used to score this identically to the supportive case; role must now
    // gate it.
    const decision = computeScore({
      direction: "bullish",
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      swingChart: { threeDay: "bullish", weekly: "bullish" },
      timePriceSquare: [
        { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, priceMove: 10, priceMovePoints: 10, squared: true },
      ],
      volumeClimax: [
        { anchorKind: "low", anchorPrice: 90, anchorIndex: 0, relativeVolume: 2, bestRecentRelativeVolume: 2, climax: true, dryingUp: false, retestOnLowerVolume: false, confirms: true },
      ],
      gann: {
        fanLines: [],
        squareOf9: [{ degree: 90, price: 100.2, distancePct: 0.3, role: "resistance" }],
        timeCycleActive: true,
        timeCycleBullishActive: true,
        timeCycleBearishActive: false,
        timeCycleDates: [],
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
        ],
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "resistance", importance: 1 }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
      nearSupportResistance: true,
      srMatch: { price: 100.4, timeframe: "1Day", role: "resistance" },
      pattern: {
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: 100.5,
        stopPrice: 86,
        description: "",
      },
      // The trade is armed by the swing-level crossing now, not by this
      // bar sequence. Same values, so the fixture's intent is unchanged.
      gannTrigger: { direction: "bullish", triggerPrice: 100.5, stopPrice: 86 },
      momentumElevated: true,
      stopAtrMultiple: 2,
      levels: {
        entry: 100.5,
        stopLoss: 86,
        stopBehindOldLevel: true,
        takeProfit1: 129.5,
        takeProfit2: 144,
        masterProfit: 144,
        riskPerShare: 14.5,
        rewardToRiskTp1: 2,
        rewardToRiskTp2: 3,
        rewardToRiskMaster: 3,
        masterFromStructure: true,
        stopPctOfPrice: 14.4,
        stopBandWarning: null,
      },
      weights: UNIFORM_WEIGHTS,
      // The major-range division in reach is overhead: resistance, the wrong role for a long.
      pillarFacts: {
        ...passingPillarFacts(),
        rangeLevels: {
          bullish: null,
          bearish: { price: 100.5, label: "1/2 of the extreme range (51.00-150.00)", basis: "extremeRange", importance: 1, role: "resistance", distancePct: 0.5 },
        },
      },
    });
    const byKey = Object.fromEntries(decision.breakdown.map((b) => [b.key, b.passed]));
    expect(byKey.gannRetracementConfluence).toBe(false);
    expect(byKey.historicalSR).toBe(false);
    // Neither gannAngleSlope nor volumeClimax is a level-role check (they
    // read realized slope and pivot volume, not a structural level's role),
    // so both still pass here. The two role-gated checks make up the
    // price-levels point, so that one point is lost.
    expect(byKey.gannAngleSlope).toBe(true);
    expect(byKey.volumeClimax).toBe(true);
    expect(byKey.priceLevels).toBe(false);
    expect(decision.score).toBe(8);
    expect(decision.outputState).toBe("Execute");
  });

  it("maps a weak setup to Reject", () => {
    const decision = computeScore({
      direction: "bullish",
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "sideways")],
      hourlyTrend: trend("1Hour", "bearish"),
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    });
    expect(decision.score).toBeLessThanOrEqual(3);
    expect(decision.outputState).toBe("Reject");
  });

  it("awards the retracement-confluence point regardless of the stop's share of price", () => {
    const item = (stopPctOfPrice: number) =>
      computeScore({
        direction: "bullish",
        macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
        hourlyTrend: trend("1Hour", "bearish"),
        gann: {
          fanLines: [],
          squareOf9: [],
          timeCycleActive: false,
          timeCycleBullishActive: false,
          timeCycleBearishActive: false,
          timeCycleDates: [],
          angleSlopes: [],
          retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.5, role: "support", importance: 1 }],
          digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
        },
        nearSupportResistance: false,
        pattern: null,
        momentumElevated: false,
        stopAtrMultiple: 0.8,
        levels: {
          entry: 100,
          stopLoss: 95,
          takeProfit1: 110,
          takeProfit2: 115,
          masterProfit: 115,
          riskPerShare: 5,
          rewardToRiskTp1: 2,
          rewardToRiskTp2: 3,
          rewardToRiskMaster: 3,
          masterFromStructure: true,
          stopPctOfPrice,
          stopBandWarning: null,
        },
        pillarFacts: passingPillarFacts(),
      }).breakdown.find((b) => b.key === "gannRetracementConfluence");

    // 5% and 30% both sit outside the old 12–18% band; only whether the
    // retracement zone + digital-root confluence holds matters now.
    expect(item(5)?.passed).toBe(true);
    expect(item(30)?.passed).toBe(true);
    expect(item(14.4)?.passed).toBe(true);
  });

  it("scores price/time squaring and no longer scores earnings", () => {
    const base = {
      direction: "bullish" as const,
      // Macro trend now scores agreement with the trade, not the old
      // counter-trend-into-a-level premise, so a full-confluence bullish
      // setup wants bullish macro too.
      macroTrends: [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "bullish")],
      hourlyTrend: trend("1Hour", "bullish"),
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
      weights: UNIFORM_WEIGHTS,
      pillarFacts: passingPillarFacts(),
    };
    const squared = computeScore({
      ...base,
      timePriceSquare: [
        { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, priceMove: 10, priceMovePoints: 10, squared: true },
      ],
    });
    const notSquared = computeScore({
      ...base,
      timePriceSquare: [
        { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, priceMove: 40, priceMovePoints: 40, squared: false },
      ],
    });

    expect(squared.score).toBe(notSquared.score + 1);
    expect(squared.breakdown.find((b) => b.criterion === "Price and time squared")?.passed).toBe(true);
    expect(squared.breakdown.filter((b) => b.pillar || b.checkOf)).toHaveLength(18);
    expect(squared.breakdown.some((b) => /earnings/i.test(b.criterion))).toBe(false);
  });

});

describe("turn windows one, two and three years from an important top or bottom (A-TIME-04, W006 pp.14, 44)", () => {
  const DAY = 86_400_000;
  const T0 = Date.UTC(2020, 0, 1);
  /** Flat at 100 with one V to 50 at day 40 (or an inverted V to 150), so the series has a single pivot. */
  function oneTurn(kind: "low" | "high"): Bar[] {
    return Array.from({ length: 120 }, (_, i) => {
      const depth = Math.max(0, 25 - Math.abs(i - 40)) * 2;
      const c = kind === "low" ? 100 - depth : 100 + depth;
      return { t: new Date(T0 + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
    });
  }
  const turnAt = (years: number, plusDays = 0) => {
    const d = new Date(T0 + 40 * DAY);
    d.setUTCFullYear(d.getUTCFullYear() + years);
    return new Date(d.getTime() + plusDays * DAY);
  };

  it("opens a buy-side window 1, 2 and 3 years after the low, and only within two days of it", () => {
    for (const y of [1, 2, 3]) {
      expect(timeCycles(oneTurn("low"), turnAt(y))).toMatchObject({ active: true, bullishActive: true, bearishActive: false });
      expect(timeCycles(oneTurn("low"), turnAt(y, 2)).bullishActive).toBe(true);
      expect(timeCycles(oneTurn("low"), turnAt(y, -2)).bullishActive).toBe(true);
      expect(timeCycles(oneTurn("low"), turnAt(y, 3)).active).toBe(false);
      expect(timeCycles(oneTurn("low"), turnAt(y, -3)).active).toBe(false);
      expect(timeCycles(oneTurn("low"), turnAt(y, 6)).active).toBe(false);
    }
  });

  it("projects each stock from its own turn (A-TIME-08, W006 pp.31, 35-37: each stock keeps its own time)", () => {
    // The same V a month later: its anniversary is a month later too.
    const later = oneTurn("low").map((b, i, all) => ({ ...all[Math.max(0, i - 30)], t: b.t }));
    expect(timeCycles(oneTurn("low"), turnAt(1)).active).toBe(true);
    expect(timeCycles(later, turnAt(1)).active).toBe(false);
    expect(timeCycles(later, turnAt(1, 30)).bullishActive).toBe(true);
  });

  it("opens a sell-side window 1, 2 and 3 years after the top", () => {
    for (const y of [1, 2, 3]) {
      expect(timeCycles(oneTurn("high"), turnAt(y))).toMatchObject({ active: true, bullishActive: false, bearishActive: true });
      expect(timeCycles(oneTurn("high"), turnAt(y, 6)).active).toBe(false);
    }
  });
});


describe("C-LEVELS-14: the Square of Nine's step per 45 degrees", () => {
  // Convention recorded: GSPS adds deg/180 to the root, so 45 degrees adds 0.25
  // and a full turn adds 2. The anonymous W009 table adds 1/8 per 45 degrees
  // (half that); the Master Course wheel's own diagonals (3, 13, 31, 57, 91)
  // step about 2 per turn, so GSPS keeps the Master Course convention.
  it("puts the 45-degree level from 100 at 10.25 squared, where W009's 10.125 squared is a 22.5-degree step", () => {
    const up45 = squareOf9Levels(100, 100).find((l) => l.degree === 45 && l.rotation === 0 && l.price > 100)!;
    expect(up45.price).toBeCloseTo(10.25 ** 2, 9);
    expect((Math.sqrt(100) + 22.5 / 180) ** 2).toBeCloseTo(10.125 ** 2, 9);
  });

  it("reproduces the wheel's diagonals within 1 point per full turn", () => {
    const diagonals = [3, 13, 31, 57, 91];
    for (let i = 0; i + 1 < diagonals.length; i++) {
      const turn = squareOf9Levels(diagonals[i], diagonals[i]).find((l) => l.degree === 0 && l.rotation === 1)!;
      expect(Math.abs(turn.price - diagonals[i + 1])).toBeLessThan(1);
    }
  });
});

describe("C-LEVELS-18: each retracement fraction paired with a fan angle", () => {
  it("maps 1/8 to 1x8 through 7/8 to 8x1", () => {
    expect(RETRACEMENT_ANGLE_PAIRS.map((p) => [p.label, p.angle])).toEqual([
      ["1/8", "1x8"], ["1/4", "1x4"], ["1/3", "1x3"], ["3/8", "1x2"], ["1/2", "1x1"],
      ["5/8", "2x1"], ["2/3", "3x1"], ["3/4", "4x1"], ["7/8", "8x1"],
    ]);
    for (const p of RETRACEMENT_ANGLE_PAIRS) {
      const [n, d] = p.label.split("/").map(Number);
      expect(p.fraction).toBeCloseTo(n / d, 12);
    }
  });
});
