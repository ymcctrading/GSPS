import { describe, expect, it } from "vitest";
import { isStopBreached, isStopBreachedByBar, readStopBreach } from "@/lib/gann/stopBreach";
import { applyStopBreachHold } from "@/lib/scoring/score";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import type { ScanDecision } from "@/lib/types";

const decision = (outputState: ScanDecision["outputState"], score = 7): ScanDecision => ({
  score,
  outputState,
  breakdown: [
    { key: "swingChartTrend", criterion: "Swing chart trend", passed: true, pillar: "trend", note: "" },
  ] as ScanDecision["breakdown"],
});

describe("isStopBreached", () => {
  it("retires a long when price reaches or falls through the stop", () => {
    expect(isStopBreached("bullish", 98, 98.5)).toBe(false);
    expect(isStopBreached("bullish", 98, 98)).toBe(true);
    expect(isStopBreached("bullish", 98, 95)).toBe(true);
  });

  it("retires a short when price reaches or rises through the stop", () => {
    expect(isStopBreached("bearish", 102, 101.5)).toBe(false);
    expect(isStopBreached("bearish", 102, 102)).toBe(true);
    expect(isStopBreached("bearish", 102, 105)).toBe(true);
  });

  it("has nothing to retire without a stop", () => {
    expect(isStopBreached("bullish", null, 1)).toBe(false);
  });
});

describe("isStopBreachedByBar", () => {
  it("reads a long's breach off the candle's low and a short's off its high", () => {
    expect(isStopBreachedByBar("bullish", 98, { h: 103, l: 97.9 })).toBe(true);
    expect(isStopBreachedByBar("bullish", 98, { h: 103, l: 98.1 })).toBe(false);
    expect(isStopBreachedByBar("bearish", 102, { h: 102.1, l: 97 })).toBe(true);
    expect(isStopBreachedByBar("bearish", 102, { h: 101.9, l: 97 })).toBe(false);
  });
});

describe("readStopBreach", () => {
  it("reports the stop and the price it found through it", () => {
    expect(readStopBreach({ direction: "bullish", stopLoss: 98, price: 96 })).toEqual({
      breached: true,
      stop: 98,
      price: 96,
    });
  });

  it("does not read a breach with no plan, no stop or no price", () => {
    expect(readStopBreach({ direction: "none", stopLoss: 98, price: 96 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: undefined, price: 96 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: 98, price: 0 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: 98, price: null }).breached).toBe(false);
  });

  it("does not bring a plan back just because price returned to the entry: the read is only of the price the scan ran at", () => {
    // Price back above the stop reads as not breached, so a scan run then
    // confirms the plan or replaces it. Nothing here remembers the earlier break.
    expect(readStopBreach({ direction: "bullish", stopLoss: 98, price: 100 }).breached).toBe(false);
  });
});

describe("applyStopBreachHold", () => {
  const breached = { breached: true, stop: 98, price: 96 };
  const standing = { breached: false, stop: 98, price: 100 };

  it("drops an Execute plan whose stop is through to Reject, keeping the score", () => {
    const held = applyStopBreachHold(decision("Execute"), breached);
    expect(held.outputState).toBe("Reject");
    expect(held.score).toBe(7);
    expect(held.breakdown.at(-1)).toMatchObject({ key: "stopBreach", passed: false });
  });

  it("retires a Watch plan too: there is no live plan to keep watching", () => {
    expect(applyStopBreachHold(decision("Watch", 5), breached).outputState).toBe("Reject");
  });

  it("leaves a plan whose stop stands, and a verdict that is already Reject, as they were", () => {
    const execute = decision("Execute");
    expect(applyStopBreachHold(execute, standing)).toBe(execute);
    const reject = decision("Reject", 2);
    expect(applyStopBreachHold(reject, breached)).toBe(reject);
  });

  it("is named on the public summary, without naming a scored condition", () => {
    const summary = toPublicScoreSummary(applyStopBreachHold(decision("Execute"), breached));
    expect(summary.stateNote).toMatch(/plan is retired/i);
    expect(JSON.stringify(summary)).not.toMatch(/swingChartTrend|Swing chart trend/);
  });
});
