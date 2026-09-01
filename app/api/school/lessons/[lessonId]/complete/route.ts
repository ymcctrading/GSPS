import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordLessonAttempt, getProgramProgress, completeSchoolReverification } from "@/lib/school/service";

const RequestSchema = z.object({ answers: z.array(z.number().int().nonnegative()) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { lessonId } = await params;
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await recordLessonAttempt(supabase, user.id, { lessonId, answers: parsed.data.answers });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const progress = await getProgramProgress(supabase, user.id);
  let reverified = false;
  if (progress.complete) {
    const service = createServiceClient();
    const outcome = await completeSchoolReverification(service, user.id);
    reverified = outcome.ok;
  }

  return NextResponse.json({ passed: result.passed, score: result.score, progress, reverified });
}
