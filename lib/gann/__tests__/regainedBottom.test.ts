/**
 * A regained old bottom is a buying point (A-TREND-10, W006 p.30): "after a
 * stock declines to new low levels and then rallies back 3 points above the
 * old bottom, it is an indication that the decline is over" (AT&T: the 1907
 * low of 88 broken, 70 1/4 made, 91 crossed). Built as a crossing of the old
 * bottom from below, by the same 3 points, bought on the reaction 1 point over
 * it with the stop 3 points under (fork F5 a, an inference from the crossing
 * construct). The mirror: an old top crossed, then lost by 3 points, is a sell
 * (A-ENTRY-16's side).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannEntryTrigger, selectGannEntry } from "@/lib/gann/entryTrigger";
import { gannEntrySource } from "@/lib/strat/levels";
import { structuralTriggerHeadline } from "@/lib/scoring/direction-copy";
import { threePoints } from "@/lib/gann/pointScale";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function weekdays(closes: number[], half = 0.3): Bar[] {
  const out: Bar[] = [];
  let t = Date.parse("2026-01-05T05:00:00Z");
  for (const c of closes) {
    while ([0, 6].includes(new Date(t).getUTCDay())) t += DAY;
    out.push({ t: new Date(t).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 });
    t += DAY;
  }
  return out;
}

// A bottom at 88, a rally to 96, a break to new lows (70.5) with one bounce to
// 83, and a rally back that closes 3 points over the old bottom on its last day.
const LOW = 88 - 0.3;
const LINE = LOW + threePoints(LOW);
const DOWN = [...leg(100, 88, 10), ...leg(88, 96, 8), ...leg(96, 80, 10), ...leg(80, 83, 3), ...leg(83, 70.5, 10)];
const REGAINED = [...DOWN, ...leg(70.5, LINE - 0.4, 14), LINE + 0.2];
/** Reflected about 88, so the old top sits at 88.3 and its 3 points barely differ. */
const mirror = (bars: Bar[]) => bars.map((b) => ({ ...b, o: 176 - b.o, h: 176 - b.l, l: 176 - b.h, c: 176 - b.c }));

describe("a regained old bottom (A-TREND-10)", () => {
  it("is bought on the reaction just over the old bottom, stop just under it", () => {
    const t = computeGannEntryTrigger(weekdays(REGAINED), "bullish")!;
    expect(t).toMatchObject({ kind: "crossing", held: true, regained: true });
    expect(t.level).toBeCloseTo(LOW, 8);
    expect(t.pivot.kind).toBe("bottom");
    const pts = threePoints(LOW);
    expect(t.reactionEntry).toBeCloseTo(LOW + pts / 3, 6);
    expect(t.reactionStop).toBeCloseTo(LOW - pts, 6);
    expect(t.stopPrice).toBeCloseTo(LOW - pts, 6);
  });

  it("is not a buy before the close clearly over it", () => {
    const t = computeGannEntryTrigger(weekdays(REGAINED.slice(0, -1)), "bullish");
    expect(t?.regained).not.toBe(true);
  });

  it("is not regained when the bottom was never closed 3 points under", () => {
    // The same rally from a low that only dipped to 86 (under 3 points).
    const shallow = [...leg(100, 88, 10), ...leg(88, 96, 8), ...leg(96, 86, 10), ...leg(86, LINE - 0.4, 8), LINE + 0.2];
    expect(computeGannEntryTrigger(weekdays(shallow), "bullish")?.regained).not.toBe(true);
  });

  it("is mirrored: an old top crossed and then lost decisively is a sell", () => {
    const t = computeGannEntryTrigger(mirror(weekdays(REGAINED)), "bearish")!;
    expect(t).toMatchObject({ kind: "crossing", held: true, regained: true, direction: "bearish" });
    expect(t.pivot.kind).toBe("top");
    expect(t.level).toBeCloseTo(176 - LOW, 8);
    const pts = threePoints(176 - LOW);
    expect(t.reactionStop).toBeCloseTo(176 - LOW + pts, 6);
  });

  it("is the plan's buying point, and every place that names it says the bottom was regained", () => {
    const t = selectGannEntry(weekdays(REGAINED), "bullish")!;
    expect(t.regained).toBe(true);
    const src = gannEntrySource(t);
    expect(src).toMatchObject({ entryKind: "crossing", entryRegained: true, setupLabel: "regained old bottom" });
    expect(src.triggerPrice).toBeCloseTo(t.reactionEntry, 8);
    expect(structuralTriggerHeadline("bullish", "crossing", undefined, undefined, undefined, true)).toBe(
      "A close clearly back over the old swing low after a break under it, then a buy on the pullback toward it.",
    );
    expect(structuralTriggerHeadline("bearish", "crossing", "priorYear", undefined, 2024, true)).toBe(
      "A close clearly back under the 2024 top after a break over it, then a sell on the bounce toward it.",
    );
    expect(gannEntrySource(computeGannEntryTrigger(mirror(weekdays(REGAINED)), "bearish")!).setupLabel).toBe("lost old top");
  });

  it("takes a previous year's bottom regained the same way", () => {
    const line = 75 + threePoints(75);
    const bars = weekdays([...leg(80, 78, 5), ...leg(78, 82, 5), ...leg(82, 69.5, 12), ...leg(69.5, line - 0.4, 10), line + 0.2]);
    const older = [{ price: 75, kind: "bottom" as const, source: "priorYear" as const, year: 2025, formedAt: "2025-03-01T05:00:00Z", crossFrom: "2026-01-01" }];
    const t = computeGannEntryTrigger(bars, "bullish", undefined, undefined, true, older)!;
    expect(t).toMatchObject({ held: true, regained: true, source: "priorYear", levelYear: 2025, level: 75 });
    expect(computeGannEntryTrigger(bars, "bullish")?.regained).not.toBe(true);
  });
});
