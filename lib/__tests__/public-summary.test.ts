/**
 * The scoring model does not leave the server.
 *
 * `ScanDecision.breakdown` names every criterion, the threshold it tests and
 * the value that passed or failed it. It used to be serialised whole into
 * `/api/scan`, so the model was readable from a network response whether or
 * not the UI rendered it. These tests hold the boundary: what crosses it is a
 * pillar rollup, and nothing a reader could reassemble the criteria from.
 */

import { passingPillarFacts } from "@/lib/scoring/__tests__/pillarFixtures";
import { describe, expect, it } from "vitest";
import type {
  GannLevels,
  ScanDecision,
  ScanResult,
  StratPattern,
  TradeLevels,
  TrendReading,
} from "@/lib/types";
import { applyDataLagHold, computeScore, type ScoreInputs } from "@/lib/scoring/score";
import { FREE_EQUITY_FEED_DELAY_MS, decisionLag } from "@/lib/data/latency";
import {
  redactDecision,
  redactScanResult,
  toAnonymousScanResult,
  toPublicScoreSummary,
  SCORE_PILLARS,
} from "@/lib/scoring/public-summary";
import { CRITERION_KEYS, type CriterionWeights } from "@/lib/scoring/weights";
import { EMPTY_DISCLOSED_RULES, type DisclosedRulesContext } from "@/lib/gann/disclosedRules";
import { redactDisclosedRules } from "@/lib/signals/publicSummary";

/**
 * These fixtures check raw pass/fail arithmetic against fixed score values
 * (9, 0...) — only meaningful when every criterion is worth one point.
 * `DEFAULT_CRITERION_WEIGHTS` (what `computeScore` falls back to when no
 * `weights` is supplied) is uniform again as of 2026-09-16, so it matches
 * this today — but it is still supplied explicitly, so a future change to
 * the live default cannot silently break these fixtures. See that constant's
 * own doc comment in lib/scoring/weights.ts.
 */
const UNIFORM_WEIGHTS: CriterionWeights = Object.fromEntries(
  CRITERION_KEYS.map((k) => [k, 1]),
) as CriterionWeights;

const trend = (direction: TrendReading["direction"]): TrendReading => ({
  timeframe: "1Day",
  direction,
  support: [90],
  resistance: [110],
});

// direction below is "bullish" (a long), so every level here is a support
// floor underneath price — the side that actually confirms a long — not a
// resistance ceiling overhead.
const gann: GannLevels = {
  fanLines: [],
  squareOf9: [{ degree: 45, price: 100.5, distancePct: 0.2, role: "support" }],
  timeCycleActive: true,
  timeCycleBullishActive: true,
  timeCycleBearishActive: false,
  timeCycleDates: ["2026-08-06"],
  angleSlopes: [
    { anchorKind: "low", anchorPrice: 90, barsSinceAnchor: 10, slope: 1.1, nearestAngle: { label: "1x1", ratio: 1, direction: "up" } },
  ],
  retracementLevels: [{ fraction: 0.5, label: "1/2", price: 100.5, distancePct: 0.2, role: "support", importance: 1 }],
  digitalRootConfluences: [{ anchorKind: "low", priceRoot: 1, timeRoot: 8, type: "COMPLEMENTARY_PAIR" }],
};

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 85,
  stopBehindOldLevel: true,
  takeProfit1: 130,
  takeProfit2: 145,
  masterProfit: 145,
  riskPerShare: 15,
  rewardToRiskTp1: 2,
  rewardToRiskTp2: 3,
  rewardToRiskMaster: 3,
  stopPctOfPrice: 15,
  stopBandWarning: null,
};

const pattern: StratPattern = {
  name: "2-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 95,
  description: "",
};

/**
 * What actually arms the trade since 2026-09-17 — the swing-level crossing
 * (`lib/gann/entryTrigger.ts`), not the bar sequence above. Same prices, so
 * each fixture's intent is unchanged; `pattern` stays for the display role.
 */
const gannTrigger = { direction: "bullish" as const, triggerPrice: 100, stopPrice: 95 };

