/**
 * GSPS School curriculum — progress, prerequisite locking, quiz grading,
 * lab submission, and the gate writes into `promotion_progress` and
 * `live_trading_restrictions`.
 *
 * Reuses the existing `school_lesson_progress` table (0056) for every
 * lesson in `lib/school/curriculum.ts`, keyed by
 * `SCHOOL_CURRICULUM_PROGRAM_ID` — a distinct program_id from the pilot's
 * `LIVE_TRADING_RECERTIFICATION_PROGRAM_ID`, so the two never collide and
 * the pilot's own grading (`lib/school/service.ts`) is untouched.
 *
 * Gate consequences (section 8 of the product spec, non-negotiable):
 *  - Foundations (Academies 1-3): passing every foundations lesson except
 *    the paper-validation lesson writes `promotion_progress.education_completed_at`;
 *    passing the paper-validation lesson (separately) writes
 *    `promotion_progress.practice_validation_completed_at`. Neither ever
 *    touches trade count, account age, execution score, stop adherence, or
 *    position-size compliance — those stay computed purely in
 *    lib/promotion/readiness.ts from real trading history.
 *  - Sharpening the Edge / Professional Toolkit (Academies 4-7): progress
 *    persists; nothing here ever writes a promotion or entitlement field.
 *  - Systemization & Capital Stewardship (Academy 8 capstone, not W2):
 *    passing every capstone lesson AND the capstone dossier lab writes
 *    `live_trading_restrictions.wall_street_school_completed_at`. Course W2
 *    stays entirely on the pilot's own service (lib/school/service.ts) and
 *    is never read here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SCHOOL_CURRICULUM_PROGRAM_ID,
  CURRICULUM_VERSION,
  ACADEMIES,
  type Academy,
  type CurriculumLesson,
  getAcademy,
  getLesson,
  foundationsEducationLessons,
  PAPER_VALIDATION_LESSON_ID,
  wallStreetCapstoneLessons,
} from "@/lib/school/curriculum";
import {
  validateThreeElementSubmission,
  scoreThreeElementSubmission,
  type ThreeElementSubmission,
} from "@/lib/school/bull-bear";

export interface QuizGradeResult {
  passed: boolean;
  score: number;
}

/** All-questions-correct mastery, matching the pilot's exact convention (lib/school/service.ts's gradeQuiz). */
export function gradeCurriculumQuiz(lesson: CurriculumLesson, answers: readonly number[]): QuizGradeResult {
  if (answers.length !== lesson.quiz.length) return { passed: false, score: 0 };
  const correct = lesson.quiz.filter((question, i) => answers[i] === question.correctIndex).length;
  const score = lesson.quiz.length === 0 ? 0 : correct / lesson.quiz.length;
  return { passed: correct === lesson.quiz.length, score };
}

export interface LessonProgressRow {
  lesson_id: string;
  status: "in_progress" | "passed";
  attempt_count: number;
  score: number | null;
  completed_at: string | null;
}

async function fetchProgressMap(supabase: SupabaseClient, userId: string): Promise<Map<string, LessonProgressRow>> {
  const { data } = await supabase
    .from("school_lesson_progress")
    .select("lesson_id, status, attempt_count, score, completed_at")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID);
  return new Map((data ?? []).map((r) => [r.lesson_id as string, r as LessonProgressRow]));
}

/** Whether every lesson in an academy is passed for this learner. Empty-lesson academies (e.g. Course W2's placeholder) are vacuously true. */
export function academyComplete(academy: Academy, passedLessonIds: ReadonlySet<string>): boolean {
  const lessonIds = academy.courses.flatMap((c) => c.lessons.map((l) => l.id));
  return lessonIds.every((id) => passedLessonIds.has(id));
}

/** An academy unlocks once every prerequisite academy is complete. Academy 1 (no prerequisites) is always unlocked. */
export function academyUnlocked(academy: Academy, passedLessonIds: ReadonlySet<string>): boolean {
  return academy.prerequisiteAcademyIds.every((prereqId) => {
    const prereq = getAcademy(prereqId);
    return prereq ? academyComplete(prereq, passedLessonIds) : false;
  });
}

export interface CurriculumMapEntry {
  academy: Academy;
  unlocked: boolean;
  complete: boolean;
  passedLessons: number;
  totalLessons: number;
}

