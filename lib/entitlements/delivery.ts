/**
 * Phase 3E: idempotent notification-delivery recording for a confirmed
 * WATCH -> EXECUTE transition. This records the delivery *ledger* row only
 * -- it does not send an email/SMS/push itself. Actual dispatch (payload,
 * provider call) is separate, pre-existing infrastructure
 * (lib/notifications, sendAlertEmail) that a future PR wires to a 'pending'
 * row here; conflating the two would make this module responsible for
 * provider concerns it doesn't need to know about to guarantee "never
 * deliver the same transition twice."
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
