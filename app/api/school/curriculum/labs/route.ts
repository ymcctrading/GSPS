import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACADEMIES, SCHOOL_CURRICULUM_PROGRAM_ID } from "@/lib/school/curriculum";

/** Every lab-bearing lesson across the curriculum, with this learner's submission status — backs /school/labs. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: labs } = await supabase
    .from("school_learning_labs")
    .select("lab_id, lab_type, status, updated_at")
    .eq("user_id", user.id)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID);
  const byId = new Map((labs ?? []).map((l) => [l.lab_id as string, l]));

  const entries = ACADEMIES.flatMap((academy) =>
    academy.courses.flatMap((course) =>
      course.lessons
        .filter((lesson) => lesson.bullBear)
        .map((lesson) => ({
          academyTitle: academy.title,
          courseTitle: course.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          scenarioBasis: lesson.bullBear?.scenarioBasis,
          status: byId.get(lesson.id)?.status ?? "not_started",
          updatedAt: byId.get(lesson.id)?.updated_at ?? null,
        })),
    ),
  );

  return NextResponse.json({ labs: entries });
}
