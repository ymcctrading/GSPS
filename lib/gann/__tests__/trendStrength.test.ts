/**
 * Guards the swing-structure trend read that replaced Wilder's ADX/DMI in the
 * Signal & Regime Engine on 2026-09-17.
 *
 * Two of these encode mistakes made while building it, because both look
 * correct in the abstract and are wrong against real bar shapes:
 *
 *   - Requiring the 3-day and 9-day charts to AGREE makes a trend unreachable
 *     during any pullback, since a pullback is exactly what flips the 3-day.
 *   - Counting 9-day reversals scores a tight range as a strong trend, since
 *     an oscillation rarely strings nine closes together and so completes
 *     almost no swings.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { isGannRangeBound, readGannTrend } from "@/lib/gann/trendStrength";

function bar(c: number): Bar {
  return { t: "2026-01-01T00:00:00Z", o: c, h: c + 1, l: c - 1, c, v: 1000 } as Bar;
}

/** Stepping uptrend: 8 up, 3 down, net higher — rising tops and bottoms. */
function uptrend(n: number): Bar[] {
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += i % 11 < 8 ? 0.8 : -0.4;
    out.push(bar(p));
  }
  return out;
}

/** Oscillation between the same two levels — flat tops and bottoms. */
function flatRange(n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const phase = i % 8;
    out.push(bar(96 + (phase < 4 ? phase : 7 - phase) * 2));
  }
  return out;
}

describe("readGannTrend", () => {
  it("confirms a stepping uptrend", () => {
    const t = readGannTrend(uptrend(120));
    expect(t.confirmed).toBe(true);
    expect(t.direction).toBe("bullish");
    expect(t.structureAgrees).toBe(true);
  });

  it("does not confirm a flat oscillating range, however long", () => {
    const t = readGannTrend(flatRange(120));
    expect(t.confirmed).toBe(false);
    expect(t.direction).toBeNull();
    expect(t.structureAgrees).toBe(false);
  });

  it("still confirms a trend that is currently pulling back", () => {
    // The regression that killed the first implementation: trendPullback.ts
    // evaluates a market IN a pullback, so a rule that needs both charts to
    // agree makes that state unreachable. Ending mid-pullback must still read
    // as a trend.
    const bars = uptrend(120);
    bars.push(bar(bars[bars.length - 1].c - 0.4));
    bars.push(bar(bars[bars.length - 1].c - 0.4));
    bars.push(bar(bars[bars.length - 1].c - 0.4));
    expect(readGannTrend(bars).confirmed).toBe(true);
  });

  it("mirrors for a downtrend", () => {
    const down = uptrend(120)
      .map((b) => bar(200 - b.c));
    const t = readGannTrend(down);
    expect(t.confirmed).toBe(true);
    expect(t.direction).toBe("bearish");
  });

  it("does not confirm on history too short to complete swings", () => {
    expect(readGannTrend([bar(100), bar(101), bar(102)]).confirmed).toBe(false);
  });
});

describe("isGannRangeBound", () => {
  it("is the exact negation of confirmed, so nothing is both trending and ranging", () => {
    for (const bars of [uptrend(120), flatRange(120), [bar(100), bar(101)]]) {
      expect(isGannRangeBound(bars)).toBe(!readGannTrend(bars).confirmed);
    }
  });
});
