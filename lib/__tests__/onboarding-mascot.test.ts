/**
 * The mascots have to be right, not just present.
 *
 * Mrs. Bull and Mr. Bear exist to teach one thing by demonstration: a bull
 * expects prices to rise, a bear expects them to fall. That lesson only lands
 * if the assignment is truthful. A bear introducing an opportunity, or a bull
 * explaining a stop loss, teaches a beginner the words backwards — and they
 * will carry that mistake to every other finance site they ever read.
 *
 * So this is a content test, not a rendering one.
 */

import { describe, expect, it } from "vitest";
import { BEAR_SUBJECTS, speakerFor, unassignedSteps } from "@/lib/onboarding/mascot";
import { MASCOTS } from "@/components/onboarding/mascots";
import { TOUR_STEPS, stepById } from "@/lib/onboarding/tour";

describe("who speaks", () => {
  it("assigns a speaker to every step", () => {
    // A step with no entry falls back to Mrs. Bull rather than throwing, which
    // keeps the tour working — and would hide a missing assignment forever if
    // nothing checked. This is that check.
    expect(unassignedSteps()).toEqual([]);
  });

  it("gives Mr. Bear every step about risk, limits or losses", () => {
    for (const id of BEAR_SUBJECTS) {
      expect(stepById(id), `"${id}" is listed as a bear subject but is not a step`).toBeDefined();
      expect(speakerFor(id), `"${id}" is about risk and should be Mr. Bear`).toBe("bear");
    }
  });

  it("gives Mrs. Bull the steps about finding and doing", () => {
    for (const id of ["dashboard", "scanner", "guided", "glossary"]) {
      expect(speakerFor(id)).toBe("bull");
    }
  });

  it("uses both of them often enough for the pattern to be visible", () => {
    // One bear in sixteen steps is a mascot, not a lesson. The reader has to
    // meet each often enough to notice which subjects belong to whom.
    const speakers = TOUR_STEPS.map((s) => speakerFor(s.id));
    expect(speakers.filter((s) => s === "bear").length).toBeGreaterThanOrEqual(4);
    expect(speakers.filter((s) => s === "bull").length).toBeGreaterThanOrEqual(4);
  });
});

describe("the step that introduces them", () => {
  const step = stepById("meet-the-guides");

  it("exists, and before anyone has to interpret a mascot", () => {
    expect(step).toBeDefined();
    const introIndex = TOUR_STEPS.findIndex((s) => s.id === "meet-the-guides");
    const firstBear = TOUR_STEPS.findIndex((s) => speakerFor(s.id) === "bear");
    expect(introIndex).toBeLessThan(firstBear);
  });

  it("names both characters and defines both words", () => {
    const copy = step!.body.join(" ");
    expect(copy).toContain("Mrs. Bull");
    expect(copy).toContain("Mr. Bear");
    // The actual lesson. Losing these sentences turns the mascots into
    // decoration, which is the failure this whole file guards against.
    expect(copy).toMatch(/bull expects prices to rise/i);
    expect(copy).toMatch(/bear expects prices to fall/i);
  });
});

describe("how they are described", () => {
  it("explains each one's job in its own label", () => {
    expect(MASCOTS.bull.role).toMatch(/up/i);
    expect(MASCOTS.bear.role).toMatch(/down/i);
    expect(MASCOTS.bull.label).toBe("Mrs. Bull");
    expect(MASCOTS.bear.label).toBe("Mr. Bear");
  });
});
