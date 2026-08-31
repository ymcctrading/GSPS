/**
 * GSPS — /api/automation/profiles
 * POST: activate a new plan-scoped automation profile (Wall Street only).
 * GET:  list the caller's automation profiles.
 *
 * The client sends `planId`/`automationMode`/`executionMode`/`configuration`
 * (a bounded allocation, not raw order terms) — see
 * lib/automation/service.ts for the server-side entitlement, plan-
 * eligibility, and immutable-execution-mode enforcement.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { activateAutomationProfile } from "@/lib/automation/service";

const ActivateSchema = z.object({
  planId: z.string().uuid(),
  automationMode: z.enum(["system_plan", "guided_custom"]),
  executionMode: z.enum(["paper", "live"]),
  configuration: z.object({
    allocatedDollarRisk: z.number().positive(),
  }),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = ActivateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await activateAutomationProfile(supabase, user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ profileId: result.profileId }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("automation_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}
