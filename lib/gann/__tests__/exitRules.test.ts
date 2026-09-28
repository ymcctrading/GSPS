import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readGannExit, type GannExitPosition } from "../exitRules";

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
  it("fails the hold test when a close falls back under the crossed top", () => {
    const bars = daily([...steppingAdvance(3), 125, 126, 124]);
    const pos = position(bars, bars.length - 3, { crossedLevel: 125 });
    expect(readGannExit(pos, bars, 126.5).exit?.reason).toBe("hold_test_failed");
  });

  it("exits after three successive closes against the trade", () => {
    const bars = daily([...steppingAdvance(3), 125, 124.8, 124.7, 124.6]);
    const pos = position(bars, bars.length - 4);
    expect(readGannExit(pos, bars, 125.5).exit?.reason).toBe("three_adverse_closes");
  });

  it("does not exit on two adverse closes", () => {
    const bars = daily([...steppingAdvance(3), 125, 124.8, 124.7]);
    const pos = position(bars, bars.length - 3);
    expect(readGannExit(pos, bars, 125.5).exit).toBeNull();
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
    const bars = daily([...steppingAdvance(3).map((c) => 250 - c), 125, 125.2, 125.3, 125.4]);
    const pos = position(bars, bars.length - 4, { side: "short", initialStop: 130 });
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
