import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar } from "@/lib/types";
import { computeTimePriceSquare } from "@/lib/gann/timePriceSquare";
import { readCounterMove } from "@/lib/gann/disclosedRules";
import { readTimeRules } from "@/lib/gann/timeRules";
import { reactionInTimeLimit, type PillarFacts } from "@/lib/scoring/pillars";

// P7 without the dated window (2026-10-20, pending the owner's choice): how
// often "squared AND in its limit" and "squared OR in its limit" pass on a
// random walk, read the way the score reads them (the direction-matched
// anchor's square; the counter-move clock and the abnormal-reaction rule).
// The numbers are recorded at `TIME_PILLAR_COMBINE` in pillars.ts.

const DAY = 86_400_000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The same walks as `timeWindowFamilies`' measurement on p7cardinal: weekdays, 1.5% log steps, from 2023-01-02. */
function walk(seed: number, sessions: number): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  let t = Date.parse("2023-01-02T00:00:00Z");
  let c = 100;
  while (out.length < sessions) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const z = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
      const o = c;
      c = c * Math.exp(0.015 * z);
      const h = Math.max(o, c) * (1 + 0.005 * r());
      const l = Math.min(o, c) * (1 - 0.005 * r());
      out.push({ t: new Date(t).toISOString(), o, h, l, c, v: 1e6 });
    }
    t += DAY;
  }
  return out;
}

describe("P7's pass rate on random walks, without the window", () => {
  it("'and' is neither saturated nor near-empty; the rates are written on request", () => {
    const walks = Number(process.env.P7_WALKS ?? 40);
    let n = 0;
    let squaredN = 0;
    let inLimitN = 0;
    let andN = 0;
    let orN = 0;
    for (let w = 0; w < walks; w++) {
      const bars = walk(1000 + w, 300);
      for (let i = 60; i < bars.length; i += 5) {
        const through = bars.slice(0, i + 1);
        const square = computeTimePriceSquare(through, through[i].c);
        const cm = readCounterMove(through);
        const facts = {
          counterMove: cm ? { trend: cm.trend, inCounterMove: cm.inCounterMove, phase: cm.phase } : null,
          reactionAbnormal: readTimeRules(through, cm).reactionAbnormal,
        } as unknown as PillarFacts;
        for (const side of ["bullish", "bearish"] as const) {
          const squared = square.find((r) => r.anchorKind === (side === "bullish" ? "low" : "high"))?.squared === true;
          const inLimit = reactionInTimeLimit(side, facts);
          n++;
          if (squared) squaredN++;
          if (inLimit) inLimitN++;
          if (squared && inLimit) andN++;
          if (squared || inLimit) orN++;
        }
      }
    }
    const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
    const report = [`readings: ${n}`, `squared: ${pct(squaredN)}`, `in its limit: ${pct(inLimitN)}`, `and: ${pct(andN)}`, `or: ${pct(orN)}`];
    if (process.env.P7_OUT) fs.writeFileSync(process.env.P7_OUT, report.join("\n"));
    expect(andN / n).toBeGreaterThan(0.05);
    expect(andN / n).toBeLessThan(0.95);
  }, 300_000);
});