const allPass: ScoreInputs = {
  direction: "bullish",
  // Macro trend now scores agreement with the trade, not the old
  // counter-trend-into-a-level premise.
  macroTrends: [trend("bullish"), trend("bullish"), trend("bullish")],
  hourlyTrend: trend("bullish"),
  swingChart: { threeDay: "bullish", weekly: "bullish" },
  ruleOfThree: { consecutiveLowerCloses: 0, consecutiveHigherCloses: 2, bullishSignal: true, bearishSignal: false },
  timePriceSquare: [
    { anchorKind: "high", anchorPrice: 110, barsSinceAnchor: 10, priceMove: 10, priceMovePoints: 10, squared: true },
  ],
  volumeClimax: [
    { anchorKind: "low", anchorPrice: 90, anchorIndex: 0, relativeVolume: 2, bestRecentRelativeVolume: 2, climax: true, dryingUp: false, retestOnLowerVolume: false, confirms: true },
  ],
  gann,
  nearSupportResistance: true,
  pattern,
  gannTrigger,
  momentumElevated: true,
  stopAtrMultiple: 2,
  levels,
  weights: UNIFORM_WEIGHTS,
  pillarFacts: passingPillarFacts(),
};

const allFail: ScoreInputs = {
  direction: "bullish",
  macroTrends: [trend("bearish"), trend("bearish"), trend("bearish")],
  hourlyTrend: trend("bearish"),
  ruleOfThree: { consecutiveLowerCloses: 0, consecutiveHigherCloses: 0, bullishSignal: false, bearishSignal: false },
  gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
  nearSupportResistance: false,
  pattern: null,
  momentumElevated: false,
  stopAtrMultiple: 0.8,
  levels: null,
};

describe("toPublicScoreSummary", () => {
  it("accounts for every scored criterion exactly once", () => {
    const summary = toPublicScoreSummary(computeScore(allPass));

    expect(summary.max).toBe(9);
    expect(summary.pillars.reduce((n, p) => n + p.total, 0)).toBe(9);
    expect(summary.pillars.reduce((n, p) => n + p.met, 0)).toBe(summary.score);
    expect(summary.score).toBe(9);
  });

  it("reports every pillar in a fixed order, whatever the score", () => {
    for (const inputs of [allPass, allFail]) {
      const summary = toPublicScoreSummary(computeScore(inputs));
      expect(summary.pillars.map((p) => p.pillar)).toEqual(SCORE_PILLARS);
    }
  });

  it("earns nothing anywhere when nothing passes", () => {
    const summary = toPublicScoreSummary(computeScore(allFail));

    expect(summary.score).toBe(0);
    expect(summary.pillars.every((p) => p.met === 0)).toBe(true);
    // The totals are a property of the model, not of the result: an empty
    // score still says how many points were available in each pillar.
    expect(summary.pillars.reduce((n, p) => n + p.total, 0)).toBe(9);
  });

  it("notes a capped state without inflating a pillar", () => {
    // Context criteria pass with no armed TRIGGER, which holds the state at
    // Watch and appends an unscored item explaining it. Clearing `pattern`
    // alone no longer does this — the trade is armed by the swing-level
    // crossing since 2026-09-17, so that is what has to be absent.
    const decision = computeScore({ ...allPass, pattern: null, gannTrigger: null });
    const summary = toPublicScoreSummary(decision);

    // Nine points, nine checks, and the hold.
    expect(decision.breakdown.length).toBeGreaterThan(18);
    expect(summary.max).toBe(9);
    expect(summary.stateNote).not.toBeNull();
  });

  it("notes a downgrade from Execute", () => {
    const decision = applyDataLagHold(computeScore(allPass), decisionLag("15Min", FREE_EQUITY_FEED_DELAY_MS));
    expect(toPublicScoreSummary(decision).stateNote).not.toBeNull();
  });

  it("leaves the note off when the state matches the score", () => {
    expect(toPublicScoreSummary(computeScore(allPass)).stateNote).toBeNull();
    expect(toPublicScoreSummary(computeScore(allFail)).stateNote).toBeNull();
  });

  it("re-reads a breakdown stored with the old groups as the nine points", () => {
    // daily_scans rows written before the rollup was stored keep the
    // breakdown, whose points named the old group (2026-10-17 to 10-21).
    const stored = computeScore(allPass);
    const old: Record<string, "trend" | "structure" | "setup" | "timing" | "riskReward"> = {
      marketCycle: "timing", trendAllTimeframes: "trend", relativeStrength: "trend",
      activity: "setup", priceLevels: "structure", geometricAngles: "structure",
      timeFactors: "timing", volumeAccumulation: "setup", definiteIndication: "riskReward",
    };
    const legacy: ScanDecision = {
      ...stored,
      breakdown: stored.breakdown.map((b) => (b.pillar ? { ...b, pillar: old[b.key as string] } : b)),
    };
    const summary = toPublicScoreSummary(legacy);
    expect(summary.pillars.map((p) => p.pillar)).toEqual(SCORE_PILLARS);
    expect(summary.max).toBe(9);
  });

  it("keeps an old group whose points carry no key, after the nine", () => {
    const legacy: ScanDecision = {
      score: 1,
      outputState: "Watch",
      breakdown: [
        { criterion: "a", pillar: "trend", passed: true, note: "" },
        { criterion: "b", pillar: "structure", passed: false, note: "" },
      ],
    };
    expect(toPublicScoreSummary(legacy).pillars).toEqual([
      { pillar: "trend", met: 1, total: 1 },
      { pillar: "structure", met: 0, total: 1 },
    ]);
  });

  it("survives a decision with no breakdown at all", () => {
    const empty: ScanDecision = { score: 0, outputState: "Reject", breakdown: [] };
    const summary = toPublicScoreSummary(empty);

    expect(summary.pillars).toEqual([]);
    expect(summary.max).toBe(0);
  });
});

