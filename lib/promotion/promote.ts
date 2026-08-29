/**
 * Server-only mutation half of tier promotion: recording eligibility,
 * handling a user's explicit upgrade request, and applying a promotion once
 * its effective session has arrived.
 *
 * Per the spec pack: "Upgrades may take effect at a defined future
 * session after required onboarding — not retroactively to defeat an entry
 * cap." So `requestPromotion` never flips `profiles.tier` immediately — it
 * schedules `effective_at` at the next market open, and `applyDuePromotion`
 * (called lazily from the status route rather than a cron, since this
 * project's two Vercel Hobby cron slots are already spent — see
 * ROADMAP.md/docs/THIRD_PARTY_LIMITS.md) performs the actual flip once that
 * session has arrived.
 *
 * This module never grants risk permissions. It only ever writes
 * `profiles.tier` from `PRACTICE` to `STANDARD` (Novice -> Pro) — the one
 * promotion path this spec pack defines — and only for a profile already
 * confirmed eligible by `lib/promotion/eligibility.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { equitySession } from "@/lib/market/session";

const NOVICE_TIER = "PRACTICE";
const PRO_TIER = "STANDARD";

const SCAN_STEP_MS = 5 * 60_000;
const MAX_SCAN_STEPS = (5 * 24 * 60) / 5; // up to 5 days ahead, in 5-minute steps

/**
 * The next US-equities regular-session open at or after `now`, holiday-agnostic
 * like the rest of `lib/market/session.ts`. Found by stepping forward in
 * 5-minute increments and reusing `equitySession` (already DST/weekend-aware)
 * to detect the closed/pre → regular crossing, rather than reimplementing ET
 * wall-clock arithmetic here.
 */
export function nextMarketOpen(now: Date): Date {
  let cursor = new Date(now.getTime());
  let prevSession = equitySession(new Date(cursor.getTime() - SCAN_STEP_MS));
  for (let i = 0; i < MAX_SCAN_STEPS; i++) {
    const session = equitySession(cursor);
    if (session === "regular" && prevSession !== "regular") return cursor;
    prevSession = session;
    cursor = new Date(cursor.getTime() + SCAN_STEP_MS);
  }
  return cursor; // Unreachable in practice — five days always contains an open.
}

/**
 * Marks the moment a profile first became eligible, if it isn't recorded
 * already. Idempotent — calling this on every readiness check is safe and
 * intended; `eligible_since` is written once and never overwritten by a
 * later check.
 */
export async function recordEligibilityIfNewlyMet(
  supabase: SupabaseClient,
  profileId: string,
  eligible: boolean,
  now: Date = new Date(),
): Promise<void> {
  if (!eligible) return;
  const { data: existing } = await supabase
    .from("promotion_status")
    .select("eligible_since")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing?.eligible_since) return;

  const { error } = await supabase.from("promotion_status").upsert(
    { profile_id: profileId, eligible_since: now.toISOString(), updated_at: now.toISOString() },
    { onConflict: "profile_id" },
  );
  if (error) console.error(`promotion: eligible_since not recorded for ${profileId} — ${error.message}`);
}

export type RequestPromotionResult =
  | { status: "scheduled"; effectiveAt: string }
  | { status: "not_eligible" }
  | { status: "already_requested"; effectiveAt: string };

/**
 * A user's explicit request to upgrade once eligible. Never triggered
 * automatically and never in response to a loss/cooldown/lock — the caller
 * (the API route) is responsible for that posture; this function only
 * enforces that eligibility itself was actually met.
 */
export async function requestPromotion(
  supabase: SupabaseClient,
  profileId: string,
  eligible: boolean,
  now: Date = new Date(),
): Promise<RequestPromotionResult> {
  if (!eligible) return { status: "not_eligible" };

  const { data: existing } = await supabase
    .from("promotion_status")
    .select("requested_at, effective_at, promoted_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing?.requested_at && existing.effective_at && !existing.promoted_at) {
    return { status: "already_requested", effectiveAt: existing.effective_at as string };
  }

  const effectiveAt = nextMarketOpen(now);
  const { error } = await supabase.from("promotion_status").upsert(
    {
      profile_id: profileId,
      eligible_since: now.toISOString(),
      requested_at: now.toISOString(),
      effective_at: effectiveAt.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) throw new Error(`requestPromotion(${profileId}): ${error.message}`);

  return { status: "scheduled", effectiveAt: effectiveAt.toISOString() };
}

/**
 * Applies a due promotion: if this profile requested an upgrade, its
 * effective session has arrived, it hasn't already been promoted, and it is
 * still on the Novice (`PRACTICE`) tier, flips `profiles.tier` to
 * `STANDARD` (Pro) and records `promoted_at`. A no-op in every other case —
 * safe to call on every status check.
 */
export async function applyDuePromotion(
  supabase: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { data: status } = await supabase
    .from("promotion_status")
    .select("effective_at, promoted_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!status?.effective_at || status.promoted_at) return false;
  if (new Date(status.effective_at) > now) return false;

  const { data: profile } = await supabase.from("profiles").select("tier").eq("id", profileId).single();
  if ((profile?.tier ?? NOVICE_TIER) !== NOVICE_TIER) return false; // Already promoted or on a different tier entirely.

  const { error: tierError } = await supabase.from("profiles").update({ tier: PRO_TIER }).eq("id", profileId);
  if (tierError) {
    console.error(`promotion: tier update failed for ${profileId} — ${tierError.message}`);
    return false;
  }

  const { error: statusError } = await supabase
    .from("promotion_status")
    .update({ promoted_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("profile_id", profileId);
  if (statusError) console.error(`promotion: promoted_at not recorded for ${profileId} — ${statusError.message}`);

  return true;
}
