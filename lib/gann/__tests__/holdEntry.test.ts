/**
 * A bottom that holds is a buy (PLAN.md item 5, step 4). Gann: "Single bottom:
 * after a reaction, wait until the stock holds a level 2-3 weeks, then buy
 * with a stop 3 points under the lowest week; in active markets use 2-3 days
 * and the lowest day" (W006 pp.20, 46-47, A-ENTRY-01). "In bull markets
 * reactions last 2-3 weeks; buy after a 2-3-week reaction once it holds 2-3
 * days" (pp.46-47, A-ENTRY-08). "A stock that holds its all-time low for weeks
 * or months without a 3-point break is a buy with a stop 3 points under"
 * (p.24, A-ENTRY-10). Shorts sell against a single top that holds, stop 3
 * points above (pp.22, 47, A-ENTRY-14).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { HOLD_WEEKS_MIN_DAYS, computeGannHoldEntry, selectGannEntry, type OlderGannLevel } from "@/lib/gann/entryTrigger";
import { beyondByThreePoints, gannThreePoints } from "@/lib/gann/pointScale";
import { readCounterMove } from "@/lib/gann/disclosedRules";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], start = "2026-03-02", half = 0.3): Bar[] {
  const t0 = Date.parse(`${start}T04:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
const flat = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? hi : lo));

// A decline into the reaction, so the weekly chart is not in an uptrend and
// only the weeks form can apply; then a top at 110, a reaction to 100, and
// sideways closes over the low.
const DOWN = leg(140, 90, 25);
const REACTION = [...leg(90, 110, 10), ...leg(110, 100, 5)];
const holding = (days: number) => daily([...DOWN, ...REACTION, ...flat(100.6, 101.4, days)]);

describe("the weeks form (A-ENTRY-01)", () => {
  it("buys at the last close once the reaction's low has stood into its second week, stop 3 points under it", () => {
    const bars = holding(9);
    const t = computeGannHoldEntry(bars, "bullish")!;
    const low = 100 - 0.3;
    expect(t).toMatchObject({ kind: "hold", holdBasis: "weeks", direction: "bullish", source: "swing" });
    expect(t.level).toBeCloseTo(low, 8);
    expect(t.reactionEntry).toBeCloseTo(bars[bars.length - 1].c, 8);
    expect(t.triggerPrice).toBeCloseTo(t.reactionEntry, 8);
    expect(t.reactionStop).toBeCloseTo(beyondByThreePoints(low, -1), 8);
    expect(t.stopPrice).toBeCloseTo(t.reactionStop, 8);
    // The top the reaction came from.
    expect(t.protectivePivot.price).toBeCloseTo(110.3, 8);
    expect(t.formedAt).toBe(bars[DOWN.length + REACTION.length - 1].t);
  });

  it("waits until the low has stood the days it needs, counted on the calendar", () => {
    expect(HOLD_WEEKS_MIN_DAYS).toBe(8);
    expect(readCounterMove(holding(7))?.trend).not.toBe("bullish");
    expect(computeGannHoldEntry(holding(7), "bullish")).toBeNull();
    expect(computeGannHoldEntry(holding(8), "bullish")?.holdBasis).toBe("weeks");
  });

  it("counts the hold again from a lower low", () => {
    // Nine days over 100, then a low under it, then two days back over it.
    const bars = daily([...DOWN, ...REACTION, ...flat(100.6, 101.4, 9), 99, 100.6, 101]);
    expect(computeGannHoldEntry(bars, "bullish")).toBeNull();
    const later = daily([...DOWN, ...REACTION, ...flat(100.6, 101.4, 9), 99, ...flat(100.6, 101.4, 8)]);
    expect(computeGannHoldEntry(later, "bullish")?.level).toBeCloseTo(98.7, 8);
  });

  it("is not a buy once price has moved off the bottom by more than the 5-point risk allows", () => {
    // The low still stands, but the last close is far over it.
    const bars = daily([...DOWN, ...REACTION, ...flat(100.6, 101.4, 8), 103, 104, 105]);
    const low = 99.7;
    const risk = 105 - beyondByThreePoints(low, -1);
    expect(risk).toBeGreaterThan((5 / 3) * gannThreePoints(105));
    expect(computeGannHoldEntry(bars, "bullish")).toBeNull();
    // Within it, the same low is a buy.
    const near = daily([...DOWN, ...REACTION, ...flat(100.6, 101.4, 8), 102.5]);
    expect(102.5 - beyondByThreePoints(low, -1)).toBeLessThanOrEqual((5 / 3) * gannThreePoints(102.5));
    expect(computeGannHoldEntry(near, "bullish")?.reactionEntry).toBeCloseTo(102.5, 8);
  });

  it("needs a reaction first: a decline of at least 3 points from a top", () => {
    // Sideways from the start: no top stands 3 points over the low.
    const bars = daily([...flat(99, 101, 30)]);
    expect(computeGannHoldEntry(bars, "bullish")).toBeNull();
  });

  it("reads the reaction from a top 3 points over the low, past the small tops of the hold", () => {
    // Small tops inside the hold, under 3 points over the low, are not the reaction.
    const bars = daily([...DOWN, ...REACTION, 100.6, 101.2, 101.8, 102.2, 101.4, 100.8, 100.6, 101, 101.4, 100.8]);
    const t = computeGannHoldEntry(bars, "bullish")!;
    expect(t.protectivePivot.price).toBeCloseTo(110.3, 8);
    expect(t.level).toBeCloseTo(99.7, 8);
  });

  it("is the mirror for a short: a single top that holds, stop 3 points over it", () => {
    const UP = leg(60, 110, 25);
    const RALLY = [...leg(110, 90, 10), ...leg(90, 100, 5)];
    const bars = daily([...UP, ...RALLY, ...flat(98.6, 99.4, 9)]);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t).toMatchObject({ kind: "hold", holdBasis: "weeks", direction: "bearish" });
    expect(t.level).toBeCloseTo(100.3, 8);
    expect(t.reactionEntry).toBeCloseTo(bars[bars.length - 1].c, 8);
    expect(t.reactionStop).toBeCloseTo(beyondByThreePoints(100.3, 1), 8);
    expect(t.protectivePivot.price).toBeCloseTo(89.7, 8);
  });
});

describe("the days form (A-ENTRY-01 in active markets, A-ENTRY-08)", () => {
  // A bull market: rising tops and bottoms, then a reaction of two weeks.
  const BULL = [...leg(60, 80, 8), ...leg(80, 72, 4), ...leg(72, 92, 8), ...leg(92, 84, 4), ...leg(84, 110, 10)];
  const REACT = leg(110, 100, 10);

  it("buys once the low of a two-to-three-week reaction in a bull market has held two days", () => {
    const bars = daily([...BULL, ...REACT, 100.8, 101.2]);
    const cm = readCounterMove(bars)!;
    expect(cm.trend).toBe("bullish");
    expect(cm.inCounterMove).toBe(true);
    expect(cm.days).toBeGreaterThanOrEqual(8);
    expect(cm.days).toBeLessThanOrEqual(21);
    const t = computeGannHoldEntry(bars, "bullish")!;
    expect(t).toMatchObject({ kind: "hold", holdBasis: "days" });
    expect(t.level).toBeCloseTo(99.7, 8);
    expect(t.reactionStop).toBeCloseTo(beyondByThreePoints(99.7, -1), 8);
    expect(t.reactionEntry).toBeCloseTo(101.2, 8);
  });

  it("waits for the second day", () => {
    expect(computeGannHoldEntry(daily([...BULL, ...REACT, 100.8]), "bullish")).toBeNull();
  });

  it("needs the reaction to have run two weeks", () => {
    // Five days of reaction, held two days: too short for the days form, and
    // the low has not stood the weeks form's days.
    const bars = daily([...BULL, ...leg(110, 100, 5), 100.8, 101.2]);
    expect(readCounterMove(bars)!.days).toBeLessThan(8);
    expect(computeGannHoldEntry(bars, "bullish")).toBeNull();
  });

  it("is not taken outside a bull market", () => {
    // The same reaction and two-day hold after a decline.
    const bars = daily([...DOWN, ...leg(90, 110, 6), ...REACT, 100.8, 101.2]);
    expect(readCounterMove(bars)?.trend).not.toBe("bullish");
    expect(computeGannHoldEntry(bars, "bullish")).toBeNull();
  });

  it("has no short mirror: a bear-market rally is sold on its own rule", () => {
    const BEAR = [...leg(140, 120, 8), ...leg(120, 128, 4), ...leg(128, 108, 8), ...leg(108, 116, 4), ...leg(116, 90, 10)];
    const bars = daily([...BEAR, ...leg(90, 100, 10), 99.2, 98.8]);
    expect(readCounterMove(bars)!.trend).toBe("bearish");
    expect(computeGannHoldEntry(bars, "bearish")).toBeNull();
  });
});

describe("the record form (A-ENTRY-10)", () => {
  const record = (price: number): OlderGannLevel => ({ price, kind: "bottom", source: "allTime", formedAt: "2019-03-01T05:00:00Z", crossFrom: "2026-03-02" });
  // Down to the record low of 50, a dip 1 point under it, then weeks near it.
  const NEAR = [...leg(70, 50.5, 12), 49.5, 49, 49.6, ...flat(50.2, 50.8, 10)];

  it("buys a record low that has held for weeks without a 3-point break, stop 3 points under the record", () => {
    const bars = daily(NEAR);
    expect(49 - 0.3).toBeGreaterThan(beyondByThreePoints(50, -1));
    const t = computeGannHoldEntry(bars, "bullish", [record(50)])!;
    expect(t).toMatchObject({ kind: "hold", holdBasis: "record", source: "allTime", formedAt: "2019-03-01T05:00:00Z" });
    expect(t.level).toBe(50);
    expect(t.reactionStop).toBeCloseTo(beyondByThreePoints(50, -1), 8);
    expect(t.reactionEntry).toBeCloseTo(bars[bars.length - 1].c, 8);
  });

  it("is off once the record has been broken by 3 points", () => {
    const bars = daily([...leg(70, 50.5, 12), 47, 46, 46.4, ...flat(47.2, 47.8, 10)]);
    expect(46 - 0.3).toBeLessThan(beyondByThreePoints(50, -1));
    expect(computeGannHoldEntry(bars, "bullish", [record(50)])?.holdBasis).not.toBe("record");
  });

  it("waits the same days as the weeks form from the first day near the record", () => {
    const bars = daily([...leg(70, 50.5, 12), 49.5, 49, 49.6, 50.2, 50.8]);
    expect(computeGannHoldEntry(bars, "bullish", [record(50)])?.holdBasis).not.toBe("record");
  });

  it("is a buy only: a record high that holds is not sold on this rule", () => {
    const top: OlderGannLevel = { price: 100, kind: "top", source: "allTime", formedAt: "2019-03-01T05:00:00Z", crossFrom: "2026-03-02" };
    const bars = daily([...leg(80, 99.5, 12), 100.5, 101, 100.4, ...flat(99.2, 99.8, 10)]);
    expect(computeGannHoldEntry(bars, "bearish", [top])?.holdBasis).not.toBe("record");
  });
});

describe("selecting the buying point", () => {
  it("offers the hold buy at the close, nearer than any order resting under it", () => {
    const bars = holding(9);
    const t = selectGannEntry(bars, "bullish")!;
    expect(t.kind).toBe("hold");
    expect(t.reactionEntry).toBeCloseTo(bars[bars.length - 1].c, 8);
  });

  it("prefers the record to the reaction's own low on the same close", () => {
    // A top at 72 first, so the dip under the record is also a reaction low
    // that has held: both forms buy at the close, and the older level wins.
    const bars = daily([...leg(60, 72, 6), ...leg(72, 50.5, 12), 49.5, 49, 49.6, ...flat(50.2, 50.8, 10)]);
    expect(computeGannHoldEntry(bars, "bullish")).toMatchObject({ holdBasis: "weeks", level: 48.7 });
    const older: OlderGannLevel[] = [{ price: 50, kind: "bottom", source: "allTime", formedAt: "2019-03-01T05:00:00Z", crossFrom: "2026-03-02" }];
    expect(selectGannEntry(bars, "bullish", older)?.holdBasis).toBe("record");
  });
});