describe("redaction at the API boundary", () => {
  const decision = computeScore(allPass);

  it("replaces the breakdown with the summary", () => {
    const redacted = redactDecision(decision);

    expect(redacted.breakdown).toEqual([]);
    expect(redacted.summary?.score).toBe(decision.score);
    expect(redacted.score).toBe(decision.score);
    expect(redacted.outputState).toBe(decision.outputState);
  });

  it("keeps the decision state, which names no condition", () => {
    const redacted = redactDecision({ ...decision, decisionState: "qualifiedLong" });
    expect(redacted.decisionState).toBe("qualifiedLong");
  });

  it("carries no criterion or note text into the serialised response", () => {
    const serialised = JSON.stringify(redactDecision(decision));

    for (const item of decision.breakdown) {
      // The nine points are published by name since 2026-10-22, one row each;
      // the checks behind them, and every note, stay server-side.
      if (!item.pillar) expect(serialised).not.toContain(item.criterion);
      expect(serialised).not.toContain(item.note);
    }
  });

  it("leaves the rest of the scan result untouched", () => {
    const result: ScanResult = {
      symbol: "AAPL",
      assetClass: "us_equity",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels,
      decision,
    };

    const redacted = redactScanResult(result);

    expect(redacted.levels).toEqual(result.levels);
    expect(redacted.pattern).toEqual(result.pattern);
    // The levels a chart draws pass; the method's working stays server-side
    // (review finding S-02).
    expect(redacted.gann.squareOf9).toEqual(result.gann.squareOf9);
    expect(redacted.gann.fanLines).toEqual(result.gann.fanLines);
    expect(redacted.gann.timeCycleActive).toBe(true);
    expect(redacted.gann.digitalRootConfluences).toEqual([]);
    expect(redacted.gann.angleSlopes).toEqual([]);
    expect(redacted.gann.retracementLevels).toEqual([]);
    expect(redacted.gann.timeCycleDates).toEqual([]);
    expect(result.gann.digitalRootConfluences).toHaveLength(1);
    expect(redacted.decision.breakdown).toEqual([]);
    // The caller's own copy keeps its breakdown — the scan pipeline, the
    // backtest replay and the published rows all still read it server-side.
    expect(result.decision.breakdown).toHaveLength(18);
  });

  it("gives a visitor with no session only what the public chart draws", () => {
    const result: ScanResult = {
      symbol: "AAPL",
      assetClass: "us_equity",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels,
      decision,
      volatilityRead: { atr: 2, regime: "normal" },
    };

    const anon = toAnonymousScanResult(result);
    expect(anon.levels).toEqual(result.levels);
    expect(anon.gann.squareOf9).toEqual(result.gann.squareOf9);
    expect(anon.gann.digitalRootConfluences).toEqual([]);
    expect(anon.signals).toBeUndefined();
    expect(anon.pattern).toBeNull();
    expect(anon.armedPatterns).toEqual([]);
    expect(anon.volatilityRead).toBeUndefined();
    expect(anon.decision.breakdown).toEqual([]);
  });

  it("strips dailyBars — bulk internal data, not a public response field", () => {
    const result: ScanResult = {
      symbol: "AAPL",
      assetClass: "us_equity",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels,
      decision,
      dailyBars: [{ t: "2026-08-08T00:00:00Z", o: 100, h: 101, l: 99, c: 100, v: 1000 }],
    };

    expect(redactScanResult(result).dailyBars).toBeUndefined();
    // The caller's own copy is untouched — lib/learning/record.ts still reads it server-side.
    expect(result.dailyBars).toHaveLength(1);
  });

  it("sends an expired plan's entry, TP1 and note only (owner's disclosure rule, 2026-10-28)", () => {
    const full = {
      reason: "beyond_reaction",
      entry: 95,
      takeProfit1: 110,
      reactionNeeded: 14,
      greatestReaction: 9,
      note: "Setup expired: the buy at $95.00 sits too far below the latest high ($109.00) for a normal pullback to reach.",
    };
    const result = {
      symbol: "XYZ",
      assetClass: "stock",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels: null,
      decision,
      planExpired: full,
    } as unknown as ScanResult;
    const out = redactScanResult(result).planExpired as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["entry", "note", "takeProfit1"]);
    expect(JSON.stringify(out)).not.toMatch(/reactionNeeded|greatestReaction|beyond_reaction/);
  });

  it("redacts the Signal and Regime Engine's per-criterion breakdown the same way", () => {
    const secretNote = "Relative volume 1.32x confirms real participation behind the reversal.";
    const secretThreshold = "ADX 24.3 supports trend strength (>= 20)";
    const result: ScanResult = {
      symbol: "AAPL",
      assetClass: "us_equity",
      scannedAt: "2026-08-08T00:00:00Z",
      currentPrice: 100,
      direction: "bullish",
      setupKind: "reversion",
      momentumElevated: true,
      trends: [trend("bullish")],
      gann,
      pattern,
      armedPatterns: [pattern],
      levels,
      decision,
      signals: {
        regime: { regime: "trend", direction: "bullish", reasons: [secretThreshold], disqualifiers: [] },
        trendPullback: {
          status: "evaluated",
          state: "trendPullback",
          regime: { regime: "trend", direction: "bullish", reasons: [secretThreshold], disqualifiers: [] },
          alignment: {
            score: 88,
            tier: "aTier",
            blueprintScoreBand: "HIGH_CONFLUENCE",
            breakdown: [
              { key: "volumeResumption", label: "Volume", points: 10, maxPoints: 10, applicable: true, passed: true, note: secretNote },
            ],
          },
          tradeable: true,
          plan: { direction: "bullish", entryTrigger: 101, entryDescription: "x", stop: 99, target: 105, targetDescription: "y" },
          expiresAfterBars: 5,
          accountContextAssumed: true,
        },
        trendBreakout: null,
        confirmedReversal: null,
        rangeReversion: null,
        gannConfluence: null,
        saraConfluence: null,
      },
    };

    const redacted = redactScanResult(result);
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain(secretNote);
    expect(serialised).not.toContain(secretThreshold);
    // The rollup a reader needs survives.
    expect(redacted.signals?.trendPullback?.status).toBe("evaluated");
    if (redacted.signals?.trendPullback?.status === "evaluated") {
      expect(redacted.signals.trendPullback.alignment.score).toBe(88);
      expect(redacted.signals.trendPullback.alignment.tier).toBe("aTier");
      expect(redacted.signals.trendPullback.tradeable).toBe(true);
      // The engine's own plan is not Gann's and stays on the server (R-025).
      expect(redacted.signals.trendPullback.plan).toBeNull();
    }
    // The caller's own copy keeps its breakdown server-side.
    if (result.signals?.trendPullback?.status === "evaluated") {
      expect(result.signals.trendPullback.alignment.breakdown).toHaveLength(1);
    }
  });
});

