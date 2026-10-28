import { describe, expect, it } from "vitest";
import type { GannLevels, TrendReading } from "@/lib/types";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";
import type { PillarFacts } from "@/lib/scoring/pillars";
import type { RangeDivisionMatch } from "@/lib/gann/rangeDivisions";
import { passingPillarFacts } from "@/lib/scoring/__tests__/pillarFixtures";
import { selectGannEntry } from "@/lib/gann/entryTrigger";
import { entryChart } from "@/lib/scan/entrySelection";

const EMPTY_GANN: GannLevels = {
  fanLines: [],
  squareOf9: [],
  timeCycleActive: false,
  timeCycleBullishActive: false,
  timeCycleBearishActive: false,
  timeCycleDates: [],
  angleSlopes: [],
  retracementLevels: [],
  digitalRootConfluences: [],
};

/**
 * A level only confirms confluence when it sits on the side that helps the
 * trade — a support floor for a long, a resistance ceiling for a short.
 *
 * Four committed real replay runs (docs/replay-runs/*.json) found
 * harmonicProximity passing correlated with *worse* expectancy than failing
 * it in all four, and the fan-line criterion it shared a band with was
 * dead on t-stat (retired 2026-09-10, replaced by gannAngleSlope) — both
 * consistent with a role-blind criterion mixing genuine confluence with a
 * headwind. See the comment on `wantedRole` in lib/scoring/score.ts.
 */
describe("computeScore volumeClimax", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  function climaxBreakdown(
    direction: "bullish" | "bearish",
    anchorKind: "low" | "high",
    climax: boolean,
  ) {
    const decision = computeScore({
      ...baseInputs(direction),
      volumeClimax: [
        { anchorKind, anchorPrice: 100, anchorIndex: 0, relativeVolume: climax ? 2 : 1, bestRecentRelativeVolume: climax ? 2 : 1, climax, dryingUp: false, retestOnLowerVolume: false, confirms: climax },
      ],
    });
    return decision.breakdown.find((b) => b.key === "volumeClimax")!;
  }

  it("reads the low anchor for a bullish setup and the high anchor for a bearish one", () => {
    // A high-anchored climax reading shouldn't confirm a bullish setup, and
    // vice versa — only the direction-matched anchor counts.
    expect(climaxBreakdown("bullish", "low", true).passed).toBe(true);
    expect(climaxBreakdown("bullish", "high", true).passed).toBe(false);
    expect(climaxBreakdown("bearish", "high", true).passed).toBe(true);
    expect(climaxBreakdown("bearish", "low", true).passed).toBe(false);
  });

  it("fails when the direction-matched anchor didn't print on a climax", () => {
    expect(climaxBreakdown("bullish", "low", false).passed).toBe(false);
  });

  it("fails when there is no measurable reading at all", () => {
    const decision = computeScore(baseInputs("bullish"));
    expect(decision.breakdown.find((b) => b.key === "volumeClimax")?.passed).toBe(false);
  });
});

