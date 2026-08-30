/**
 * Read-only accessor for a profile's current circuit-breaker state
 * (`risk_circuit_state`, migration 0042). Separate from `lib/risk/service.ts`,
 * which owns evaluating and writing that state for live accounts — this is
 * just the display-side read a status widget needs, with no side effects.
 *
 * Defaults to `"normal"` when no row exists, matching the circuit breaker's
 * own resting state before any evaluation has ever run for a profile (most
 * accounts today, since live trading has no execution path yet — see
 * ROADMAP.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CircuitState } from "@/lib/risk/config";

export async function getCurrentCircuitState(supabase: SupabaseClient, profileId: string): Promise<CircuitState> {
  const { data, error } = await supabase
    .from("risk_circuit_state")
    .select("state")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.error(`risk: circuit state read failed for ${profileId} — ${error.message}`);
    return "normal";
  }
  return (data?.state as CircuitState | undefined) ?? "normal";
}
