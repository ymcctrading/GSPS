/**
 * GSPS — /api/school/exam/[transition]
 *
 * The graduation exam for Novice -> Pro (`novice_to_pro`) or Pro -> Expert
 * (`pro_to_expert`). GET reports whether it's passed and returns an attempt in
 * progress; POST `{ action: "start" }` starts one; POST `{ action: "submit",
 * attemptId, answers }` grades it. The answer key never leaves the server
 * until an attempt is graded. See lib/school/graduationExam.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { EXAM_TRANSITIONS, retakeAvailableAt, type ExamTransition } from "@/lib/school/graduationExam";
import { examPassedAt, latestAttempt, startAttempt, submitAttempt, viewsOf } from "@/lib/school/examService";

const TIER_FOR: Record<ExamTransition, string> = { novice_to_pro: "PRACTICE", pro_to_expert: "STANDARD" };

const AnswerSchema = z.object({
  trend: z.enum(["up", "down", "sideways"]).optional(),
  decision: z.enum(["trade", "wait"]).optional(),
  entryChoiceId: z.string().max(8).optional(),
  stopChoiceId: z.string().max(8).optional(),
  shares: z.number().int().min(0).max(1_000_000).optional(),
});
const PostSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("submit"), attemptId: z.string().uuid(), answers: z.array(AnswerSchema).max(20) }),
]);

async function auth(transitionParam: string) {
  const transition = transitionParam as ExamTransition;
  if (!EXAM_TRANSITIONS.includes(transition)) return { error: NextResponse.json({ error: "Unknown exam." }, { status: 404 }) };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { transition, user, supabase };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ transition: string }> }) {
  const a = await auth((await ctx.params).transition);
  if ("error" in a) return a.error;
  const service = createServiceClient();
  const [passedAt, last, tier] = await Promise.all([
    examPassedAt(service, a.user.id, a.transition),
    latestAttempt(service, a.user.id, a.transition),
    getUserTier(a.supabase, a.user.id),
  ]);
  return NextResponse.json({
    transition: a.transition,
    eligible: tier === TIER_FOR[a.transition],
    passedAt,
    attempt: last && !last.graded_at ? { id: last.id, scenarios: viewsOf(last) } : null,
    lastScore: last?.graded_at ? last.score : null,
    retakeAt: last?.graded_at && !last.passed ? retakeAvailableAt(last.graded_at).toISOString() : null,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ transition: string }> }) {
  const a = await auth((await ctx.params).transition);
  if ("error" in a) return a.error;
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const tier = await getUserTier(a.supabase, a.user.id);
  if (tier !== TIER_FOR[a.transition]) return NextResponse.json({ error: "This exam is for a different tier." }, { status: 403 });
  const service = createServiceClient();

  if (parsed.data.action === "start") {
    const r = await startAttempt(service, a.user.id, a.transition);
    if (!r.ok) return NextResponse.json({ error: r.error, retakeAt: r.retakeAt ?? null }, { status: r.status });
    return NextResponse.json({ attempt: { id: r.attempt.id, scenarios: viewsOf(r.attempt) } });
  }
  const r = await submitAttempt(service, a.user.id, parsed.data.attemptId, parsed.data.answers);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ grade: r.grade });
}
