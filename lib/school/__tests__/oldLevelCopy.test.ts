/**
 * What a person reads about an entry at an old bottom (Gann's double and
 * triple bottoms, PLAN.md item 5, step 2) describes that entry, not the
 * crossing: the signal card, the graduation exam's explanations, the lessons
 * and the Settings stop rule.
 */
import { describe, expect, it } from "vitest";
import { gradeExam, type StoredScenario } from "@/lib/school/graduationExam";
import { ACADEMIES } from "@/lib/school/curriculum";
import { STOP_RULE_DETAIL, STOP_RULE_LABEL } from "@/lib/trade/protocol-rules";
import { structuralTriggerHeadline } from "@/lib/scoring/direction-copy";

const scenario = (entryKind?: "oldLevel"): StoredScenario => ({
  view: { symbol: "TEST", asOf: "2026-03-02", bars: [], entryChoices: [], stopChoices: [] },
  key: {
    trend: "up", decision: "trade", direction: "bullish", entryChoiceId: "e1", stopChoiceId: "s1",
    entry: 39.7, stop: 37.74, shares: 51, crossed: true, ...(entryKind ? { entryKind } : {}),
  },
  // Price stays above the old bottom: the resting buy is never filled.
  playback: [{ t: "2026-03-03", h: 42, l: 41, c: 41.5 }],
});

describe("the graduation exam on an old-bottom entry", () => {
  const items = (s: StoredScenario) =>
    gradeExam("pro_to_expert", [s], [{ trend: "up", decision: "trade", entryChoiceId: "e1", stopChoiceId: "s1", shares: 51 }]).scenarios[0];

  it("explains the entry, the stop and the decision as a buy resting at the old bottom", () => {
    const g = items(scenario("oldLevel"));
    const text = (item: string) => g.items.find((x) => x.item === item)!.explanation;
    expect(text("decision")).toMatch(/old bottom/);
    expect(text("decision")).not.toMatch(/closes 3 points past/);
    expect(text("entry")).toMatch(/the old swing bottom itself, at 39\.70/);
    expect(text("entry")).not.toMatch(/1 point past/);
    expect(text("stop")).toMatch(/3 points under that bottom, at 37\.74/);
    expect(text("stop")).not.toMatch(/crossing/);
  });

  it("says price never came back to the old bottom when the buy was not filled", () => {
    expect(items(scenario("oldLevel")).playedOut).toMatch(/never came back down to the old bottom/);
    // The crossing keeps its own wording.
    expect(items(scenario()).playedOut).toMatch(/crossed the old level but never pulled back/);
  });
});

describe("the signal card's headline", () => {
  it("names the resting buy at an old bottom, and its mirror", () => {
    expect(structuralTriggerHeadline("bullish", "oldLevel")).toMatch(/at the last confirmed swing low.*3 points under it/);
    expect(structuralTriggerHeadline("bearish", "oldLevel")).toMatch(/at the last confirmed swing high.*3 points over it/);
    expect(structuralTriggerHeadline("bullish")).toMatch(/^A close 3 points over/);
  });
});

describe("the lessons and the Settings stop rule", () => {
  const lesson = (id: string) =>
    ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === id)!.instruction.join(" ");

  it("teach the buy at a double or triple bottom alongside the crossing", () => {
    expect(lesson("academy-4/reading-the-swings/breakouts-and-stops")).toMatch(/second test makes a double bottom and a third a triple bottom/);
    const method = lesson("academy-6/method-rules/entries-and-exits");
    expect(method).toMatch(/double or triple bottom/);
    expect(method).not.toMatch(/stays out until price breaks away/);
    expect(STOP_RULE_LABEL).toMatch(/rests at/);
    expect(STOP_RULE_DETAIL).toMatch(/double or triple bottom/);
  });
});
