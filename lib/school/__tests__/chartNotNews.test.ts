/**
 * C-OTHER-02 (class C, Additional Cycle Findings p. 17): ignore the financial
 * press. A discipline lesson: judge the market from its own chart.
 */
import { describe, expect, it } from "vitest";
import { getAcademy, getLesson } from "@/lib/school/curriculum";

const ID = "academy-2/simple-rules/the-chart-not-the-news";

describe("the chart, not the news (C-OTHER-02)", () => {
  it("is a lesson in the novice simple-rules course", () => {
    const course = getAcademy("academy-2")!.courses.find((c) => c.id === "academy-2/simple-rules")!;
    expect(course.lessons.map((l) => l.id)).toContain(ID);
  });

  it("tells the learner to judge the market from its own chart rather than the news", () => {
    const { lesson } = getLesson(ID)!;
    const text = [lesson.title, ...lesson.objectives, ...lesson.instruction, lesson.application].join(" ");
    expect(text).toMatch(/chart/i);
    expect(text).toMatch(/news|headline/i);
    expect(lesson.quiz.some((q) => /news|headline/i.test(q.question))).toBe(true);
  });

  it("names no source or method author in the lesson text", () => {
    const { lesson } = getLesson(ID)!;
    const text = JSON.stringify(lesson);
    expect(text).not.toMatch(/gann/i);
  });
});
