/**
 * Phase 5: shared scan -> visible-results -> monitor -> notification
 * fan-out, factored out of app/api/batch-scan/route.ts (the original,
 * Phase 3E, single-profile implementation of this pipeline) so the
 * scheduled 6:00/9:15 ET jobs (lib/entitlements/scheduled-scan.ts) apply
 * the exact same entitlement rules per profile rather than a second,
 * possibly-diverging copy.
 *
 * Nothing here talks to a market-data provider or runs a scan itself --
 * callers pass in the qualifying ranked setups a scan already produced.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { selectVisibleResults, type RankedSetup } from "@/lib/entitlements/result-selection";
import { evaluateMonitor } from "@/lib/entitlements/monitor-store";
import {
  dispatchNotificationDelivery,
  getEnabledChannels,
  recordNotificationDelivery,
  type EntitledAlertPayload,
} from "@/lib/entitlements/delivery";
import { toPublicSignalSummary } from "@/lib/signals/publicSummary";
import type { Limit } from "@/lib/entitlements/policy";
import type { ScanResult } from "@/lib/types";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import { buildNewTradePlanFromScanResult } from "@/lib/lifecycle/fromScanResult";
import { applyEventAndPersist, createTradePlan } from "@/lib/lifecycle/store";

export type FanOutOutcome = {
  visibleCount: number;
  notifiedCount: number;
};

/**
 * Applies the result-visibility cap for one profile against a shared set of
 * qualifying setups, persists that profile's `visible_scan_results` rows
 * against an existing `scan_executions` row (its own, for a user-initiated
 * scan; a shared system row, for a scheduled job -- see
 * `visible_scan_results.scan_execution_id` in migration 0036), evaluates a
 * monitor transition for every visible setup and every rejected symbol that
 * already has an open monitor, and dispatches a notification for any
 * transition that confirms WATCH -> EXECUTE. Best-effort throughout past
 * the visible-results write: one profile's monitor/notification failure
 * must never abort the fan-out for the rest.
 */
export async function fanOutForProfile(
  service: SupabaseClient,
  args: {
    profileId: string;
    scanExecutionId: string;
    source: string;
    qualifying: RankedSetup<ScanResult>[];
    rejectedSymbols: Set<string>;
    maxDashboardSetupsPerScan: number;
    maxActiveWatchMonitors: Limit;
  },
): Promise<FanOutOutcome> {
  const { visible } = selectVisibleResults(args.qualifying, {
    maxSetupsPerScan: args.maxDashboardSetupsPerScan,
    noviceDirectionalBackfill: args.maxDashboardSetupsPerScan === 6,
    isTopTier: args.maxDashboardSetupsPerScan === 30,
  });

  if (visible.length > 0) {
    const rows = visible.map((v, i) => ({
      scan_execution_id: args.scanExecutionId,
      profile_id: args.profileId,
      symbol: v.value.symbol,
      side: v.side,
      rank: i + 1,
    }));
    const { error } = await service.from("visible_scan_results").insert(rows);
    if (error) {
      console.error(`fanOutForProfile: visible scan results not recorded for ${args.profileId} — ${error.message}`);
    }
  }

  const notifiedCount = await evaluateMonitorsAndNotify(service, {
    profileId: args.profileId,
    source: args.source,
    scanExecutionId: args.scanExecutionId,
    visible,
    rejectedSymbols: args.rejectedSymbols,
    maxActiveWatchMonitors: args.maxActiveWatchMonitors,
  });

  return { visibleCount: visible.length, notifiedCount };
}

/**
 * Evaluates a monitor for every visible setup (WATCH/EXECUTE) and for every
 * scanned-but-rejected symbol that already has an open monitor
 * (INVALIDATED). Records and immediately dispatches a notification delivery
 * for each transition that confirms WATCH -> EXECUTE. Returns the number of
 * deliveries this call actually sent (not merely recorded), for callers
 * that want it in a summary/log line.
 */
