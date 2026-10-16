import { describe, expect, it } from "vitest";
import type { GannLevels, TrendReading } from "@/lib/types";
import { computeScore, type ScoreInputs } from "@/lib/scoring/score";
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

  it("never gates on digital-root/vortex confluence alone — a retracement match is also required", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(false);
  });

  it("passes on the retracement match alone: the digital root is context, never a gate (FL5 a)", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support", importance: 1 }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 2, timeRoot: 5, type: "NO_CONFLUENCE" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(true);
  });

  it("passes when the role-matched retracement zone holds, with a digital-root reading on the card", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "support", importance: 1 }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(true);
  });

  it("ignores a wrong-role retracement zone", () => {
    const decision = computeScore({
      ...baseInputs("bullish"),
      gann: {
        ...EMPTY_GANN,
        retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100, distancePct: 0.1, role: "resistance", importance: 1 }],
        digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
      },
    });
    expect(decision.breakdown.find((b) => b.key === "gannRetracementConfluence")?.passed).toBe(false);
  });
});

// 2026-09-11: us_equity's stopRoom asks "did this stop come from a real
// structural level, not the fallback" instead of "is the stop >= 1.5x ATR" —
// see hasStopRoom's own comment in lib/scoring/score.ts for why the R/ATR
// question stopped meaning anything once equities moved to the percent model.
describe("computeScore stopRoom (equities)", () => {
  function baseInputs(direction: "bullish" | "bearish", stopFromStructure: boolean | undefined): ScoreInputs {
    return {
      direction,
      macroTrends: [],
      hourlyTrend: { timeframe: "1Day", direction: "sideways", support: [], resistance: [] },
      gann: EMPTY_GANN,
      nearSupportResistance: false,
      pattern: null,
      momentumElevated: false,
      assetClass: "us_equity",
      levels:
        stopFromStructure === undefined
          ? null
          : ({ stopFromStructure } as unknown as ScoreInputs["levels"]),
    };
  }

  it("passes when the equity stop is anchored to real structure", () => {
    const decision = computeScore(baseInputs("bullish", true));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(true);
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.criterion).toBe("Stop backed by real structure");
  });

  it("fails when the equity stop fell back to the fixed percentage", () => {
    const decision = computeScore(baseInputs("bullish", false));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("fails when no equity trade plan was priced at all", () => {
    const decision = computeScore(baseInputs("bullish", undefined));
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("ignores stopAtrMultiple entirely for equities, even when supplied", () => {
    // A caller that still computes stopAtrMultiple (both real call sites do,
    // for every asset class) must not let it leak into the equity verdict.
    const decision = computeScore({ ...baseInputs("bullish", false), stopAtrMultiple: 5 });
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(false);
  });

  it("keeps the ATR-multiple question for non-equity asset classes", () => {
    const decision = computeScore({
      ...baseInputs("bullish", false),
      assetClass: "crypto",
      stopAtrMultiple: 2,
    });
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.passed).toBe(true);
    expect(decision.breakdown.find((b) => b.key === "stopRoom")?.criterion).toMatch(/ATR/);
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

// M-R3 (review 22): the scored point reads the call's own side, on the daily
// chart or, failing that, the weekly or monthly.
describe("computeScore ruleOfThree", () => {
  const trend = (direction: TrendReading["direction"]): TrendReading => ({ timeframe: "1Day", direction, support: [], resistance: [] });
  const r3 = (bullishSignal: boolean, bearishSignal: boolean) => ({
    consecutiveHigherCloses: bullishSignal ? 3 : 0,
    consecutiveLowerCloses: bearishSignal ? 3 : 0,
    bullishSignal,
    bearishSignal,
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

  it("reads three higher closes for a long and three lower closes for a short", () => {
    expect(item("bullish", { ruleOfThree: r3(true, false) }).passed).toBe(true);
    expect(item("bullish", { ruleOfThree: r3(false, true) }).passed).toBe(false);
    expect(item("bearish", { ruleOfThree: r3(false, true) }).passed).toBe(true);
    expect(item("bearish", { ruleOfThree: r3(true, false) }).passed).toBe(false);
  });

  it("passes on the weekly or monthly chart when the daily does not fire, and names it", () => {
    const weekly = item("bearish", { ruleOfThree: r3(false, false), ruleOfThreeWeekly: r3(false, true) });
    expect(weekly.passed).toBe(true);
    expect(weekly.note).toMatch(/weekly chart/);
    const monthly = item("bullish", { ruleOfThree: r3(false, false), ruleOfThreeWeekly: r3(false, false), ruleOfThreeMonthly: r3(true, false) });
    expect(monthly.passed).toBe(true);
    expect(monthly.note).toMatch(/monthly chart/);
    expect(item("bullish", { ruleOfThree: r3(false, false), ruleOfThreeWeekly: r3(false, true) }).passed).toBe(false);
  });
});
