/**
 * Advances every open AWAITING_ENTRY_CONFIRMATION plan for a symbol using
 * that symbol's latest scan pass, and arms it the moment `entryReady`
 * fires. Called from the scan fan-out (`lib/entitlements/scan-fanout.ts`)
 * on every pass for a profile, not only the pass that created the plan —
 * confirmation is observed over several later scans, by construction.
 *
 * Known limitation: `ScanResult` carries `currentPrice`, not a full OHLC
 * bar, so this builds a degenerate bar (o=h=l=c=currentPrice) per scan
 * pass rather than reading the real closed-bar range. That collapses the
 * "wick touch" vs. "close break" distinction *within* one scan pass, but
 * each pass still produces exactly one bar at one timestamp, so the
 * cross-pass ordering the state machine depends on (touch this pass, break
 * a later pass, retest a later pass still, confirm a later pass still) is
 * unaffected — a single degenerate bar still can't satisfy two stages,
 * since `advanceEntryConfirmation` requires each stage's bar to be
 * strictly after the previous stage's. A future pass that threads the
 * scan's actual closed bar through here (rather than `currentPrice`) would
 * restore full intra-bar fidelity; tracked as a follow-up rather than
 * blocking this gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";
import { advanceEntryConfirmation, entryReady } from "./entryConfirmation";
import { applyEventAndPersist, listTradePlans } from "./store";

export interface ConfirmationScanTick {
  symbol: string;
  direction: "bullish" | "bearish";
  currentPrice: number;
  scannedAt: string;
}

/**
 * Runs one scan tick through every open awaiting-confirmation plan for that
 * symbol on this profile. Best-effort per plan — one plan's failure never
 * blocks another's, matching the rest of the fan-out's error handling.
 */
export async function advanceEntryConfirmationForSymbol(
  service: SupabaseClient,
  profileId: string,
  tick: ConfirmationScanTick,
): Promise<void> {
  let plans;
  try {
    plans = await listTradePlans(service, profileId, { state: "awaiting_entry_confirmation" });
  } catch (err) {
    console.error(`advanceEntryConfirmationForSymbol: plan lookup failed — ${String(err)}`);
    return;
  }

  const candidates = plans.filter(
    (p) => p.instrument === tick.symbol && p.direction === tick.direction,
  );
  if (candidates.length === 0) return;

  const bar: Bar = {
    t: tick.scannedAt,
    o: tick.currentPrice,
    h: tick.currentPrice,
    l: tick.currentPrice,
    c: tick.currentPrice,
    v: 0,
  };

  for (const plan of candidates) {
    try {
      const nextEvidence = advanceEntryConfirmation(
        plan.entryConfirmation,
        { direction: plan.direction, entryTrigger: plan.coordinates.entryTrigger },
        bar,
      );
      if (nextEvidence === plan.entryConfirmation) continue; // no change this tick

      const recorded = await applyEventAndPersist(service, profileId, plan.planId, {
        type: "record_confirmation_evidence",
        at: tick.scannedAt,
        evidence: nextEvidence,
      });
      if (!recorded.ok) continue;

      if (entryReady(nextEvidence)) {
        await applyEventAndPersist(service, profileId, plan.planId, {
          type: "arm",
          at: tick.scannedAt,
          reason: "Break/retest/confirmation-move sequence completed.",
        });
      }
    } catch (err) {
      console.error(
        `advanceEntryConfirmationForSymbol: advance failed for plan ${plan.planId} — ${String(err)}`,
      );
    }
  }
}
