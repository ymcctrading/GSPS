import { describe, expect, it } from "vitest";
import {
  RECLAIM_POINTS,
  RECLAIM_POINTS_STRICT,
  isReclaimedByClose,
  isStopBreached,
  isStopBreachedByBar,
  readStopBreach,
  reclaimLevel,
} from "@/lib/gann/stopBreach";
import { gannThreePoints } from "@/lib/gann/pointScale";
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

/**
 * Gann's own test of a false break: after breaking an old bottom a stock "should
 * not rally 3 points back above it", and the close decides (New Stock Trend
 * Detector p. 20; Master Stock Market Course, rules 4-5 and the range rules).
 */
describe("reclaimLevel", () => {
  it("is the broken level plus his 3-point allowance for a long, minus it for a short", () => {
    const allowance = gannThreePoints(88);
    expect(allowance).toBeGreaterThan(0);
    expect(reclaimLevel("bullish", 88)).toBeCloseTo(88 + allowance, 10);
    expect(reclaimLevel("bearish", 88)).toBeCloseTo(88 - gannThreePoints(88), 10);
  });

  it("scales with the price, as he scaled his points", () => {
    const pctAt = (p: number) => (reclaimLevel("bullish", p) - p) / p;
    expect(pctAt(20)).toBeGreaterThan(pctAt(500));
  });

  it("defaults to his 3 points, and the replay can ask for the stricter 5", () => {
    expect(RECLAIM_POINTS).toBe(3);
    expect(RECLAIM_POINTS_STRICT).toBe(5);
    expect(reclaimLevel("bullish", 88, RECLAIM_POINTS)).toBe(reclaimLevel("bullish", 88));
    const three = reclaimLevel("bullish", 88) - 88;
    expect(reclaimLevel("bullish", 88, 5) - 88).toBeCloseTo((three * 5) / 3, 10);
    expect(88 - reclaimLevel("bearish", 88, 5)).toBeCloseTo((three * 5) / 3, 10);
    // A close that clears three points does not clear five.
    const close = { c: reclaimLevel("bullish", 88) + 0.01 };
    expect(isReclaimedByClose("bullish", 88, close)).toBe(true);
    expect(isReclaimedByClose("bullish", 88, close, 5)).toBe(false);
  });

  it("is won back on a close, not a touch", () => {
    const line = reclaimLevel("bullish", 88);
    expect(isReclaimedByClose("bullish", 88, { c: line })).toBe(true);
    expect(isReclaimedByClose("bullish", 88, { c: line - 0.01 })).toBe(false);
    const shortLine = reclaimLevel("bearish", 102);
    expect(isReclaimedByClose("bearish", 102, { c: shortLine })).toBe(true);
    expect(isReclaimedByClose("bearish", 102, { c: shortLine + 0.01 })).toBe(false);
  });
});

describe("readStopBreach", () => {
  const stop = 88;
  const line = reclaimLevel("bullish", stop);
  const bar = (l: number, c: number) => ({ h: c + 1, l, c });

  it("reads price through the stop as broken, and reports where a close must get back to", () => {
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: 85 })).toEqual({
      breached: true,
      stop,
      price: 85,
      reclaimAt: line,
    });
  });

  it("does not read a breach with no plan, no stop or no price", () => {
    expect(readStopBreach({ direction: "none", stopLoss: stop, price: 85 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: undefined, price: 85 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: 0 }).breached).toBe(false);
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: null }).breached).toBe(false);
  });

  it("keeps a plan standing when the session never touched the stop", () => {
    const bars = [bar(95, 97), bar(94, 96)];
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: 96, sessionBars: bars }).breached).toBe(false);
  });

  it("keeps a plan retired when it broke earlier and price has only come back between the stop and the line", () => {
    // Back above the stop, but not through the broken level by the allowance:
    // the old bottom is now resistance, and this is a test of it.
    const bars = [bar(86, 87), bar(87, stop + (line - stop) / 2)];
    const r = readStopBreach({ direction: "bullish", stopLoss: stop, price: stop + 1, sessionBars: bars });
    expect(r.breached).toBe(true);
  });

  it("stands the plan again when a closed bar has closed back through the line: a failed break", () => {
    const bars = [bar(86, 87), bar(87, line + 0.1)];
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: line + 0.2, sessionBars: bars }).breached).toBe(false);
  });

  it("does not count a poke that reversed by the close as a break", () => {
    // The breaking bar itself closed back through the line.
    const bars = [bar(86, line + 0.5)];
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: line + 0.5, sessionBars: bars }).breached).toBe(false);
  });

  it("retires again on a fresh break after a reclaim", () => {
    const bars = [bar(86, line + 0.5), bar(85, 87)];
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: 89, sessionBars: bars }).breached).toBe(true);
  });

  it("stays broken while price is through the stop, whatever closed before", () => {
    const bars = [bar(86, line + 0.5)];
    expect(readStopBreach({ direction: "bullish", stopLoss: stop, price: 87, sessionBars: bars }).breached).toBe(true);
  });

  it("mirrors for a short", () => {
    const shortStop = 112;
    const shortLine = reclaimLevel("bearish", shortStop);
    const broke = { h: 113, l: 110, c: 112.5 };
    expect(
      readStopBreach({ direction: "bearish", stopLoss: shortStop, price: 111, sessionBars: [broke] }).breached,
    ).toBe(true);
    const reclaimed = { h: shortStop - 0.5, l: shortLine - 0.5, c: shortLine - 0.1 };
    expect(
      readStopBreach({ direction: "bearish", stopLoss: shortStop, price: shortLine - 1, sessionBars: [broke, reclaimed] })
        .breached,
    ).toBe(false);
  });
});

describe("applyStopBreachHold", () => {
  const breached = { breached: true, stop: 98, price: 96, reclaimAt: 102 };
  const standing = { breached: false, stop: 98, price: 100, reclaimAt: 102 };

  it("drops an Execute plan whose stop is broken to Reject, keeping the score", () => {
    const held = applyStopBreachHold(decision("Execute"), breached);
    expect(held.outputState).toBe("Reject");
    expect(held.score).toBe(7);
    expect(held.breakdown.at(-1)).toMatchObject({ key: "stopBreach", passed: false });
    expect(held.breakdown.at(-1)?.note).toContain("102.00");
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
    expect(summary.stateNote).toMatch(/false break/);
    expect(JSON.stringify(summary)).not.toMatch(/swingChartTrend|Swing chart trend/);
  });
});
