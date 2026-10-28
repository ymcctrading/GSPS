import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { BOILING_POINT_TRAIL_POINTS, GANN_EXIT_RULE_NAMES, readGannExit, type GannExitPosition, type GannExitRuleName } from "../exitRules";
import { computeRunBoilingPoint } from "../boilingPoint";
import { exhaustGapAt, readGaps } from "../extremeRules";
import { gannPoint, gannThreePoints } from "../pointScale";
import { reversesOn } from "../reverse";
import { rebuysOn, TRAILING_STOPS } from "../rebuy";

/**
 * The F1 extreme rules and the boiling point acting on the exit (M-E11, M-E12,
 * M-T10; 2026-10-22). One bar per calendar day; each bar spans close ± 0.5.
 */
const DAY = 86_400_000;
function bar(i: number, o: number, h: number, l: number, c: number, start = Date.UTC(2026, 0, 1)): Bar {
  return { t: new Date(start + i * DAY).toISOString(), o, h, l, c, v: 1000 };
}
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
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
function long(bars: Bar[], entryIndex: number, over: Partial<GannExitPosition> = {}): GannExitPosition {
  return {
    side: "long",
    entry: bars[entryIndex].c,
    initialStop: bars[entryIndex].c - 20,
    entryDate: bars[entryIndex].t.slice(0, 10),
    crossedLevel: null,
    ...over,
  };
}
/** Every trail and signal off but the ones named, to read one rule alone. */
const only = (...keep: GannExitRuleName[]) => new Set(GANN_EXIT_RULE_NAMES.filter((n) => !keep.includes(n)));

/** Appends a top reverse signal day: opens over the prior high, makes a new high, closes in the bottom quarter. */
function withTopReverseDay(bars: Bar[]): Bar[] {
  const prev = bars[bars.length - 1];
  const o = prev.h + 0.5;
  return [...bars, bar(bars.length, o, o + 2, o - 2, o - 1.8)];
}

describe("M-E11: a reverse signal day against the trade puts the stop 3 points beyond it", () => {
  it("moves a long's stop 3 points under a top reverse day printed after the fill", () => {
    const base = daily(steppingAdvance(3));
    const bars = withTopReverseDay(base);
    const signal = bars[bars.length - 1];
    const r = readGannExit(long(bars, base.length - 4), bars, signal.h, null, only("reverse_signal"));
    expect(r.stopReason).toBe("reverse_signal");
    expect(r.stop).toBeCloseTo(signal.l - gannThreePoints(signal.l), 9);
  });

  it("ignores a reverse day printed before the fill", () => {
    const bars = [...withTopReverseDay(daily(steppingAdvance(3)))];
    const after = daily([...steppingAdvance(3), 0, 0]).slice(-2).map((b, k) => bar(bars.length + k, 110, 110.5, 109.5, 110));
    const all = [...bars, ...after];
    const r = readGannExit(long(all, all.length - 1), all, 110.5, null, only("reverse_signal"));
    expect(r.stopReason).toBe("initial");
  });

  it("mirrors for a short at a bottom reverse day", () => {
    const base = daily(steppingAdvance(3).map((c) => 200 - c));
    const prev = base[base.length - 1];
    const o = prev.l - 0.5;
    const bars = [...base, bar(base.length, o, o + 2, o - 2, o + 1.8)];
    const signal = bars[bars.length - 1];
    const pos: GannExitPosition = { ...long(bars, base.length - 4), side: "short", initialStop: bars[base.length - 4].c + 20 };
    const r = readGannExit(pos, bars, signal.l, null, only("reverse_signal"));
    expect(r.stopReason).toBe("reverse_signal");
    expect(r.stop).toBeCloseTo(signal.h + gannThreePoints(signal.h), 9);
  });

  it("is a stop that reverses and re-buys, as every trailing stop is", () => {
    expect(reversesOn("reverse_signal")).toBe(true);
    expect(rebuysOn("reverse_signal")).toBe(true);
  });
});

