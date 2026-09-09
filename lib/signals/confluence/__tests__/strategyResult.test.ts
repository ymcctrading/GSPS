import { describe, expect, it } from "vitest";
import { toSaraStrategyResult } from "../strategyResult";
import { SARA_CONFLUENCE_MODULE } from "../sara";
import type { SaraConfluenceResult } from "../types";

function baseResult(overrides: Partial<SaraConfluenceResult> = {}): SaraConfluenceResult {
  return {
    module: SARA_CONFLUENCE_MODULE,
    market: "equities",
    marketAdapterStatus: "supported",
    alignment: "neutral",
    scenarioId: null,
    direction: "none",
    timeframeContinuity: "notConfirmed",
    confirmationState: "noArmedScenario",
    evidence: { calculationVersion: "0.1.0", inputs: {}, sourceTimestamp: "x", explanationTrace: [] },
    note: "",
    ...overrides,
  };
}

describe("toSaraStrategyResult", () => {
  it("reports NO_TRADE when the market/data are unavailable", () => {
    const result = toSaraStrategyResult(baseResult({ alignment: "notImplemented" }), null);
    expect(result.status).toBe("NO_TRADE");
    expect(result.conditionsFailed).toContain("market_data_unavailable");
    expect(result.entryTrigger).toBeNull();
    expect(result.stopLoss).toBeNull();
  });

  it("reports WATCH when the market is supported but no scenario is armed", () => {
    const result = toSaraStrategyResult(baseResult(), null);
    expect(result.status).toBe("WATCH");
    expect(result.conditionsFailed).toContain("no_armed_scenario");
    expect(result.confidenceScore).toBe(0);
  });

  it("reports ACTIONABLE with entry/stop prices when a scenario is confirmed", () => {
    const result = toSaraStrategyResult(
      baseResult({
        alignment: "aligned",
        scenarioId: "2-1-2",
        direction: "bullish",
        timeframeContinuity: "confirmed",
        confirmationState: "closedBarConfirmed",
      }),
      { entryTrigger: 105.5, stopLoss: 104.2 },
    );
    expect(result.status).toBe("ACTIONABLE");
    expect(result.signalType).toBe("2-1-2");
    expect(result.direction).toBe("bullish");
    expect(result.entryTrigger).toBe(105.5);
    expect(result.stopLoss).toBe(104.2);
    expect(result.confidenceScore).toBe(1);
    expect(result.conditionsMet).toContain("pattern_armed_and_closed_bar_confirmed");
    expect(result.conditionsMet).toContain("higher_timeframe_continuity_confirmed");
  });

  it("flags a higher-timeframe conflict on an otherwise-armed scenario", () => {
    const result = toSaraStrategyResult(
      baseResult({
        alignment: "conflict",
        scenarioId: "3-1-2",
        direction: "bearish",
        timeframeContinuity: "notConfirmed",
        confirmationState: "closedBarConfirmed",
      }),
      { entryTrigger: 50, stopLoss: 51 },
    );
    expect(result.status).toBe("ACTIONABLE");
    expect(result.conditionsFailed).toContain("higher_timeframe_continuity_conflict");
  });

  it("never fabricates targets, a time stop, or a feature snapshot id", () => {
    const result = toSaraStrategyResult(
      baseResult({ confirmationState: "closedBarConfirmed", scenarioId: "2-2", direction: "bullish" }),
      { entryTrigger: 10, stopLoss: 9 },
    );
    expect(result.targets).toEqual([]);
    expect(result.timeStopBars).toBeNull();
    expect(result.featureSnapshotId).toBeNull();
  });
});
