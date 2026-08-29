/**
 * GSPS — /api/scan-history
 *
 * Read side of the Scanner page's "History" tab: what a manual scan told
 * this user, grouped by the run that produced it, next to what each
 * symbol's status is now.
 *
 * "Now" is not computed here — it is read straight off `active_monitors`
 * (migration 0036), the entitlement notification system's own live
 * WATCH/EXECUTE/INVALIDATED tracker for this profile, kept current by every
 * scan of any source that touches a symbol (manual dashboard, guided,
 * automation, intraday, the scheduled morning scans). This route never
 * re-scans a symbol to answer "has this changed" — doing so would mean two
 * different code paths could disagree about a symbol's live state. A symbol
 * with no monitor row (most often a Reject that has never since become a
 * real setup for this profile) has no current state to report, and the
 * response says so rather than guessing.
 *
 * Signed-in users only, and always scoped to their own rows — RLS ("own
 * scan results" / "own active monitors") is the backstop, but the query
 * itself filters explicitly, same convention as the rest of this codebase.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildHistorySymbol, type MonitorState, type ScanHistoryRun, type ScannedState } from "@/lib/scanner/history";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const days = resolveDays(new URL(req.url).searchParams.get("days"));
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const { data: resultRows, error: resultsError } = await supabase
    .from("scan_results")
    .select(
      "scan_execution_id, symbol, asset_class, direction, score, output_state, entry, stop_loss, take_profit_1, master_profit, created_at",
    )
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }
  if (!resultRows || resultRows.length === 0) {
    return NextResponse.json({ days, runs: [] satisfies ScanHistoryRun[] });
  }

  const symbols = [...new Set(resultRows.map((r) => r.symbol))];
  const { data: monitorRows, error: monitorsError } = await supabase
    .from("active_monitors")
    .select("symbol, state, last_evaluated_at")
    .eq("profile_id", user.id)
    .in("symbol", symbols)
    .order("last_evaluated_at", { ascending: false });

  if (monitorsError) {
    // A monitor read failure shouldn't hide the scan history itself — it
    // just means every symbol reports no current state, same as one that
    // was never monitored.
    console.error(`scan-history: active monitors not read — ${monitorsError.message}`);
  }

  // First row per symbol wins (rows arrived newest-first).
  const latestMonitorBySymbol = new Map<string, { state: MonitorState; last_evaluated_at: string }>();
  for (const row of monitorRows ?? []) {
    if (!latestMonitorBySymbol.has(row.symbol)) {
      latestMonitorBySymbol.set(row.symbol, {
        state: row.state as MonitorState,
        last_evaluated_at: row.last_evaluated_at,
      });
    }
  }

  // Group by the run that produced each row. A row from before this
  // migration (no scan_execution_id) groups alone rather than with anything
  // else, since there's no shared key to merge it on.
  const runs = new Map<string, ScanHistoryRun>();
  for (const row of resultRows) {
    const key = row.scan_execution_id ?? `standalone:${row.created_at}:${row.symbol}`;
    let run = runs.get(key);
    if (!run) {
      run = { scanExecutionId: row.scan_execution_id, runAt: row.created_at, symbols: [] };
      runs.set(key, run);
    }
    const monitor = latestMonitorBySymbol.get(row.symbol) ?? null;
    run.symbols.push(
      buildHistorySymbol({
        symbol: row.symbol,
        assetClass: row.asset_class,
        direction: row.direction as "bullish" | "bearish" | "none",
        scannedState: row.output_state as ScannedState,
        score: row.score,
        entry: row.entry,
        stopLoss: row.stop_loss,
        takeProfit1: row.take_profit_1,
        masterProfit: row.master_profit,
        currentState: monitor?.state ?? null,
        currentStateAsOf: monitor?.last_evaluated_at ?? null,
      }),
    );
  }

  return NextResponse.json({
    days,
    runs: [...runs.values()].sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt)),
  });
}

function resolveDays(param: string | null): number {
  const parsed = Number(param);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}