describe("computeScore gannAngleSlope", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  it("passes a bullish setup holding at/above the 1x1 angle off the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.2, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
          { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 5, slope: -0.5, nearestAngle: { label: "1x2", ratio: 0.5, direction: "down" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });

  // Loosened 2026-09-11: confirmed starved (2.2%/1.9% pass rate on two
  // independent large-sample unconditioned runs, one also significantly
  // inverted) when it required 1x1-or-steeper — see
  // lib/validation/criteria-registry.ts's gannAngleSlope entry. Now accepts
  // 1x2-or-steeper, the next rung down on the same ANGLES ladder
  // (lib/gann/fans.ts).
  it("passes a bullish setup holding at/above the (looser) 1x2 angle off the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 0.6, nearestAngle: { label: "1x2", ratio: 0.5, direction: "up" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });

  it("fails a bullish setup below the low-anchor 1x2 angle", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 0.2, nearestAngle: { label: "1x4", ratio: 0.25, direction: "up" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(false);
  });

  it("reads the high anchor for a bearish setup, not the low anchor", () => {
    const decision = computeScore({
      ...baseInputs("bearish"),
      gann: {
        ...EMPTY_GANN,
        angleSlopes: [
          { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.2, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
          { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 5, slope: -1.3, nearestAngle: { label: "1x1", ratio: 1, direction: "down" } },
        ],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannAngleSlope")?.passed).toBe(true);
  });
});

describe("computeScore gannRetracementConfluence", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({
    timeframe: "1Day",
    direction,
    support: [],
    resistance: [],
  });

  function baseInputs(direction: "bullish" | "bearish"): ScoreInputs {
    return {
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    };
  }

  // P5(b) reads the major-range divisions from the pillar facts (2026-10-21),
  // not the last daily swing's divisions in `gann.retracementLevels`.
  const half: RangeDivisionMatch = {
    price: 100, label: "1/2 of the extreme range (50.00-150.00)", basis: "extremeRange", importance: 1, role: "support", distancePct: 0.1,
  };
  const facts = (rangeLevels: PillarFacts["rangeLevels"]): PillarFacts => ({ ...passingPillarFacts("bullish"), rangeLevels });
  const passedFor = (d: ReturnType<typeof computeScore>) => d.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed;

  it("never gates on digital-root/vortex confluence alone: a range-division match is also required", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: { ...EMPTY_GANN, digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }] },
      pillarFacts: facts({ bullish: null, bearish: null }),
    });
    expect(passedFor(decision)).toBe(false);
  });

  it("passes on the range-division match alone: the digital root is context, never a gate (FL5 a)", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: { ...EMPTY_GANN, digitalRootConfluences: [{ anchorKind: "low", priceRoot: 2, timeRoot: 5, type: "NO_CONFLUENCE" }] },
      pillarFacts: facts({ bullish: half, bearish: null }),
    });
    expect(passedFor(decision)).toBe(true);
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.note).toMatch(/1\/2 of the extreme range/);
  });

  it("passes when the role-matched division holds, with a digital-root reading on the card", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: { ...EMPTY_GANN, digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }] },
      pillarFacts: facts({ bullish: half, bearish: null }),
    });
    expect(passedFor(decision)).toBe(true);
  });

  it("ignores a division in the other role", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      pillarFacts: facts({ bullish: null, bearish: { ...half, role: "resistance" } }),
    });
    expect(passedFor(decision)).toBe(false);
  });

  it("no longer passes on a division of the last daily swing", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support", importance: 1 }],
      },
      pillarFacts: facts({ bullish: null, bearish: null }),
    });
    expect(passedFor(decision)).toBe(false);
  });
});

// Q23 (owner, 2026-10-16): the scored stop point is Gann's rule, an old level
// 3 points in front of the stop (W006 pp.20-24, 46-47), on every asset class.
// It replaced `stopRoom` (an ATR multiple, or "anchored to S/R" for stocks).
describe("computeScore stopBehindOldLevel", () => {
  function baseInputs(stopBehindOldLevel: boolean | undefined, assetClass: "us_equity" | "crypto" = "us_equity"): ScoreInputs {
    return {
      direction: "bullish",
      macroTrends: [],
      hourlyTrend: { timeframe: "1Day", direction: "sideways", support: [], resistance: [] },
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      assetClass,
      levels: stopBehindOldLevel === undefined ? null : ({ stopBehindOldLevel } as unknown as ScoreInputs["levels"]),
    };
  }
  const item = (i: ScoreInputs) => computeScore(i).breakdown.find((b) => b.key === "stopBehindOldLevel");

  it("passes when an old level stands 3 points in front of the stop, on stocks and crypto alike", () => {
    expect(item(baseInputs(true))?.passed).toBe(true);
    expect(item(baseInputs(true, "crypto"))?.passed).toBe(true);
    expect(item(baseInputs(true))?.criterion).toBe("Stop 3 points behind an old level");
  });

  it("fails without such a level, or without a plan", () => {
    expect(item(baseInputs(false))?.passed).toBe(false);
    expect(item(baseInputs(undefined))?.passed).toBe(false);
  });

  it("reads no ATR multiple", () => {
    expect(item({ ...baseInputs(false, "crypto"), stopAtrMultiple: 5 })?.passed).toBe(false);
    expect(computeScore(baseInputs(true)).breakdown.some((b) => (b.key as string) === "stopRoom")).toBe(false);
  });
});

