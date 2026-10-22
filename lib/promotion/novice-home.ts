/**
 * Server-only aggregation for the Novice homepage summary
 * (components/dashboard/novice-home-summary.tsx).
 *
 * Per the spec pack's "Novice user experience" section, a ceiling phrased as
 * "maximum," never a target, plus an existing-position protection status and a cooldown status. Market regime
 * and the best-qualified-plan-or-none card are handled separately
 * (lib/promotion/market-regime.ts, and the dashboard's own already-fetched
 * scan rows respectively) since both need data this module doesn't.
 *
 * The ceiling is the room left under Gann's open-market count (five stocks,
 * three other markets; `lib/risk/gannCapital.ts`). It was "0-3 new entries
 * today" until 2026-10-21; Gann sets no daily count (Q8, R-019).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOtherMarket } from "@/lib/market/otherMarkets";
import { MAX_OPEN_OTHER_MARKETS, MAX_OPEN_STOCKS } from "@/lib/risk/gannCapital";
import { getCurrentCircuitState } from "@/lib/risk/status";
import type { CircuitState } from "@/lib/risk/config";

export interface PositionProtectionStatus {
  openCount: number;
  protectedCount: number;
}

export interface NoviceHomeSummary {
  /** Markets that may still be opened under Gann's count. Never negative; a ceiling, not a target. */
  openRoom: { stocks: number; otherMarkets: number };
  protection: PositionProtectionStatus;
  cooldownState: CircuitState;
}

interface OpenPositionRow {
  symbol: string;
  stop_loss: number | null;
}

export async function getNoviceHomeSummary(
  supabase: SupabaseClient,
  profileId: string,
): Promise<NoviceHomeSummary> {
  const [{ data: openRaw, error: openError }, cooldownState] = await Promise.all([
    supabase
      .from("positions")
      .select("symbol, stop_loss")
      .eq("user_id", profileId)
      .eq("mode", "paper")
      .eq("closed", false),
    getCurrentCircuitState(supabase, profileId),
  ]);

  if (openError) {
    console.error(`promotion: open-position read failed for ${profileId} — ${openError.message}`);
  }

  const open = (openRaw ?? []) as OpenPositionRow[];
  // One market per symbol, as Gann's count reads it.
  const marketsOf = (other: boolean) =>
    new Set(open.filter((p) => isOtherMarket(p.symbol) === other).map((p) => p.symbol.toUpperCase().replace("/", ""))).size;
  const protectedCount = open.filter((p) => p.stop_loss != null).length;

  return {
    openRoom: {
      stocks: Math.max(0, MAX_OPEN_STOCKS - marketsOf(false)),
      otherMarkets: Math.max(0, MAX_OPEN_OTHER_MARKETS - marketsOf(true)),
    },
    protection: { openCount: open.length, protectedCount },
    cooldownState,
  };
}
