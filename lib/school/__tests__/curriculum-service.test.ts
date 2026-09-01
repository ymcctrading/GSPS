import { describe, expect, it } from "vitest";
import {
  recordCurriculumLessonAttempt,
  maybeWriteEducationCompleted,
  maybeWritePracticeValidationCompleted,
  submitLearningLab,
  maybeWriteWallStreetSchoolCompleted,
  isWallStreetSchoolCompleted,
  CAPSTONE_LAB_ID,
} from "@/lib/school/curriculum-service";
import {
  SCHOOL_CURRICULUM_PROGRAM_ID,
  foundationsEducationLessons,
  PAPER_VALIDATION_LESSON_ID,
  wallStreetCapstoneLessons,
} from "@/lib/school/curriculum";
import { fakeSupabase } from "@/lib/school/__tests__/fake-supabase";

const USER = "user-1";

function passLesson(tables: Record<string, Record<string, unknown>[]>, lessonId: string) {
  tables.school_lesson_progress = tables.school_lesson_progress ?? [];
  tables.school_lesson_progress.push({
    user_id: USER,
    program_id: SCHOOL_CURRICULUM_PROGRAM_ID,
    lesson_id: lessonId,
    status: "passed",
    attempt_count: 1,
  });
}

describe("recordCurriculumLessonAttempt", () => {
  it("blocks an attempt on a lesson in a locked academy", async () => {
    const { client } = fakeSupabase();
    const result = await recordCurriculumLessonAttempt(client, USER, "academy-2/mechanics/order-types", [0]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/prerequisite/);
  });

  it("records a passing attempt and flags the education gate for a non-paper-validation Foundations lesson", async () => {
    const { client } = fakeSupabase();
    const lessonId = "academy-1/orientation/what-markets-do";
    const { getLesson } = await import("@/lib/school/curriculum");
    const lesson = getLesson(lessonId)!.lesson;
    const answers = lesson.quiz.map((q) => q.correctIndex);
    const result = await recordCurriculumLessonAttempt(client, USER, lessonId, answers);
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.shouldCheckEducationCompleted).toBe(true);
    expect(result.shouldCheckPracticeValidation).toBe(false);
  });

  it("flags the practice-validation gate, not the education gate, for the paper-validation lesson", async () => {
    const { client, tables } = fakeSupabase();
    // Unlock Academies 1-2 and everything in Academy 3 up to the paper-validation lesson.
    const { getAcademy } = await import("@/lib/school/curriculum");
    for (const id of ["academy-1", "academy-2"]) {
      for (const lesson of getAcademy(id)!.courses.flatMap((c) => c.lessons)) passLesson(tables, lesson.id);
    }
    for (const lesson of getAcademy("academy-3")!.courses.flatMap((c) => c.lessons)) {
      if (lesson.id !== PAPER_VALIDATION_LESSON_ID) passLesson(tables, lesson.id);
    }
    const { getLesson } = await import("@/lib/school/curriculum");
    const lesson = getLesson(PAPER_VALIDATION_LESSON_ID)!.lesson;
    const answers = lesson.quiz.map((q) => q.correctIndex);
    const result = await recordCurriculumLessonAttempt(client, USER, PAPER_VALIDATION_LESSON_ID, answers);
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.shouldCheckPracticeValidation).toBe(true);
    expect(result.shouldCheckEducationCompleted).toBe(false);
  });
});

describe("maybeWriteEducationCompleted", () => {
  it("does not write education_completed_at until every required Foundations lesson (except paper validation) is passed", async () => {
    const { client, tables } = fakeSupabase();
    const required = foundationsEducationLessons();
    for (const lesson of required.slice(0, -1)) passLesson(tables, lesson.id);

    const wrote = await maybeWriteEducationCompleted(client, USER);
    expect(wrote).toBe(false);
    expect(tables.promotion_progress ?? []).toHaveLength(0);
  });

  it("writes education_completed_at once every required lesson is passed, and never overwrites it again", async () => {
    const { client, tables } = fakeSupabase();
    const required = foundationsEducationLessons();
    for (const lesson of required) passLesson(tables, lesson.id);

    const wrote = await maybeWriteEducationCompleted(client, USER);
    expect(wrote).toBe(true);
    const row = tables.promotion_progress[0];
    expect(row.education_completed_at).toBeTruthy();

    const firstTimestamp = row.education_completed_at;
    const wroteAgain = await maybeWriteEducationCompleted(client, USER);
    expect(wroteAgain).toBe(false);
    expect(tables.promotion_progress[0].education_completed_at).toBe(firstTimestamp);
  });

  it("never writes practice_validation_completed_at as a side effect", async () => {
    const { client, tables } = fakeSupabase();
    for (const lesson of foundationsEducationLessons()) passLesson(tables, lesson.id);
    await maybeWriteEducationCompleted(client, USER);
    expect(tables.promotion_progress[0].practice_validation_completed_at).toBeUndefined();
  });
});

describe("maybeWritePracticeValidationCompleted", () => {
  it("does not write until the paper-validation lesson itself is passed", async () => {
    const { client, tables } = fakeSupabase();
    const wrote = await maybeWritePracticeValidationCompleted(client, USER);
    expect(wrote).toBe(false);
    expect(tables.promotion_progress ?? []).toHaveLength(0);
  });

  it("writes practice_validation_completed_at once the paper-validation lesson is passed, independent of education_completed_at", async () => {
    const { client, tables } = fakeSupabase();
    passLesson(tables, PAPER_VALIDATION_LESSON_ID);
    const wrote = await maybeWritePracticeValidationCompleted(client, USER);
    expect(wrote).toBe(true);
    expect(tables.promotion_progress[0].practice_validation_completed_at).toBeTruthy();
    expect(tables.promotion_progress[0].education_completed_at).toBeUndefined();
  });
});

