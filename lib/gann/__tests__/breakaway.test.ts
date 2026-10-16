import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readBreakaway, readBreakawayVolume } from "../breakaway";
import { computeGannEntryTrigger } from "../entryTrigger";
import { applyBreakawayHold } from "@/lib/scoring/score";
import type { ScanDecision } from "@/lib/types";

/** One bar per calendar day from 2026-01-01; each bar spans close ± 0.5. */
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

/** A sideways market: swings between ~95 and ~105 with no net progress. */
function sideways(cycles: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < cycles; k++) {
    // Tops alternate slightly so the highest top is an older one.
    const top = k % 2 === 0 ? 105 : 103;
    for (let i = 1; i <= 5; i++) out.push(95 + ((top - 95) * i) / 5);
    for (let i = 1; i <= 5; i++) out.push(top - ((top - 95) * i) / 5);
  }
  return out;
}

function steppingAdvance(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

describe("readBreakaway (Commodities pp. 51-52)", () => {
  it("reads a sideways market as range-bound and holds an entry inside the range", () => {
    // The last leg tops near 100, so its 3-point crossing (~5 points) still
    // sits inside the ~105.5 range high.
    const bars = daily([...sideways(6), 97, 98, 99, 100, 99, 98, 97, 96]);
    const trigger = computeGannEntryTrigger(bars, "bullish");
    const r = readBreakaway(bars, trigger);
    expect(r.rangeBound).toBe(true);
    expect(trigger).not.toBeNull();
    expect(trigger!.triggerPrice).toBeLessThan(r.rangeHigh!);
    expect(r.breaksAway).toBe(false);
  });

  it("allows an entry that crosses the top of the range", () => {
    const bars = daily(sideways(6));
    const r = readBreakaway(bars, {
      kind: "crossing",
      direction: "bullish",
      triggerPrice: 200,
      stopPrice: 90,
      pivot: { index: 0, price: 199, kind: "top" },
      level: 199,
      reactionEntry: 199.3,
      reactionStop: 198,
      protectivePivot: { index: 1, price: 91, kind: "bottom" },
      held: false,
      crossedAt: null,
      swingDays: 3,
      source: "swing" as const,
      formedAt: "2026-01-01T00:00:00Z",
    });
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(true);
  });

  it("does not apply in a confirmed trend", () => {
    const bars = daily(steppingAdvance(8));
    const r = readBreakaway(bars, computeGannEntryTrigger(bars, "bullish"));
    expect(r.rangeBound).toBe(false);
    expect(r.breaksAway).toBe(true);
  });
});

describe("applyBreakawayHold", () => {
  const execute = { outputState: "Execute", breakdown: [] } as unknown as ScanDecision;

  it("holds a range-bound Execute that does not break away", () => {
    const held = applyBreakawayHold(execute, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: false });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("breakaway");
  });

  it("leaves a breakaway, a trend, or a non-Execute verdict alone", () => {
    expect(applyBreakawayHold(execute, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: true })).toBe(execute);
    expect(applyBreakawayHold(execute, { rangeBound: false, rangeHigh: null, rangeLow: null, breaksAway: true })).toBe(execute);
    const watch = { ...execute, outputState: "Watch" } as ScanDecision;
    expect(applyBreakawayHold(watch, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: false })).toBe(watch);
  });
});

describe("readBreakaway on a held crossed level", () => {
  it("measures the range before the crossing, not the top made after it", () => {
    // Cross the 105.5 range high by 3 points, run to 113, react: the level is
    // held and the breakaway is the crossing of the range high itself.
    const bars = daily([...sideways(6), 100, 104, 108, 112, 113, 112, 111, 110]);
    const t = computeGannEntryTrigger(bars, "bullish")!;
    expect(t.held).toBe(true);
    expect(t.level).toBe(105.5);
    const r = readBreakaway(bars, t);
    expect(r.rangeBound).toBe(true);
    expect(r.rangeHigh).toBe(105.5);
    expect(r.breaksAway).toBe(true);
    // Read over every top, the move after the crossing would set the range.
    expect(readBreakaway(bars, { ...t, held: false, crossedAt: null }).rangeHigh).toBeGreaterThan(110);
  });

  it("is the mirror for a short: the range ends where the bottom was broken", () => {
    const flip = (xs: number[]) => xs.map((x) => 200 - x);
    const bars = daily(flip([...sideways(6), 100, 104, 108, 112, 113, 112, 111, 110]));
    const t = computeGannEntryTrigger(bars, "bearish")!;
    expect(t.held).toBe(true);
    const r = readBreakaway(bars, t);
    expect(r.rangeBound).toBe(true);
    expect(r.rangeLow).toBeCloseTo(t.level, 8);
    expect(r.breaksAway).toBe(true);
  });
});


