/**
 * Arms a user's open AWAITING_ENTRY_CONFIRMATION plans from the real closed
 * execution-timeframe bars since each plan was generated, for the Automated
 * Portfolio Manager (`lib/automation/portfolio-manager.ts`).
 *
 * Why it exists: the scan fan-out (`advanceConfirmation.ts`) advances a plan
 * one degenerate bar per scan pass, and scans run a few times a day, so the
 * four-stage sequence (touch, break, retest, hold) could not complete inside
 * a plan's window. Through 2026-10-16 no plan in production had ever armed,
 * so the manager never had anything to trade. This reads the same bars and
 * the same state machine `lib/lifecycle/confirmNow.ts` uses at placement
 * (`lib/trade/place-order.ts`), so a plan armed here is one placement accepts.
 *
 * When #309 lands, the rule below takes the plan's `stopPrice` and
 * `entryKind`, the same way that PR changes `advanceConfirmation.ts`.
 *
 * Three-question basis:
 * 1. Gann: the break stage's buffer is his 3-point rule (A5); the retest and
 *    hold is "should not react back under the old top" (A05 p. 20). Nothing
 *    new is decided here, only read on real bars instead of scan prices.
 * 2. Cycles: no periodicity claim, so Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. The arm is the effect of a confirmation the
 *    bars actually show.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetClass, Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { assertLiveMarketData, MARKET_DATA_UNAVAILABLE, SyntheticMarketDataError } from "@/lib/data/feed-mode";
import { EXECUTION_TIMEFRAME, TF_INTERVAL_MS } from "@/lib/timeframe";
import { closedSessionBars, crossingHeldNow } from "./confirmNow";
import { entryReady, replayEntryConfirmation } from "./entryConfirmation";
import { isExpiredByClock } from "./expiry";
import { applyEventAndPersist, listTradePlans } from "./store";
import { isPivotSignal } from "./fromPivot";
import { isStopBreached, isStopBreachedByBar } from "@/lib/gann/stopBreach";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";

/**
 * Has the plan's own stop broken since the plan was generated? A bar since
 * generation traded through it, or the latest price is through it. A breach
 * retires the plan (owner decision 2026-09-30, `lib/gann/stopBreach.ts`), and
 * Gann never resumes a stopped trade at its old levels, so a later close back
 * over the line does not bring it back here: a new plan comes from the next
 * scan. The `trade_plans` retirement itself (`lib/lifecycle/retire.ts`) waits
 * on its sign-off, so until then the manager reads the breach here, the same
 * test `lib/marketScan.ts#hasTradePlan` applies through `stopBreach`.
 */
export function stopBrokenSince(
  direction: "bullish" | "bearish",
  stop: number,
  barsSinceGenerated: readonly Pick<Bar, "h" | "l">[],
  latestPrice: number | null,
): boolean {
  if (barsSinceGenerated.some((b) => isStopBreachedByBar(direction, stop, b))) return true;
  return latestPrice != null && latestPrice > 0 && isStopBreached(direction, stop, latestPrice);
}

/** Every execution bar since `generatedAt`, the one still forming included. */
export async function fetchBarsSince(symbol: string, market: string, generatedAt: string): Promise<Bar[]> {
  const intervalMs = TF_INTERVAL_MS[EXECUTION_TIMEFRAME];
  const provider = getMarketDataProvider();
  assertLiveMarketData(`arm ${symbol.toUpperCase()}'s plan from its bars`, provider);
  const bars = await provider.fetchBars(
    symbol,
    EXECUTION_TIMEFRAME,
    new Date(Date.parse(generatedAt) - intervalMs),
    null,
    market as AssetClass,
  );
  return (bars ?? []).filter((b) => Date.parse(b.t) >= Date.parse(generatedAt));
}

/** The intake check: true when the plan's stop has broken since it was generated. */
export async function planStopBroken(plan: {
  instrument: string;
  market: string;
  direction: "bullish" | "bearish";
  invalidation: number;
  generatedAt: string;
}): Promise<boolean> {
  const bars = await fetchBarsSince(plan.instrument, plan.market, plan.generatedAt);
  return stopBrokenSince(plan.direction, plan.invalidation, bars, bars.length ? bars[bars.length - 1].c : null);
}

export interface ArmFromBarsResult {
  checked: number;
  armed: string[];
  /** Plans left unarmed because their stop broke first. */
  stopBroken: string[];
  errors: { planId: string; reason: string }[];
}

