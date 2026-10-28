/**
 * The Resting tier (owner's items 5 and 10, 2026-10-28): a plan with every
 * condition met whose order rests at its level, beside Execute, Watch and Reject.
 */
import { describe, expect, it } from "vitest";
import type { ScanDecision } from "@/lib/types";
import { applyReadyNowHold, type ReadyNowReading } from "@/lib/scoring/score";
import { redactDecision } from "@/lib/scoring/public-summary";
import { setupTier, splitResting, restingInputOfRow } from "@/lib/setups/resting";
import { bestQualifiedSetup } from "@/lib/dashboard/bestPlan";
import { buildDailyCardModel } from "@/lib/setups/card";
import { groupManualScan } from "@/components/scan/manual-scan-results";
import type { ScanRow } from "@/components/scan/results-table";

const decision = (outputState: ScanDecision["outputState"], score: number): ScanDecision => ({ score, outputState, breakdown: [] });
const levels = { entry: 184.45, takeProfit1: 199, masterProfit: 215 };
const reading: ReadyNowReading = { side: "buy", indicationShown: true, price: 206.71, dayRange: 5, levels };

describe("the scan's Resting flag", () => {
  it("marks an Execute held only for the distance to its entry", () => {
    const held = applyReadyNowHold(decision("Execute", 8), reading);
    expect(held.outputState).toBe("Watch");
    expect(held.resting).toBe(true);
    expect(redactDecision(held).resting).toBe(true);
  });

  it("does not mark a crossing whose indication is not shown", () => {
    expect(applyReadyNowHold(decision("Execute", 8), { ...reading, indicationShown: false }).resting).toBeUndefined();
  });

  it("does not mark a Watch held by another rule, nor a plan near its entry", () => {
    expect(applyReadyNowHold(decision("Watch", 8), reading).resting).toBeUndefined();
    const near = applyReadyNowHold(decision("Execute", 8), { ...reading, price: 189, dayRange: 6, levels: { ...levels, takeProfit1: 188 } });
    expect(near.outputState).toBe("Watch");
    expect(near.resting).toBeUndefined();
  });
});

const row = (over: Partial<ScanRow>): ScanRow => ({
  symbol: "X",
  score: 7,
  outputState: "Watch",
  direction: "bullish",
  entry: 100,
  stopLoss: 96,
  takeProfit1: 110,
  masterProfit: 120,
  currentPrice: 101,
  dayRange: 3,
  ...over,
});

describe("setupTier", () => {
  it("reads the scan's flag when the row carries it", () => {
    expect(setupTier(restingInputOfRow(row({ resting: true, currentPrice: 101 })))).toBe("Resting");
    // A 7+ Watch far from its entry but held by another rule is Watch, not Resting.
    expect(setupTier(restingInputOfRow(row({ resting: false, currentPrice: 130 })))).toBe("Watch");
    expect(setupTier(restingInputOfRow(row({ outputState: "Execute", resting: false })))).toBe("Execute");
  });

  it("falls back to score and distance on a row stored before the flag", () => {
    expect(setupTier(restingInputOfRow(row({ currentPrice: 130 })))).toBe("Resting");
    expect(setupTier(restingInputOfRow(row({ score: 6, currentPrice: 130 })))).toBe("Watch");
    expect(setupTier(restingInputOfRow(row({ outputState: "Execute", currentPrice: 130 })))).toBe("Resting");
  });

  it("never calls a Reject resting", () => {
    expect(setupTier(restingInputOfRow(row({ outputState: "Reject", resting: true })))).toBe("Reject");
  });

  it("splits the lists the same way", () => {
    const flagged = row({ symbol: "R", resting: true });
    const held = row({ symbol: "H", resting: false, currentPrice: 130 });
    const { now, resting } = splitResting([flagged, held], (r) => restingInputOfRow(r));
    expect(resting.map((r) => r.symbol)).toEqual(["R"]);
    expect(now.map((r) => r.symbol)).toEqual(["H"]);
  });

  it("ranks Resting behind Execute and ahead of Watch on Today's plan", () => {
    const rows = [row({ symbol: "W", score: 9, resting: false }), row({ symbol: "R", score: 7, resting: true })];
    expect(bestQualifiedSetup(rows)?.symbol).toBe("R");
    expect(bestQualifiedSetup([...rows, row({ symbol: "E", score: 7, outputState: "Execute", resting: false })])?.symbol).toBe("E");
  });

  it("names the tier on the card", () => {
    const model = buildDailyCardModel(row({ resting: true, currentPrice: 130 }), { scoreText: "7", scoreMax: 9 });
    expect(model.verdict).toBe("Resting");
    expect(model.synopsis).toMatch(/resting at its level/);
  });
});

describe("groupManualScan", () => {
  it("splits by side and tier, with rejects and sideless rows apart", () => {
    const rows = [
      row({ symbol: "BE", outputState: "Execute", resting: false }),
      row({ symbol: "BR", resting: true }),
      row({ symbol: "BW", score: 5 }),
      row({ symbol: "SE", direction: "bearish", outputState: "Execute", resting: false }),
      row({ symbol: "SW", direction: "bearish", score: 4 }),
      row({ symbol: "RJ", outputState: "Reject", score: 2 }),
      row({ symbol: "NO", direction: "none", outputState: "Watch", score: 5 }),
    ];
    const { groups, rejected } = groupManualScan(rows);
    const syms = (rs: ScanRow[]) => rs.map((r) => r.symbol);
    expect(syms(groups.buy.Execute)).toEqual(["BE"]);
    expect(syms(groups.buy.Resting)).toEqual(["BR"]);
    expect(syms(groups.buy.Watch)).toEqual(["BW"]);
    expect(syms(groups.sell.Execute)).toEqual(["SE"]);
    expect(syms(groups.sell.Resting)).toEqual([]);
    expect(syms(groups.sell.Watch)).toEqual(["SW"]);
    expect(syms(rejected)).toEqual(["RJ", "NO"]);
  });
});
