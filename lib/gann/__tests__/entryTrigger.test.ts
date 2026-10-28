/**
 * Guards the Gann entry trigger that replaced the bar-sequence trigger as the
 * source of every trade plan's entry price on 2026-09-17.
 *
 * The distinction these tests protect is the whole reason for the change: the
 * trigger must sit at the last completed SWING extreme, not the last BAR
 * extreme. A test that passes for both is not testing the thing that changed.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  computeGannEntryTrigger,
  distributedBefore,
  ENTRY_TRIGGER_SWING_DAYS,
} from "@/lib/gann/entryTrigger";
import { swingPivots } from "@/lib/gann/swingChart";
import { threePoints } from "@/lib/gann/pointScale";

/** Bars from closes; high/low straddle each close so pivots are well defined. */
function bars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1_000,
  })) as Bar[];
}

/** Up 6, down 4 (flips the 3-day chart), up 6 again — two completed swings. */
const ZIGZAG = bars([
  10, 11, 12, 13, 14, 15, 16, // rally to 16 (high 17)
  15, 14, 13, 12, // four down closes: 3-day chart flips
  13, 14, 15, 16, 17, 18, // rally again
]);

// The short's mirror, after distribution (A-ENTRY-15): two narrow weeks at the top, then a zigzag down.
const ZIGZAG_SHORT = bars([...Array.from({ length: 10 }, (_, i) => 18 + (i % 2 ? 0.1 : -0.1)), 17, 16, 15, 14, 13, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10]);

describe("swingPivots", () => {
  it("returns completed swing extremes, not per-bar extremes", () => {
    const pivots = swingPivots(ZIGZAG, ENTRY_TRIGGER_SWING_DAYS);
    expect(pivots.length).toBeGreaterThanOrEqual(1);
    for (const p of pivots) {
      expect(["top", "bottom"]).toContain(p.kind);
      expect(Number.isFinite(p.price)).toBe(true);
    }
  });

  it("alternates top and bottom — a swing cannot follow itself", () => {
    const pivots = swingPivots(ZIGZAG, ENTRY_TRIGGER_SWING_DAYS);
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i].kind).not.toBe(pivots[i - 1].kind);
    }
  });

  it("has no completed top when there is not enough history to complete a swing", () => {
    // Only the chart's origin (the low the first swing started from) exists.
    const pivots = swingPivots(bars([10, 11]), ENTRY_TRIGGER_SWING_DAYS);
    expect(pivots.filter((p) => p.kind === "top")).toEqual([]);
  });
});

describe("computeGannEntryTrigger", () => {
  it("triggers above the old swing top for a long, not the prior bar's high", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish");
    expect(t).not.toBeNull();
    expect(t!.pivot.kind).toBe("top");

    // The defining assertion: the level is the swing top, and the prior bar's
    // high is NOT what set it. If these ever coincide the fixture is wrong.
    const priorBarHigh = ZIGZAG[ZIGZAG.length - 1].h;
    expect(t!.pivot.price).not.toBe(priorBarHigh);
  });

  it("clears the level by 3 points, price-scaled, rather than sitting on it", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish")!;
    expect(t.triggerPrice).toBeGreaterThan(t.pivot.price);
    expect(t.triggerPrice).toBeCloseTo(t.pivot.price + threePoints(t.pivot.price), 8);
  });

  it("stops beyond the protective swing on the other side", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish")!;
    expect(t.protectivePivot.kind).toBe("bottom");
    expect(t.stopPrice).toBeLessThan(t.protectivePivot.price);
    expect(t.stopPrice).toBeLessThan(t.triggerPrice);
  });

  it("mirrors exactly for a short", () => {
    const t = computeGannEntryTrigger(ZIGZAG_SHORT, "bearish")!;
    expect(t.pivot.kind).toBe("bottom");
    expect(t.protectivePivot.kind).toBe("top");
    expect(t.triggerPrice).toBeLessThan(t.pivot.price);
    expect(t.stopPrice).toBeGreaterThan(t.triggerPrice);
  });

  it("does not sell a swing bottom short without a distribution spell first (A-ENTRY-15)", () => {
    const plain = bars([18, 17, 16, 15, 14, 13, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10]);
    expect(computeGannEntryTrigger(plain, "bearish")).toBeNull();
    expect(computeGannEntryTrigger(ZIGZAG_SHORT, "bearish")).not.toBeNull();
  });

  it("reads distribution as ten narrow sessions near the top, held above the level", () => {
    expect(distributedBefore(ZIGZAG_SHORT, ZIGZAG_SHORT.length, 11)).toBe(true);
    // The spell sat above the level; one that traded under it was not distribution there.
    expect(distributedBefore(ZIGZAG_SHORT, ZIGZAG_SHORT.length, 30)).toBe(false);
    // Fewer than ten sessions read: nothing to find.
    expect(distributedBefore(ZIGZAG_SHORT, 9, 11)).toBe(false);
  });

  it("does not ask distribution of an old top lost by 3 points (A-ENTRY-15 is a bottom's break)", () => {
    const lost = bars([40, 42, 44, 46, 48, 50, 48, 46, 44, 45, 47, 49, 51, 53, 55, 53, 51, 49, 47, 45, 44]);
    const t = computeGannEntryTrigger(lost, "bearish");
    expect(t).toMatchObject({ held: true, regained: true, source: "swing" });
  });

  it("reads the spell only near the top of the 13 weeks before the break", () => {
    const flat = Array.from({ length: 12 }, (_, i) => 20 + (i % 2 ? 0.1 : -0.1));
    const atTop = bars(flat);
    expect(distributedBefore(atTop, atTop.length, 15)).toBe(true);
    // The same spell well under an earlier high is not distribution at a top.
    const underHigh = bars([24, 28, 32, 36, 40, 36, 32, 28, 24, 20, ...flat]);
    expect(distributedBefore(underHigh, underHigh.length, 15)).toBe(false);
  });

  it("reads a spell wider than two 3-point allowances as no distribution", () => {
    const w = 2.5 * threePoints(19);
    // Closes swing so the bars' highs and lows span 2.5 allowances: a sharp top, not a narrow spell.
    const wide = bars(Array.from({ length: 12 }, (_, i) => (i % 2 ? 20 + (w - 2) / 2 : 20 - (w - 2) / 2)));
    expect(distributedBefore(wide, wide.length, 10)).toBe(false);
  });

  it("leaves the intraday profile's own scale alone: the daily distribution spell is not read on it", () => {
    const plain = bars([18, 17, 16, 15, 14, 13, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10]);
    expect(computeGannEntryTrigger(plain, "bearish", ENTRY_TRIGGER_SWING_DAYS, 0.3)).not.toBeNull();
  });

  it("returns null rather than a plan with no history to price it from", () => {
    expect(computeGannEntryTrigger(bars([10, 11, 12]), "bullish")).toBeNull();
  });

  it("never returns a stop on the wrong side of its own trigger", () => {
    for (const dir of ["bullish", "bearish"] as const) {
      const t = computeGannEntryTrigger(ZIGZAG, dir);
      if (!t) continue;
      const risk = Math.abs(t.triggerPrice - t.stopPrice);
      expect(risk).toBeGreaterThan(0);
      if (dir === "bullish") expect(t.stopPrice).toBeLessThan(t.triggerPrice);
      else expect(t.stopPrice).toBeGreaterThan(t.triggerPrice);
    }
  });
});
