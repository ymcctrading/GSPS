import { describe, expect, it } from "vitest";
import {
  LIVE_TRADING_RECERTIFICATION_LESSONS,
  validateLessonPublishable,
  getPublishedLessons,
} from "@/lib/school/content";

describe("GSPS School pilot content", () => {
  it("every pilot lesson passes the publishability gate", () => {
    for (const lesson of LIVE_TRADING_RECERTIFICATION_LESSONS) {
      const result = validateLessonPublishable(lesson);
      expect(result.errors).toEqual([]);
      expect(result.publishable).toBe(true);
    }
  });

  it("every prerequisite id refers to a real lesson in the program", () => {
    const ids = new Set(LIVE_TRADING_RECERTIFICATION_LESSONS.map((l) => l.id));
    for (const lesson of LIVE_TRADING_RECERTIFICATION_LESSONS) {
      for (const prereq of lesson.prerequisites) {
        expect(ids.has(prereq)).toBe(true);
      }
    }
  });

  it("publishes only lessons marked status: published", () => {
    expect(getPublishedLessons().length).toBe(LIVE_TRADING_RECERTIFICATION_LESSONS.length);
  });

  it("flags a lesson missing a mastery check as not publishable", () => {
    const broken = { ...LIVE_TRADING_RECERTIFICATION_LESSONS[0], quiz: [] };
    const result = validateLessonPublishable(broken);
    expect(result.publishable).toBe(false);
    expect(result.errors).toContain("quiz: at least one mastery-check question is required");
  });
});
