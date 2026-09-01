import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getLesson, SCHOOL_CURRICULUM_PROGRAM_ID } from "@/lib/school/curriculum";
import {
  recordCurriculumLessonAttempt,
  academyUnlocked,
  maybeWriteEducationCompleted,
  maybeWritePracticeValidationCompleted,
} from "@/lib/school/curriculum-service";

function lessonIdFromParams(segments: string[]): string {
  return segments.join("/");
}

/** Lesson detail (no answer keys) plus this learner's progress and academy lock state. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ lessonId: string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { lessonId: segments } = await params;
  const lessonId = lessonIdFromParams(segments);
  const found = getLesson(lessonId);
  if (!found) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const { data: progressRows } = await supabase
    .from("school_lesson_progress")
    .select("lesson_id, status, attempt_count, score, completed_at")
    .eq("user_id", user.id)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID);
  const passedIds = new Set((progressRows ?? []).filter((r) => r.status === "passed").map((r) => r.lesson_id as string));
  const own = (progressRows ?? []).find((r) => r.lesson_id === lessonId) ?? null;

  const unlocked = academyUnlocked(found.academy, passedIds);

  return NextResponse.json({
    academy: { id: found.academy.id, slug: found.academy.slug, title: found.academy.title },
    course: { id: found.course.id, slug: found.course.slug, title: found.course.title },
    lesson: {
      id: found.lesson.id,
      title: found.lesson.title,
      objectives: found.lesson.objectives,
      estimatedMinutes: found.lesson.estimatedMinutes,
      instruction: found.lesson.instruction,
      application: found.lesson.application,
      questions: found.lesson.quiz.map((q) => ({ question: q.question, choices: q.choices })),
      bullBear: found.lesson.bullBear ?? null,
      metricsShown: found.lesson.metricsShown ?? null,
    },
    unlocked,
    progress: own ?? { status: "not_started", attempt_count: 0 },
  });
}

const RequestSchema = z.object({ answers: z.array(z.number().int().nonnegative()) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { lessonId: segments } = await params;
  const lessonId = lessonIdFromParams(segments);
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await recordCurriculumLessonAttempt(supabase, user.id, lessonId, parsed.data.answers);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // education_completed_at / practice_validation_completed_at are
  // account-wide fields with no client write policy (0046) — the same
  // posture as the pilot's completeSchoolReverification — so the actual
  // gate write runs on a service-role client, separate from the
  // user-scoped progress write above.
  let wroteEducationCompleted = false;
  let wrotePracticeValidationCompleted = false;
  if (result.shouldCheckEducationCompleted || result.shouldCheckPracticeValidation) {
    const service = createServiceClient();
    if (result.shouldCheckEducationCompleted) {
      wroteEducationCompleted = await maybeWriteEducationCompleted(service, user.id);
    }
    if (result.shouldCheckPracticeValidation) {
      wrotePracticeValidationCompleted = await maybeWritePracticeValidationCompleted(service, user.id);
    }
  }

  return NextResponse.json({
    passed: result.passed,
    score: result.score,
    wroteEducationCompleted,
    wrotePracticeValidationCompleted,
  });
}
