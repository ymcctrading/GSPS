/**
 * Server-only aggregation for the Novice homepage summary
 * (components/dashboard/novice-home-summary.tsx).
 *
 * Per the spec pack's "Novice user experience" section: "Show 0-3 new
 * entries available today; phrase it as 'maximum,' never a target," plus an
 * existing-position protection status and a cooldown status. Market regime
 * and the best-qualified-plan-or-none card are handled separately
 * (lib/promotion/market-regime.ts, and the dashboard's own already-fetched
 * scan rows respectively) since both need data this module doesn't.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { MAX_NEW_POSITIONS_PER_DAY } from "@/lib/risk/config";
import { getCurrentCircuitState } from "@/lib/risk/status";
import type { CircuitState } from "@/lib/risk/config";

export interface PositionProtectionStatus {
  openCount: number;
  protectedCount: number;
}

export interface NoviceHomeSummary {
  /** Never negative, never above MAX_NEW_POSITIONS_PER_DAY — a ceiling, not a target. */
  entriesAvailableToday: number;
  protection: PositionProtectionStatus;
  cooldownState: CircuitState;
}

interface OpenPositionRow {
  opened_at: string;
  stop_loss: number | null;
}

export async function getNoviceHomeSummary(
  supabase: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<NoviceHomeSummary> {
  const [{ data: openRaw, error: openError }, cooldownState] = await Promise.all([
    supabase
      .from("positions")
      .select("opened_at, stop_loss")
      .eq("user_id", profileId)
      .eq("mode", "paper")
      .eq("closed", false),
    getCurrentCircuitState(supabase, profileId),
  ]);

  if (openError) {
    console.error(`promotion: open-position read failed for ${profileId} — ${openError.message}`);
  }

  const open = (openRaw ?? []) as OpenPositionRow[];
  const today = etDateKey(now);
  const openedToday = open.filter((p) => etDateKey(new Date(p.opened_at)) === today).length;
  const protectedCount = open.filter((p) => p.stop_loss != null).length;

  return {
    entriesAvailableToday: Math.max(0, MAX_NEW_POSITIONS_PER_DAY - openedToday),
    protection: { openCount: open.length, protectedCount },
    cooldownState,
  };
}