describe("the Gann rule readings at the API boundary (R-024)", () => {
  function rules(): DisclosedRulesContext {
    return {
      ...EMPTY_DISCLOSED_RULES,
      asOf: "2026-10-21",
      counterMove: { inCounterMove: true, phase: "normal", days: 9, trend: "bullish" } as DisclosedRulesContext["counterMove"],
      astro: { jensen: { projection: { price: 123.45, fromDate: "2026-10-01" } } } as unknown as DisclosedRulesContext["astro"],
      hexagonTime: [{ secret: "hexagon count" }] as unknown as DisclosedRulesContext["hexagonTime"],
      timing: {
        alternation: { daysSincePivot: 14, mark: 14 },
        square144: null,
        projection: { kind: "top", medianDate: "2026-11-02", spreadDays: 4, count: 3 },
        changeDates: { dates: [], next: { date: "2026-11-09", days: 14, expect: "high", came: null } },
      } as DisclosedRulesContext["timing"],
    };
  }

  it("keeps what the confluence card draws", () => {
    const out = redactDisclosedRules(rules());
    expect(out.counterMove?.days).toBe(9);
    expect(out.timing.alternation?.mark).toBe(14);
    expect(out.asOf).toBe("2026-10-21");
  });

  it("keeps the astrology, the undrawn counts and the dated forward labels on the server", () => {
    const out = redactDisclosedRules(rules());
    const serialised = JSON.stringify(out);
    expect(out.astro).toBeNull();
    expect(out.hexagonTime).toEqual([]);
    expect(out.timing.projection).toBeNull();
    expect(out.timing.changeDates).toBeNull();
    for (const leak of ["123.45", "hexagon count", "2026-11-02", "2026-11-09"]) expect(serialised).not.toContain(leak);
  });
});

