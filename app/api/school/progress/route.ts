import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublishedLessons } from "@/lib/school/content";
import { getProgramProgress } from "@/lib/school/service";

/** Lesson list (no answer keys) plus this member's pass/fail state per lesson. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: progressRows } = await supabase
    .from("school_lesson_progress")
    .select("lesson_id, status, attempt_count")
    .eq("user_id", user.id);
  const progressByLesson = new Map((progressRows ?? []).map((r) => [r.lesson_id as string, r]));

  const lessons = getPublishedLessons().map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    objectives: lesson.objectives,
    prerequisites: lesson.prerequisites,
    instruction: lesson.instruction,
    application: lesson.application,
    questions: lesson.quiz.map((q) => ({ question: q.question, choices: q.choices })),
    progress: progressByLesson.get(lesson.id) ?? { status: "not_started", attempt_count: 0 },
  }));

  const progress = await getProgramProgress(supabase, user.id);
  return NextResponse.json({ lessons, progress });
}