/**
 * The armed trigger's note names the level the close crossed, and says when
 * that close was a new record on the chart (PLAN.md item 5, step 3).
 */
describe("computeScore entryTriggerArmed note", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({ timeframe: "1Day", direction, support: [], resistance: [] });
  const note = (gannTrigger: ScoreInputs["gannTrigger"]) =>
    computeScore({
      direction: gannTrigger?.direction ?? "bullish",
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      gannTrigger,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
    }).breakdown.find((b) => b.key === "entryTriggerArmed")!.note;
  const crossing = { triggerPrice: 125.5, stopPrice: 114.5, direction: "bullish" as const, kind: "crossing" as const, level: 120 };

  it("names the level by where it came from", () => {
    expect(note({ ...crossing, source: "swing" })).toMatch(/crosses the last completed swing level by 3 points/);
    expect(note({ ...crossing, source: "priorYear" })).toMatch(/crosses the previous year's top by 3 points/);
    expect(note({ ...crossing, source: "allTime" })).toMatch(/crosses the record high before the last 52 weeks by 3 points/);
  });

  it("names a regained old bottom, and a lost old top, as such (A-TREND-10)", () => {
    expect(note({ ...crossing, source: "swing", regained: true })).toMatch(
      /a close at 125\.50 is 3 points back over the old swing low after a 3-point break under it, and the entry then waits/,
    );
    expect(note({ ...crossing, direction: "bearish", source: "priorYear", levelYear: 2024, regained: true })).toMatch(
      /3 points back under the 2024 top after a 3-point break over it/,
    );
  });

  it("states the narrow-week sale on the plan that carries it (A-ENTRY-19)", () => {
    expect(note({ triggerPrice: 99, stopPrice: 102, direction: "bearish", kind: "hold", level: 99.5, holdBasis: "narrowWeek" })).toMatch(
      /a sell rests 1 point under that week's low at 99\.50, for the bounce, with the stop 3 points over it/,
    );
  });

  it("names a previous year's level by its year", () => {
    expect(note({ ...crossing, source: "priorYear", levelYear: 2024 })).toMatch(/crosses the 2024 top by 3 points/);
    expect(note({ ...crossing, direction: "bearish", source: "priorYear", levelYear: 2024 })).toMatch(/crosses the 2024 bottom by 3 points/);
  });

  it("ranks a crossed level formed years earlier above an equally near level formed weeks earlier (A-ENTRY-09)", () => {
    // 2021's top is 100, and a swing top a cent above it formed weeks before
    // the close that crossed both. They are one level, equally near the
    // price; the older reading names it.
    const DAY = 86_400_000;
    const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
    const t0 = Date.parse("2026-01-05T04:00:00Z");
    const closes = [...leg(90, 99.71, 10), ...leg(99.71, 92, 20), ...leg(92, 106, 20), ...leg(106, 103.5, 3)];
    const d = closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: 1e6 }));
    const m = Array.from({ length: 120 }, (_, i) => {
      const y = 2016 + Math.floor(i / 12);
      const month = `${y}-${String((i % 12) + 1).padStart(2, "0")}`;
      // The record is 2018's 150, so 2021's top is a year's top and nothing more.
      const [h, l] = month === "2021-04" ? [100, 90] : month === "2018-02" ? [150, 120] : [80, 70];
      return { t: `${month}-01T05:00:00Z`, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1e8 };
    });
    const chart = entryChart(d, m, "2026-06-01");
    const t = selectGannEntry(chart.bars, "bullish", chart.older)!;
    expect(t).toMatchObject({ kind: "crossing", held: true, source: "priorYear", levelYear: 2021, formedAt: "2021-04-01T05:00:00Z" });
    expect(Math.abs(t.level - 100)).toBeLessThanOrEqual(0.01);
    expect(note({ ...t, triggerPrice: t.reactionEntry, stopPrice: t.reactionStop })).toMatch(/crosses the 2021 top by 3 points/);
  });

  it("says when the crossing close was a new record, and only then", () => {
    expect(note({ ...crossing, source: "allTime", newRecord: true })).toMatch(/That close was a new record high on the chart\.$/);
    expect(note({ ...crossing, source: "allTime", newRecord: false })).not.toMatch(/new record/);
    expect(note({ ...crossing, source: "swing" })).not.toMatch(/new record/);
  });
});

