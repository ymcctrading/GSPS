import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requiresResetChecklist, validateResetChecklist, type ResetChecklist } from "@/lib/risk/cooldown";
import { lastResetChecklistAt } from "@/lib/risk/service";
import type { CircuitState } from "@/lib/risk/config";

/**
 * The reset checklist a member completes before new entries resume out of a
 * hard cooldown or any lock (lib/risk/cooldown.ts#applyResetChecklistHold;
 * docs/SYNTHESIZED_ROADMAP.md Part 5 item 16).
 *
 * GET  — the account's circuit state and whether a checklist is due.
 * POST — `{ accountValue, currentOpenRiskUsd, ruleBreach, correlationExposure,
 *        revisedPlan }`. Validated, then written on the service role
 *        (migration 0042 gives members no write), tied to the transition it
 *        resets out of. Completing it never shortens a hold still running:
 *        the circuit breaker only reads it once the hold's days are done.
 */

interface CircuitRow {
  state: CircuitState;
  triggered_at: string;
  reason: string;
}

async function readStatus(userId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("risk_circuit_state")
    .select("state, triggered_at, reason")
    .eq("profile_id", userId)
    .maybeSingle();
  const row = data as CircuitRow | null;
  const state: CircuitState = row?.state ?? "normal";
  const lastCompletedAt = await lastResetChecklistAt(service, userId);
  const due =
    row != null &&
    requiresResetChecklist(state) &&
    !(lastCompletedAt && lastCompletedAt >= new Date(row.triggered_at));
  return { service, row, state, lastCompletedAt, due };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { row, state, lastCompletedAt, due } = await readStatus(user.id);
  return NextResponse.json({
    state,
    reason: row?.reason ?? null,
    triggeredAt: row?.triggered_at ?? null,
    due,
    lastCompletedAt: lastCompletedAt?.toISOString() ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<Record<keyof ResetChecklist, unknown>>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const checklist: Partial<ResetChecklist> = {
    accountValue: typeof body.accountValue === "number" ? body.accountValue : undefined,
    currentOpenRiskUsd: typeof body.currentOpenRiskUsd === "number" ? body.currentOpenRiskUsd : undefined,
    ruleBreach: body.ruleBreach === null ? null : text(body.ruleBreach, 2000) || null,
    correlationExposure: text(body.correlationExposure, 2000),
    revisedPlan: text(body.revisedPlan, 4000),
  };
  const validation = validateResetChecklist(checklist);
  if (!validation.complete) {
    return NextResponse.json({ error: "Every part of the checklist is needed.", missingFields: validation.missingFields }, { status: 400 });
  }
  if ((checklist.accountValue as number) < 0 || (checklist.currentOpenRiskUsd as number) < 0) {
    return NextResponse.json({ error: "Account value and open risk can't be negative." }, { status: 400 });
  }

  const { service, due } = await readStatus(user.id);
  if (!due) {
    return NextResponse.json({ error: "No reset checklist is due on this account." }, { status: 409 });
  }

  const { data: audit } = await service
    .from("risk_circuit_audit_log")
    .select("id")
    .eq("profile_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await service.from("risk_reset_checklists").insert({
    profile_id: user.id,
    circuit_audit_log_id: (audit as { id: string } | null)?.id ?? null,
    account_value: checklist.accountValue,
    current_open_risk_usd: checklist.currentOpenRiskUsd,
    rule_breach: checklist.ruleBreach,
    correlation_exposure: checklist.correlationExposure,
    revised_plan: checklist.revisedPlan,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
