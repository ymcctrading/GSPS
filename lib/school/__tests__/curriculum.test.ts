import { describe, expect, it } from "vitest";
import {
  ACADEMIES,
  SCHOOL_PROGRAMS,
  getAcademy,
  getLesson,
  allCurriculumLessons,
  foundationsEducationLessons,
  PAPER_VALIDATION_LESSON_ID,
  wallStreetCapstoneLessons,
} from "@/lib/school/curriculum";
import { academyUnlocked, academyComplete, gradeCurriculumQuiz } from "@/lib/school/curriculum-service";

/**
 * The pilot's `validateLessonPublishable` (lib/school/content.ts) checks a
 * `SchoolLesson`, which carries a `prerequisites` field this curriculum's
 * `CurriculumLesson` deliberately replaces with academy-level prerequisite
 * locking (see academyUnlocked). This mirrors the same publishability
 * standard — 1-3 objectives, non-empty instruction/application, a
 * well-formed quiz, a published reviewMeta — for the shape this module
 * actually uses.
 */
function assertLessonPublishable(lesson: (typeof ACADEMIES)[number]["courses"][number]["lessons"][number]) {
  expect(lesson.objectives.length).toBeGreaterThanOrEqual(1);
  expect(lesson.objectives.length).toBeLessThanOrEqual(3);
  expect(lesson.instruction.length).toBeGreaterThan(0);
  expect(lesson.application.trim().length).toBeGreaterThan(0);
  expect(lesson.quiz.length).toBeGreaterThan(0);
  for (const q of lesson.quiz) {
    expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q.correctIndex).toBeLessThan(q.choices.length);
  }
  expect(lesson.reviewMeta.author).toBeTruthy();
  expect(lesson.reviewMeta.lastReviewedAt).toBeTruthy();
  expect(lesson.reviewMeta.status).toBe("published");
}

describe("curriculum content", () => {
  it("defines exactly 8 academies, numbered 1-8", () => {
    expect(ACADEMIES).toHaveLength(8);
    expect(ACADEMIES.map((a) => a.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("maps every academy to at least one of the 4 real entitlement programs", () => {
    const programIds = new Set(SCHOOL_PROGRAMS.map((p) => p.id));
    for (const academy of ACADEMIES) {
      expect(academy.programIds.length).toBeGreaterThan(0);
      for (const id of academy.programIds) expect(programIds.has(id)).toBe(true);
    }
  });

  it("every published lesson meets the pilot's publishability standard", () => {
    for (const lesson of allCurriculumLessons()) {
      assertLessonPublishable(lesson);
    }
  });

  it("every prerequisite academy id refers to a real academy", () => {
    for (const academy of ACADEMIES) {
      for (const prereqId of academy.prerequisiteAcademyIds) {
        expect(getAcademy(prereqId), `${academy.id} -> ${prereqId}`).toBeDefined();
      }
    }
  });

  it("Academy 1 has no prerequisites and is always unlocked", () => {
    const academy1 = getAcademy("academy-1")!;
    expect(academy1.prerequisiteAcademyIds).toEqual([]);
    expect(academyUnlocked(academy1, new Set())).toBe(true);
  });

  it("locks a downstream academy until its prerequisite is fully passed", () => {
    const academy2 = getAcademy("academy-2")!;
    const academy1 = getAcademy("academy-1")!;
    const allButOneAcademy1LessonIds = new Set(
      academy1.courses.flatMap((c) => c.lessons.map((l) => l.id)).slice(0, -1),
    );
    expect(academyUnlocked(academy2, allButOneAcademy1LessonIds)).toBe(false);

    const everyAcademy1LessonId = new Set(academy1.courses.flatMap((c) => c.lessons.map((l) => l.id)));
    expect(academyUnlocked(academy2, everyAcademy1LessonId)).toBe(true);
  });

  it("academyComplete requires every lesson in the academy to be passed", () => {
    const academy3 = getAcademy("academy-3")!;
    const lessonIds = academy3.courses.flatMap((c) => c.lessons.map((l) => l.id));
    expect(academyComplete(academy3, new Set(lessonIds.slice(0, -1)))).toBe(false);
    expect(academyComplete(academy3, new Set(lessonIds))).toBe(true);
  });

  it("foundationsEducationLessons excludes the paper-validation lesson", () => {
    const ids = foundationsEducationLessons().map((l) => l.id);
    expect(ids).not.toContain(PAPER_VALIDATION_LESSON_ID);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("wallStreetCapstoneLessons never includes Course W2's lessons", () => {
    const capstoneIds = wallStreetCapstoneLessons().map((l) => l.id);
    for (const id of capstoneIds) expect(id.startsWith("academy-8/capstone/")).toBe(true);
  });

  it("getLesson resolves every lesson id returned by allCurriculumLessons", () => {
    for (const lesson of allCurriculumLessons()) {
      expect(getLesson(lesson.id)?.lesson.id).toBe(lesson.id);
    }
  });

  it("Wall Street program is required; Pro and Expert are advisory", () => {
    const byId = new Map(SCHOOL_PROGRAMS.map((p) => [p.id, p]));
    expect(byId.get("foundations")?.gateStatus).toBe("required");
    expect(byId.get("sharpening-the-edge")?.gateStatus).toBe("advisory");
    expect(byId.get("professional-toolkit")?.gateStatus).toBe("advisory");
    expect(byId.get("systemization-capital-stewardship")?.gateStatus).toBe("required");
  });
});

describe("gradeCurriculumQuiz", () => {
  const lesson = getLesson("academy-1/orientation/what-markets-do")!.lesson;

  it("passes only when every answer is correct", () => {
    const correct = lesson.quiz.map((q) => q.correctIndex);
    expect(gradeCurriculumQuiz(lesson, correct)).toEqual({ passed: true, score: 1 });
  });

  it("fails on any wrong answer", () => {
    const answers = lesson.quiz.map((q) => q.correctIndex);
    answers[0] = (answers[0] + 1) % lesson.quiz[0].choices.length;
    expect(gradeCurriculumQuiz(lesson, answers).passed).toBe(false);
  });

  it("fails safely on a mismatched answer count", () => {
    expect(gradeCurriculumQuiz(lesson, [])).toEqual({ passed: false, score: 0 });
  });
});