// W006 p.20: avoid stocks in long, narrow ranges until they break out on volume.
describe("the breakaway's volume (A-VOLUME-10)", () => {
  const withVolume = (bars: Bar[], last: number) => bars.map((b, i) => (i === bars.length - 1 ? { ...b, v: last } : { ...b, v: i % 2 ? 1500 : 500 }));
  const after = (bars: Bar[]) => new Date(Date.parse(bars[bars.length - 1].t) + 2 * 86_400_000);

  it("measures the session that leaves a range against the range's average volume", () => {
    const up = withVolume(daily([...sideways(6), 112]), 3000);
    expect(readBreakawayVolume(up, after(up))).toEqual({ direction: "bullish", ratio: 3 });
    const down = withVolume(daily([...sideways(6), 88]), 600);
    expect(readBreakawayVolume(down, after(down))).toEqual({ direction: "bearish", ratio: 0.6 });
  });

  it("reads nothing while the close stays inside the range, or outside a range", () => {
    const inside = withVolume(daily([...sideways(6), 104]), 3000);
    expect(readBreakawayVolume(inside, after(inside))).toBeNull();
    // Beyond the top (~105.5) and the bottom (~94.5), but short of the 3-point allowance.
    const short = withVolume(daily([...sideways(6), 107.5]), 3000);
    expect(readBreakawayVolume(short, after(short))).toBeNull();
    const shortDown = withVolume(daily([...sideways(6), 92.5]), 3000);
    expect(readBreakawayVolume(shortDown, after(shortDown))).toBeNull();
    const trend = withVolume(daily([...steppingAdvance(10), 200]), 3000);
    expect(readBreakawayVolume(trend, after(trend))).toBeNull();
  });

  it("puts the breakaway's volume on the setup and measures it with and against the trade", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const up = withVolume(daily([...sideways(6), 112]), 3000);
    const ctx = readDisclosedRules(up, 112, null, after(up));
    expect(describeDisclosedRules(ctx)).toContain("The last session crossed the top of a narrow range on 3.0× the range's average volume. Shown for context; it does not change the setup.");
    expect(contextFactorsFor(ctx, "bullish", 112)).toMatchObject({ breakawayOnVolumeWith: true, breakawayWithoutVolumeWith: false, breakawayOnVolumeAgainst: false });
    expect(contextFactorsFor(ctx, "bearish", 112)).toMatchObject({ breakawayOnVolumeWith: false, breakawayWithoutVolumeWith: false, breakawayOnVolumeAgainst: true });
    const quiet = withVolume(daily([...sideways(6), 88]), 600);
    const q = readDisclosedRules(quiet, 88, null, after(quiet));
    expect(describeDisclosedRules(q)).toContain("The last session broke the bottom of a narrow range on 0.6× the range's average volume: a breakout without volume. Shown for context; it does not change the setup.");
    expect(contextFactorsFor(q, "bearish", 88)).toMatchObject({ breakawayOnVolumeWith: false, breakawayWithoutVolumeWith: true });
  });

  it("never reads the session still trading", () => {
    const up = withVolume(daily([...sideways(6), 112]), 3000);
    const sameSession = new Date(Date.parse(up[up.length - 1].t) + 3_600_000);
    expect(readBreakawayVolume(up, sameSession)).toBeNull();
  });

  it("averages only the range's 91 days, not the heavier sessions before them", () => {
    const bars = daily([...sideways(12), 112]).map((b, i, all) => ({ ...b, v: i === all.length - 1 ? 3000 : i < all.length - 95 ? 9000 : i % 2 ? 1500 : 500 }));
    expect(readBreakawayVolume(bars, after(bars))?.ratio).toBeCloseTo(3, 1);
  });

  it("reads the same on a year of history or six", () => {
    const tail = [...sideways(6), 112];
    const long = withVolume(daily([...Array.from({ length: 1900 }, (_, i) => 40 + 15 * Math.sin(i / 23)), ...tail]), 3000);
    const short = long.slice(-252);
    expect(readBreakawayVolume(short, after(long))).toEqual(readBreakawayVolume(long, after(long)));
    expect(readBreakawayVolume(long, after(long))?.direction).toBe("bullish");
  });
});
