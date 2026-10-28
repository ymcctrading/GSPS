/**
 * What a person reads about a buy over a bottom that held (PLAN.md item 5,
 * step 4; W006 pp.20, 24, 46-47) describes that entry, not the crossing or the
 * double bottom: the signal card, the score's setup label, the graduation
 * exam, the lessons and the Settings stop rule.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildScenario, gradeExam, type StoredScenario } from "@/lib/school/graduationExam";
import { ACADEMIES } from "@/lib/school/curriculum";
import { STOP_RULE_DETAIL, STOP_RULE_LABEL } from "@/lib/trade/protocol-rules";
import { structuralTriggerHeadline } from "@/lib/scoring/direction-copy";
import { selectGannEntry } from "@/lib/gann/entryTrigger";
import { entryChart } from "@/lib/scan/entrySelection";

const scenario = (holdBasis: "weeks" | "days" | "record" = "weeks", direction: "bullish" | "bearish" = "bullish"): StoredScenario => ({
  view: { symbol: "TEST", asOf: "2026-03-02", bars: [], entryChoices: [], stopChoices: [] },
  key: {
    trend: direction === "bullish" ? "up" : "down", decision: "trade", direction, entryChoiceId: "e1", stopChoiceId: "s1",
    entry: 101, stop: 94.7, shares: 158, crossed: true, entryKind: "hold", holdBasis,
  },
  // Price rises straight away from the close: the resting buy is never filled.
  playback: direction === "bullish" ? [{ t: "2026-03-03", h: 104, l: 102, c: 103.5 }] : [{ t: "2026-03-03", h: 99, l: 97, c: 97.5 }],
});

describe("the graduation exam on a held bottom", () => {
  const graded = (s: StoredScenario) =>
    gradeExam("pro_to_expert", [s], [{ trend: s.key.trend, decision: "trade", entryChoiceId: "e1", stopChoiceId: "s1", shares: 158 }]).scenarios[0];
  const text = (s: StoredScenario, item: string) => graded(s).items.find((x) => x.item === item)!.explanation;

  it("explains the decision, the entry and the stop as a buy at the close over a low that held", () => {
    const s = scenario();
    expect(text(s, "decision")).toMatch(/the low had held: a trade/);
    expect(text(s, "entry")).toMatch(/the last close, at 101\.00/);
    expect(text(s, "entry")).not.toMatch(/just past|double or triple/);
    expect(text(s, "stop")).toMatch(/just under the low that held, at 94\.70/);
  });

  it("names the rule that found it", () => {
    // In plain words, never the rule's timing (confidential sources, 2026-10-28).
    expect(text(scenario("days"), "decision")).toMatch(/the low had held/);
    expect(text(scenario("days"), "decision")).not.toMatch(/two days|three-week/);
    expect(text(scenario("record"), "decision")).toMatch(/record low had held/);
    expect(text(scenario("record"), "decision")).not.toMatch(/for weeks/);
    expect(text(scenario("weeks", "bearish"), "decision")).toMatch(/high had held/);
    expect(text(scenario("weeks", "bearish"), "decision")).not.toMatch(/second week/);
    expect(text(scenario("weeks", "bearish"), "stop")).toMatch(/just over the high that held/);
  });

  it("says price moved away from the close when the buy was not filled", () => {
    expect(graded(scenario()).playedOut).toMatch(/never traded back down to the entry/);
    expect(graded(scenario("weeks", "bearish")).playedOut).toMatch(/never traded back up to the entry/);
  });

  it("builds the key from a held bottom, with choices that differ", () => {
    const DAY = 86_400_000;
    const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
    const flat = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? hi : lo));
    // An uptrend whose reactions run 12 points over 16 days, then a 9-point
    // reaction from the last top and eight days over its low, the first day
    // the hold is offered: a reaction of 3 points or more that overbalances
    // none before it, so the trend still reads up.
    const closes: number[] = [];
    let base = 80;
    for (let k = 0; k < 4; k++) {
      closes.push(...leg(base, base + 24, 10), ...leg(base + 24, base + 12, 16));
      base += 12;
    }
    const low = base + 24 - 9;
    closes.push(...leg(base, base + 24, 10), ...leg(base + 24, low, 4), ...flat(low + 0.8, low + 1.4, 8), ...leg(low + 1.4, low + 10, 8));
    const t0 = Date.parse("2026-01-01T04:00:00Z");
    const bars: Bar[] = closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + 0.6, l: c - 0.6, c, v: 1e6 }));
    const asOf = bars[closes.length - 8].t.slice(0, 10);
    const chart = entryChart(bars, [], asOf);
    expect(selectGannEntry(chart.bars, "bullish", chart.older)?.kind).toBe("hold");
    const s = buildScenario("TEST", asOf, bars, 7)!;
    expect(s.key).toMatchObject({ decision: "trade", entryKind: "hold", holdBasis: "weeks", crossed: true });
    const prices = s.view.entryChoices.map((c) => c.price);
    expect(new Set(prices).size).toBe(prices.length);
  });
});

describe("the signal card's headline", () => {
  it("names the buy at the close over a low that held, and its mirror", () => {
    expect(structuralTriggerHeadline("bullish", "hold", undefined, "weeks")).toMatch(/^A buy at the last close, the low having held, with the stop just under the low\./);
    expect(structuralTriggerHeadline("bearish", "hold", undefined, "weeks")).toMatch(/^A sell at the last close, the high having held, with the stop just over the high\./);
    expect(structuralTriggerHeadline("bullish", "hold", undefined, "days")).toBe("A buy at the last close, the low having held, with the stop just under the low.");
    expect(structuralTriggerHeadline("bullish", "hold", undefined, "record")).toBe("A buy at the last close, the record low having held, with the stop just under the low.");
  });
});

describe("the lessons and the Settings stop rule", () => {
  const lesson = (id: string) =>
    ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === id)!.instruction.join(" ");

  it("leave the method's own hold rule out of the lessons, and the stop rule says what it risks", () => {
    // The School teaches public methods only (confidential sources, owner
    // 2026-10-28), so the method's own entry rules are not in the lessons.
    expect(lesson("academy-4/reading-the-swings/breakouts-and-stops")).not.toMatch(/second week|stopped falling/);
    expect(lesson("academy-6/method-rules/entries-and-exits")).not.toMatch(/second week|record low/);
    expect(STOP_RULE_LABEL).toMatch(/the low that held/);
    expect(STOP_RULE_DETAIL).toMatch(/at the last close/);
    expect(STOP_RULE_DETAIL).not.toMatch(/never risks more than 4 points/);
  });
});
