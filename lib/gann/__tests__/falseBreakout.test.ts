import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readFalseBreakout, FALSE_BREAKOUT_RANGE_WEEKS } from "@/lib/gann/falseBreakout";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

/** One Monday-to-Friday week per [low, high, close], from Monday 6 Jan 2025. */
function weeks(rows: [number, number, number][]): Bar[] {
  return rows.flatMap(([l, h, c], w) =>
    [0, 1, 2, 3, 4].map((d) => ({ t: new Date(Date.UTC(2025, 0, 6 + 7 * w + d, 14)).toISOString(), o: c, h, l, c, v: 1000 })),
  );
}
const RANGE: [number, number, number][] = Array.from({ length: FALSE_BREAKOUT_RANGE_WEEKS }, (_, i) => [90, 100, i % 2 ? 94 : 96]);
const P = gannThreePoints(100);
/** The Monday after the last week, so every week read is complete. */
const after = (daily: Bar[]) => new Date(Date.parse(daily[daily.length - 1].t) + 3 * 86_400_000);

describe("readFalseBreakout (C-STOP-01)", () => {
  it("reads a week over the range top by less than 3 points, failing the next week, as a false breakout up", () => {
    const d = weeks([...RANGE, [95, 100 + P - 0.2, 99], [93, 99, 96]]);
    const r = readFalseBreakout(d, after(d));
    expect(r).toMatchObject({ direction: "bearish", level: 100 });
  });

  it("is not false when the break went more than 3 points past the top", () => {
    const d = weeks([...RANGE, [95, 100 + P + 0.2, 99], [93, 99, 96]]);
    expect(readFalseBreakout(d, after(d))).toBeNull();
  });

  it("is not false while the next week holds outside the range", () => {
    const d = weeks([...RANGE, [95, 100 + P - 0.2, 99], [99, 102, 101]]);
    expect(readFalseBreakout(d, after(d))).toBeNull();
  });

  it("mirrors under the range bottom", () => {
    const d = weeks([...RANGE, [90 - gannThreePoints(90) + 0.2, 95, 91], [91, 97, 94]]);
    expect(readFalseBreakout(d, after(d))).toMatchObject({ direction: "bullish", level: 90 });
  });

  // Review 22: the mirror's two negative cases, and the range's full 13 weeks.
  it("is not false under the bottom when the break went more than 3 points past it", () => {
    const d = weeks([...RANGE, [90 - gannThreePoints(90) - 0.2, 95, 91], [91, 97, 94]]);
    expect(readFalseBreakout(d, after(d))).toBeNull();
  });

  it("is not false under the bottom while the next week holds outside the range", () => {
    const d = weeks([...RANGE, [90 - gannThreePoints(90) + 0.2, 95, 91], [86, 91, 88]]);
    expect(readFalseBreakout(d, after(d))).toBeNull();
  });

  it("reads the top from all 13 weeks, the oldest included", () => {
    const range = RANGE.map((w, i) => (i === 0 ? ([90, 101, 96] as [number, number, number]) : w));
    const d = weeks([...range, [95, 100.5, 99], [93, 99, 96]]);
    expect(readFalseBreakout(d, after(d))).toBeNull();
  });

  it("counts a break of exactly 3 points as false, and says so on the card", () => {
    const d = weeks([...RANGE, [95, 100 + P, 99], [93, 99, 96]]);
    const ctx = readDisclosedRules(d, 96, null, after(d));
    expect(ctx.falseBreakout?.direction).toBe("bearish");
    expect(describeDisclosedRules(ctx).some((l) => l.includes("no more than 3 points over the 13-week top"))).toBe(true);
  });

  it("does not read the week still trading", () => {
    const d = weeks([...RANGE, [95, 100 + P - 0.2, 99], [93, 99, 96]]);
    // Asked on the last Friday, the failing week is not complete yet.
    expect(readFalseBreakout(d, new Date(d[d.length - 1].t))).toBeNull();
  });

  it("is on the card and in the measured context, with a sale", () => {
    const d = weeks([...RANGE, [95, 100 + P - 0.2, 99], [93, 99, 96]]);
    const price = d[d.length - 1].c;
    const ctx = readDisclosedRules(d, price, null, after(d));
    expect(ctx.falseBreakout?.direction).toBe("bearish");
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("A false breakout over the range top"))).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", price).falseBreakoutAgrees).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", price).falseBreakoutAgrees).toBe(false);
  });
});
