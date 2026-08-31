import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requestStopOverride } from "@/lib/risk/stop-override";

const RequestSchema = z.object({
  positionId: z.string().uuid(),
  symbol: z.string().min(1),
  action: z.enum(["widen", "remove"]),
  requestedNewStop: z.number().positive().nullable(),
  warningAcknowledged: z.boolean(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const verificationBaseUrl = new URL("/api/risk/stop-override/confirm", req.nextUrl.origin).toString();
  const result = await requestStopOverride(supabase, user.id, { ...parsed.data, verificationBaseUrl });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ overrideId: result.overrideId }, { status: 201 });
}
