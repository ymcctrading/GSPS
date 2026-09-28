/**
 * Server side of the graduation exams (`lib/school/graduationExam.ts`):
 * starting an attempt (fetching the charts and fixing the answer key),
 * grading it, and reading whether a student has passed. Writes go through the
 * service role only; `graduation_exam_attempts` (migration 0084) is
 * owner-readable and otherwise closed, because a pass gates promotion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketDataProvider } from "@/lib/data/provider";
import {
  buildScenario,
  gradeExam,
  pickScenarioSeeds,
  retakeAvailableAt,
  SCENARIOS_PER_EXAM,
  type ExamGrade,
  type ExamTransition,
  type ScenarioAnswer,
  type ScenarioView,
  type StoredScenario,
} from "@/lib/school/graduationExam";

export interface AttemptRow {
  id: string;
  user_id: string;
  transition: ExamTransition;
  scenarios: StoredScenario[];
  answers: ScenarioAnswer[] | null;
  score: number | null;
  passed: boolean | null;
  started_at: string;
  graded_at: string | null;
}

/** When the student passed this exam, or null. Fails closed on a read error. */
export async function examPassedAt(service: SupabaseClient, userId: string, transition: ExamTransition): Promise<string | null> {
  const { data, error } = await service
    .from("graduation_exam_attempts")
    .select("graded_at")
    .eq("user_id", userId)
    .eq("transition", transition)
    .eq("passed", true)
    .order("graded_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { graded_at: string | null } | null)?.graded_at ?? null;
}

export async function latestAttempt(service: SupabaseClient, userId: string, transition: ExamTransition): Promise<AttemptRow | null> {
  const { data } = await service
    .from("graduation_exam_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("transition", transition)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

export function viewsOf(attempt: AttemptRow): ScenarioView[] {
  return attempt.scenarios.map((s) => s.view);
}

export type StartResult =
  | { ok: true; attempt: AttemptRow }
  | { ok: false; status: number; error: string; retakeAt?: string };

export async function startAttempt(service: SupabaseClient, userId: string, transition: ExamTransition, now = new Date()): Promise<StartResult> {
  const last = await latestAttempt(service, userId, transition);
  if (last && !last.graded_at) return { ok: true, attempt: last };
  if (last?.passed) return { ok: false, status: 409, error: "You've already passed this exam." };
  if (last?.graded_at) {
    const at = retakeAvailableAt(last.graded_at);
    if (at > now) return { ok: false, status: 429, error: "You can retake the exam after a short break.", retakeAt: at.toISOString() };
  }

  const provider = getMarketDataProvider();
  const scenarios: StoredScenario[] = [];
  const seed = Math.floor(now.getTime() / 1000) ^ userId.length;
  const candidates = pickScenarioSeeds(seed, now, SCENARIOS_PER_EXAM * 2);
  for (const [i, c] of candidates.entries()) {
    if (scenarios.length >= SCENARIOS_PER_EXAM) break;
    try {
      const asOf = new Date(`${c.asOf}T00:00:00Z`);
      const bars = await provider.fetchBars(
        c.symbol,
        "1Day",
        new Date(asOf.getTime() - 500 * 86_400_000),
        new Date(asOf.getTime() + 60 * 86_400_000),
        "us_equity",
      );
      const s = buildScenario(c.symbol, c.asOf, bars, seed + i);
      if (s) scenarios.push(s);
    } catch {
      // Try the next candidate.
    }
  }
  if (scenarios.length < SCENARIOS_PER_EXAM) {
    return { ok: false, status: 503, error: "Couldn't load the exam's charts right now. Please try again shortly." };
  }

  const { data, error } = await service
    .from("graduation_exam_attempts")
    .insert({ user_id: userId, transition, scenarios })
    .select("*")
    .single();
  if (error || !data) return { ok: false, status: 502, error: error?.message ?? "Couldn't start the exam." };
  return { ok: true, attempt: data as AttemptRow };
}

export type SubmitResult = { ok: true; grade: ExamGrade } | { ok: false; status: number; error: string };

export async function submitAttempt(
  service: SupabaseClient,
  userId: string,
  attemptId: string,
  answers: ScenarioAnswer[],
): Promise<SubmitResult> {
  const { data } = await service
    .from("graduation_exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  const attempt = data as AttemptRow | null;
  if (!attempt) return { ok: false, status: 404, error: "Exam attempt not found." };
  if (attempt.graded_at) return { ok: false, status: 409, error: "This attempt has already been graded." };

  const grade = gradeExam(attempt.transition, attempt.scenarios, answers);
  // Conditional on still being ungraded, so a double submit can't grade twice.
  const { data: updated, error } = await service
    .from("graduation_exam_attempts")
    .update({ answers, score: grade.score, passed: grade.passed, graded_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("user_id", userId)
    .is("graded_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, status: 502, error: error.message };
  if (!updated) return { ok: false, status: 409, error: "This attempt has already been graded." };
  return { ok: true, grade };
}
