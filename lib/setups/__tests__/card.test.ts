import { describe, expect, it } from "vitest";
import {
  buildDailyCardModel,
  buildSetupSynopsis,
  checksFromSummary,
  describeTrends,
  hasPlan,
  rewardToRisk,
  type DailySetupInput,
  type SetupCheck,
} from "@/lib/setups/card";
import type { PublicScoreSummary } from "@/lib/types";

const summary: PublicScoreSummary = {
  score: 6,
  max: 9,
  stateNote: null,
  pillars: [
    { pillar: "trend", met: 2, total: 2 },
    { pillar: "structure", met: 1, total: 3 },
    { pillar: "setup", met: 2, total: 2 },
    { pillar: "timing", met: 0, total: 1 },
    { pillar: "riskReward", met: 1, total: 1 },
  ],
};

const levels = { entry: 100, stop: 95, tp1: 110, mtp: 120 };

describe("checksFromSummary", () => {
  it("turns each pillar into met / partial / missed with its count", () => {
    expect(checksFromSummary(summary)).toEqual([
      { label: "Trend", state: "met", detail: "2 of 2" },
      { label: "Structure", state: "partial", detail: "1 of 3" },
      { label: "Setup", state: "met", detail: "2 of 2" },
      { label: "Timing", state: "missed", detail: "0 of 1" },
      { label: "Risk/reward", state: "met", detail: "1 of 1" },
    ]);
  });

  it("is empty when the row carries no rollup", () => {
    expect(checksFromSummary(null)).toEqual([]);
    expect(checksFromSummary(undefined)).toEqual([]);
  });
});

describe("rewardToRisk", () => {
  it("measures a target against the distance from entry to exit", () => {
    expect(rewardToRisk(levels, 110)).toBe(2);
    expect(rewardToRisk(levels, 120)).toBe(4);
  });

  it("reads a short the same way round", () => {
    expect(rewardToRisk({ entry: 100, stop: 105, tp1: 90, mtp: 80 }, 90)).toBe(2);
  });

  it("is null when a price is missing or there is no risk to measure against", () => {
    expect(rewardToRisk({ ...levels, stop: null }, 110)).toBeNull();
    expect(rewardToRisk(levels, null)).toBeNull();
    expect(rewardToRisk({ ...levels, stop: 100 }, 110)).toBeNull();
  });
});

describe("hasPlan", () => {
  it("needs an entry, an exit and a first target", () => {
    expect(hasPlan(levels)).toBe(true);
    expect(hasPlan({ ...levels, tp1: null })).toBe(false);
    expect(hasPlan({ ...levels, entry: null })).toBe(false);
  });
});

describe("buildSetupSynopsis", () => {
  const checks: SetupCheck[] = checksFromSummary(summary);

  it("is two sentences: how strong and where weak, then the plan", () => {
    const text = buildSetupSynopsis({ side: "buy", verdict: "Execute", scoreText: "6", scoreMax: 9, checks, levels });
    expect(text).toBe(
      "A buy setup ready to act on: 6 of 9 checks line up, strongest on trend and setup, still missing timing. " +
        "Enter near $100.00, exit at $95.00 if it fails, first target $110.00 (2.0× the risk).",
    );
    expect(text.match(/\. /g)).toHaveLength(1);
  });

  it("words a Watch and a Reject differently, and says sell for a short", () => {
    expect(
      buildSetupSynopsis({ side: "sell", verdict: "Watch", scoreText: "4.5", scoreMax: 9, checks: [], levels }),
    ).toMatch(/^A sell setup worth watching: 4.5 of 9 checks line up\./);
    expect(
      buildSetupSynopsis({ side: "buy", verdict: "Reject", scoreText: "2", scoreMax: 9, checks: [], levels }),
    ).toMatch(/^A buy setup not yet strong enough to act on: 2 of 9/);
  });

  it("says there is nothing to act on rather than inventing levels when no plan has armed", () => {
    const text = buildSetupSynopsis({
      side: "buy",
      verdict: "Watch",
      scoreText: "5",
      scoreMax: 9,
      checks: [],
      levels: { entry: null, stop: null, tp1: null, mtp: null },
    });
    expect(text).toContain("No trade plan has armed yet");
    expect(text).not.toContain("$");
  });

  it("leaves the count out for a setup saved without a score", () => {
    const text = buildSetupSynopsis({ side: "buy", verdict: "Reject", scoreText: null, scoreMax: 9, checks: [], levels });
    expect(text).toMatch(/^A buy setup\. Enter near/);
    expect(text).not.toContain("checks line up");
  });
});

