/**
 * GSPS — /api/monitors/invalidation-sweep
 *
 * A cheap, live counterpart to the full scheduled scans. Before this route
 * existed, a tracked `active_monitors` row (WATCH or EXECUTE) could only be
 * invalidated by a later full scan re-evaluating that exact symbol and
 * getting back a "Reject" — see lib/entitlements/scan-fanout.ts's
 * `rejectedSymbols` handling — which meant a setup that had already broken
 * its stop could sit on the dashboard reading Execute for hours, until the
 * next scheduled scan happened to look at it again.
 *
 * This route does the one cheap thing a full rescan would also tell it:
 * fetch the current live price for every symbol with an open monitor
 * anywhere, and check it against that monitor's own trade plan's stop —
 * exactly `lib/trade/invalidate-pending.ts`'s `isInvalidatedByStop`, the
 * same check `lib/dailyScans.ts` already applies to `daily_scans` rows at
 * read time. One price fetch per distinct tracked symbol, never a full
 * scanTicker pass over the universe. Twice an hour, market hours only, per
 * project owner direction (2026-09-17) — see
 * .github/workflows/monitor-invalidation-sweep.yml for the exact :15/:45
 * cadence.
 *
 * A monitor with no scan_results row to read a stop from (nothing this
 * profile has ever scanned that symbol through) is left alone — this route
 * only ever narrows WATCH/EXECUTE to INVALIDATED off a stop it can actually
 * check, never invents one.
 *
 * Same bearer-secret auth pattern as every other cron-invoked route in this
 * codebase (see app/api/market-scan/route.ts).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isTradingDay } from "@/lib/market/calendar";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import { evaluateMonitor } from "@/lib/entitlements/monitor-store";
import type { MonitorState } from "@/lib/entitlements/monitor";

export const maxDuration = 60;

function isAuthorized(authorizationHeader: string | null): boolean {
  return Boolean(process.env.CRON_SECRET) && authorizationHeader === `Bearer ${process.env.CRON_SECRET}`;
}

interface OpenMonitor {
  id: string;
  profile_id: string;
  symbol: string;
  state: MonitorState;
}

interface LatestScanResultRow {
  user_id: string;
  symbol: string;
  direction: string;
  stop_loss: number | null;
  created_at: string;
}

/**
 * This route only ever transitions an EXISTING WATCH/EXECUTE monitor to
 * INVALIDATED — `decideTransition` (lib/entitlements/monitor.ts) only
 * applies the new-monitor capacity check when `priorState === null`, which
 * can't happen here (every row this route evaluates was already loaded from
 * an open monitor). The capacity limit is therefore never consulted; this
 * constant exists only to satisfy `evaluateMonitor`'s signature.
 */
const CAPACITY_UNUSED = "unlimited" as const;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const index = i++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("invalidation-sweep: CRON_SECRET is not set — the sweep cannot run");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isTradingDay(now)) {
    return NextResponse.json({ skipped: "non_trading_day" });
  }

  const service = createServiceClient();

  const { data: monitors, error: monitorsError } = await service
    .from("active_monitors")
    .select("id, profile_id, symbol, state")
    .in("state", ["WATCH", "EXECUTE"]);
  if (monitorsError || !monitors) {
    console.error(`invalidation-sweep: could not list open monitors — ${monitorsError?.message}`);
    return NextResponse.json({ error: "Could not list open monitors" }, { status: 503 });
  }
  const openMonitors = monitors as OpenMonitor[];
  if (openMonitors.length === 0) {
    return NextResponse.json({ checked: 0, invalidated: 0 });
  }

  const symbols = [...new Set(openMonitors.map((m) => m.symbol))];
  const profileIds = [...new Set(openMonitors.map((m) => m.profile_id))];

  // Each open monitor's own trade plan comes from that profile's most recent
  // scan_results row for the symbol — the same source lib/dashboard/
  // trackedExecute.ts already reads for the "tracked Execute setups" card.
  const { data: resultRows } = await service
    .from("scan_results")
    .select("user_id, symbol, direction, stop_loss, created_at")
    .in("user_id", profileIds)
    .in("symbol", symbols)
    .order("created_at", { ascending: false });

  const latestByProfileSymbol = new Map<string, LatestScanResultRow>();
  for (const row of (resultRows ?? []) as LatestScanResultRow[]) {
    const key = `${row.user_id}:${row.symbol}`;
    if (!latestByProfileSymbol.has(key)) latestByProfileSymbol.set(key, row);
  }

  const provider = getMarketDataProvider();
  const priceBySymbol = new Map<string, number | null>();
  await mapWithConcurrency(symbols, 6, async (symbol) => {
    try {
      const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
      priceBySymbol.set(symbol, await provider.fetchLatestPrice(symbol, assetClass));
    } catch {
      priceBySymbol.set(symbol, null);
    }
  });

  let invalidated = 0;
  for (const monitor of openMonitors) {
    const plan = latestByProfileSymbol.get(`${monitor.profile_id}:${monitor.symbol}`);
    if (!plan || plan.stop_loss == null) continue;

    const price = priceBySymbol.get(monitor.symbol);
    if (price == null || !Number.isFinite(price)) continue;

    const side = plan.direction === "bearish" ? "sell" : "buy";
    if (!isInvalidatedByStop({ side, stop_price: plan.stop_loss }, price)) continue;

    try {
      const result = await evaluateMonitor(service, {
        profileId: monitor.profile_id,
        symbol: monitor.symbol,
        source: "scheduled_invalidation_sweep",
        candidateState: "INVALIDATED",
        evaluationId: randomUUID(),
        maxActiveWatchMonitors: CAPACITY_UNUSED,
        now,
      });
      if (result.outcome === "applied") invalidated += 1;
    } catch (err) {
      console.error(`invalidation-sweep: monitor evaluation failed for ${monitor.symbol}:`, err);
    }
  }

  return NextResponse.json({ checked: openMonitors.length, symbolsPriced: symbols.length, invalidated });
}
