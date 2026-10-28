import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { MIN_RANGE_SESSIONS, breakawayVolumeMet, isNarrowRange, narrowRangeBeforeLeg, narrowRangeSessions, readBreakaway, readBreakawayVolume } from "../breakaway";
import { threePoints } from "../pointScale";
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

/**
 * A sideways market: swings between 98 and 102 with no net progress, so the
 * bars span 97.5 to 102.5, 5 points: inside Gann's widest narrow range (4 of
 * his points, 4/3 of the 3-point allowance, about 6.5 here).
 */
function sideways(cycles: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < cycles; k++) {
    // Tops alternate slightly so the highest top is an older one.
    const top = k % 2 === 0 ? 102 : 101.5;
    for (let i = 1; i <= 5; i++) out.push(98 + ((top - 98) * i) / 5);
    for (let i = 1; i <= 5; i++) out.push(top - ((top - 98) * i) / 5);
  }
  return out;
}

/** An entry crossing at `triggerPrice`, built by hand: inside a narrow range no swing top's 3-point crossing is. */
function crossingAt(direction: "bullish" | "bearish", triggerPrice: number) {
  const sign = direction === "bullish" ? 1 : -1;
  return {
    kind: "crossing" as const,
    direction,
    triggerPrice,
    stopPrice: triggerPrice - sign * 8,
    pivot: { index: 0, price: triggerPrice - sign, kind: direction === "bullish" ? ("top" as const) : ("bottom" as const) },
    level: triggerPrice - sign,
    reactionEntry: triggerPrice - sign * 0.7,
    reactionStop: triggerPrice - sign * 2,
    protectivePivot: { index: 1, price: triggerPrice - sign * 8, kind: direction === "bullish" ? ("bottom" as const) : ("top" as const) },
    held: false,
    crossedAt: null,
    swingDays: 3,
    source: "swing" as const,
    formedAt: "2026-01-01T00:00:00Z",
  };
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
    const bars = daily(sideways(6));
    const r = readBreakaway(bars, crossingAt("bullish", 101));
    expect(r.rangeBound).toBe(true);
    expect(r.rangeHigh).toBe(102.5);
    expect(r.rangeLow).toBe(97.5);
    expect(r.breaksAway).toBe(false);
  });

  it("reads a range wider than 4 of his points as not narrow (Master Course pp. 246-248)", () => {
    // 95.5 to 103.5, 8 points: wider than his widest narrow range at this price.
    const wider = daily(sideways(6).map((c) => 100 + (c - 100) * 2));
    expect(readBreakaway(wider, crossingAt("bullish", 101)).rangeBound).toBe(false);
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

// Gann's sideways market is a narrow range held for weeks (Commodities pp.
// 51-52; Master Course "2-6 or 10-13 weeks in a narrow range"). A market whose
// trend is merely unconfirmed, swinging widely, is not one (2026-10-21).
describe("readBreakaway reads a narrow range only", () => {
  /** Swings between 70 and 130: no confirmed trend, but far wider than narrow. */
  function wideSwings(cycles: number): number[] {
    const out: number[] = [];
    for (let k = 0; k < cycles; k++) {
      const top = k % 2 === 0 ? 130 : 126;
      for (let i = 1; i <= 5; i++) out.push(70 + ((top - 70) * i) / 5);
      for (let i = 1; i <= 5; i++) out.push(top - ((top - 70) * i) / 5);
    }
    return out;
  }
  const flip = (xs: number[]) => xs.map((x) => 200 - x);
  const execute = { outputState: "Execute", breakdown: [] } as unknown as ScanDecision;

  it("does not hold a long inside a wide, unconfirmed market", () => {
    const bars = daily([...wideSwings(6), 80, 90, 100, 110, 100, 90, 85]);
    const trigger = computeGannEntryTrigger(bars, "bullish");
    expect(trigger).not.toBeNull();
    const r = readBreakaway(bars, trigger);
    expect(r.rangeBound).toBe(false);
    expect(r.breaksAway).toBe(true);
    expect(applyBreakawayHold(execute, r).outputState).toBe("Execute");
  });

  it("is the mirror for a short", () => {
    const bars = daily(flip([...wideSwings(6), 80, 90, 100, 110, 100, 90, 85]));
    const trigger = computeGannEntryTrigger(bars, "bearish");
    expect(trigger).not.toBeNull();
    const r = readBreakaway(bars, trigger);
    expect(r.rangeBound).toBe(false);
    expect(applyBreakawayHold(execute, r).outputState).toBe("Execute");
  });

  it("still holds a short inside a narrow range", () => {
    const bars = daily(flip(sideways(6)));
    const r = readBreakaway(bars, crossingAt("bearish", 99));
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(false);
    expect(applyBreakawayHold(execute, r).outputState).toBe("Watch");
  });

  it("reads the range a market is leaving, but not one it fell back into wide", () => {
    // Left by closes above the top every session since: still that range.
    const leaving = daily([...sideways(6), 103.5, 105, 106.5]);
    expect(narrowRangeBeforeLeg(leaving.slice(-70))).not.toBeNull();
    expect(narrowRangeSessions(leaving.slice(-70))).toBeNull();
    // A retest that closes back inside the range still reads the range it left.
    const retest = daily([...sideways(6), 105, 106.5, 101, 107]);
    expect(narrowRangeBeforeLeg(retest.slice(-70))).not.toBeNull();
    // Closing through the range's other side ends it: no range.
    const through = daily([...sideways(6), 105, 106.5, 96]);
    expect(narrowRangeBeforeLeg(through.slice(-70))).toBeNull();
  });

  it("needs two weeks of sessions before it reads a range", () => {
    expect(readBreakaway(daily([100, 101, 100, 101, 100, 101]), null).rangeBound).toBe(false);
  });
});

describe("readBreakaway on a held crossed level", () => {
  it("measures the range before the crossing, not the top made after it", () => {
    // Cross the 102.5 range high by 3 points, run to 113, react: the level is
    // held and the breakaway is the crossing of the range high itself.
    const bars = daily([...sideways(6), 101, 108.5, 112, 113, 112, 111, 110]);
    const t = computeGannEntryTrigger(bars, "bullish")!;
    expect(t.held).toBe(true);
    expect(t.level).toBe(102.5);
    const r = readBreakaway(bars, t);
    expect(r.rangeBound).toBe(true);
    expect(r.rangeHigh).toBe(102.5);
    expect(r.breaksAway).toBe(true);
    // Read over every session, the move after the crossing is the leg out of
    // the range, closed above it throughout: the range read is still the one
    // it left, not one widened by the breakaway's own move.
    const all = readBreakaway(bars, { ...t, held: false, crossedAt: null });
    expect(all.rangeBound).toBe(true);
    expect(all.rangeHigh).toBe(102.5);
  });

  it("is the mirror for a short: the range ends where the bottom was broken", () => {
    const flip = (xs: number[]) => xs.map((x) => 200 - x);
    const bars = daily(flip([...sideways(6), 101, 108.5, 112, 113, 112, 111, 110]));
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
    // Beyond the top (102.5) and the bottom (97.5), but short of the 3-point allowance.
    const short = withVolume(daily([...sideways(6), 106]), 3000);
    expect(readBreakawayVolume(short, after(short))).toBeNull();
    const shortDown = withVolume(daily([...sideways(6), 94]), 3000);
    expect(readBreakawayVolume(shortDown, after(shortDown))).toBeNull();
    const trend = withVolume(daily([...steppingAdvance(10), 200]), 3000);
    expect(readBreakawayVolume(trend, after(trend))).toBeNull();
  });

  it("puts the breakaway's volume on the setup and measures it with and against the trade", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const up = withVolume(daily([...sideways(6), 112]), 3000);
    const ctx = readDisclosedRules(up, 112, null, after(up));
    expect(describeDisclosedRules(ctx)).toContain("The last session crossed the top of a narrow range on 3.0× the range's average volume.");
    expect(contextFactorsFor(ctx, "bullish", 112)).toMatchObject({ breakawayOnVolumeWith: true, breakawayWithoutVolumeWith: false, breakawayOnVolumeAgainst: false });
    expect(contextFactorsFor(ctx, "bearish", 112)).toMatchObject({ breakawayOnVolumeWith: false, breakawayWithoutVolumeWith: false, breakawayOnVolumeAgainst: true });
    const quiet = withVolume(daily([...sideways(6), 88]), 600);
    const q = readDisclosedRules(quiet, 88, null, after(quiet));
    expect(describeDisclosedRules(q)).toContain("The last session broke the bottom of a narrow range on 0.6× the range's average volume: a breakout without volume, so an entry out of this range waits for a session that closes past the line on volume.");
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
    const long = withVolume(daily([...Array.from({ length: 1900 }, (_, i) => 100 + 3 * Math.sin(i / 23)), ...tail]), 3000);
    const short = long.slice(-252);
    expect(readBreakawayVolume(short, after(long))).toEqual(readBreakawayVolume(long, after(long)));
    expect(readBreakawayVolume(long, after(long))?.direction).toBe("bullish");
  });
});

// W006 p.20 at the entry (fork FV6 b): in a narrow range, wait for a completed
// session to close past the line on volume.
describe("the breakaway waits for a session that closes past the range on volume (A-VOLUME-10)", () => {
  // The range tops at 102.5; the lines below are past its 3-point crossing.
  const range = () => daily(sideways(6)).map((b, i) => ({ ...b, v: i % 2 ? 1500 : 500 }));
  const session = (prev: Bar[], c: number, v: number): Bar[] => [...prev, { ...prev[prev.length - 1], t: new Date(Date.parse(prev[prev.length - 1].t) + 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v }];

  it("is ready once a session closed past the line on more than the range's average volume", () => {
    expect(breakawayVolumeMet(session(range(), 111, 3000), "bullish", 110)).toBe(true);
  });

  it("waits when that session came on less than the range's average", () => {
    expect(breakawayVolumeMet(session(range(), 111, 600), "bullish", 110)).toBe(false);
  });

  it("has no volume condition when the market before the crossing was trending, not ranging", async () => {
    const { isGannRangeBound } = await import("@/lib/gann/trendStrength");
    // Narrow in span but stepping up: rising tops and bottoms, 100 to about 106.
    const closes: number[] = [];
    for (let k = 0; k < 6; k++) {
      const base = 100 + k;
      for (let i = 1; i <= 5; i++) closes.push(base + (1.6 * i) / 5);
      for (let i = 1; i <= 5; i++) closes.push(base + 1.6 - (0.6 * i) / 5);
    }
    const trending = daily(closes).map((b, i) => ({ ...b, v: i % 2 ? 1500 : 500 }));
    expect(isGannRangeBound(trending)).toBe(false);
    expect(breakawayVolumeMet(session(trending, 108, 600), "bullish", 107.5)).toBe(true);
  });

  it("has no volume condition for a range too wide to be narrow (batch review A2)", async () => {
    const { isGannRangeBound } = await import("@/lib/gann/trendStrength");
    // The same swings three times as wide, about 94 to 106.
    const wide = daily(sideways(6).map((c) => 100 + (c - 100) * 3)).map((b, i) => ({ ...b, v: i % 2 ? 1500 : 500 }));
    expect(isGannRangeBound(wide)).toBe(true);
    expect(breakawayVolumeMet(session(wide, 121, 600), "bullish", 120)).toBe(true);
    expect(breakawayVolumeMet(range(), "bullish", 110)).toBe(false);
    // The card and the factor read the same "narrow" (review 20): nothing to report for a wide range.
    const out = session(wide, 125, 3000);
    expect(readBreakawayVolume(out, new Date(Date.parse(out[out.length - 1].t) + 2 * 86_400_000))).toBeNull();
  });

  it("waits while no completed session has closed past the line", () => {
    expect(breakawayVolumeMet(range(), "bullish", 110)).toBe(false);
    expect(breakawayVolumeMet(session(range(), 103, 3000), "bullish", 110)).toBe(false);
  });

  it("judges the breakout session, not the sessions that follow it", () => {
    expect(breakawayVolumeMet(session(session(range(), 111, 3000), 112, 400), "bullish", 110)).toBe(true);
    expect(breakawayVolumeMet(session(session(range(), 111, 400), 112, 3000), "bullish", 110)).toBe(false);
  });

  it("still reads the breakout during the reaction back under the line", () => {
    const reacting = session(session(session(range(), 111, 3000), 109, 800), 108.5, 800);
    expect(breakawayVolumeMet(reacting, "bullish", 110)).toBe(true);
  });

  it("works the same way down", () => {
    expect(breakawayVolumeMet(session(range(), 89, 3000), "bearish", 90)).toBe(true);
    expect(breakawayVolumeMet(session(range(), 89, 600), "bearish", 90)).toBe(false);
  });

  it("asks nothing of a market that is not in a range", () => {
    const trend = daily(steppingAdvance(10));
    expect(breakawayVolumeMet(trend, "bullish", 500)).toBe(true);
    expect(breakawayVolumeMet([], "bullish", 110)).toBe(true);
  });
});

// Master Course pp. 246-248 and Commodities p. 51: "2-6 or 10-13 weeks in a
// narrow range, then crossing the tops or breaking the bottoms of the previous
// weeks". The weeks are counted back from now, so a narrow spell after a wide
// quarter is a range too, and its own extremes are the breakaway (2026-10-21).
describe("readBreakaway reads a 2-6 week narrow range after a wide quarter", () => {
  /** Swings between 70 and 130: no confirmed trend, far wider than narrow. */
  function wideSwings(cycles: number): number[] {
    const out: number[] = [];
    for (let k = 0; k < cycles; k++) {
      const top = k % 2 === 0 ? 130 : 126;
      for (let i = 1; i <= 5; i++) out.push(70 + ((top - 70) * i) / 5);
      for (let i = 1; i <= 5; i++) out.push(top - ((top - 70) * i) / 5);
    }
    return out;
  }
  /** About four weeks swinging 97.6 to 102.4 (bars 97.1 to 102.9), then a leg to 100. */
  const narrowTail = [98, 100, 102, 103, 101, 99, 97, 99, 101, 102, 100, 98, 97, 99, 101, 103, 101, 99, 97, 98, 99, 100, 99, 98, 97].map((x) => 100 + (x - 100) * 0.8);
  const TAIL_HIGH = 102.9;
  const TAIL_LOW = 97.1;
  const bars = () => daily([...wideSwings(6), 100, ...narrowTail]);
  const flip = (xs: number[]) => xs.map((x) => 200 - x);
  const execute = { outputState: "Execute", breakdown: [] } as unknown as ScanDecision;

  it("counts the narrow sessions back from the latest, and only those", () => {
    const window = bars().slice(-80);
    const run = narrowRangeSessions(window)!;
    expect(run).not.toBeNull();
    expect(run.length).toBeGreaterThanOrEqual(narrowTail.length);
    expect(run.length).toBeLessThan(window.length);
    expect(isNarrowRange(run)).toBe(true);
    expect(isNarrowRange(window.slice(-run.length - 1))).toBe(false);
    // Fewer than two weeks of narrow sessions is not a range.
    expect(narrowRangeSessions(window.slice(-(MIN_RANGE_SESSIONS - 1)))).toBeNull();
    // A whole quarter narrow is all of it: the 10-13 week case, as before.
    const quarter = daily(sideways(9));
    expect(narrowRangeSessions(quarter)).toEqual(quarter);
  });

  /** An entry crossing at `price`, read the day it arms (no crossing held yet). */
  const arming = (b: Bar[], direction: "bullish" | "bearish", price: number) => ({
    ...computeGannEntryTrigger(b, direction)!,
    kind: "crossing" as const,
    held: false,
    crossedAt: null,
    triggerPrice: price,
  });

  it("holds a long inside the narrow spell, with the spell's own top as the range high", () => {
    const b = bars();
    const r = readBreakaway(b, arming(b, "bullish", 102));
    expect(r.rangeBound).toBe(true);
    expect(r.rangeHigh).toBeCloseTo(TAIL_HIGH, 9);
    expect(r.rangeLow).toBeCloseTo(TAIL_LOW, 9);
    expect(r.breaksAway).toBe(false);
    expect(applyBreakawayHold(execute, r).outputState).toBe("Watch");
  });

  it("lets the entry that crosses the spell's top by 3 points through, though the quarter's top is higher", () => {
    const b = bars();
    const r = readBreakaway(b, arming(b, "bullish", TAIL_HIGH + threePoints(TAIL_HIGH) + 0.01));
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(true);
    expect(r.rangeHigh!).toBeLessThan(130);
  });

  it("is the mirror for a short", () => {
    const b = daily(flip([...wideSwings(6), 100, ...narrowTail]));
    const r = readBreakaway(b, arming(b, "bearish", 98));
    expect(r.rangeBound).toBe(true);
    expect(r.rangeLow).toBeCloseTo(TAIL_LOW, 9);
    expect(r.rangeHigh).toBeCloseTo(TAIL_HIGH, 9);
    expect(r.breaksAway).toBe(false);
    expect(readBreakaway(b, arming(b, "bearish", TAIL_LOW - threePoints(TAIL_LOW) - 0.01)).breaksAway).toBe(true);
  });

  it("waits for the spell's breakout to come on more than the spell's average volume", () => {
    const vol = bars().map((b, i, all) => ({ ...b, v: i < all.length - narrowTail.length ? 9000 : i % 2 ? 1500 : 500 }));
    const line = TAIL_HIGH + threePoints(TAIL_HIGH);
    const out = (v: number): Bar[] => [...vol, { ...vol[vol.length - 1], t: new Date(Date.parse(vol[vol.length - 1].t) + 86_400_000).toISOString(), o: line + 1, h: line + 1.5, l: line + 0.5, c: line + 1, v }];
    expect(breakawayVolumeMet(out(3000), "bullish", line)).toBe(true);
    expect(breakawayVolumeMet(out(1200), "bullish", line)).toBe(false);
    const leaving = out(3000);
    const read = readBreakawayVolume(leaving, new Date(Date.parse(leaving[leaving.length - 1].t) + 2 * 86_400_000));
    expect(read?.direction).toBe("bullish");
    // Against the spell's average, not the wide quarter's heavier sessions.
    expect(read?.ratio).toBeGreaterThan(2);
  });
});
