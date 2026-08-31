/**
 * Live-only stop widen/remove, per the spec's live-only risk policy:
 * "Wall Street member may widen or remove [the default stop] only after a
 * high-friction warning, verified email delivery, verified phone/SMS
 * delivery." See 0052_live_trade_loss_policy.sql's header for why
 * `verified_phone` can never become true in this repo today (no SMS
 * provider) — the gate below requires verified email only, and documents
 * that narrowing rather than silently requiring an unreachable phone step.
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendStopOverrideVerificationEmail } from "@/lib/notifications/live-risk-email";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes — high-friction, not indefinite.

export interface RequestStopOverrideArgs {
  positionId: string;
  symbol: string;
  action: "widen" | "remove";
  requestedNewStop: number | null;
  warningAcknowledged: boolean;
  verificationBaseUrl: string;
}

export interface RequestStopOverrideResult {
  ok: boolean;
  error?: string;
  overrideId?: string;
}

/**
 * Step 1: the high-friction warning must already be acknowledged by the
 * caller (a UI-side confirmation checkbox — this function refuses without
 * it) before it will even send the verification email. Step 2, approval,
 * only happens when the emailed link is clicked (`confirmStopOverride`).
 */
export async function requestStopOverride(
  supabase: SupabaseClient,
  userId: string,
  args: RequestStopOverrideArgs,
): Promise<RequestStopOverrideResult> {
  if (!args.warningAcknowledged) {
    return { ok: false, error: "The high-friction risk warning must be acknowledged before requesting a stop override." };
  }
  if (args.action === "widen" && (args.requestedNewStop == null || !Number.isFinite(args.requestedNewStop))) {
    return { ok: false, error: "A widened stop requires a valid requestedNewStop." };
  }

  const token = randomBytes(24).toString("hex");
  const { data, error } = await supabase
    .from("live_stop_overrides")
    .insert({
      user_id: userId,
      position_id: args.positionId,
      action: args.action,
      requested_new_stop: args.requestedNewStop,
      warning_acknowledged: true,
      verification_token: token,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: userRecord } = await supabase.auth.admin.getUserById(userId);
  const email = userRecord?.user?.email;
  if (email) {
    await sendStopOverrideVerificationEmail({
      userEmail: email,
      symbol: args.symbol,
      action: args.action,
      verificationUrl: `${args.verificationBaseUrl}?token=${token}`,
    }).catch((err) => console.error(`requestStopOverride: verification email failed — ${String(err)}`));
  }

  return { ok: true, overrideId: data.id as string };
}

export interface ConfirmStopOverrideResult {
  ok: boolean;
  error?: string;
}

/** Step 2: the verified-email confirmation link lands here. */
export async function confirmStopOverride(
  supabase: SupabaseClient,
  token: string,
): Promise<ConfirmStopOverrideResult> {
  const { data: row, error } = await supabase
    .from("live_stop_overrides")
    .select("*")
    .eq("verification_token", token)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "No pending stop-override request for this link." };

  const requestedAt = new Date(row.requested_at as string).getTime();
  if (Date.now() - requestedAt > TOKEN_TTL_MS) {
    await supabase.from("live_stop_overrides").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: false, error: "This confirmation link has expired. Request the override again." };
  }

  const { data: positionRow } = await supabase
    .from("positions")
    .select("mode")
    .eq("id", row.position_id)
    .maybeSingle();
  if (positionRow?.mode !== "live") {
    return { ok: false, error: "This override no longer applies — the position is not an open live position." };
  }

  const { error: updateErr } = await supabase
    .from("live_stop_overrides")
    .update({ status: "approved", verified_email: true, resolved_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  if (row.action === "remove") {
    await supabase.from("positions").update({ stop_loss: null }).eq("id", row.position_id);
  } else if (row.requested_new_stop != null) {
    await supabase.from("positions").update({ stop_loss: row.requested_new_stop }).eq("id", row.position_id);
  }

  return { ok: true };
}