describe("describeTrends", () => {
  it("names each higher timeframe and skips the hourly read", () => {
    expect(
      describeTrends([
        { timeframe: "1Month", direction: "bullish" },
        { timeframe: "1Week", direction: "sideways" },
        { timeframe: "1Day", direction: "bearish" },
        { timeframe: "1Hour", direction: "bullish" },
      ]),
    ).toBe("Monthly rising, Weekly flat, Daily falling");
  });

  it("is null when there is nothing to name", () => {
    expect(describeTrends(null)).toBeNull();
    expect(describeTrends([])).toBeNull();
  });
});

describe("buildDailyCardModel", () => {
  const row: DailySetupInput = {
    symbol: "MSFT",
    score: 6,
    outputState: "Execute",
    direction: "bullish",
    entry: 100,
    stopLoss: 95,
    takeProfit1: 110,
    masterProfit: 120,
    patternName: "2-2",
    setupKind: "continuation",
    currentPrice: 99.5,
    scoreSummary: summary,
    trends: [{ timeframe: "1Day", direction: "bullish" }],
    signal: {
      state: "trendPullback",
      regime: "trend",
      direction: "bullish",
      tier: "aTier",
      alignmentScore: 81.6,
      tradeable: true,
      accountContextAssumed: true,
    },
  };

  it("maps the row onto the card: side, the four levels, checks, context and the way to the chart", () => {
    const model = buildDailyCardModel(row, { scoreText: "6", scoreMax: 9 });
    expect(model.side).toBe("buy");
    expect(model.levels).toEqual(levels);
    expect(model.price).toBe(99.5);
    expect(model.checks).toHaveLength(5);
    expect(model.continuation).toBe(true);
    expect(model.alignmentScore).toBe(81.6);
    expect(model.signal).toEqual({ tierLabel: "A-tier", stateLabel: "Trend Pullback", tradeable: true });
    expect(model.higherTimeframes).toBe("Daily rising");
    expect(model.patternLabel).toBe("Failed-push reversal");
    expect(model.tickerHref).toBe("/ticker/MSFT");
  });

  it("prefers the live price over the scan-time one", () => {
    expect(buildDailyCardModel(row, { scoreText: "6", scoreMax: 9, livePrice: 101 }).price).toBe(101);
  });

  it("reads a bearish row as a sell, and never prints a pattern tag it has no approved name for", () => {
    const model = buildDailyCardModel(
      { ...row, direction: "bearish", patternName: "not-a-pattern", signal: null, scoreSummary: null, trends: null },
      { scoreText: "6", scoreMax: 9 },
    );
    expect(model.side).toBe("sell");
    expect(model.patternLabel).toBeNull();
    expect(model.signal).toBeNull();
    expect(model.checks).toEqual([]);
    expect(model.higherTimeframes).toBeNull();
  });

  it("carries only the pillar rollup: no per-criterion breakdown, and no criterion text", () => {
    const model = buildDailyCardModel(row, { scoreText: "6", scoreMax: 9 });
    const text = JSON.stringify(model);
    expect(Object.keys(model)).not.toContain("breakdown");
    expect(text).not.toMatch(/criterion/i);
    // What the checks say is a pillar's name and its count, nothing finer.
    expect(model.checks.map((c) => c.label)).toEqual(["Trend", "Structure", "Setup", "Timing", "Risk/reward"]);
  });
});
