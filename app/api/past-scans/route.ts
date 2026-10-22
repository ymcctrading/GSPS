/**
 * GSPS — /api/past-scans
 *
 * Read side of the Scanner's "Past scans" tab (Q2 item 5): two sessions'
 * published daily lists side by side, what changed between them, which Watch
 * became an Execute later, the forward test's walk of each Execute, and the
 * forward test by strategy version beside the committed replay. See
 * `lib/scanner/pastScans.ts` for the design basis.
 *
 *   GET /api/past-scans                         latest session and the one before it
 *   GET /api/past-scans?earlier=2026-10-20&later=2026-10-22
 *
 * A record read back, never a re-scan: each date shows the rows published that
 * day, as the lists showed them (complete plans, not retired or through their
 * stop at scan time). How far back a member reads is the tier's
 * `scanHistoryRetentionDays`. `shadow_signals` is platform telemetry with no
 * member read policy, so it is read with the service client and only its
 * outcome fields leave the server. No quote or bar is fetched.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { isComplete, isInvalidated } from "@/lib/dailyScans";
import { etDateKey } from "@/lib/market/session";
import {
  comparePastScans,
  earliestReadableDate,
  forwardTestByVersion,
  type ForwardOutcome,
  type ForwardTestRow,
  type PastScanRow,
  type PastScanState,
} from "@/lib/scanner/pastScans";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface DailyScanSelect {
  scan_date: string;
  symbol: string;
  direction: "bullish" | "bearish";
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  strategy_version: string | null;
  detail: { retired?: boolean | null; currentPrice?: number | null; breakdown?: { key?: string; passed: boolean }[] | null } | null;
}

function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPastRow(r: DailyScanSelect): PastScanRow {
  return {
    symbol: r.symbol,
    direction: r.direction,
    rank: r.rank,
    state: r.output_state as PastScanState,
    score: Number(r.score),
    entry: num(r.entry),
    stopLoss: num(r.stop_loss),
    takeProfit1: num(r.take_profit_1),
    masterProfit: num(r.master_profit),
    strategyVersion: r.strategy_version,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  const today = etDateKey(new Date());
  const floor = earliestReadableDate(today, policy.scanHistoryRetentionDays);

  // Every session with a published list, newest first, inside the tier's reach.
  let datesQuery = supabase.from("daily_scans").select("scan_date").order("scan_date", { ascending: false }).limit(5000);
  if (floor) datesQuery = datesQuery.gte("scan_date", floor);
  const { data: dateRows, error: datesError } = await datesQuery;
  if (datesError) return NextResponse.json({ error: datesError.message }, { status: 500 });
  const dates = [...new Set((dateRows ?? []).map((r) => r.scan_date as string))];

  const params = new URL(req.url).searchParams;
  const asked = (name: string) => {
    const v = params.get(name);
    return v && DATE.test(v) ? v : null;
  };
  let later = asked("later") ?? dates[0] ?? null;
  let earlier = asked("earlier") ?? dates.find((d) => later !== null && d < later) ?? null;
  if (earlier && later && earlier > later) [earlier, later] = [later, earlier];
  if (!earlier || !later || !dates.includes(earlier) || !dates.includes(later)) {
    return NextResponse.json({
      dates,
      earlier: null,
      later: null,
      rows: [],
      forwardByVersion: [],
      exactScoreDisplayEnabled: policy.exactScoreDisplayEnabled,
      note: dates.length < 2 ? "Fewer than two sessions are inside your plan's history." : "Pick two sessions from the list.",
    });
  }

  const service = createServiceClient();
  const [{ data: scanRows, error: scansError }, { data: shadowRows, error: shadowError }] = await Promise.all([
    supabase
      .from("daily_scans")
      .select(
        "scan_date, symbol, direction, rank, score, output_state, entry, stop_loss, take_profit_1, master_profit, strategy_version, detail",
      )
      .gte("scan_date", earlier)
      .lte("scan_date", later)
      .order("rank"),
    service
      .from("shadow_signals")
      .select("symbol, direction, scanned_at, outcome, r_multiple, bars_held, fill_price, strategy_version")
      .order("scanned_at", { ascending: false })
      .limit(5000),
  ]);
  if (scansError) return NextResponse.json({ error: scansError.message }, { status: 500 });
  if (shadowError) console.error(`past-scans: forward test not read — ${shadowError.message}`);

  const listed = ((scanRows ?? []) as DailyScanSelect[]).filter((r) => isComplete(r) && !isInvalidated(r));
  const byDate = new Map<string, PastScanRow[]>();
  for (const r of listed) {
    const list = byDate.get(r.scan_date) ?? [];
    list.push(toPastRow(r));
    byDate.set(r.scan_date, list);
  }

  const forward: ForwardTestRow[] = (shadowRows ?? []).map((r) => ({
    symbol: r.symbol as string,
    direction: r.direction as "bullish" | "bearish",
    sessionDate: etDateKey(new Date(r.scanned_at as string)),
    scannedAt: r.scanned_at as string,
    outcome: (r.outcome as ForwardOutcome | null) ?? null,
    rMultiple: num(r.r_multiple as number | string | null),
    barsHeld: (r.bars_held as number | null) ?? null,
    fillPrice: num(r.fill_price as number | string | null),
    strategyVersion: r.strategy_version as string,
  }));

  const rows = comparePastScans({
    earlierDate: earlier,
    laterDate: later,
    earlier: byDate.get(earlier) ?? [],
    later: byDate.get(later) ?? [],
    between: [...byDate.entries()].map(([date, list]) => ({ date, rows: list })),
    forward,
  });

  return NextResponse.json({
    dates,
    earlier,
    later,
    rows,
    forwardByVersion: shadowError ? null : forwardTestByVersion(forward),
    exactScoreDisplayEnabled: policy.exactScoreDisplayEnabled,
  });
}
