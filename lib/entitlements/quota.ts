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

/**
 * How long a reservation may stay `reserved` before it is treated as
 * abandoned. Every route that reserves (`/api/guided`, `/api/batch-scan`) runs
 * inside a 60-second function, so a row still reserved well past that was
 * left by a run that died before it could finalize or release it (review
 * finding S-12: one such row since 2026-08-26). An engineering figure, set at
 * fifteen times the budget so no live run is ever touched.
 */
export const STALE_RESERVATION_MS = 15 * 60_000;

/**
 * Releases every reservation older than `olderThanMs` that was never
 * finalized or released. Released, not finalized: the run died before it
 * could say it completed, so the member is not charged, the same reading
 * `finalizeUsageReservation`'s "released" gives a failed attempt (a batch
 * scan killed after writing its results but before finalizing goes
 * uncharged too, as its own error path already allows). The row stays for
 * audit. Returns how many rows it released.
 */
export async function releaseStaleReservations(
  supabase: SupabaseClient,
  now: Date = new Date(),
  olderThanMs: number = STALE_RESERVATION_MS,
): Promise<number> {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - olderThanMs).toISOString();
  const { data, error } = await supabase
    .from("usage_ledger")
    .update({ status: "released", finalized_at: nowIso, updated_at: nowIso })
    .eq("status", "reserved")
    .lt("reserved_at", cutoff)
    .select("id");

  if (error) throw new Error(`releaseStaleReservations: ${error.message}`);
  return data?.length ?? 0;
}