describe("the Gann confluence's working at the API boundary (R-024)", () => {
  it("drops the root, the dated counts, the vortex and the ledger", async () => {
    const { redactScanSignals } = await import("@/lib/signals/publicSummary");
    const gann = {
      root: 12.34,
      timeCycleDates: ["2026-11-03"],
      timeCycleFixedCalendarDates: ["2026-11-08"],
      squareOf52: { active: true, dates: ["2026-11-10"] },
      angleMonthCounts: { active: false, dates: ["2026-12-01"] },
      vortexContext: { priceDisplacement: 3, timeDisplacement: 6, priceVortexClass: "x", timeVortexClass: "y", relationship: "z", transition: "w" },
      angleSlope: { slope: 1.1, nearestAngle: null },
      coordinateLedger: [{ price: 1 }],
      nearestFanLine: null,
      disclosedRules: EMPTY_DISCLOSED_RULES,
      evidence: { calculationVersion: "1", inputs: {}, sourceTimestamp: "x", explanationTrace: ["t"] },
    };
    const out = redactScanSignals({
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      trendPullback: null,
      trendBreakout: null,
      confirmedReversal: null,
      rangeReversion: null,
      gannConfluence: gann as never,
      saraConfluence: null,
    })!.gannConfluence!;
    expect(out.squareOf52.active).toBe(true);
    const serialised = JSON.stringify(out);
    for (const leak of ["12.34", "2026-11-03", "2026-11-08", "2026-11-10", "2026-12-01", "1.1", "\"price\":1"]) expect(serialised).not.toContain(leak);
  });
});
