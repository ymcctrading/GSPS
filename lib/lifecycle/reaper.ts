/**
 * The scheduled entry point for pre-entry `trade_plans` expiry.
 *
 * `lib/lifecycle/transitions.ts` has always specified this rule — "Any
 * pre-entry state -> EXPIRED when the trigger doesn't occur by `expiresAt`"
 * — and `applyPlanEvent`'s `expire` case has been unit-tested since the state
 * machine shipped. What never existed was anything that actually calls it:
 * no cron, no worker, anywhere in the app. A plan sitting in WATCHLIST,
 * QUALIFIED, AWAITING_ENTRY_CONFIRMATION, or ARMED whose trigger window has
 * closed just stayed at that state indefinitely, reading as live to anything
 * that lists open plans (the Automated Portfolio Manager's candidate query
 * among them) until something else happened to move it — the same "correct
 * rule, never wired to run" shape as the scan-list staleness bug this
 * follows up on (see CHANGELOG.md, 2026-09-08).
 *
 * Deliberately narrow: this only dispatches the `expire` transition the spec
 * already defines for pre-entry states. It does NOT add a new price-based
 * invalidation rule for pre-entry plans (price already running past the stop
 * before the entry ever triggers) — extending INVALIDATED to apply pre-entry
 * would be a new business rule beyond what the "Trade Lifecycle, Exit &
 * Runner Engine" spec pack this module implements (see
 * `lib/lifecycle/types.ts`'s header) defines, and that spec's own header
 * flags the module as needing securities/compliance counsel review before
 * any such change ships. That decision is left to the product owner, not
 * made silently here.
 *
 * Also does not touch ACTIVE_STATES (post-entry) plans: `invalidate` there is
 * already dispatched reactively, from an actual broker/simulator stop fill
 * (`lib/automation/stop-out.ts`, called from `lib/trade/exit-manager.ts` /
 * `exit-manager-sim.ts`) — adding a second, independent price-comparison path
 * for the same plans would race the authoritative fill-driven one rather than
 * duplicate a check safely, so it's out of scope for this pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listExpirablePlans, applyEventAndPersist } from "./store";
import { isExpiredByClock } from "./expiry";

export interface LifecycleReaperResult {
  candidates: number;
  expired: number;
  errors: { userId: string; planId: string; reason: string }[];
}

export async function runLifecycleReaper(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<LifecycleReaperResult> {
  const nowIso = now.toISOString();
  const candidates = await listExpirablePlans(supabase, now);

  let expired = 0;
  const errors: LifecycleReaperResult["errors"] = [];

  for (const candidate of candidates) {
    // Re-checked against the same primitive `lib/lifecycle/expiry.ts`
    // defines for this — the store's own `.lte("expires_at", ...)` filter is
    // an efficient first pass, not a second definition of "expired" to keep
    // in sync with this one by hand.
    if (!isExpiredByClock(nowIso, candidate.expiresAt)) continue;
    try {
      const result = await applyEventAndPersist(supabase, candidate.userId, candidate.planId, {
        type: "expire",
        at: now.toISOString(),
      });
      if (result.ok) {
        expired += 1;
      } else if (result.error !== "not_found") {
        // A state raced out from under the reaper between the read and the
        // write (e.g. the user armed it in the meantime) — not an error to
        // surface, just a candidate that's no longer expirable.
        continue;
      }
    } catch (err) {
      errors.push({
        userId: candidate.userId,
        planId: candidate.planId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { candidates: candidates.length, expired, errors };
}
