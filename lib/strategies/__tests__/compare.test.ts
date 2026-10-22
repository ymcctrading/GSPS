import { describe, it, expect } from "vitest";
import { alignsWithPlan, rankTechniques, readTechnique, type ArmedTechnique } from "../compare";
import type { PlanInput, PlanReading } from "../explain/types";

const PLAN: PlanInput = {
  direction: "bullish",
  entry: 100,
  stopLoss: 95,
  takeProfit1: 110,
  masterTarget: 120,
};

const long: ArmedTechnique = {
  direction: "bullish",
  entry: 101,
  stopLoss: 97,
  takeProfit1: 107,
  rationale: "long",
};
const short: ArmedTechnique = {
  direction: "bearish",
  entry: 99,
  stopLoss: 103,
  takeProfit1: 93,
  rationale: "short",
};

function reading(agrees: boolean | null): PlanReading {
  return { source: "x", label: "X", agrees, summary: "s", levels: [] };
}

describe("alignsWithPlan", () => {
  it("aligns when armed the plan's way, whatever the lean", () => {
    expect(alignsWithPlan(PLAN, long, reading(false))).toBe(true);
  });
  it("never aligns when armed against the plan, even with an agreeing lean", () => {
    expect(alignsWithPlan(PLAN, short, reading(true))).toBe(false);
  });
  it("falls back to the lean when nothing is armed", () => {
    expect(alignsWithPlan(PLAN, null, reading(true))).toBe(true);
    expect(alignsWithPlan(PLAN, null, reading(null))).toBe(false);
    expect(alignsWithPlan(PLAN, null, null)).toBe(false);
  });
  it("nothing aligns without a plan", () => {
    expect(alignsWithPlan(null, long, reading(true))).toBe(false);
  });
});

describe("readTechnique", () => {
  it("an aligned technique trades GSPS's plan and brings no levels of its own", () => {
    const r = readTechnique("rsiReversal", "RSI", PLAN, long, reading(true));
    expect(r.aligned).toBe(true);
    expect(r.ownLevels).toBeNull();
  });

  it("a technique against the plan offers its own entry, stop and TP1, and no MTP", () => {
    const r = readTechnique("macdMomentum", "MACD", PLAN, { ...short, masterTarget: 80 } as ArmedTechnique, null);
    expect(r.aligned).toBe(false);
    expect(r.ownLevels).toEqual({
      direction: "bearish",
      entry: 99,
      stopLoss: 103,
      takeProfit1: 93,
      rationale: "short",
    });
    expect(r.ownLevels).not.toHaveProperty("masterTarget");
  });

  it("with no plan, an armed technique offers its own levels", () => {
    const r = readTechnique("vwap", "VWAP", null, long, null);
    expect(r.aligned).toBe(false);
    expect(r.ownLevels?.entry).toBe(101);
  });

  it("a signal-only script or malformed levels offer nothing", () => {
    const signalOnly = { direction: "bearish" as const, entry: null, stopLoss: null, takeProfit1: null, rationale: "s" };
    expect(readTechnique("custom:a", "A", PLAN, signalOnly, null).ownLevels).toBeNull();
    const wrongSide = { ...short, takeProfit1: 105 };
    expect(readTechnique("custom:b", "B", PLAN, wrongSide, null).ownLevels).toBeNull();
    const nan = { ...short, stopLoss: Number.NaN };
    expect(readTechnique("custom:c", "C", PLAN, nan, null).ownLevels).toBeNull();
  });
});

describe("rankTechniques", () => {
  it("puts the aligned first, then own levels, then the rest, keeping order within each", () => {
    const reads = [
      readTechnique("a", "A", PLAN, null, null), // nothing
      readTechnique("b", "B", PLAN, short, null), // own
      readTechnique("c", "C", PLAN, long, null), // aligned
      readTechnique("d", "D", PLAN, short, null), // own
      readTechnique("e", "E", PLAN, null, reading(true)), // aligned
    ];
    expect(rankTechniques(reads).map((r) => r.source)).toEqual(["c", "e", "b", "d", "a"]);
  });
});
