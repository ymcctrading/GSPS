/**
 * Gann's buy on the reaction after a crossing, on the live paths (PLAN.md item
 * 4). W006 pp.20, 46-47: old top 50, a close at 53 crosses it, buy the
 * reaction at 51 (down to 48), stop at 47, never risk more than 5 points.
 * Points are price-scaled by `lib/gann/pointScale.ts`; shorts are the mirror.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannEntryTrigger, gannBreakLine, gannCrossedLevel } from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { computeTradeLevels, gannEntrySource } from "@/lib/strat/levels";
import { advanceEntryConfirmation, entryReady, freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { confirmationFromBars } from "@/lib/lifecycle/confirmNow";
import { isTriggered } from "@/lib/brokers/simulator";

function bars(closes: number[], half = 0.5): Bar[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}

const ZIGZAG = bars([10, 11, 12, 13, 14, 15, 16, 15, 14, 13, 12, 13, 14, 15, 16, 17, 18].map((c) => c * 4), 1);
// The short's mirror, after distribution (A-ENTRY-15): two narrow weeks at the top, then the same zigzag down.
const ZIGZAG_SHORT = bars([...Array.from({ length: 10 }, (_, i) => 18 + (i % 2 ? 0.1 : -0.1)), 17, 16, 15, 14, 13, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10].map((c) => c * 4), 1);
const prev: Bar = { t: "2026-01-20T00:00:00Z", o: 70, h: 71, l: 69, c: 70, v: 1 };

function bar(t: string, h: number, l: number, c: number): Bar {
  return { t, o: c, h, l, c, v: 1 };
}

describe("the reaction buy on the live plan", () => {
  for (const direction of ["bullish", "bearish"] as const) {
    const t = computeGannEntryTrigger(direction === "bullish" ? ZIGZAG : ZIGZAG_SHORT, direction)!;
    const sign = direction === "bullish" ? 1 : -1;
    const point = gannThreePoints(t.level) / 3;

    it(`prices a ${direction} plan at the level plus 1 point, stopped at the level less 3`, () => {
      for (const assetClass of ["us_equity", "crypto"] as const) {
        const l = computeTradeLevels(gannEntrySource(t), prev, [], undefined, 0.4, assetClass, false, [t.level - sign * 9]);
        expect(l.entry).toBeCloseTo(t.level + sign * point, 2);
        expect(l.stopLoss).toBeCloseTo(t.level - sign * 3 * point, 2);
        // Never more than 5 points at risk (W006 p.46): the reaction risks 4.
        expect(l.riskPerShare).toBeLessThanOrEqual((5 / 3) * gannThreePoints(t.level) + 0.01);
      }
    });

    it(`recovers the ${direction} crossing line and level from the stored entry and stop`, () => {
      expect(gannBreakLine(t.reactionEntry, t.reactionStop)).toBeCloseTo(t.triggerPrice, 8);
      expect(gannCrossedLevel(t.reactionEntry, t.reactionStop)).toBeCloseTo(t.level, 8);
    });
  }

  const rule = { direction: "bullish" as const, entryTrigger: 51, stopPrice: 47 };

  it("is ready once a close crosses the old top by 3 points, on the same bar that first reached it", () => {
    const ev = advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-01-02T00:00:00Z", 53.4, 50.5, 53));
    expect(entryReady(ev)).toBe(true);
  });

  it("is not ready on a wick past the line that closes short of it", () => {
    const ev = advanceEntryConfirmation(freshEntryConfirmation(), rule, bar("2026-01-02T00:00:00Z", 53.4, 50.5, 52.6));
    expect(entryReady(ev)).toBe(false);
  });

  it("calls the entry off when a later close goes through the stop before it is placed", () => {
    const crossed = bar("2026-01-02T00:00:00Z", 53.4, 50.5, 53);
    expect(confirmationFromBars([crossed], "bullish", 51, 47).ready).toBe(true);
    const dead = confirmationFromBars([crossed, bar("2026-01-03T00:00:00Z", 50, 46.5, 46.8)], "bullish", 51, 47);
    expect(dead.ready).toBe(false);
    expect(dead.stage).toBe("dead");
  });

  it("mirrors for a short: a close 3 points under the old bottom", () => {
    const short = { direction: "bearish" as const, entryTrigger: 49, stopPrice: 53 };
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), short, bar("2026-01-02T00:00:00Z", 49.5, 46.6, 47)))).toBe(true);
    expect(entryReady(advanceEntryConfirmation(freshEntryConfirmation(), short, bar("2026-01-02T00:00:00Z", 49.5, 46.6, 47.4)))).toBe(false);
  });

  it("fills the resting order only when price reacts back to the entry", () => {
    expect(isTriggered("buy", 51, 53)).toBe(false);
    expect(isTriggered("buy", 51, 50.6)).toBe(true);
    expect(isTriggered("sell", 49, 47)).toBe(false);
    expect(isTriggered("sell", 49, 49.3)).toBe(true);
  });
});
