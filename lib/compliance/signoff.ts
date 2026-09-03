/**
 * Compliance sign-off gate — reads `compliance_signoffs`
 * (0059_compliance_signoffs.sql), the durable, out-of-band ledger of actual
 * human/firm review decisions.
 *
 * `isFeatureAuthorized` is the only thing code should ever call. It answers
 * one question: has an active (non-revoked) sign-off for this feature been
 * recorded? Nothing in this file, or anywhere else in this codebase, ever
 * inserts a row here — that insert is a deliberate, out-of-band act by a
 * qualified human, using `recordSignoff` directly against the service-role
 * client (e.g. from a one-off script or the Supabase SQL editor), not
 * something a deploy or a feature flag can trigger. An AI coding agent can
 * build the controls a review requires and can prepare the review document
 * itself (see docs/AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md), but cannot
 * grant the review — that authority stays outside this code entirely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ComplianceFeature = "autonomous_live_trading";

/**
 * True only if `compliance_signoffs` holds a row for `feature` with
 * `revoked_at is null`. Fails closed: any query error, missing table, or
 * absent row all resolve to `false` — the same "unset/unreadable means not
 * authorized" direction `TRADING_DISABLED` and `killSwitchRefusal` already
 * use in `lib/trade/kill-switch.ts`, applied to authorization instead of a
 * halt.
 */
export async function isFeatureAuthorized(
  supabase: SupabaseClient,
  feature: ComplianceFeature,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("compliance_signoffs")
    .select("id")
    .eq("feature", feature)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`isFeatureAuthorized: query failed for "${feature}" — ${error.message}`);
    return false;
  }
  return data != null;
}

export interface RecordSignoffArgs {
  feature: ComplianceFeature;
  approvedBy: string;
  reviewReference: string;
  notes?: string;
}

/**
 * Records a sign-off already granted by a qualified human reviewer outside
 * this codebase. Calling this function does not itself constitute review —
 * it is the durable record that one occurred. Intended to be run once, by
 * hand, against the service-role client, by whoever holds that authority;
 * not called from any request handler, cron, or UI action anywhere in this
 * app.
 */
export async function recordSignoff(
  supabase: SupabaseClient,
  args: RecordSignoffArgs,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("compliance_signoffs").insert({
    feature: args.feature,
    approved_by: args.approvedBy,
    review_reference: args.reviewReference,
    notes: args.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Revokes every currently-active sign-off for `feature` — the emergency-stop
 * path if a granted authorization needs to be pulled. Same "by hand, by
 * whoever holds that authority" posture as `recordSignoff`.
 */
export async function revokeSignoff(
  supabase: SupabaseClient,
  feature: ComplianceFeature,
  revokedBy: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("compliance_signoffs")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy, revoked_reason: reason })
    .eq("feature", feature)
    .is("revoked_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
