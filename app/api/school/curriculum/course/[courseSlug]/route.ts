import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourse, SCHOOL_CURRICULUM_PROGRAM_ID } from "@/lib/school/curriculum";
import { academyUnlocked } from "@/lib/school/curriculum-service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ courseSlug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { courseSlug } = await params;
  const found = getCourse(courseSlug);
  if (!found) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data: progressRows } = await supabase
    .from("school_lesson_progress")
    .select("lesson_id, status")
    .eq("user_id", user.id)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID);
  const passedIds = new Set((progressRows ?? []).filter((r) => r.status === "passed").map((r) => r.lesson_id as string));

  return NextResponse.json({
    academy: { id: found.academy.id, slug: found.academy.slug, title: found.academy.title, number: found.academy.number, unlocked: academyUnlocked(found.academy, passedIds) },
    course: {
      id: found.course.id,
      slug: found.course.slug,
      title: found.course.title,
      outcome: found.course.outcome,
      lessons: found.course.lessons.map((l, i) => ({
        id: l.id,
        title: l.title,
        estimatedMinutes: l.estimatedMinutes,
        passed: passedIds.has(l.id),
        // A lesson unlocks once every lesson before it in the same course
        // has passed — in-course sequencing, distinct from academy-level
        // prerequisite locking (which the academy.unlocked flag covers).
        unlocked: i === 0 || passedIds.has(found.course.lessons[i - 1].id),
      })),
    },
  });
}
