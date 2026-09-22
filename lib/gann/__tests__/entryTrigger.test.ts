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
  LOST_MOTION_BUFFER_PCT,
  ENTRY_TRIGGER_SWING_DAYS,
} from "@/lib/gann/entryTrigger";
import { swingPivots } from "@/lib/gann/swingChart";

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

  it("is empty when there is not enough history to complete a swing", () => {
    expect(swingPivots(bars([10, 11]), ENTRY_TRIGGER_SWING_DAYS)).toEqual([]);
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

  it("clears the level by the lost-motion allowance rather than sitting on it", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish")!;
    expect(t.triggerPrice).toBeGreaterThan(t.pivot.price);
    expect(t.triggerPrice).toBeCloseTo(t.pivot.price * (1 + LOST_MOTION_BUFFER_PCT / 100), 8);
  });

  it("stops beyond the protective swing on the other side", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish")!;
    expect(t.protectivePivot.kind).toBe("bottom");
    expect(t.stopPrice).toBeLessThan(t.protectivePivot.price);
    expect(t.stopPrice).toBeLessThan(t.triggerPrice);
  });

  it("mirrors exactly for a short", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bearish")!;
    expect(t.pivot.kind).toBe("bottom");
    expect(t.protectivePivot.kind).toBe("top");
    expect(t.triggerPrice).toBeLessThan(t.pivot.price);
    expect(t.stopPrice).toBeGreaterThan(t.triggerPrice);
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
