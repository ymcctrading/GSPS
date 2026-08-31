import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildShadowSignal, recordShadowSignals } from "@/lib/shadow/record";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import type { ScanResult } from "@/lib/types";

function baseResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: "2026-08-28T14:30:00Z",
    currentPrice: 200,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    pattern: { name: "2-2", direction: "bullish", triggerPrice: 200, stopPrice: 195 } as ScanResult["pattern"],
    armedPatterns: [],
    levels: {
      entry: 200,
      stopLoss: 195,
      takeProfit1: 205,
      takeProfit2: 215,
      masterProfit: 215,
      riskPerShare: 5,
      rewardToRiskTp1: 1,
      rewardToRiskTp2: 3,
      rewardToRiskMaster: 3,
      masterFromStructure: false,
      stopPctOfPrice: 2.5,
      stopBandWarning: null,
      stateNote: null,
    },
    decision: { score: 7, outputState: "Execute", breakdown: [] },
    ...overrides,
  } as ScanResult;
}

describe("buildShadowSignal", () => {
  it("builds a row for an Execute-tier, fully priced result", () => {
    const row = buildShadowSignal(baseResult(), "scheduled_morning_scan");
    expect(row).toEqual({
      symbol: "AAPL",
      direction: "bullish",
      pattern: "2-2",
      strategyVersion: STRATEGY_VERSION,
      entry: 200,
      stopLoss: 195,
      target: 215,
      score: 7,
      source: "scheduled_morning_scan",
      scannedAt: "2026-08-28T14:30:00Z",
    });
  });

  it("returns null for a Watch/Reject verdict", () => {
    const watch = baseResult({ decision: { score: 5, outputState: "Watch", breakdown: [] } });
    expect(buildShadowSignal(watch, "x")).toBeNull();
  });

  it("returns null when the scan errored", () => {
    expect(buildShadowSignal(baseResult({ error: "provider timeout" }), "x")).toBeNull();
  });

  it("returns null with no priced plan", () => {
    expect(buildShadowSignal(baseResult({ levels: null }), "x")).toBeNull();
  });

  it("returns null with no clear direction", () => {
    expect(buildShadowSignal(baseResult({ direction: "none" }), "x")).toBeNull();
  });
});

describe("recordShadowSignals", () => {
  it("upserts only the Execute-tier rows and reports the count", async () => {
    const upserted: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (rows: unknown[]) => {
          upserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    const results = [
      baseResult({ symbol: "AAPL" }),
      baseResult({ symbol: "TSLA", decision: { score: 4, outputState: "Watch", breakdown: [] } }),
    ];
    const outcome = await recordShadowSignals(client, results, "scheduled_morning_scan");
    expect(outcome.recorded).toBe(1);
    expect(upserted).toHaveLength(1);
    expect((upserted[0] as { symbol: string }).symbol).toBe("AAPL");
  });

  it("is a no-op when nothing qualifies", async () => {
    const client = { from: () => ({ upsert: () => Promise.resolve({ error: null }) }) } as unknown as SupabaseClient;
    const outcome = await recordShadowSignals(
      client,
      [baseResult({ decision: { score: 4, outputState: "Watch", breakdown: [] } })],
      "x",
    );
    expect(outcome.recorded).toBe(0);
  });

  it("swallows a write failure and reports zero recorded", async () => {
    const client = {
      from: () => ({ upsert: () => Promise.resolve({ error: { message: "boom" } }) }),
    } as unknown as SupabaseClient;
    const outcome = await recordShadowSignals(client, [baseResult()], "x");
    expect(outcome.recorded).toBe(0);
  });
});
