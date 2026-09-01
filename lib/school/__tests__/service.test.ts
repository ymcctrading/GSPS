import { describe, expect, it } from "vitest";
import { gradeQuiz } from "@/lib/school/service";
import { getLesson } from "@/lib/school/content";

describe("gradeQuiz", () => {
  const lesson = getLesson("why-you-are-here")!;

  it("passes only when every answer is correct", () => {
    const correctAnswers = lesson.quiz.map((q) => q.correctIndex);
    expect(gradeQuiz(lesson, correctAnswers)).toEqual({ passed: true, score: 1 });
  });

  it("fails when any answer is wrong, scoring partial credit", () => {
    const answers = lesson.quiz.map((q) => q.correctIndex);
    answers[0] = (answers[0] + 1) % lesson.quiz[0].choices.length;
    const result = gradeQuiz(lesson, answers);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(1);
  });

  it("fails safely when the answer count doesn't match the question count", () => {
    expect(gradeQuiz(lesson, [])).toEqual({ passed: false, score: 0 });
  });
});
