/**
 * P6(a): the monthly 45° from the last bottom of the 3-month swing chart, at 1
 * Gann point a month (diagnosis: replay-diagnosis/2026-10-21-p6-angle-scale.md).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Bar } from "@/lib/types";
import { monthlyAngleOrigin, readMonthlyFortyFive } from "@/lib/scoring/pillars";
import { swingPivots, THREE_DAY_CHART } from "@/lib/gann/swingChart";
import { buildMacroContext } from "@/lib/backtest/replay";
import { toMonthlyBars } from "@/lib/gann/disclosedRules";

const DAY = 86_400_000;
const months = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2020, i, 1)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));

describe("the monthly 45° (readMonthlyFortyFive)", () => {
  // A decline to a bottom at month 6 (low 89.5), then a rally of 3 months or more.
  const base = [100, 98, 96, 94, 92, 91, 90, 92, 94, 96, 98];

  it("holds for a long while price is at or above 1 point a month up from the last monthly bottom", () => {
    // Line at month 11: 89.5 + 5 = 94.5; price 96 holds, 93 is broken by more than 1 point.
    expect(readMonthlyFortyFive(months(base), 96, 1)?.bullish).toBe(true);
    expect(readMonthlyFortyFive(months(base), 93, 1)?.bullish).toBe(false);
  });

  it("allows the 1-point break under the line", () => {
    expect(readMonthlyFortyFive(months(base), 93.6, 1)?.bullish).toBe(true);
  });

  it("draws from a bottom only once it has held 3 closed months (GA-25 to GA-27)", () => {
    // The bottom at month 6 has 2 months after it: no origin yet, so the long fails.
    expect(readMonthlyFortyFive(months(base.slice(0, 9)), 100, 1)?.bullish).toBe(false);
    // With a third month after it, the line is drawn: 89.5 + 4 = 93.5 at month 10.
    expect(readMonthlyFortyFive(months(base.slice(0, 10)), 96, 1)?.bullish).toBe(true);
  });

  it("retires a bottom a later month broke by 3 points and reads the older one that stands", () => {
    // Bottom A at month 3 (84.5), bottom B at month 10 (88.5), then a break to
    // 85.3 at month 16, 2 months old: B is more than 3 points through, so A is
    // the origin. Without the break, B stands.
    const closes = [100, 95, 90, 85, 88, 91, 94, 97, 94, 91, 89, 92, 95, 98, 94, 90, 85.8, 88, 91];
    const read = (c: number[]) => {
      const m = months(c);
      return monthlyAngleOrigin(m, swingPivots(m, THREE_DAY_CHART), "bottom", 1)?.price;
    };
    expect(read(closes)).toBe(84.5);
    expect(read(closes.slice(0, 14))).toBe(88.5);
  });

  it("reads nothing without the months to draw it", () => {
    expect(readMonthlyFortyFive(months([100]), 100, 1)).toBeNull();
  });
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function walk(seed: number, count: number, start: number, drift: number): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  let t = Date.parse("2019-01-02T00:00:00Z");
  let c = start;
  while (out.length < count) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const z = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
      const o = c;
      c = c * Math.exp(drift + 0.015 * z);
      out.push({ t: new Date(t).toISOString(), o, h: Math.max(o, c) * (1 + 0.005 * r()), l: Math.min(o, c) * (1 - 0.005 * r()), c, v: 1e6 });
    }
    t += DAY;
  }
  return out;
}

// ANGLE_WALKS sets the walks per price (the diagnosis used 20); ANGLE_OUT writes the rates.
describe("the monthly 45° on random walks", () => {
  it("is neither near-empty nor saturated, and favours the trend's side in an uptrend", () => {
    const walks = Number(process.env.ANGLE_WALKS ?? 4);
    const report: string[] = [];
    for (const drift of [0, 0.0005]) {
      for (const start of [20, 150, 500]) {
        const pass = { bullish: 0, bearish: 0 };
        let n = 0;
        for (let w = 0; w < walks; w++) {
          const bars = walk(5000 + w, 1300, start, drift);
          for (let i = 300; i < bars.length - 1; i += 40) {
            const daily = bars.slice(0, i + 1);
            const asOf = new Date(Date.parse(daily[i].t) + DAY);
            const ctx = buildMacroContext(daily, daily[i].c, asOf, toMonthlyBars(daily).slice(0, -1), null, null);
            n++;
            if (ctx.pillarFacts.angles?.holds45.bullish) pass.bullish++;
            if (ctx.pillarFacts.angles?.holds45.bearish) pass.bearish++;
          }
        }
        const pct = (k: number) => (100 * k) / n;
        report.push(`drift ${drift} $${start}: ${n} readings; long ${pct(pass.bullish).toFixed(1)}%, short ${pct(pass.bearish).toFixed(1)}%`);
        expect(pct(pass.bullish)).toBeGreaterThan(drift > 0 ? 25 : 5);
        expect(pct(pass.bearish)).toBeGreaterThan(5);
        expect(Math.max(pct(pass.bullish), pct(pass.bearish))).toBeLessThan(95);
        if (drift > 0) expect(pass.bullish).toBeGreaterThan(pass.bearish);
      }
    }
    if (process.env.ANGLE_OUT) fs.writeFileSync(process.env.ANGLE_OUT, report.join("\n"));
  }, 1_800_000);
});
