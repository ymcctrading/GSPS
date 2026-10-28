/**
 * The bear-market rally sell (PLAN.md item 5, step 4b; W006 p.47, Rule 4,
 * A-ENTRY-18): "bear-market rallies last 2-3 weeks; sell at the end of the
 * second or third week with a stop 3 points above the previous week's high."
 * Like the held bottom, the order rests at the last close with nothing to
 * cross first.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannHoldEntry, selectGannEntry } from "@/lib/gann/entryTrigger";
import { readCounterMove } from "@/lib/gann/disclosedRules";
import { beyondByThreePoints } from "@/lib/gann/pointScale";
import { gannEntrySource } from "@/lib/strat/levels";
import { structuralTriggerHeadline } from "@/lib/scoring/direction-copy";
import { gradeExam, type StoredScenario } from "@/lib/school/graduationExam";
import { ACADEMIES } from "@/lib/school/curriculum";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// One bar a calendar day from Monday 2026-03-02, so bar i is a Friday when i % 7 is 4.
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2026-03-02T04:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
// A bear market, falling tops and bottoms, down to a bottom at 90 on bar 33.
const BEAR = [...leg(140, 120, 8), ...leg(120, 128, 4), ...leg(128, 108, 8), ...leg(108, 116, 4), ...leg(116, 90, 10)];
// A rally from it of `days` days, the last bar on a Friday when 33 + days is.
const rally = (days: number) => daily([...BEAR, ...leg(90, 90 + days * 0.6, days)]);

describe("the sell at the end of a bear-market rally's second or third week", () => {
  it("sells at the Friday close of a two-week rally, the stop just over that week's high", () => {
    const bars = rally(13);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    const cm = readCounterMove(bars)!;
    expect(cm).toMatchObject({ trend: "bearish", inCounterMove: true });
    const t = computeGannHoldEntry(bars, "bearish")!;
    const weekHigh = Math.max(...bars.slice(-5).map((b) => b.h));
    expect(t).toMatchObject({ kind: "hold", holdBasis: "rally", direction: "bearish" });
    expect(t.reactionEntry).toBeCloseTo(bars.at(-1)!.c, 8);
    expect(t.level).toBeCloseTo(weekHigh, 8);
    expect(t.reactionStop).toBeCloseTo(beyondByThreePoints(weekHigh, 1), 8);
    expect(selectGannEntry(bars, "bearish")?.holdBasis).toBe("rally");
  });

  it("sells at the end of the third week as well", () => {
    // Too little height to sell at the end of the second week, so the third is
    // the rally's one sale (one rally is sold once, step 4b review R6).
    const bars = daily([...BEAR, ...leg(90, 92, 13), ...leg(92, 97, 7)]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    expect(computeGannHoldEntry(bars.slice(0, -7), "bearish")?.holdBasis).not.toBe("rally");
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).toBe("rally");
  });

  it("waits for the end of a week", () => {
    expect(computeGannHoldEntry(rally(12), "bearish")?.holdBasis).not.toBe("rally");
  });

  it("does not sell a rally of one week, or one past three", () => {
    expect(computeGannHoldEntry(rally(6), "bearish")?.holdBasis).not.toBe("rally");
    expect(computeGannHoldEntry(rally(27), "bearish")?.holdBasis).not.toBe("rally");
  });

  it("is a sell in a bear market only", () => {
    // A bull market's reaction ending on a Friday is not sold on this rule.
    const BULL = [...leg(60, 80, 8), ...leg(80, 72, 4), ...leg(72, 92, 8), ...leg(92, 84, 4), ...leg(84, 110, 9)];
    const bars = daily([...BULL, ...leg(110, 100, 14)]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
    expect(computeGannHoldEntry(rally(13), "bullish")?.holdBasis).not.toBe("rally");
  });

  it("takes the week's high from Monday on, not only the last sessions", () => {
    // The rally tops on Tuesday and eases into Friday without turning.
    const bars = daily([...BEAR, ...leg(90, 98.5, 9), 99.5, 99, 98.6, 98.8]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    const t = computeGannHoldEntry(bars, "bearish")!;
    expect(t.holdBasis).toBe("rally");
    expect(t.level).toBeCloseTo(99.8, 8);
  });

  it("does not sell a drift of less than 3 points", () => {
    const bars = daily([...BEAR, ...leg(90, 92, 13)]);
    expect(readCounterMove(bars)).toMatchObject({ trend: "bearish", inCounterMove: true });
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });

  it("does not sell a short, steep rally of one week", () => {
    // Six days and 6 points: enough height, too few days.
    const bars = daily([...BEAR, ...leg(90, 96, 6)]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });

  it("does not sell a reaction in a rising market that has the rally's shape", () => {
    // A bull market's two-week decline, a dip midweek and a bounce into Friday
    // that keeps the stop within 5 points.
    const BULL = [...leg(60, 80, 8), ...leg(80, 72, 4), ...leg(72, 92, 8), ...leg(92, 84, 4), ...leg(84, 110, 9)];
    const bars = daily([...BULL, ...leg(110, 103.5, 9), 103, 102.5, 97.5, 99, 100.5]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    expect(readCounterMove(bars)).toMatchObject({ trend: "bullish", inCounterMove: true });
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });

  it("is not offered when the stop is more than 5 points off the close", () => {
    // A week that ran far over the Friday close.
    const bars = daily([...BEAR, ...leg(90, 105, 10), 108, 103, 99]);
    expect(new Date(bars.at(-1)!.t).getUTCDay()).toBe(5);
    expect(computeGannHoldEntry(bars, "bearish")?.holdBasis).not.toBe("rally");
  });
});

describe("what a person reads about it", () => {
  const t = computeGannHoldEntry(rally(13), "bearish")!;

  it("names the setup and the signal card's headline", () => {
    expect(gannEntrySource(t).setupLabel).toBe("bear-market rally");
    expect(structuralTriggerHeadline("bearish", "hold", undefined, "rally")).toBe(
      "A sell at the last close, at the end of the second or third week of a rally in a falling market, with the stop just over that week's high.",
    );
  });

  it("explains the exam's decision, entry and stop", () => {
    const s: StoredScenario = {
      view: { symbol: "TEST", asOf: "2026-04-20", bars: [], entryChoices: [], stopChoices: [] },
      key: {
        trend: "down", decision: "trade", direction: "bearish", entryChoiceId: "e1", stopChoiceId: "s1",
        entry: 97.8, stop: 103.1, shares: 188, crossed: true, entryKind: "hold", holdBasis: "rally",
      },
      playback: [{ t: "2026-04-21", h: 97, l: 95, c: 95.5 }],
    };
    const items = gradeExam("pro_to_expert", [s], [{ trend: "down", decision: "trade", entryChoiceId: "e1", stopChoiceId: "s1", shares: 188 }]).scenarios[0].items;
    const text = (item: string) => items.find((x) => x.item === item)!.explanation;
    expect(text("decision")).toMatch(/rally in a falling market had run its course/);
    expect(text("decision")).not.toMatch(/second or third week/);
    expect(text("entry")).toMatch(/the last close, at 97\.80/);
    expect(text("stop")).toMatch(/just over the rally's high, at 103\.10/);
  });

  it("is not taught in the Expert course", () => {
    // The School teaches public methods only (confidential sources, owner
    // 2026-10-28), so the method's own entry rules are not in the lessons.
    const method = ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === "academy-6/method-rules/entries-and-exits")!.instruction.join(" ");
    expect(method).not.toMatch(/second or third week/);
  });
});
