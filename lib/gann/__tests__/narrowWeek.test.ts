/**
 * A narrow week followed by a sharp drop on large volume turns the trend down
 * (A-ENTRY-19, W006 p.27, Corn Products, week ended 20 July 1935: short even
 * while the averages rose). PLAN.md item 6 step 10, fork F7 (a): context only,
 * measured, with "narrow", "sharp" and "large" pre-registered in narrowWeek.ts.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { readNarrowWeekBreak } from "@/lib/gann/narrowWeek";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

/** One bar a week from Monday 6 Jan 2025: [low, high, close, volume]. */
function weeks(rows: [number, number, number, number][]): Bar[] {
  return rows.map(([l, h, c, v], i) => ({ t: new Date(Date.UTC(2025, 0, 6 + 7 * i, 14)).toISOString(), o: (l + h) / 2, h, l, c, v }));
}
/** Thirteen ordinary weeks around 80 on volume 100. */
const BASE: [number, number, number, number][] = Array.from({ length: 13 }, (_, i) => [78 + (i % 2), 84 + (i % 2), 81, 100]);
const P = gannThreePoints(78);

describe("a narrow week, then a sharp drop on large volume (A-ENTRY-19)", () => {
  // Ranges 6, 5, 7, then a 2-point week, then a week closing 3 points under its low on twice the volume.
  const narrow: [number, number, number, number][] = [[78, 84, 81, 100], [79, 84, 82, 100], [77, 84, 80, 100], [80, 82, 81, 90]];
  const drop = (close: number, v: number): [number, number, number, number] => [close - 0.5, 81, close, v];

  it("turns the trend down", () => {
    const r = readNarrowWeekBreak(weeks([...BASE, ...narrow, drop(80 - P - 0.1, 200)]));
    expect(r).toMatchObject({ direction: "bearish", narrowHigh: 82, narrowLow: 80 });
  });

  it("is still read the week after the drop", () => {
    const r = readNarrowWeekBreak(weeks([...BASE, ...narrow, drop(80 - P - 0.1, 200), [72, 76, 74, 120]]));
    expect(r?.direction).toBe("bearish");
  });

  it("is not read two weeks after", () => {
    expect(readNarrowWeekBreak(weeks([...BASE, ...narrow, drop(80 - P - 0.1, 200), [72, 76, 74, 120], [72, 76, 74, 120]]))).toBeNull();
  });

  it("needs the drop to close 3 points under the narrow week's low", () => {
    expect(readNarrowWeekBreak(weeks([...BASE, ...narrow, drop(80 - P + 0.3, 200)]))).toBeNull();
  });

  it("needs volume above the 13-week average", () => {
    expect(readNarrowWeekBreak(weeks([...BASE, ...narrow, drop(80 - P - 0.1, 99)]))).toBeNull();
  });

  it("measures volume against the 13 weeks before the drop, not counting the drop", () => {
    // A heavy week 13 weeks back lifts the average over 150; the drop week itself is not in it.
    const heavy: [number, number, number, number][] = BASE.map((w, i) => (i === 4 ? [78, 84, 81, 1000] : w));
    expect(readNarrowWeekBreak(weeks([...heavy, ...narrow, drop(80 - P - 0.1, 150)]))).toBeNull();
  });

  it("needs the week to be the narrowest of the last four", () => {
    const wide: [number, number, number, number][] = [[78, 84, 81, 100], [80, 81, 81, 100], [77, 84, 80, 100], [80, 82, 81, 90]];
    expect(readNarrowWeekBreak(weeks([...BASE, ...wide, drop(80 - P - 0.1, 200)]))).toBeNull();
  });

  it("reads the mirror, a sharp rise on volume after a narrow week, as up", () => {
    const P2 = gannThreePoints(82);
    const r = readNarrowWeekBreak(weeks([...BASE, ...narrow, [81, 82 + P2 + 0.6, 82 + P2 + 0.1, 200]]));
    expect(r?.direction).toBe("bullish");
  });

  it("is on the card and in the measured context, against a buy", () => {
    const rows = [...BASE, ...narrow, drop(80 - P - 0.1, 200)];
    // Five sessions a week, each spanning the week's range on a fifth of its volume.
    const daily: Bar[] = rows.flatMap(([l, h, c, v], w) =>
      [0, 1, 2, 3, 4].map((d) => ({ t: new Date(Date.UTC(2025, 0, 6 + 7 * w + d, 14)).toISOString(), o: c, h, l, c, v: v / 5 })),
    );
    const ctx = readDisclosedRules(daily, daily[daily.length - 1].c, null, new Date("2025-05-10T20:00:00Z"));
    expect(ctx.narrowWeekBreak?.direction).toBe("bearish");
    const line = describeDisclosedRules(ctx).find((l) => l.startsWith("A narrow week, then a sharp drop on heavy volume"));
    // The card must not claim it moved the trend read (item 6 review R6); since
    // 2026-10-16 it names the sale.
    expect(line).toMatch(/does not change the trend read/);
    expect(line).toMatch(/A sell rests 1 point under the narrow week's low/);
    const price = daily[daily.length - 1].c;
    expect(contextFactorsFor(ctx, "bullish", price).narrowWeekBreakAgrees).toBe(false);
    expect(contextFactorsFor(ctx, "bearish", price).narrowWeekBreakAgrees).toBe(true);
  });
});