export async function getCurriculumMap(supabase: SupabaseClient, userId: string): Promise<CurriculumMapEntry[]> {
  const progress = await fetchProgressMap(supabase, userId);
  const passedIds = new Set([...progress.values()].filter((r) => r.status === "passed").map((r) => r.lesson_id));

  return ACADEMIES.map((academy) => {
    const lessonIds = academy.courses.flatMap((c) => c.lessons.map((l) => l.id));
    const passedLessons = lessonIds.filter((id) => passedIds.has(id)).length;
    return {
      academy,
      unlocked: academyUnlocked(academy, passedIds),
      complete: academyComplete(academy, passedIds),
      passedLessons,
      totalLessons: lessonIds.length,
    };
  });
}

export interface AttemptLessonResult {
  ok: boolean;
  error?: string;
  passed?: boolean;
  score?: number;
  /** True when this attempt newly passed the paper-validation lesson specifically — the caller should then call `maybeWritePracticeValidationCompleted` with a service-role client. */
  shouldCheckPracticeValidation?: boolean;
  /** True when this attempt newly passed a Foundations lesson other than paper-validation — the caller should then call `maybeWriteEducationCompleted` with a service-role client. */
  shouldCheckEducationCompleted?: boolean;
}

/**
 * Records one quiz attempt for a curriculum lesson on the caller-supplied
 * user-scoped client (RLS restricts `school_lesson_progress` writes to the
 * caller's own row, same as the pilot's `recordLessonAttempt`). Enforces
 * academy-level prerequisite locking — a locked academy's lessons cannot be
 * attempted regardless of client state. Does not itself write any
 * promotion/restriction field; see `maybeWriteEducationCompleted` /
 * `maybeWritePracticeValidationCompleted`, which require a service-role
 * client and must be called separately by the route handler, matching the
 * pilot's own two-client split in `app/api/school/lessons/[lessonId]/complete/route.ts`.
 */
