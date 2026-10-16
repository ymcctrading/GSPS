import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readGannExit, type GannExitPosition } from "../exitRules";
import { gannThreePoints } from "../pointScale";

/** One bar per calendar day from 2026-01-01; each bar spans close ± 0.5. */
function daily(closes: number[], start = Date.UTC(2026, 0, 1)): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(start + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

/** A stepping advance: 6 bars up 1.0, 3 bars down 0.5, repeated. */
function steppingAdvance(cycles: number, from = 100): number[] {
  const out: number[] = [];
  let p = from;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

function position(bars: Bar[], entryIndex: number, over: Partial<GannExitPosition> = {}): GannExitPosition {
  return {
    side: "long",
    entry: bars[entryIndex].c,
    initialStop: bars[entryIndex].c - 5,
    entryDate: bars[entryIndex].t.slice(0, 10),
    crossedLevel: null,
    ...over,
  };
}

describe("readGannExit", () => {
  it("fails the hold test when a close falls back under the crossed top by 3 points, price-scaled", () => {
    // At $125, the 3 points scale to about 4.6% of price (lib/gann/pointScale.ts).
    const bars = daily([...steppingAdvance(3), 125, 126, 118]);
    const pos = position(bars, bars.length - 3, { crossedLevel: 125 });
    expect(readGannExit(pos, bars, 126.5).exit?.reason).toBe("hold_test_failed");
  });

  it("holds through a small reaction back under the crossed top", () => {
    const bars = daily([...steppingAdvance(3), 125, 126, 124]);
    const pos = position(bars, bars.length - 3, { crossedLevel: 125 });
    expect(readGannExit(pos, bars, 126.5).exit?.reason).not.toBe("hold_test_failed");
  });

  it("exits when each of the first three sessions from entry closes against the trade", () => {
    const bars = daily([...steppingAdvance(3), 125, 124.8, 124.7]);
    const pos = position(bars, bars.length - 3, { entry: 125.2 });
    expect(readGannExit(pos, bars, 125.5).exit?.reason).toBe("three_adverse_closes");
  });

  it("does not exit on two adverse closes", () => {
    const bars = daily([...steppingAdvance(3), 125, 124.8]);
    const pos = position(bars, bars.length - 2, { entry: 125.2 });
    expect(readGannExit(pos, bars, 125.5).exit).toBeNull();
  });

  it("does not apply to three adverse closes later in the trade", () => {
    // Days one to three close above the entry; a later three-day dip under it
    // is a reaction inside the trade, not Gann's first-days test.
    const bars = daily([...steppingAdvance(3), 125.5, 125.6, 125.7, 124.9, 124.8, 124.7]);
    const pos = position(bars, bars.length - 6, { entry: 125.2 });
    expect(readGannExit(pos, bars, 126).exit?.reason).not.toBe("three_adverse_closes");
  });

  it("moves the stop to break-even once the trade has gone one risk unit its way", () => {
    // Too short a history for a campaign or a swing, so only break-even can move the stop.
    const bars = daily([121, 122, 123, 124, 125, 126]);
    const pos = position(bars, bars.length - 2, { initialStop: 123 });
    const before = readGannExit(pos, bars, 126.5);
    expect(before.stop).toBe(123);
    const after = readGannExit(pos, bars, 127.1);
    expect(after.stop).toBe(125);
    expect(after.stopReason).toBe("break_even");
  });

  it("trails under a higher bottom made after entry", () => {
    const closes = steppingAdvance(6);
    const bars = daily(closes);
    const entryIndex = 20;
    const pos = position(bars, entryIndex, { initialStop: closes[entryIndex] - 10 });
    const r = readGannExit(pos, bars, Math.max(...closes) + 0.5);
    expect(r.stop).toBeGreaterThan(pos.entry);
    expect(["last_reaction", "prior_month", "final_stage"]).toContain(r.stopReason);
  });

  it("mirrors every rule for a short", () => {
    const bars = daily([...steppingAdvance(3).map((c) => 250 - c), 125, 125.2, 125.3]);
    const pos = position(bars, bars.length - 3, { side: "short", entry: 124.9, initialStop: 130 });
    expect(readGannExit(pos, bars, 124.5).exit?.reason).toBe("three_adverse_closes");
  });

  it("returns the initial stop before the entry session has closed", () => {
    const bars = daily(steppingAdvance(3));
    const pos = { ...position(bars, bars.length - 1), entryDate: "2027-01-01" };
    expect(readGannExit(pos, bars, null)).toEqual({ stop: pos.initialStop, stopReason: "initial", exit: null });
  });
});

describe("readGannExit: the distribution week (parity D2)", () => {
  // A long advance, a fill, then a final week at the high on heavy volume.
  function advanceWithHeavyWeek(heavyDaily: number): { bars: Bar[]; entryIndex: number } {
    const closes = steppingAdvance(8);
    const bars = daily(closes);
    const entryIndex = bars.length - 10;
    for (let i = bars.length - 5; i < bars.length; i++) bars[i] = { ...bars[i], v: heavyDaily };
    return { bars, entryIndex };
  }

  it("exits a long when two-thirds of the stock trades in a week at a top after the fill", () => {
    const { bars, entryIndex } = advanceWithHeavyWeek(20_000);
    const reading = readGannExit(position(bars, entryIndex), bars, null, 100_000);
    expect(reading.exit?.reason).toBe("distribution");
  });

  it("is silent without a share count, and on ordinary volume", () => {
    const { bars, entryIndex } = advanceWithHeavyWeek(20_000);
    expect(readGannExit(position(bars, entryIndex), bars, null).exit?.reason).not.toBe("distribution");
    const quiet = advanceWithHeavyWeek(1000);
    expect(readGannExit(position(quiet.bars, quiet.entryIndex), quiet.bars, null, 100_000).exit?.reason).not.toBe(
      "distribution",
    );
  });

  it("does not apply to shorts", () => {
    const { bars, entryIndex } = advanceWithHeavyWeek(20_000);
    const short = position(bars, entryIndex, { side: "short", initialStop: bars[entryIndex].c + 5 });
    expect(readGannExit(short, bars, null, 100_000).exit?.reason).not.toBe("distribution");
  });
});

describe("readGannExit: under each week's bottom (A-STOP-05)", () => {
  // W006 p.46: trail the stop 1, 2, 3 or 5 points under each week's bottom
  // (above each week's top when short). GSPS takes 3 points, the stop Gann
  // calls safest (p.46), price-scaled.
  const weekOf = (t: string) => {
    const d = new Date(t);
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  };
  const priorWeek = (bars: ReturnType<typeof daily>) => {
    const current = weekOf(bars[bars.length - 1].t);
    const before = bars.filter((b) => weekOf(b.t) < current);
    const wk = weekOf(before[before.length - 1].t);
    return before.filter((b) => weekOf(b.t) === wk);
  };

  it("moves a long's stop 3 points under the last completed week's bottom", () => {
    // A straight advance in January: no reaction, no new month.
    const bars = daily(Array.from({ length: 30 }, (_, i) => 101 + i));
    const pos = position(bars, 5, { initialStop: bars[5].c - 20 });
    const low = Math.min(...priorWeek(bars).map((b) => b.l));
    const r = readGannExit(pos, bars, bars[bars.length - 1].h);
    expect(r.stop).toBeCloseTo(low - gannThreePoints(low), 8);
    expect(r.stopReason).toBe("prior_week");
  });

  it("moves a short's stop 3 points over the last completed week's top", () => {
    const bars = daily(Array.from({ length: 30 }, (_, i) => 200 - i));
    const pos = position(bars, 5, { side: "short", initialStop: bars[5].c + 20 });
    const high = Math.max(...priorWeek(bars).map((b) => b.h));
    const r = readGannExit(pos, bars, bars[bars.length - 1].l);
    expect(r.stop).toBeCloseTo(high + gannThreePoints(high), 8);
    expect(r.stopReason).toBe("prior_week");
  });

  it("leaves the stop alone while the trade is still in its entry week", () => {
    const bars = daily(Array.from({ length: 13 }, (_, i) => 101 + i));
    // 2026-01-13 is a Tuesday; entered on the Monday of that week.
    const pos = position(bars, 11, { initialStop: bars[11].c - 20 });
    expect(readGannExit(pos, bars, bars[12].h).stopReason).not.toBe("prior_week");
  });
});

describe("a change of trend from the campaign ledger after entry (item 7 review L1)", () => {
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const CAMPAIGN = [...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 60, 80), ...leg(60, 120, 120)];
  // From the 120 top: down to 108 by day 50, a 4-day bounce (the entry), then new lows to day 70.
  const closes = [...CAMPAIGN, ...leg(120, 108, 50), ...leg(108, 110, 4), ...leg(110, 106, 16)];
  const entryIndex = CAMPAIGN.length + 49;

  it("exits a long when the reaction makes new lows in its third month after the fill", () => {
    const bars = daily(closes);
    const exit = readGannExit(position(bars, entryIndex, { initialStop: 90 }), bars, 110).exit;
    expect(exit?.reason).toBe("trend_change");
    expect(exit?.note).toContain("third month");
  });

  it("does not exit when the reaction made its low in the second month and held", () => {
    const held = daily([...CAMPAIGN, ...leg(120, 108, 50), ...leg(108, 110, 4), ...Array.from({ length: 16 }, () => 109)]);
    expect(readGannExit(position(held, entryIndex, { initialStop: 90 }), held, 110).exit).toBeNull();
  });

  it("does not exit on a call that already stood at entry", () => {
    // The same reaction, entered on day 66, already in its third month and making new lows.
    const bars = daily([...CAMPAIGN, ...leg(120, 106, 65), ...leg(106, 108, 4)]);
    const exit = readGannExit(position(bars, CAMPAIGN.length + 65, { initialStop: 90 }), bars, 108).exit;
    expect(exit?.reason).not.toBe("trend_change");
  });
});
