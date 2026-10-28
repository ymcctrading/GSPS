import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar } from "@/lib/types";
import { HELD_LEVEL_SESSIONS, readHeldLevel } from "@/lib/gann/heldLevel";
import { threePoints, pricePoint } from "@/lib/gann/pointScale";
import { buildMacroContext } from "@/lib/backtest/replay";
import { toMonthlyBars } from "@/lib/gann/disclosedRules";

const DAY = 86_400_000;

/** Completed sessions with the given lows (and highs 1 over, closes at the middle), from 2026-01-05. */
function sessions(lows: number[], closes?: number[]): Bar[] {
  const start = Date.parse("2026-01-05T05:00:00Z");
  return lows.map((l, i) => {
    const c = closes?.[i] ?? l + 0.5;
    return { t: new Date(start + i * DAY).toISOString(), o: c, h: Math.max(l + 1, c), l, c, v: 1e6 };
  });
}

describe("historicalSR: the reaction stopped at an old level and held (heldLevel.ts)", () => {
  const level = [{ price: 50, timeframe: "1Week" as const }];

  it("passes a long whose last 10-session low printed at the old level 2+ sessions ago and held", () => {
    // The low of 49 is 1 point (well within 3) under the level, 4 sessions ago.
    const bars = sessions([55, 54, 53, 52, 51, 49, 51, 52, 53, 54]);
    const m = readHeldLevel(bars, level, 54.5, "bullish");
    expect(m).toEqual({ price: 50, timeframe: "1Week", extreme: 49, sessionsAgo: 4 });
  });

  it("fails when the low is the last session or the one before (not held yet)", () => {
    expect(readHeldLevel(sessions([55, 54, 53, 52, 51, 51, 51, 51, 51, 49.5]), level, 50, "bullish")).toBeNull();
    expect(readHeldLevel(sessions([55, 54, 53, 52, 51, 51, 51, 51, 49.5, 50]), level, 50.5, "bullish")).toBeNull();
  });

  it("fails when the reaction stopped short of the level by more than 1 point, or went through by more than 3", () => {
    const one = pricePoint(50);
    const three = threePoints(50);
    const short = 50 + one + 0.2;
    const through = 50 - three - 0.2;
    expect(readHeldLevel(sessions([58, 57, 56, 55, short, 56, 57, 58, 58, 58]), level, 58.5, "bullish")).toBeNull();
    expect(readHeldLevel(sessions([58, 57, 56, 55, through, 56, 57, 58, 58, 58]), level, 58.5, "bullish")).toBeNull();
  });

  it("reads only levels of the wanted role: a level over price is not support", () => {
    const bars = sessions([55, 54, 53, 52, 51, 49, 51, 52, 53, 54]);
    expect(readHeldLevel(bars, level, 49.8, "bullish")).toBeNull();
  });

  it("mirrors for a short: the highest high at an old top, held under it", () => {
    // Highs are lows + 1: the high of 51 sits 1 point over the old top at 50, 4 sessions ago.
    const lows = [44, 45, 46, 47, 48, 50, 48, 47, 46, 45];
    const bars = sessions(lows, lows.map((l) => l + 0.5));
    const m = readHeldLevel(bars, [{ price: 50, timeframe: "1Month" }], 45.5, "bearish");
    expect(m).toEqual({ price: 50, timeframe: "1Month", extreme: 51, sessionsAgo: 4 });
    expect(readHeldLevel(bars, [{ price: 50, timeframe: "1Month" }], 45.5, "bullish")).toBeNull();
  });

  it("needs a full reaction window of completed sessions", () => {
    expect(readHeldLevel(sessions([55, 49, 51]), level, 52, "bullish")).toBeNull();
    expect(HELD_LEVEL_SESSIONS).toBe(10);
  });
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The diagnosis's walks: weekdays, 1.5% log steps, from 2023-01-02, at a starting price. */
function walk(seed: number, count: number, start: number): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  let t = Date.parse("2023-01-02T00:00:00Z");
  let c = start;
  while (out.length < count) {
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

// The 2026-10-21 diagnosis (replay-diagnosis/2026-10-21-historicalSR-saturation.md):
// the proximity check passed 98-100% of random-walk readings. This pins the held
// rule, read through the replay's context (the live scan reads the same facts,
// pillarParity.test.ts), between "not saturated" and "not near-empty".
// SR_WALKS sets the walks per price (the diagnosis used 20); SR_OUT writes the rates.
describe("historicalSR's pass rate on random walks", () => {
  it("is neither saturated nor near-empty at $20, $50, $150 and $500, long and short", () => {
    const walks = Number(process.env.SR_WALKS ?? 5);
    const report: string[] = [];
    for (const start of [20, 50, 150, 500]) {
      const held = { bullish: 0, bearish: 0 };
      const near = { bullish: 0, bearish: 0 };
      const division = { bullish: 0, bearish: 0 };
      let n = 0;
      for (let w = 0; w < walks; w++) {
        const bars = walk(2000 + w, 520, start);
        for (let i = 300; i < bars.length - 1; i += 10) {
          const daily = bars.slice(0, i + 1);
          const price = daily[i].c;
          const asOf = new Date(Date.parse(daily[i].t) + DAY);
          const ctx = buildMacroContext(daily, price, asOf, toMonthlyBars(daily).slice(0, -1), null, null);
          n++;
          if (ctx.pillarFacts.heldLevels.bullish) held.bullish++;
          if (ctx.pillarFacts.heldLevels.bearish) held.bearish++;
          if (ctx.srMatches.support) near.bullish++;
          if (ctx.srMatches.resistance) near.bearish++;
          if (ctx.pillarFacts.rangeLevels.bullish) division.bullish++;
          if (ctx.pillarFacts.rangeLevels.bearish) division.bearish++;
        }
      }
      const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
      report.push(
        `$${start}: ${n} readings a side; held long ${pct(held.bullish)}, short ${pct(held.bearish)}; ` +
          `proximity (before) long ${pct(near.bullish)}, short ${pct(near.bearish)}; ` +
          `held range division long ${pct(division.bullish)}, short ${pct(division.bearish)}`,
      );
      for (const side of ["bullish", "bearish"] as const) {
        expect(held[side] / n).toBeGreaterThan(0.05);
        expect(held[side] / n).toBeLessThan(0.95);
        // P5(b), held rather than near (census 2026-10-21: 56-92% when near).
        expect(division[side] / n).toBeLessThan(0.7);
      }
    }
    if (process.env.SR_OUT) fs.writeFileSync(process.env.SR_OUT, report.join("\n"));
  }, 1_800_000);
});