export async function evaluateMonitorsAndNotify(
  service: SupabaseClient,
  args: {
    profileId: string;
    source: string;
    scanExecutionId: string;
    visible: RankedSetup<ScanResult>[];
    rejectedSymbols: Set<string>;
    maxActiveWatchMonitors: Limit;
  },
): Promise<number> {
  const notifyWorthy: { transitionId: string; setup: RankedSetup<ScanResult> }[] = [];

  for (const setup of args.visible) {
    try {
      const result = await evaluateMonitor(service, {
        profileId: args.profileId,
        symbol: setup.value.symbol,
        source: args.source,
        candidateState: setup.value.decision.outputState === "Execute" ? "EXECUTE" : "WATCH",
        evaluationId: args.scanExecutionId,
        maxActiveWatchMonitors: args.maxActiveWatchMonitors,
      });
      if (result.outcome === "applied" && result.notify && result.transitionId) {
        notifyWorthy.push({ transitionId: result.transitionId, setup });
      }
    } catch (err) {
      console.error(`evaluateMonitorsAndNotify: monitor evaluation failed for ${setup.value.symbol} — ${String(err)}`);
    }
  }

  for (const symbol of args.rejectedSymbols) {
    try {
      await evaluateMonitor(service, {
        profileId: args.profileId,
        symbol,
        source: args.source,
        candidateState: "INVALIDATED",
        evaluationId: args.scanExecutionId,
        maxActiveWatchMonitors: args.maxActiveWatchMonitors,
      });
    } catch (err) {
      console.error(`evaluateMonitorsAndNotify: monitor invalidation failed for ${symbol} — ${String(err)}`);
    }
  }

  if (notifyWorthy.length === 0) return 0;

  const channels = await getEnabledChannels(service, args.profileId).catch((err) => {
    console.error(`evaluateMonitorsAndNotify: enabled channels not resolved — ${String(err)}`);
    return [];
  });
  if (channels.length === 0) return 0;

  let sentCount = 0;
  for (const { transitionId, setup } of notifyWorthy) {
    // Best-effort, same as everything else in this loop: a plan that fails to
    // create must never hold up the alert itself, which is the reason this
    // transition confirmed in the first place.
    await createTradePlanForTransition(service, args.profileId, transitionId, setup).catch((err) => {
      console.error(`evaluateMonitorsAndNotify: trade plan not created for ${setup.value.symbol} — ${String(err)}`);
    });

    const payload = buildAlertPayload(setup);
    for (const channel of channels) {
      try {
        const recorded = await recordNotificationDelivery(service, {
          transitionId,
          profileId: args.profileId,
          channel,
          idempotencyKey: `${transitionId}:${channel}`,
          payload,
        });
        if (!recorded.recorded || !recorded.deliveryId) continue;
        const outcome = await dispatchNotificationDelivery(service, {
          deliveryId: recorded.deliveryId,
          profileId: args.profileId,
        });
        if (outcome.dispatched && outcome.status === "sent") sentCount += 1;
      } catch (err) {
        console.error(`evaluateMonitorsAndNotify: delivery failed for ${setup.value.symbol}/${channel} — ${String(err)}`);
      }
    }
  }
  return sentCount;
}

/**
 * Auto-creates a trade-plan lifecycle object (`lib/lifecycle/`) for a setup
 * that just confirmed WATCH -> EXECUTE, and advances it straight to ARMED:
 * the Rules Alignment gates that made this transition confirm already
 * qualified it, and the setup's entry trigger is already priced and waiting
 * for price to reach it. `signalId` keys off `transitionId` — the monitor
 * transition already uniquely identifies "this setup, this confirmation" —
 * so a re-notified transition (there isn't one; transitions are one-shot)
 * would collide rather than silently duplicate the plan.
 */
async function createTradePlanForTransition(
  service: SupabaseClient,
  profileId: string,
  transitionId: string,
  setup: RankedSetup<ScanResult>,
): Promise<void> {
  const input = buildNewTradePlanFromScanResult(setup.value, {
    strategyVersion: STRATEGY_VERSION,
    signalId: transitionId,
    generatedAt: setup.value.scannedAt,
  });
  if (!input) return;

  const plan = await createTradePlan(service, profileId, input);
  const at = new Date().toISOString();
  const qualified = await applyEventAndPersist(service, profileId, plan.planId, {
    type: "qualify",
    at,
    reason: "Monitor confirmed WATCH -> EXECUTE; Rules Alignment gates passed.",
  });
  if (!qualified.ok) return;
  await applyEventAndPersist(service, profileId, plan.planId, {
    type: "arm",
    at,
    reason: "Entry trigger priced from the confirmed setup.",
  });
}

function buildAlertPayload(setup: RankedSetup<ScanResult>): EntitledAlertPayload {
  const r = setup.value;
  const entry = r.levels?.entry ?? r.currentPrice;
  return {
    symbol: r.symbol,
    direction: setup.side === "buy" ? "bullish" : "bearish",
    score: r.decision.score,
    entry,
    stopLoss: r.levels?.stopLoss ?? entry,
    takeProfit: r.levels?.takeProfit1 ?? entry,
    verdict: r.decision.outputState,
    confidence: r.decision.score / 9,
    // Informational only — see EntitledAlertPayload's doc comment. Does not
    // affect whether this alert fires or what triggered it.
    signal: toPublicSignalSummary(
      r.signals?.trendPullback,
      r.signals?.trendBreakout,
      r.signals?.confirmedReversal,
      r.signals?.rangeReversion,
    ),
  };
}
