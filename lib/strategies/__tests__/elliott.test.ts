import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  countElliott,
  countPoints,
  elliottLean,
  readImpulse,
  swingPoints,
  type SwingPoint,
} from "../elliottCount";
import { evaluateElliottWave } from "../elliottWave";
import { evaluateStrategyMode } from "../registry";
import { explainPlan } from "../explain";

/** Daily bars walking one point a bar through `waypoints`. */
function path(waypoints: number[], mirror = false): Bar[] {
  const closes: number[] = [waypoints[0]];
  for (let k = 1; k < waypoints.length; k++) {
    const from = waypoints[k - 1];
    const to = waypoints[k];
    const steps = Math.max(1, Math.round(Math.abs(to - from)));
    for (let i = 1; i <= steps; i++) closes.push(from + ((to - from) * i) / steps);
  }
  const start = Date.UTC(2025, 0, 2);
  return closes.map((c0, i) => {
    const c = mirror ? 300 - c0 : c0;
    return { t: new Date(start + i * 86_400_000).toISOString(), o: c, h: c + 0.2, l: c - 0.2, c, v: 1000 };
  });
}

const IMPULSE_THEN_ABC = [100, 120, 110, 145, 132, 150, 138, 144, 130, 136];

function pts(prices: number[], firstKind: "low" | "high"): SwingPoint[] {
  return prices.map((price, k) => ({
    index: k * 10,
    t: new Date(Date.UTC(2025, 0, 1 + k * 10)).toISOString(),
    price,
    kind: (k % 2 === 0) === (firstKind === "low") ? "low" : "high",
    confirmed: true,
  }));
}

describe("Elliott Wave counter", () => {
  it("finds the swing points of a clean path", () => {
    const sw = swingPoints(path(IMPULSE_THEN_ABC));
    expect(sw.map((p) => Math.round(p.price))).toEqual(IMPULSE_THEN_ABC);
    expect(sw.at(-1)?.confirmed).toBe(false);
  });

  it("counts five rising waves and a complete A-B-C", () => {
    const count = countElliott(path(IMPULSE_THEN_ABC));
    expect(count.impulse?.direction).toBe("bullish");
    expect(count.impulse?.points.map((p) => Math.round(p.price))).toEqual([100, 120, 110, 145, 132, 150]);
    expect(count.correction?.points.map((p) => p.label)).toEqual(["A", "B", "C"]);
    expect(count.correction?.complete).toBe(true);
    expect(elliottLean(count)).toBe("bullish");
    expect(countPoints(count).map((p) => p.text)).toEqual(["0", "1", "2", "3", "4", "5", "A", "B", "C"]);
  });

  it("leans against five waves while their correction is unfinished", () => {
    const count = countElliott(path([100, 120, 110, 145, 132, 150, 138]));
    expect(count.impulse?.direction).toBe("bullish");
    expect(elliottLean(count)).toBe("bearish");
  });

  it("mirrors the count for a falling market", () => {
    const count = countElliott(path(IMPULSE_THEN_ABC, true));
    expect(count.impulse?.direction).toBe("bearish");
    expect(count.correction?.complete).toBe(true);
  });

  it("keeps Elliott's three rules", () => {
    expect(readImpulse(pts([100, 120, 110, 145, 132, 150], "low"))).not.toBeNull();
    // Rule 1: wave 2 past the start of wave 1.
    expect(readImpulse(pts([100, 120, 99, 145, 132, 150], "low"))).toBeNull();
    // Rule 2: wave 3 the shortest.
    expect(readImpulse(pts([100, 120, 110, 125, 121, 145], "low"))).toBeNull();
    // Rule 3: wave 4 into wave 1's range.
    expect(readImpulse(pts([100, 120, 110, 145, 118, 150], "low"))).toBeNull();
  });

  it("notes a truncated fifth without rejecting it", () => {
    const imp = readImpulse(pts([100, 120, 110, 145, 132, 143], "low"));
    expect(imp).not.toBeNull();
    expect(imp?.notes.some((n) => n.includes("truncated"))).toBe(true);
  });
});

describe("Elliott Wave, wave 3 entry", () => {
  const bars = path([100, 120, 108, 114]);

  it("arms on waves 1 and 2, entry past wave 1, stop at its start", () => {
    const lv = evaluateElliottWave(bars);
    expect(lv).not.toBeNull();
    expect(lv!.direction).toBe("bullish");
    expect(lv!.entry).toBeGreaterThan(120.2);
    expect(lv!.entry).toBeLessThan(120.3);
    expect(lv!.stopLoss).toBeCloseTo(99.8, 5);
    expect(lv!.takeProfit1).toBeCloseTo(107.8 + 1.618 * 20.4, 5);
    expect(lv!.masterTarget).toBeCloseTo(107.8 + 2.618 * 20.4, 5);
    expect(evaluateStrategyMode("elliottWave", bars)).toEqual(lv);
  });

  it("mirrors for a falling wave 1", () => {
    const lv = evaluateElliottWave(path([100, 120, 108, 114], true));
    expect(lv?.direction).toBe("bearish");
    expect(lv!.stopLoss).toBeGreaterThan(lv!.entry);
  });

  it("stands aside once wave 3 has passed wave 1's end", () => {
    expect(evaluateElliottWave(path([100, 120, 108, 124]))).toBeNull();
  });

  it("stands aside when wave 2 gave back all of wave 1", () => {
    expect(evaluateElliottWave(path([100, 120, 98, 104]))).toBeNull();
  });

  it("reads GSPS's plan against the count", () => {
    const r = explainPlan("elliottWave", bars, {
      direction: "bullish",
      entry: 115,
      stopLoss: 105,
      takeProfit1: 125,
      masterTarget: 135,
    });
    expect(r?.agrees).toBe(true);
    expect(r?.summary).toContain("One valid count");
    expect(r?.levels).toHaveLength(4);
  });
});
