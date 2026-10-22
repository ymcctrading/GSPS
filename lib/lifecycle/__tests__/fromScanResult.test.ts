import { describe, expect, it } from "vitest";
import type { ScanResult, TradeLevels } from "@/lib/types";
import { buildNewTradePlanFromScanResult } from "@/lib/lifecycle/fromScanResult";

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 97,
  takeProfit1: 105,
  takeProfit2: 108,
  masterProfit: 110,
  riskPerShare: 3,
  rewardToRiskTp1: 1.67,
  rewardToRiskTp2: 2.67,
  rewardToRiskMaster: 3.33,
  stopPctOfPrice: 3,
  stopBandWarning: null,
};

function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: "2026-08-30T13:00:00.000Z",
    currentPrice: 100,
    direction: "bullish",
    setupKind: "continuation",
    momentumElevated: true,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleBullishActive: false, timeCycleBearishActive: false, timeCycleDates: [], angleSlopes: [], retracementLevels: [], digitalRootConfluences: [] },
    pattern: null,
    armedPatterns: [],
    levels,
    decision: { score: 8, outputState: "Execute", breakdown: [] },
    ...overrides,
  };
}

describe("buildNewTradePlanFromScanResult", () => {
  it("builds a plan priced off the scan's levels", () => {
    const plan = buildNewTradePlanFromScanResult(scanResult(), {
      strategyVersion: "1.0.0",
      signalId: "transition-1",
      generatedAt: "2026-08-30T13:00:00.000Z",
    });
    expect(plan).not.toBeNull();
    expect(plan?.instrument).toBe("AAPL");
    expect(plan?.direction).toBe("bullish");
    expect(plan?.coordinates.entryTrigger).toBe(100);
    expect(plan?.coordinates.invalidation).toBe(97);
    expect(plan?.coordinates.masterProfit).toBe(110);
    expect(plan?.coordinates.runnerRule.enabled).toBe(true);
    // Expiry is after the generated time, not before or equal to it.
    expect(new Date(plan!.expiresAt).getTime()).toBeGreaterThan(
      new Date(plan!.generatedAt).getTime(),
    );
  });

  it("lasts until the close of the session it trades in", () => {
    const plan = buildNewTradePlanFromScanResult(scanResult(), {
      strategyVersion: "1.0.0",
      signalId: "transition-1",
      generatedAt: "2026-10-15T14:00:00.000Z",
    });
    expect(plan!.expiresAt).toBe("2026-10-15T20:00:00.000Z");
  });

  it("carries an old-level plan's kind, and leaves a crossing's unset", () => {
    const opts = { strategyVersion: "1.0.0", signalId: "transition-1", generatedAt: "2026-08-30T13:00:00.000Z" };
    const old = buildNewTradePlanFromScanResult(scanResult({ levels: { ...levels, entryKind: "oldLevel" } }), opts);
    expect(old?.coordinates.entryKind).toBe("oldLevel");
    expect(buildNewTradePlanFromScanResult(scanResult(), opts)?.coordinates.entryKind).toBeUndefined();
  });

  it("carries a held-bottom plan's kind (PLAN.md item 5, step 4)", () => {
    const opts = { strategyVersion: "1.0.0", signalId: "transition-1", generatedAt: "2026-08-30T13:00:00.000Z" };
    const held = buildNewTradePlanFromScanResult(scanResult({ levels: { ...levels, entryKind: "hold", holdBasis: "weeks" } }), opts);
    expect(held?.coordinates.entryKind).toBe("hold");
  });

  it("returns null when the scan has no priced levels", () => {
    const plan = buildNewTradePlanFromScanResult(scanResult({ levels: null }), {
      strategyVersion: "1.0.0",
      signalId: "transition-1",
      generatedAt: "2026-08-30T13:00:00.000Z",
    });
    expect(plan).toBeNull();
  });

  it("returns null for a directionless result", () => {
    const plan = buildNewTradePlanFromScanResult(scanResult({ direction: "none" }), {
      strategyVersion: "1.0.0",
      signalId: "transition-1",
      generatedAt: "2026-08-30T13:00:00.000Z",
    });
    expect(plan).toBeNull();
  });

  it("disables the runner rule when there's no Master Profit target", () => {
    const plan = buildNewTradePlanFromScanResult(
      scanResult({ levels: { ...levels, masterProfit: null as unknown as number } }),
      { strategyVersion: "1.0.0", signalId: "transition-1", generatedAt: "2026-08-30T13:00:00.000Z" },
    );
    expect(plan?.coordinates.masterProfit).toBeNull();
    expect(plan?.coordinates.runnerRule.enabled).toBe(false);
  });
});
