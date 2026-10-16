/**
 * The step 4b review of the bear-market rally sell (W006 p.47, Rule 4,
 * A-ENTRY-18), on weekday-only sessions as a real chart has them: the rally is
 * timed from its low, not from the last 3-Day Chart turn inside it (R1); one
 * rally is sold once (R6); the week is Monday on and its own high (T1); the
 * 8-21 day window's edges (T2); a top that held is preferred (T3).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannHoldEntry } from "@/lib/gann/entryTrigger";
import { readCounterMove } from "@/lib/gann/disclosedRules";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { confirmationFromBars } from "@/lib/lifecycle/confirmNow";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
/** One session a weekday from Monday 2026-01-05. */
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
const weekday = (b: Bar) => new Date(b.t).getUTCDay();
// A bear market down to a low on Thursday 2026-02-19 (89.7).
const BEAR_THU = [...leg(140, 120, 8), ...leg(120, 128, 4), ...leg(128, 108, 8), ...leg(108, 116, 4), ...leg(116, 90, 10)];
// The same, one session further, to a low on Friday 2026-02-20 (89).
const BEAR_FRI = [...BEAR_THU, 89.3];
const rallyFrom = (base: number[], ...moves: number[][]) => weekdays([...base, ...moves.flat()]);

describe("the rally is timed from its low (R1)", () => {
  it("is not sold in its fourth week because a 3-day pullback came inside it", () => {
    // Thursday low; five sessions up, three lower lows, eight up: a Friday 22 days on.
    const bars = rallyFrom(BEAR_THU, leg(90, 95, 5), leg(95, 93, 3), leg(93, 98, 8));
    expect(weekday(bars.at(-1)!)).toBe(5);
    expect(readCounterMove(bars)!.days).toBeLessThan(21);
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });

  it("is still sold at the end of its second week after a pullback early in that week", () => {
    // Friday low; Monday to Friday up, then Monday to Wednesday down and two days up.
    const bars = rallyFrom(BEAR_FRI, leg(89.3, 95, 5), leg(95, 93, 3), leg(93, 94.6, 2));
    expect(weekday(bars.at(-1)!)).toBe(5);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t.holdBasis).toBe("rally");
    expect(t.protectivePivot.price).toBeCloseTo(89, 8);
  });
});

describe("a bull market's reaction is timed from its top too (R1, the mirror)", () => {
  const BULL = [...leg(60, 80, 8), ...leg(80, 72, 4), ...leg(72, 92, 8), ...leg(92, 84, 4), ...leg(84, 110, 10)];

  it("is not bought on the days rule when a bounce inside it hid a reaction past three weeks", () => {
    // Five sessions down, a three-session bounce, eight down to the low, two up.
    const bars = weekdays([...BULL, ...leg(110, 104, 5), ...leg(104, 106.5, 3), ...leg(106.5, 100, 8), 100.6, 101]);
    expect(computeGannHoldEntry(bars, "bullish")?.holdBasis).not.toBe("days");
  });

  it("is bought on the days rule when the same reaction ran two weeks", () => {
    const bars = weekdays([...BULL, ...leg(110, 104, 3), ...leg(104, 106.5, 3), ...leg(106.5, 100, 4), 100.6, 101]);
    expect(computeGannHoldEntry(bars, "bullish")?.holdBasis).toBe("days");
  });
});

describe("one rally is sold once (R6)", () => {
  it("is not sold again at the end of its third week once the second week's sale traded", () => {
    const at15 = rallyFrom(BEAR_THU, leg(90, 98.8, 11));
    expect(weekday(at15.at(-1)!)).toBe(5);
    // The second week's Friday sold it; Monday traded through that price.
    expect(computeGannHoldEntry(at15.slice(0, -5), "bearish")?.holdBasis).toBe("rally");
    expect(computeGannHoldEntry(at15, "bearish")?.holdBasis).not.toBe("rally");
  });
});

