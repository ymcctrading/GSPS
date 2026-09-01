import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurriculumMap } from "@/lib/school/curriculum-service";
import { SCHOOL_PROGRAMS } from "@/lib/school/curriculum";

/** The curriculum map: all 8 academies with lock/complete state for the signed-in learner, plus the 4 entitlement-aware programs. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const map = await getCurriculumMap(supabase, user.id);
  return NextResponse.json({
    programs: SCHOOL_PROGRAMS,
    academies: map.map((entry) => ({
      id: entry.academy.id,
      slug: entry.academy.slug,
      number: entry.academy.number,
      title: entry.academy.title,
      outcome: entry.academy.outcome,
      programIds: entry.academy.programIds,
      gateStatus: entry.academy.gateStatus,
      unlocked: entry.unlocked,
      complete: entry.complete,
      passedLessons: entry.passedLessons,
      totalLessons: entry.totalLessons,
      courses: entry.academy.courses.map((c) => ({ id: c.id, slug: c.slug, title: c.title, lessonCount: c.lessons.length })),
    })),
  });
}
