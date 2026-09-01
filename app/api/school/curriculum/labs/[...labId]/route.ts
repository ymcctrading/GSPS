import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SCHOOL_CURRICULUM_PROGRAM_ID, getLesson } from "@/lib/school/curriculum";
import { submitLearningLab, maybeWriteWallStreetSchoolCompleted } from "@/lib/school/curriculum-service";
import { OPERATOR_ACTIONS } from "@/lib/school/bull-bear";

function labIdFromParams(segments: string[]): string {
  return segments.join("/");
}

const SignalSchema = z.object({
  instrument: z.string(),
  timeframe: z.string(),
  setupOrState: z.string(),
  evidence: z.string(),
  uncertainty: z.string(),
  catalystOrEventContext: z.string(),
  sourceProvenance: z.string(),
});
const BullSchema = z.object({
  thesis: z.string(),
  supportingEvidence: z.string(),
  confirmation: z.string(),
  entryCondition: z.string(),
  upsideScenario: z.string(),
  target: z.string(),
  thesisWeakeningConditions: z.string(),
});
const BearSchema = z.object({
  contradictoryEvidence: z.string(),
  invalidation: z.string(),
  hardStop: z.string(),
  liquidityVolatilityEventRisk: z.string(),
  positionSizeConsequence: z.string(),
});
const OperatorSchema = z.object({
  action: z.enum(OPERATOR_ACTIONS as unknown as [string, ...string[]]),
  nextObservableCondition: z.string(),
  riskAction: z.string(),
  reversalCondition: z.string(),
});
const RegimeSchema = z
  .object({
    trendRangeTransition: z.enum(["trend", "range", "transition", "dislocation"]),
    volatilityState: z.string(),
    liquidity: z.string(),
    scheduledCatalyst: z.string(),
    controllingTimeframe: z.string(),
    conflictingTimeframeEvidence: z.string(),
    disqualifier: z.string(),
    actionState: z.enum(OPERATOR_ACTIONS as unknown as [string, ...string[]]),
  })
  .optional();

const RequestSchema = z.object({
  labType: z.string(),
  signal: SignalSchema,
  bull: BullSchema,
  bear: BearSchema,
  operator: OperatorSchema,
  regime: RegimeSchema,
});

/** This learner's existing submission for one lab, if any. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ labId: string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const labId = labIdFromParams((await params).labId);
  const { data } = await supabase
    .from("school_learning_labs")
    .select("*")
    .eq("user_id", user.id)
    .eq("program_id", SCHOOL_CURRICULUM_PROGRAM_ID)
    .eq("lab_id", labId)
    .maybeSingle();

  return NextResponse.json({ submission: data ?? null });
}

/** Submits (or resubmits) a Three-Element Method lab. Every field is validated server-side — see lib/school/bull-bear.ts. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ labId: string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const labId = labIdFromParams((await params).labId);
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  // A lab is scoped to one lesson id in this pass (lesson.id === labId) —
  // used only to read whether a regime checkpoint is required, never to
  // trust client-supplied gate status.
  const found = getLesson(labId);
  const requiresRegimeCheckpoint = found?.lesson.bullBear?.requiresRegimeCheckpoint ?? false;

  const result = await submitLearningLab(
    supabase,
    user.id,
    labId,
    parsed.data.labType,
    {
      signal: parsed.data.signal,
      bull: parsed.data.bull,
      bear: parsed.data.bear,
      operator: parsed.data.operator as never,
      regime: parsed.data.regime as never,
    },
    requiresRegimeCheckpoint,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  let wroteWallStreetSchoolCompleted = false;
  if (result.shouldCheckWallStreetSchoolCompleted) {
    const service = createServiceClient();
    wroteWallStreetSchoolCompleted = await maybeWriteWallStreetSchoolCompleted(service, user.id);
  }

  return NextResponse.json({ passed: result.passed, errors: result.errors ?? [], wroteWallStreetSchoolCompleted });
}