describe("the week sold under (T1)", () => {
  it("takes the high made on Monday", () => {
    // A slow first week, a jump on Monday, a drift lower into Friday 15 days on.
    const bars = rallyFrom(BEAR_THU, leg(90, 91.5, 6), [96], leg(95.8, 95, 4));
    expect(weekday(bars.at(-1)!)).toBe(5);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t.holdBasis).toBe("rally");
    expect(t.level).toBeCloseTo(96.3, 8);
  });

  it("takes this week's high, not the higher one of the week before", () => {
    // Friday low; a slow week ending in a jump on Friday (day 7), then lower into Friday day 14.
    const bars = rallyFrom(BEAR_FRI, leg(89.3, 91, 4), [96], [94], leg(94.1, 94.8, 4));
    expect(weekday(bars.at(-1)!)).toBe(5);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t.holdBasis).toBe("rally");
    expect(t.level).toBeCloseTo(95.1, 8);
  });
});

describe("the rally's end", () => {
  it("is over once the weekly chart has turned down from the rally's top", () => {
    // Friday low; a week up, then a week down into the Friday 14 days on
    // (the top a week old, so no top has held yet either).
    const bars = rallyFrom(BEAR_FRI, leg(89.3, 97, 5), leg(96.6, 95, 5));
    expect(weekday(bars.at(-1)!)).toBe(5);
    expect(walkSwingChart(bars, WEEKLY_SWING_CHART).pivots.at(-1)?.kind).toBe("top");
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });
});

describe("the second or third week's edges (T2)", () => {
  it("sells a Thursday low's rally on the Friday eight days on", () => {
    const bars = rallyFrom(BEAR_THU, leg(90, 96, 6));
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).toBe("rally");
  });

  it("does not sell a Friday low's rally on the Friday seven days on", () => {
    const bars = rallyFrom(BEAR_FRI, leg(89.3, 94.3, 5));
    expect(weekday(bars.at(-1)!)).toBe(5);
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });

  it("sells on the Friday 21 days on, and not 22", () => {
    // Too little height to sell at the end of the first two weeks; then a third-week run.
    const at21 = rallyFrom(BEAR_FRI, leg(89.3, 91.5, 10), leg(91.5, 96.5, 5));
    expect(weekday(at21.at(-1)!)).toBe(5);
    expect(computeGannHoldEntry(at21, "bearish")?.holdBasis).toBe("rally");
    const at22 = rallyFrom(BEAR_THU, leg(90, 92, 11), leg(92, 97, 5));
    expect(weekday(at22.at(-1)!)).toBe(5);
    expect(computeGannHoldEntry(at22, "bearish")?.holdBasis).not.toBe("rally");
  });
});

describe("a top that held comes first (T3)", () => {
  it("sells the top that has held over a week rather than the rally's Friday", () => {
    // Thursday low; a run to the next Thursday, then sideways under it: a
    // Friday 15 days on, the first session the top has held 8 days, with the
    // rally still standing on the weekly chart.
    const bars = rallyFrom(BEAR_THU, leg(90, 97, 5), [95.6, 96, 95.6, 96, 95.6, 96]);
    expect(weekday(bars.at(-1)!)).toBe(5);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t.holdBasis).toBe("weeks");
    expect(t.level).toBeCloseTo(97.3, 8);
  });
});

describe("what the plan says about a sell at the close (R4)", () => {
  it("does not call a short's level a low that held", () => {
    const bar: Bar = { t: "2026-03-09T14:30:00Z", o: 95, h: 95.4, l: 94.6, c: 95, v: 1000 };
    const r = confirmationFromBars([bar], "bearish", 95, 100, "hold");
    expect(r.stage).toBe("confirmed");
    expect(r.note).not.toMatch(/low/);
    expect(r.note).toMatch(/3 points over the high/);
    const dead = confirmationFromBars([{ ...bar, c: 100.5, h: 100.8 }], "bearish", 95, 100, "hold");
    expect(dead.note).not.toMatch(/low/);
  });
});