describe("M-E12: an exhaust gap against the trade takes it off", () => {
  /** An advance, then a one-day gap to a new high whose bar is itself a reverse signal day. */
  function exhaust(): Bar[] {
    const base = daily(steppingAdvance(3));
    const prev = base[base.length - 1];
    const o = prev.h + 2;
    return [...base, bar(base.length, o, o + 2, prev.h + 0.5, prev.h + 0.8)];
  }

  it("is the card's exhaust gap, read by one shared rule", () => {
    const bars = exhaust();
    expect(exhaustGapAt(bars, bars.length - 1)).toBe("top");
    expect(readGaps(bars).exhaustGap).toBe("top");
  });

  it("exits a long when the gap prints after the fill, without reversing", () => {
    const bars = exhaust();
    const r = readGannExit(long(bars, bars.length - 8), bars, bars[bars.length - 1].h);
    expect(r.exit?.reason).toBe("exhaust_gap");
    expect(r.reverse).toBeNull();
    expect(reversesOn("exhaust_gap")).toBe(false);
  });

  it("does not count a gap printed on the fill day: it was part of the setup", () => {
    const bars = exhaust();
    const r = readGannExit(long(bars, bars.length - 1), bars, bars[bars.length - 1].h);
    expect(r.exit?.reason).not.toBe("exhaust_gap");
  });

  it("does not fire on a short (the gap runs its way), nor when switched off", () => {
    const bars = exhaust();
    const short: GannExitPosition = { ...long(bars, bars.length - 8), side: "short", initialStop: 999 };
    expect(readGannExit(short, bars, bars[bars.length - 8].l).exit?.reason).not.toBe("exhaust_gap");
    expect(readGannExit(long(bars, bars.length - 8), bars, 130, null, new Set(["exhaust_gap"])).exit?.reason).not.toBe("exhaust_gap");
  });
});

describe("M-T10: the boiling point trails his 10 points from the best once the run has lasted 6 weeks", () => {
  /** A decline into a low, then a steady advance whose reactions never turn the weekly chart. */
  function run(advanceCycles: number): Bar[] {
    const decline = Array.from({ length: 30 }, (_, i) => 130 - i);
    return daily([...decline, ...steppingAdvance(advanceCycles, 101)]);
  }

  it("adopts best less his 10 points once the weekly run is 6 weeks old", () => {
    const bars = run(6); // 54 sessions of advance: about 7½ weeks
    const reading = computeRunBoilingPoint(bars)!;
    expect(reading.run).toBe("up");
    expect(reading.weeksSinceStart).toBeGreaterThanOrEqual(6);
    const best = Math.max(...bars.map((b) => b.h));
    const r = readGannExit(long(bars, bars.length - 10), bars, best, null, only("boiling_point"));
    expect(r.stopReason).toBe("boiling_point");
    expect(r.stop).toBeCloseTo(best - BOILING_POINT_TRAIL_POINTS * gannPoint(best), 9);
  });

  it("is his raw 10 points at the price he worked it, Advance Rumely's 105 (out at 95)", () => {
    expect(BOILING_POINT_TRAIL_POINTS * gannPoint(105)).toBeCloseTo(10, 9);
  });

  it("does nothing before 6 weeks", () => {
    const bars = run(3); // 27 sessions: under 4 weeks
    expect(computeRunBoilingPoint(bars)!.weeksSinceStart).toBeLessThan(6);
    const best = Math.max(...bars.map((b) => b.h));
    expect(readGannExit(long(bars, bars.length - 5), bars, best, null, only("boiling_point")).stopReason).toBe("initial");
  });

  it("starts exactly when the run has lasted 6 weeks", () => {
    const full = run(6);
    let seenOn = false;
    let seenOff = false;
    for (let n = full.length - 20; n <= full.length; n++) {
      const bars = full.slice(0, n);
      const reading = computeRunBoilingPoint(bars)!;
      const on = reading.run === "up" && reading.weeksSinceStart >= 6;
      const best = Math.max(...bars.slice(n - 5).map((b) => b.h));
      const r = readGannExit(long(bars, n - 5), bars, bars[n - 1].c, null, only("boiling_point"));
      expect(r.stopReason === "boiling_point").toBe(on && best - BOILING_POINT_TRAIL_POINTS * gannPoint(best) > bars[n - 5].c - 20);
      if (on) seenOn = true;
      else seenOff = true;
    }
    expect(seenOn && seenOff).toBe(true);
  });

  it("does not trail a short riding against the run", () => {
    const bars = run(6);
    const pos: GannExitPosition = { ...long(bars, bars.length - 10), side: "short", initialStop: 999 };
    expect(readGannExit(pos, bars, bars[bars.length - 10].l, null, only("boiling_point")).stopReason).toBe("initial");
  });
});

describe("the new rules are listed wherever the stop and exit names are", () => {
  it("re-buys on every trailing stop the exit rules name", () => {
    for (const n of GANN_EXIT_RULE_NAMES) {
      const isStop = ["break_even", "last_reaction", "prior_week", "prior_month", "final_stage", "day_low", "reverse_signal", "boiling_point"].includes(n);
      expect(TRAILING_STOPS.has(n)).toBe(isStop);
      if (isStop) expect(reversesOn(n)).toBe(true);
    }
  });
});