const VALID_SIGNAL = {
  instrument: "AAPL",
  timeframe: "Daily",
  setupOrState: "Testing prior swing high resistance",
  evidence: "Volume declining into the pullback",
  uncertainty: "Earnings in 9 days",
  catalystOrEventContext: "Earnings scheduled",
  sourceProvenance: "GSPS scanner, reviewed manually",
};
const VALID_BULL = {
  thesis: "A confirmed break of resistance resumes the uptrend",
  supportingEvidence: "Higher lows over three weeks",
  confirmation: "Close above resistance on volume",
  entryCondition: "Break and hold above 187.50",
  upsideScenario: "Continuation to prior highs",
  target: "195.00",
  thesisWeakeningConditions: "A close below the prior higher low",
};
const VALID_BEAR = {
  contradictoryEvidence: "The declining volume the Bull case cites as bullish could mean fading interest before earnings",
  invalidation: "A close below the prior higher low at 182",
  hardStop: "181.50",
  liquidityVolatilityEventRisk: "Earnings gap risk",
  positionSizeConsequence: "Reduce size 50% for earnings week",
};
const VALID_OPERATOR = {
  action: "reduced_risk_entry" as const,
  nextObservableCondition: "Confirmed close above 187.50",
  riskAction: "Half normal size",
  reversalCondition: "Close below 182 exits",
};

describe("submitLearningLab", () => {
  it("stores an invalid submission as needs_revision and never flags the Wall Street gate", async () => {
    const { client, tables } = fakeSupabase();
    const result = await submitLearningLab(
      client,
      USER,
      CAPSTONE_LAB_ID,
      "trade_plan",
      { signal: VALID_SIGNAL, bull: VALID_BULL, bear: { ...VALID_BEAR, contradictoryEvidence: "risk exists" }, operator: VALID_OPERATOR },
      false,
    );
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(false);
    expect(tables.school_learning_labs[0].status).toBe("needs_revision");
  });

  it("flags the Wall Street gate check only for the capstone dossier lab id, once passed", async () => {
    const { client } = fakeSupabase();
    const result = await submitLearningLab(
      client,
      USER,
      CAPSTONE_LAB_ID,
      "trade_plan",
      { signal: VALID_SIGNAL, bull: VALID_BULL, bear: VALID_BEAR, operator: VALID_OPERATOR },
      false,
    );
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.shouldCheckWallStreetSchoolCompleted).toBe(true);
  });

  it("does not flag the Wall Street gate for a non-capstone lab", async () => {
    const { client } = fakeSupabase();
    const result = await submitLearningLab(
      client,
      USER,
      "academy-4/structure/chart-annotation-lab",
      "chart_annotation",
      { signal: VALID_SIGNAL, bull: VALID_BULL, bear: VALID_BEAR, operator: VALID_OPERATOR },
      false,
    );
    expect(result.shouldCheckWallStreetSchoolCompleted).toBe(false);
  });
});

describe("maybeWriteWallStreetSchoolCompleted", () => {
  it("requires every capstone lesson AND the capstone lab passed before writing", async () => {
    const { client, tables } = fakeSupabase();
    for (const lesson of wallStreetCapstoneLessons()) passLesson(tables, lesson.id);
    // No lab row yet.
    const wrote = await maybeWriteWallStreetSchoolCompleted(client, USER);
    expect(wrote).toBe(false);
  });

  it("writes wall_street_school_completed_at once both conditions are met, and never overwrites it, never touching school_completed_at", async () => {
    const { client, tables } = fakeSupabase();
    for (const lesson of wallStreetCapstoneLessons()) passLesson(tables, lesson.id);
    tables.school_learning_labs = [
      { user_id: USER, program_id: SCHOOL_CURRICULUM_PROGRAM_ID, lab_id: CAPSTONE_LAB_ID, status: "passed" },
    ];

    const wrote = await maybeWriteWallStreetSchoolCompleted(client, USER);
    expect(wrote).toBe(true);
    const row = tables.live_trading_restrictions[0];
    expect(row.wall_street_school_completed_at).toBeTruthy();
    expect(row.school_completed_at).toBeUndefined();

    const again = await maybeWriteWallStreetSchoolCompleted(client, USER);
    expect(again).toBe(false);
  });
});

describe("isWallStreetSchoolCompleted — the checkout gate's own check", () => {
  it("is false with no row and false with a row missing the timestamp", async () => {
    const { client } = fakeSupabase();
    expect(await isWallStreetSchoolCompleted(client, USER)).toBe(false);

    const { client: client2, tables } = fakeSupabase({
      live_trading_restrictions: [{ user_id: USER, restricted: false }],
    });
    void tables;
    expect(await isWallStreetSchoolCompleted(client2, USER)).toBe(false);
  });

  it("is true once wall_street_school_completed_at is set, and is unaffected by school_completed_at alone", async () => {
    const { client } = fakeSupabase({
      live_trading_restrictions: [{ user_id: USER, school_completed_at: "2026-01-01T00:00:00Z" }],
    });
    expect(await isWallStreetSchoolCompleted(client, USER)).toBe(false);

    const { client: client2 } = fakeSupabase({
      live_trading_restrictions: [{ user_id: USER, wall_street_school_completed_at: "2026-01-01T00:00:00Z" }],
    });
    expect(await isWallStreetSchoolCompleted(client2, USER)).toBe(true);
  });
});
