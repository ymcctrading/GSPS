import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurriculumMap } from "@/lib/school/curriculum-service";
import { SCHOOL_PROGRAMS, allCurriculumLessons } from "@/lib/school/curriculum";

/**
 * Full learner progress + the learning-to-behavior trace ("Correspondence"
 * in the spec's hermetic-audit source, presented here in plain
 * educational-governance language): for each gate-relevant lesson, which
 * recorded field it feeds and what real consequence that has.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [map, { data: promotionProgress }, { data: restriction }] = await Promise.all([
    getCurriculumMap(supabase, user.id),
    supabase
      .from("promotion_progress")
      .select("education_completed_at, practice_validation_completed_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("live_trading_restrictions")
      .select("wall_street_school_completed_at, school_completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const gateTrace = [
    {
      lesson: "Academy 1-3 (Foundations, excluding paper validation)",
      lab: null,
      recordedField: "promotion_progress.education_completed_at",
      consequence: "Additive input to Pro (Novice→Pro) promotion eligibility — never replaces trade count, account age, execution score, stop adherence, or position-size compliance.",
      met: promotionProgress?.education_completed_at != null,
    },
    {
      lesson: "Academy 3 — Paper-Trading Validation",
      lab: null,
      recordedField: "promotion_progress.practice_validation_completed_at",
      consequence: "Additive input to Pro promotion eligibility, tracked separately from education_completed_at.",
      met: promotionProgress?.practice_validation_completed_at != null,
    },
    {
      lesson: "Academy 8 — Capstone (not Course W2)",
      lab: "academy-8/capstone/capstone-dossier",
      recordedField: "live_trading_restrictions.wall_street_school_completed_at",
      consequence: "Required server-side before Wall Street (System Mastery) checkout.",
      met: restriction?.wall_street_school_completed_at != null,
    },
    {
      lesson: "Course W2 — Live-Trading Risk Re-Certification (pilot, unchanged)",
      lab: null,
      recordedField: "live_trading_restrictions.school_completed_at",
      consequence: "Lifts a live-trading restriction after a 50% live-loss event. Never used as proof of pre-purchase Wall Street readiness.",
      met: restriction?.school_completed_at != null,
    },
  ];

  return NextResponse.json({
    programs: SCHOOL_PROGRAMS,
    academies: map.map((entry) => ({
      id: entry.academy.id,
      title: entry.academy.title,
      gateStatus: entry.academy.gateStatus,
      complete: entry.complete,
      passedLessons: entry.passedLessons,
      totalLessons: entry.totalLessons,
    })),
    totalLessonsInCurriculum: allCurriculumLessons().length,
    gateTrace,
  });
}
