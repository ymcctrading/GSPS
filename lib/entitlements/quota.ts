/**
 * Thin, typed wrapper around the reserve_usage_slot / finalize_usage_reservation
 * RPCs added in supabase/migrations/0036_entitlement_usage_and_monitors.sql.
 *
 * Both RPCs are service_role-only (see that migration's grant/revoke block),
 * so `supabase` here must be a service-role client (lib/supabase/server.ts's
 * `createServiceClient()`), never the user-session client — calling with the
 * latter fails with a permission error, which is the point: quota reservation
 * is a trusted-server-path operation, not something a route can accidentally
 * delegate to RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import type { Limit } from "@/lib/entitlements/policy";

export type UsageKey = "manual_dashboard_scan" | "guided_scan";

export type ReservationResult = {
  reservationId: string | null;
  status: "reserved" | "quota_exceeded" | "finalized" | "released";
  currentCount: number;
  wasDuplicate: boolean;
};

/** `"unlimited"` has no cap to enforce; the RPC takes `null` for that case. */
function rpcLimit(limit: Limit): number | null {
  return limit === "unlimited" ? null : limit;
}

/**
 * Atomically reserves one unit of `usageKey` quota for `profileId` on
 * today's America/New_York calendar day, or reports it as exhausted.
 * `requestId` is this call's idempotency key — reuse the same value only if
 * deliberately retrying the identical logical request; a fresh
 * `crypto.randomUUID()` per genuine user action is correct for a route that
 * has no client-supplied idempotency key of its own.
 */
export async function reserveUsageSlot(
  supabase: SupabaseClient,
  args: { profileId: string; usageKey: UsageKey; limit: Limit; requestId: string; now?: Date },
): Promise<ReservationResult> {
  const { data, error } = await supabase
    .rpc("reserve_usage_slot", {
      p_profile_id: args.profileId,
      p_usage_key: args.usageKey,
      p_usage_day_et: etDateKey(args.now),
      p_request_id: args.requestId,
      p_limit: rpcLimit(args.limit),
    })
    .single();

  if (error) throw new Error(`reserveUsageSlot: ${error.message}`);

  const row = data as { reservation_id: string | null; status: string; current_count: number; was_duplicate: boolean };
  return {
    reservationId: row.reservation_id,
    status: row.status as ReservationResult["status"],
    currentCount: row.current_count,
    wasDuplicate: row.was_duplicate,
  };
}

/**
 * Marks a reservation `finalized` (the scan produced a completed result --
 * including a completed scan that legitimately found nothing to show) or
 * `released` (the attempt failed before completion, so it should not have
 * cost the user their quota slot). A no-op — not an error -- if there is
 * nothing left to finalize (already resolved, wrong profile, unknown id).
 */
export async function finalizeUsageReservation(
  supabase: SupabaseClient,
  args: { profileId: string; reservationId: string; status: "finalized" | "released" },
): Promise<boolean> {
  const { data, error } = await supabase.rpc("finalize_usage_reservation", {
    p_profile_id: args.profileId,
    p_reservation_id: args.reservationId,
    p_status: args.status,
  });

  if (error) throw new Error(`finalizeUsageReservation: ${error.message}`);
  return data as boolean;
}