// M-R3 (review 22): the scored point reads the call's own side. Since
// 2026-10-28 it reads the trend the rule leaves standing on the daily chart,
// with neither the weekly nor the monthly rule reading against it.
describe("computeScore ruleOfThree", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({ timeframe: "1Day", direction, support: [], resistance: [] });
  const r3 = (t: "bullish" | "bearish" | null, streak = 0) => ({
    consecutiveHigherCloses: t === "bullish" ? streak : 0,
    consecutiveLowerCloses: t === "bearish" ? streak : 0,
    bullishSignal: t === "bullish" && streak >= 3,
    bearishSignal: t === "bearish" && streak >= 3,
    trend: t,
  });
  const item = (direction: "bullish" | "bearish", extra: Partial<ScoreInputs>) =>
    computeScore({
      direction,
      macroTrends: [trend("sideways"), trend("sideways"), trend("sideways")],
      hourlyTrend: trend("sideways"),
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      stopAtrMultiple: 0.8,
      levels: null,
      ...extra,
    }).breakdown.find((b) => b.key === "ruleOfThree")!;

  it("reads the standing trend, not only the day a run of three prints", () => {
    expect(item("bullish", { ruleOfThree: r3("bullish", 3) }).passed).toBe(true);
    // A one-day reaction inside the up trend: the run is over, the trend stands.
    expect(item("bullish", { ruleOfThree: r3("bullish", 0) }).passed).toBe(true);
    expect(item("bullish", { ruleOfThree: r3("bearish") }).passed).toBe(false);
    expect(item("bearish", { ruleOfThree: r3("bearish") }).passed).toBe(true);
    expect(item("bearish", { ruleOfThree: r3("bullish") }).passed).toBe(false);
    expect(item("bullish", { ruleOfThree: r3(null) }).passed).toBe(false);
  });

  it("fails when the weekly or monthly rule reads against the trade, and names it", () => {
    const weekly = item("bullish", { ruleOfThree: r3("bullish"), ruleOfThreeWeekly: r3("bearish") });
    expect(weekly.passed).toBe(false);
    expect(weekly.note).toMatch(/weekly trend against/);
    const monthly = item("bearish", { ruleOfThree: r3("bearish"), ruleOfThreeWeekly: r3(null), ruleOfThreeMonthly: r3("bullish") });
    expect(monthly.passed).toBe(false);
    expect(monthly.note).toMatch(/monthly trend against/);
    expect(item("bearish", { ruleOfThree: r3("bearish"), ruleOfThreeWeekly: r3("bearish"), ruleOfThreeMonthly: r3(null) }).passed).toBe(true);
    // The higher charts alone never pass it.
    expect(item("bullish", { ruleOfThree: r3(null), ruleOfThreeWeekly: r3("bullish") }).passed).toBe(false);
  });
});
