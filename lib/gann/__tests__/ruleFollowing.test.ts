import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar, ScanDecision } from "@/lib/types";
import { readRuleFollowing } from "@/lib/gann/ruleFollowing";
import { applyRuleFollowingHold } from "@/lib/scoring/score";

// Q24 (owner: "Both"): Gann's "trade active stocks that follow the rules; leave
// queer-acting ... stocks alone" (A-SELECTION-01, W006 pp.20, 34-35), measured
// as the stock's own buying and selling points: did crossing an old top carry
// on, or fail back through the stop?

const DAY = 86_400_000;
function days(closes: number[]): Bar[] {
  const t0 = Date.parse("2025-11-03T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.2, l: c - 0.2, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

// A staircase: each rally crosses the last top and carries on well past it.
function stairs(steps: number): number[] {
  const out = [50];
  let p = 50;
  for (let s = 0; s < steps; s++) {
    out.push(...leg(p, p + 20, 6), ...leg(p + 20, p + 15, 4));
    p += 15;
  }
  return out;
}
// A trap: each rally pokes past the last top, then falls through the bottom.
function traps(steps: number): number[] {
  const out = [50];
  for (let s = 0; s < steps; s++) out.push(...leg(50, 60, 5), ...leg(60, 45, 6), ...leg(45, 66, 6), ...leg(66, 35, 8), ...leg(35, 50, 5));
  return out;
}

describe("readRuleFollowing", () => {
  it("counts a stock whose crossings carry on as following the rules", () => {
    const r = readRuleFollowing(days(stairs(8)))!;
    expect(r.resolved).toBeGreaterThanOrEqual(4);
    expect(r.followed).toBeGreaterThan(r.failed);
    expect(r.queer).toBe(false);
  });

  it("calls a stock whose crossings keep failing queer-acting", () => {
    const r = readRuleFollowing(days(traps(4)))!;
    expect(r.resolved).toBeGreaterThanOrEqual(4);
    expect(r.failed).toBeGreaterThan(r.followed);
    expect(r.queer).toBe(true);
  });

  it("calls nothing queer on too few crossings", () => {
    const r = readRuleFollowing(days(traps(1)));
    expect(r?.queer ?? false).toBe(false);
  });

  it("reads the short side too (Polarity)", () => {
    const r = readRuleFollowing(days(stairs(8).map((c) => 400 - c)))!;
    expect(r.followed).toBeGreaterThan(r.failed);
  });
});

describe("applyRuleFollowingHold", () => {
  const execute: ScanDecision = { score: 8, outputState: "Execute", breakdown: [] };
  it("leaves a queer-acting stock alone: Execute held to Watch", () => {
    const held = applyRuleFollowingHold(execute, { resolved: 6, followed: 1, failed: 5, queer: true });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("queerActing");
  });
  it("lets a stock that follows the rules through", () => {
    expect(applyRuleFollowingHold(execute, { resolved: 6, followed: 4, failed: 2, queer: false })).toBe(execute);
    expect(applyRuleFollowingHold(execute, null)).toBe(execute);
  });
  it("is applied by the live scan and the replay alike", () => {
    for (const f of ["lib/scanTicker.ts", "lib/backtest/replay.ts"]) expect(fs.readFileSync(f, "utf8")).toMatch(/applyRuleFollowingHold\(/);
  });
});
