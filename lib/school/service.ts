/**
 * GSPS School pilot — grading, progress, and the one write this program
 * exists for: lifting a live-trading restriction by finally putting a
 * timestamp in `live_trading_restrictions.school_completed_at`
 * (`lib/risk/live-trade-loss.ts`'s `isLiveTradingRestricted` has read that
 * column since migration 0052; nothing ever wrote it until now).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIVE_TRADING_RECERTIFICATION_PROGRAM_ID,
  getLesson,
  getPublishedLessons,
  type SchoolLesson,
} from "@/lib/school/content";

export interface GradeQuizArgs {
  lessonId: string;
  answers: readonly number[];
}

export interface GradeQuizResult {
  ok: boolean;
  error?: string;
  passed?: boolean;
  score?: number;
}

/** Pure grading: every question must be answered correctly to pass. */
export function gradeQuiz(lesson: SchoolLesson, answers: readonly number[]): { passed: boolean; score: number } {
  if (answers.length !== lesson.quiz.length) {
    return { passed: false, score: 0 };
  }
  const correct = lesson.quiz.filter((q, i) => answers[i] === q.correctIndex).length;
  const score = lesson.quiz.length === 0 ? 0 : correct / lesson.quiz.length;
  return { passed: correct === lesson.quiz.length, score };
}

/**
 * Records one attempt at a lesson's quiz for `userId`, using the
 * caller-supplied user-scoped client (RLS restricts this to the caller's
 * own row). Does not lift any restriction itself — see
 * `completeSchoolReverification` for that, which requires every published
 * lesson to be passed, not just this one.
 */
export async function recordLessonAttempt(
  supabase: SupabaseClient,
  userId: string,
  args: GradeQuizArgs,
): Promise<GradeQuizResult> {
  const lesson = getLesson(args.lessonId);
  if (!lesson) return { ok: false, error: `Unknown lesson "${args.lessonId}"` };
  if (!getPublishedLessons().some((l) => l.id === lesson.id)) {
    return { ok: false, error: `Lesson "${args.lessonId}" is not published` };
  }
  for (const prereqId of lesson.prerequisites) {
    const { data: prereqRow } = await supabase
      .from("school_lesson_progress")
      .select("status")
      .eq("user_id", userId)
      .eq("program_id", LIVE_TRADING_RECERTIFICATION_PROGRAM_ID)
      .eq("lesson_id", prereqId)
      .maybeSingle();
    if (prereqRow?.status !== "passed") {
      return { ok: false, error: `Complete "${prereqId}" before attempting "${lesson.id}".` };
    }
  }

  const { passed, score } = gradeQuiz(lesson, args.answers);

  const { data: existing } = await supabase
    .from("school_lesson_progress")
    .select("attempt_count, status")
    .eq("user_id", userId)
    .eq("program_id", LIVE_TRADING_RECERTIFICATION_PROGRAM_ID)
    .eq("lesson_id", lesson.id)
    .maybeSingle();

  const alreadyPassed = existing?.status === "passed";
  const nextAttemptCount = (existing?.attempt_count ?? 0) + 1;

  const { error } = await supabase
    .from("school_lesson_progress")
    .upsert(
      {
        user_id: userId,
        program_id: LIVE_TRADING_RECERTIFICATION_PROGRAM_ID,
        lesson_id: lesson.id,
        status: alreadyPassed || passed ? "passed" : "in_progress",
        attempt_count: nextAttemptCount,
        score,
        completed_at: alreadyPassed ? undefined : passed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,program_id,lesson_id" },
    );
  if (error) return { ok: false, error: error.message };

  return { ok: true, passed: alreadyPassed || passed, score };
}

export interface ProgramProgress {
  totalLessons: number;
  passedLessons: number;
  complete: boolean;
}

export async function getProgramProgress(supabase: SupabaseClient, userId: string): Promise<ProgramProgress> {
  const published = getPublishedLessons();
  const { data } = await supabase
    .from("school_lesson_progress")
    .select("lesson_id, status")
    .eq("user_id", userId)
    .eq("program_id", LIVE_TRADING_RECERTIFICATION_PROGRAM_ID)
    .eq("status", "passed");

  const passedIds = new Set((data ?? []).map((r) => r.lesson_id as string));
  const passedLessons = published.filter((l) => passedIds.has(l.id)).length;
  return { totalLessons: published.length, passedLessons, complete: passedLessons === published.length };
}

export interface CompleteReverificationResult {
  ok: boolean;
  error?: string;
}

/**
 * The write `live_trading_restrictions.school_completed_at` existed for
 * without one. Requires every published lesson passed; requires a
 * service-role client since regular users only have select on
 * `live_trading_restrictions` (0052's RLS is read-only by design — this is
 * the one account-wide, security-relevant field on it, same as the
 * restriction write itself in `forceCloseAndRestrict`).
 */
export async function completeSchoolReverification(
  service: SupabaseClient,
  userId: string,
): Promise<CompleteReverificationResult> {
  const progress = await getProgramProgress(service, userId);
  if (!progress.complete) {
    return { ok: false, error: `${progress.passedLessons}/${progress.totalLessons} lessons passed — program not complete.` };
  }

  const { error } = await service.from("live_trading_restrictions").upsert({
    user_id: userId,
    school_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