export async function recordCurriculumLessonAttempt(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  answers: readonly number[],
): Promise<AttemptLessonResult> {
  const found = getLesson(lessonId);
  if (!found) return { ok: false, error: `Unknown lesson "${lessonId}"` };
  const { academy, lesson } = found;

  const progress = await fetchProgressMap(supabase, userId);
  const passedIds = new Set([...progress.values()].filter((r) => r.status === "passed").map((r) => r.lesson_id));
  if (!academyUnlocked(academy, passedIds)) {
    return { ok: false, error: `Complete the prerequisite academies before attempting "${lesson.id}".` };
  }

  const { passed, score } = gradeCurriculumQuiz(lesson, answers);
  const existing = progress.get(lesson.id);
  const alreadyPassed = existing?.status === "passed";
  const nextAttemptCount = (existing?.attempt_count ?? 0) + 1;

  const { error } = await supabase.from("school_lesson_progress").upsert(
    {
      user_id: userId,
      program_id: SCHOOL_CURRICULUM_PROGRAM_ID,
      lesson_id: lesson.id,
      status: alreadyPassed || passed ? "passed" : "in_progress",
      attempt_count: nextAttemptCount,
      score,
      completed_at: alreadyPassed ? existing?.completed_at : passed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,program_id,lesson_id" },
  );
  if (error) return { ok: false, error: error.message };

  const nowPassed = alreadyPassed || passed;
  return {
    ok: true,
    passed: nowPassed,
    score,
    shouldCheckPracticeValidation: nowPassed && lesson.id === PAPER_VALIDATION_LESSON_ID,
    shouldCheckEducationCompleted: nowPassed && lesson.id !== PAPER_VALIDATION_LESSON_ID,
  };
}

/**
 * Writes `promotion_progress.education_completed_at` once every Academy
 * 1-3 lesson except the paper-validation lesson has passed. Idempotent —
 * never overwrites an existing timestamp. `service` must be a service-role
 * client — `promotion_progress` has no client write policy (0046), the
 * same posture the pilot uses for its one account-wide write.
 */
export async function maybeWriteEducationCompleted(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data: progressRows } = await service
    .from("school_lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("status", "passed");
  const passedIds = new Set((progressRows ?? []).map((r) => r.lesson_id as string));

  const required = foundationsEducationLessons();
  const allPassed = required.every((l) => passedIds.has(l.id));
  if (!allPassed) return false;

  const { data: existing } = await service
    .from("promotion_progress")
    .select("education_completed_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (existing?.education_completed_at) return false;

  const { error } = await service.from("promotion_progress").upsert(
    { profile_id: userId, education_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "profile_id" },
  );
  if (error) {
    console.error(`gsps-school: education_completed_at not written for ${userId} — ${error.message}`);
    return false;
  }
  return true;
}

export async function maybeWritePracticeValidationCompleted(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data: lessonRow } = await service
    .from("school_lesson_progress")
    .select("status")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("lesson_id", PAPER_VALIDATION_LESSON_ID)
    .maybeSingle();
  if (lessonRow?.status !== "passed") return false;

  const { data: existing } = await service
    .from("promotion_progress")
    .select("practice_validation_completed_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (existing?.practice_validation_completed_at) return false;

  const { error } = await service.from("promotion_progress").upsert(
    { profile_id: userId, practice_validation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "profile_id" },
  );
  if (error) {
    console.error(`gsps-school: practice_validation_completed_at not written for ${userId} — ${error.message}`);
    return false;
  }
  return true;
}

export interface SubmitLabResult {
  ok: boolean;
  error?: string;
  errors?: readonly string[];
  passed?: boolean;
  /** True when this submission newly passed the capstone dossier lab — the caller should then call `maybeWriteWallStreetSchoolCompleted` with a service-role client. */
  shouldCheckWallStreetSchoolCompleted?: boolean;
}

export const CAPSTONE_LAB_ID = "academy-8/capstone/capstone-dossier";

/**
 * Validates and persists a Three-Element Method lab submission on the
 * caller-supplied user-scoped client (`school_learning_labs` has own-row
 * RLS, same as `school_lesson_progress`). Every field is validated
 * server-side (never trusts a client "complete" flag) — an invalid
 * submission is stored as `needs_revision` with its errors, a valid one as
 * `passed`. Does not itself write `wall_street_school_completed_at` — see
 * `maybeWriteWallStreetSchoolCompleted`, which requires a service-role
 * client.
 */
export async function submitLearningLab(
  supabase: SupabaseClient,
  userId: string,
  labId: string,
  labType: string,
  submission: ThreeElementSubmission,
  requiresRegimeCheckpoint: boolean,
): Promise<SubmitLabResult> {
  const validation = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint });
  const rubric = scoreThreeElementSubmission(submission);

  const { data: existing } = await supabase
    .from("school_learning_labs")
    .select("attempt_count")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("lab_id", labId)
    .maybeSingle();

  const { error } = await supabase.from("school_learning_labs").upsert(
    {
      user_id: userId,
      program_id: SCHOOL_CURRICULUM_PROGRAM_ID,
      lab_id: labId,
      lab_type: labType,
      signal: submission.signal,
      bull_case: submission.bull,
      bear_case: submission.bear,
      operator_decision: submission.operator,
      regime_checkpoint: submission.regime ?? null,
      status: validation.ok ? "passed" : "needs_revision",
      score: rubric.total,
      score_breakdown: rubric,
      attempt_count: (existing?.attempt_count ?? 0) + 1,
      curriculum_version: CURRICULUM_VERSION,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,program_id,lab_id" },
  );
  if (error) return { ok: false, error: error.message };
  if (!validation.ok) return { ok: true, passed: false, errors: validation.errors };

  return { ok: true, passed: true, shouldCheckWallStreetSchoolCompleted: labId === CAPSTONE_LAB_ID };
}

/**
 * Writes `live_trading_restrictions.wall_street_school_completed_at` once
 * every Academy 8 capstone lesson (not W2) has passed AND the capstone
 * dossier lab has passed. `service` must be a service-role client — same
 * posture as `completeSchoolReverification` in lib/school/service.ts for
 * the sibling `school_completed_at` field on the same table.
 */
export async function maybeWriteWallStreetSchoolCompleted(service: SupabaseClient, userId: string): Promise<boolean> {
  const capstoneLessons = wallStreetCapstoneLessons();
  const { data: progressRows } = await service
    .from("school_lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("status", "passed");
  const passedIds = new Set((progressRows ?? []).map((r) => r.lesson_id as string));
  const allLessonsPassed = capstoneLessons.every((l) => passedIds.has(l.id));
  if (!allLessonsPassed) return false;

  const { data: lab } = await service
    .from("school_learning_labs")
    .select("status")
    .eq("user_id", userId)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("lab_id", CAPSTONE_LAB_ID)
    .maybeSingle();
  if (lab?.status !== "passed") return false;

  const { data: existing } = await service
    .from("live_trading_restrictions")
    .select("wall_street_school_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.wall_street_school_completed_at) return false;

  const { error } = await service.from("live_trading_restrictions").upsert({
    user_id: userId,
    wall_street_school_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`gsps-school: wall_street_school_completed_at not written for ${userId} — ${error.message}`);
    return false;
  }
  return true;
}

/** Server-side, unbypassable-from-client check used by the checkout route. */
export async function isWallStreetSchoolCompleted(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("live_trading_restrictions")
    .select("wall_street_school_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.wall_street_school_completed_at != null;
}
