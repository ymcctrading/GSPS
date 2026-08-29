/**
 * Phase 3E/Phase 5: idempotent notification-delivery recording for a
 * confirmed WATCH -> EXECUTE transition, plus (Phase 5) the actual send.
 *
 * `recordNotificationDelivery` inserts the ledger row *and* the entitled
 * payload it was recorded with -- the unique constraint on
 * `idempotency_key` is what guarantees a retry or duplicate evaluation
 * lands it once. `dispatchNotificationDelivery` is the send step: it
 * re-reads the row immediately before sending and only proceeds if it is
 * still `pending`, so calling it twice for the same delivery (a retry sweep
 * racing the original inline call, a crash after a successful send but
 * before the caller observed the response) never sends twice -- the second
 * caller sees a non-pending status and no-ops. It reads the payload back
 * from the row rather than trusting a caller-supplied one, so a retry sweep
 * with no scan context of its own can dispatch a stuck delivery using
 * exactly what was recorded at evaluation time -- never a payload
 * reconstructed from current (possibly since-changed) data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlertEmail } from "@/lib/notifications/resend-handler";
import { isPreviewEnvironment } from "@/lib/env/preview";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";

export type DeliveryChannel = "email" | "sms" | "push";

/**
 * Only what an entitled, visible WATCH -> EXECUTE alert may disclose --
 * built by the caller from `visible_scan_results`/monitor state, never from
 * raw scan internals. Deliberately narrower than `ScanResult`.
 *
 * `signal` is the Signal and Regime Engine's own rollup (already redacted —
 * see `lib/signals/publicSummary.ts`), attached as informational context
 * alongside the Gann/STRAT verdict above. It never decides whether this
 * alert fires: the WATCH -> EXECUTE transition that triggers a notification
 * is computed from `verdict`/`score` alone, same as before this field
 * existed. `null`/absent when no state evaluated as tradeable.
 */
export type EntitledAlertPayload = {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  verdict: string;
  confidence: number;
  signal?: PublicSignalSummary | null;
};

export type RecordDeliveryResult =
  | { recorded: true; deliveryId: string }
  | { recorded: false; deliveryId: null };

/**
 * Inserts a `pending` notification_deliveries row for `transitionId` +
 * `channel`, keyed by `idempotencyKey`, storing `payload` alongside it. If
 * that key was already recorded -- a retry, a duplicate evaluation, two
 * concurrent callers -- the unique constraint on
 * notification_deliveries.idempotency_key rejects the second insert and
 * this returns `recorded: false` rather than throwing: the caller's job
 * (send once) is already done or already someone else's turn.
 */