export async function armConfirmedPlansFromBars(
  supabase: SupabaseClient,
  userId: string,
  opts: { market?: string; now?: Date } = {},
): Promise<ArmFromBarsResult> {
  const now = opts.now ?? new Date();
  const result: ArmFromBarsResult = { checked: 0, armed: [], stopBroken: [], errors: [] };
  const plans = (await listTradePlans(supabase, userId, { state: "awaiting_entry_confirmation" })).filter(
    (p) => (opts.market == null || p.market === opts.market) && !isExpiredByClock(now.toISOString(), p.expiresAt),
  );
  const intervalMs = TF_INTERVAL_MS[EXECUTION_TIMEFRAME];

  for (const plan of plans) {
    result.checked++;
    try {
      const bars = await fetchBarsSince(plan.instrument, plan.market, plan.generatedAt);
      const latest = bars.length ? bars[bars.length - 1].c : null;
      if (stopBrokenSince(plan.direction, plan.coordinates.invalidation, bars, latest)) {
        result.stopBroken.push(plan.planId);
        continue;
      }
      // The plan's own rule, read exactly as the scan-driven advance reads it
      // (`advanceConfirmation.ts`): Gann's crossing line from the entry and
      // stop, or no crossing for an old-level or hold entry; only a
      // stop-and-reverse plan keeps the retest-and-hold sequence. Until
      // 2026-10-21 this passed neither the stop nor the entry kind, so the
      // manager armed every plan on the retest sequence that the reaction
      // rule replaced (review finding R-014).
      const closed = closedSessionBars(bars, now, intervalMs, plan.generatedAt);
      const pivot = isPivotSignal(plan.signalId);
      const rule = {
        direction: plan.direction,
        entryTrigger: plan.coordinates.entryTrigger,
        stopPrice: pivot ? undefined : plan.coordinates.invalidation,
        entryKind: plan.coordinates.entryKind,
      };
      let evidence = replayEntryConfirmation(rule, closed);
      // A crossing plan is usually generated after its crossing closed: since
      // 2026-10-27 a crossing reads Execute only once it is held (definite
      // indication shown, `applyReadyNowHold`). The bars since generation then
      // hold no crossing close, only the reaction. When the completed daily
      // chart still holds the crossing this entry buys, the indication is
      // shown, so the plan arms as an entry resting at its level does and
      // placement's buy-zone test fills it on the reaction (W006 Rules
      // 3(b)-(c) pp.46-47), as `readEntryConfirmationNow` already reads it.
      let heldCrossing = false;
      if (
        !entryReady(evidence) &&
        !pivot &&
        !restsWithoutCrossing(plan.coordinates.entryKind) &&
        (await crossingHeldNow({
          symbol: plan.instrument,
          assetClass: plan.market as AssetClass,
          direction: plan.direction,
          entry: plan.coordinates.entryTrigger,
          now,
        }))
      ) {
        evidence = replayEntryConfirmation({ ...rule, entryKind: "oldLevel" }, closed);
        heldCrossing = true;
      }
      if (!entryReady(evidence)) continue;

      const at = now.toISOString();
      const recorded = await applyEventAndPersist(supabase, userId, plan.planId, {
        type: "record_confirmation_evidence",
        at,
        evidence,
      });
      if (!recorded.ok) {
        result.errors.push({ planId: plan.planId, reason: recorded.error });
        continue;
      }
      const armed = await applyEventAndPersist(supabase, userId, plan.planId, {
        type: "arm",
        at,
        reason: pivot
          ? "Break/retest/confirmation-move sequence completed on closed bars since the plan was generated."
          : heldCrossing
            ? "The crossing closed clearly past the old level before the plan, and the daily chart still holds it; the entry waits for the reaction."
            : restsWithoutCrossing(plan.coordinates.entryKind)
            ? "The entry rests at its level, read on closed bars since the plan was generated."
            : "Price closed clearly past the old level on a closed bar; the entry waits for the reaction.",
      });
      if (armed.ok) result.armed.push(plan.planId);
      else result.errors.push({ planId: plan.planId, reason: armed.error });
    } catch (err) {
      // The refusal's own text names the provider and its settings; it is
      // already in the log (`syntheticDataRefusal`), so the run's response
      // carries the fixed message instead (S-14).
      const reason =
        err instanceof SyntheticMarketDataError ? MARKET_DATA_UNAVAILABLE : err instanceof Error ? err.message : String(err);
      result.errors.push({ planId: plan.planId, reason });
    }
  }
  return result;
}
