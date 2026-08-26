/**
 * Phase 3E/Phase 5: idempotent notification-delivery recording for a
 * confirmed WATCH -> EXECUTE transition, plus (Phase 5) the actual send.
 *
 * `recordNotificationDelivery` only inserts the ledger row -- the unique
 * constraint on `idempotency_key` is what guarantees a retry or duplicate
 * evaluation lands it once. `dispatchNotificationDelivery` is the send step:
 * it re-reads the row immediately before sending and only proceeds if it is
 * still `pending`, so calling it twice for the same delivery (a retry sweep
 * racing the original inline call, a crash after a successful send but
 * before the caller observed the response) never sends twice -- the second
 * caller sees a non-pending status and no-ops.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlertEmail } from "@/lib/notifications/resend-handler";

export type DeliveryChannel = "email" | "sms" | "push";

export type RecordDeliveryResult =
  | { recorded: true; deliveryId: string }
  | { recorded: false; deliveryId: null };

/**
 * Inserts a `pending` notification_deliveries row for `transitionId` +
 * `channel`, keyed by `idempotencyKey`. If that key was already recorded --
 * a retry, a duplicate evaluation, two concurrent callers -- the unique
 * constraint on notification_deliveries.idempotency_key rejects the second
 * insert and this returns `recorded: false` rather than throwing: the
 * caller's job (send once) is already done or already someone else's turn.
 */
export async function recordNotificationDelivery(
  service: SupabaseClient,
  args: { transitionId: string; profileId: string; channel: DeliveryChannel; idempotencyKey: string },
): Promise<RecordDeliveryResult> {
  const { data, error } = await service
    .from("notification_deliveries")
    .insert({
      transition_id: args.transitionId,
      profile_id: args.profileId,
      channel: args.channel,
      idempotency_key: args.idempotencyKey,
      status: "pending",
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

/**
 * Only what an entitled, visible WATCH -> EXECUTE alert may disclose --
 * built by the caller from `visible_scan_results`/monitor state, never from
 * raw scan internals. Deliberately narrower than `ScanResult`.
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
};

export type DispatchOutcome =
  | { dispatched: true; status: "sent" | "failed" }
  | { dispatched: false; reason: "not_pending" | "channel_unsupported" | "no_email" };

/**
 * Sends the notification for an already-recorded `pending` delivery row and
 * updates its status. Re-reads the row's current status first: if it is no
 * longer `pending` (already sent by an earlier call, or already marked
 * failed and awaiting a deliberate retry decision), this no-ops rather than
 * sending again -- that guard, not caller discipline, is what keeps a retry
 * sweep safe to run concurrently with the inline dispatch on the original
 * evaluation path.
 *
 * Email is the only channel with a real provider today (`sendAlertEmail`);
 * sms/push are recorded but not yet dispatchable and are left `pending` for
 * a future channel implementation rather than falsely marked `sent`.
 */
export async function dispatchNotificationDelivery(
  service: SupabaseClient,
  args: { deliveryId: string; profileId: string; payload: EntitledAlertPayload },
): Promise<DispatchOutcome> {
  const { data: current, error: readError } = await service
    .from("notification_deliveries")
    .select("id, status, channel")
    .eq("id", args.deliveryId)
    .single();
  if (readError || !current) throw new Error(`dispatchNotificationDelivery: ${readError?.message ?? "not found"}`);
  if (current.status !== "pending") return { dispatched: false, reason: "not_pending" };

  if (current.channel !== "email") {
    return { dispatched: false, reason: "channel_unsupported" };
  }

  const { data: userRecord } = await service.auth.admin.getUserById(args.profileId);
  const email = userRecord?.user?.email;
  if (!email) return { dispatched: false, reason: "no_email" };

  const result = await sendAlertEmail({ userEmail: email, ...args.payload });
  const status: "sent" | "failed" = result.success ? "sent" : "failed";

  await service
    .from("notification_deliveries")
    .update({ status, provider_ref: result.success ? (result.id ?? null) : null, updated_at: new Date().toISOString() })
    .eq("id", args.deliveryId)
    .eq("status", "pending");

  return { dispatched: true, status };
}