export async function recordNotificationDelivery(
  service: SupabaseClient,
  args: {
    transitionId: string;
    profileId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
    payload: EntitledAlertPayload;
  },
): Promise<RecordDeliveryResult> {
  const { data, error } = await service
    .from("notification_deliveries")
    .insert({
      transition_id: args.transitionId,
      profile_id: args.profileId,
      channel: args.channel,
      idempotency_key: args.idempotencyKey,
      status: "pending",
      payload: args.payload,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { recorded: false, deliveryId: null };
    throw new Error(`recordNotificationDelivery: ${error.message}`);
  }
  return { recorded: true, deliveryId: (data as { id: string }).id };
}

/** Reads a profile's enabled channels via the service-role-only RPC (migration 0025/0026). */
export async function getEnabledChannels(service: SupabaseClient, profileId: string): Promise<DeliveryChannel[]> {
  const { data, error } = await service.rpc("get_enabled_notification_channels", { user_id: profileId });
  if (error) throw new Error(`getEnabledChannels: ${error.message}`);
  return (data ?? []) as DeliveryChannel[];
}

export type DispatchOutcome =
  | { dispatched: true; status: "sent" | "failed" }
  | { dispatched: false; reason: "not_pending" | "channel_unsupported" | "no_email" | "preview_suppressed" | "max_attempts" };

/** Attempt ceiling for a stuck `pending`/`failed` delivery the retry sweep will pick back up. */
export const MAX_DISPATCH_ATTEMPTS = 5;

/** Statuses this function will still attempt to send for. `sent` (and `bounced`) are terminal -- never re-dispatched. */
const DISPATCHABLE_STATUSES = ["pending", "failed"];

/**
 * Sends the notification for an already-recorded delivery row still in a
 * dispatchable status (`pending` or `failed`) and updates its status.
 * Re-reads the row's current status first: if it has already reached `sent`
 * (by an earlier call -- the inline dispatch, or a concurrent sweep), this
 * no-ops rather than sending again -- that guard, not caller discipline, is
 * what keeps a retry sweep safe to run concurrently with the inline
 * dispatch on the original evaluation path. The final status update is
 * itself conditioned on the row still being in a dispatchable status, so
 * two concurrent callers racing the same row can't both record a send.
 *
 * Never sends a real notification in preview -- checked here, not only at
 * the scheduled-job call site, so `/api/batch-scan`'s manual scan path
 * (which has no preview guard of its own) can't leak a real email out of a
 * preview deployment either. The row is left untouched, so preview activity
 * never fabricates a `sent`/`failed` record.
 *
 * Email is the only channel with a real provider today (`sendAlertEmail`);
 * sms/push are recorded but not yet dispatchable and are left `pending` for
 * a future channel implementation rather than falsely marked `sent`.
 */
export async function dispatchNotificationDelivery(
  service: SupabaseClient,
  args: { deliveryId: string; profileId: string },
): Promise<DispatchOutcome> {
  if (isPreviewEnvironment()) {
    return { dispatched: false, reason: "preview_suppressed" };
  }

  const { data: current, error: readError } = await service
    .from("notification_deliveries")
    .select("id, status, channel, payload, attempt_count")
    .eq("id", args.deliveryId)
    .single();
  if (readError || !current) throw new Error(`dispatchNotificationDelivery: ${readError?.message ?? "not found"}`);
  if (!DISPATCHABLE_STATUSES.includes(current.status)) return { dispatched: false, reason: "not_pending" };
  if ((current.attempt_count ?? 0) >= MAX_DISPATCH_ATTEMPTS) return { dispatched: false, reason: "max_attempts" };

  if (current.channel !== "email") {
    return { dispatched: false, reason: "channel_unsupported" };
  }

  const { data: userRecord } = await service.auth.admin.getUserById(args.profileId);
  const email = userRecord?.user?.email;
  if (!email) return { dispatched: false, reason: "no_email" };

  const payload = current.payload as EntitledAlertPayload;
  const result = await sendAlertEmail({ userEmail: email, ...payload });
  const status: "sent" | "failed" = result.success ? "sent" : "failed";

  await service
    .from("notification_deliveries")
    .update({
      status,
      provider_ref: result.success ? (result.id ?? null) : null,
      attempt_count: (current.attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.deliveryId)
    .in("status", DISPATCHABLE_STATUSES);

  return { dispatched: true, status };
}

/**
 * Retry sweep: picks up deliveries stuck `pending` (an inline dispatch that
 * never ran or crashed mid-flight) or `failed` (a transport error worth
 * retrying) below the attempt ceiling, and dispatches each with the exact
 * payload it was originally recorded with. `olderThanMs` avoids racing the
 * inline dispatch that runs immediately after `recordNotificationDelivery`
 * on the original evaluation path -- only rows old enough that the inline
 * attempt has certainly already happened (or never will) are candidates.
 */
export async function sweepStuckDeliveries(
  service: SupabaseClient,
  args: { olderThanMs: number; limit?: number },
): Promise<{ swept: number; sent: number; failed: number; suppressed: number }> {
  const cutoff = new Date(Date.now() - args.olderThanMs).toISOString();
  const { data: rows, error } = await service
    .from("notification_deliveries")
    .select("id, profile_id")
    .in("status", ["pending", "failed"])
    .lt("attempt_count", MAX_DISPATCH_ATTEMPTS)
    .lt("created_at", cutoff)
    .limit(args.limit ?? 200);

  if (error) throw new Error(`sweepStuckDeliveries: ${error.message}`);

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  for (const row of (rows ?? []) as { id: string; profile_id: string }[]) {
    try {
      const outcome = await dispatchNotificationDelivery(service, { deliveryId: row.id, profileId: row.profile_id });
      if (outcome.dispatched && outcome.status === "sent") sent += 1;
      else if (outcome.dispatched && outcome.status === "failed") failed += 1;
      else if (!outcome.dispatched) suppressed += 1;
    } catch (err) {
      console.error(`sweepStuckDeliveries: dispatch failed for delivery ${row.id} — ${String(err)}`);
    }
  }

  return { swept: (rows ?? []).length, sent, failed, suppressed };
}
