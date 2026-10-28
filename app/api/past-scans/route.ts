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
 * outcome fields leave the server. No quote or bar is fetched. The API cuts a
 * read at 1,000 rows without an error, so every list read pages (`readAll`);
 * the two chosen sessions are read on their own (30 rows at most each).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { isComplete, isInvalidated } from "@/lib/dailyScans";
import { etDateKey } from "@/lib/market/session";
import { PRODUCTION_REPLAY_RUNS } from "@/lib/backtest/replayReference";
import { publicVersionLabel } from "@/lib/backtest/publicVersion";
import {
  comparePastScans,
  earliestReadableDate,
  forwardTestByVersion,
  type ForwardOutcome,
  type ForwardTestRow,
  type PastScanRow,
  type PastScanState,
} from "@/lib/scanner/pastScans";

// The version names stay on the server; a screen reads the label only.
const PUBLIC_REPLAY_RUNS = PRODUCTION_REPLAY_RUNS.map((run) => ({
  ...run,
  file: undefined,
  strategyVersion: publicVersionLabel(run.strategyVersion),
}));

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

interface ShadowSelect {
  symbol: string;
  direction: "bullish" | "bearish";
  scanned_at: string;
  entry: number | string | null;
  outcome: ForwardOutcome | null;
  r_multiple: number | string | null;
  bars_held: number | null;
  fill_price: number | string | null;
  strategy_version: string;
}

/** The API's page size: a read is cut here without an error, so every list read pages. */
const PAGE = 1000;
/** Pages read at most per list, a guard against a runaway loop. */
const MAX_PAGES = 50;

/** Reads every row of a query, page by page, ordered so the pages don't overlap. */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
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
    strategyVersion: publicVersionLabel(r.strategy_version),
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
  // Every published direction has a rank 1 (`lib/scan/publish.ts` ranks from
  // 1), so reading those rows lists the dates at two rows a session at most.
  const { rows: dateRows, error: datesError } = await readAll<{ scan_date: string }>((from, to) => {
    let q = supabase.from("daily_scans").select("scan_date").eq("rank", 1);
    if (floor) q = q.gte("scan_date", floor);
    return q.order("scan_date", { ascending: false }).range(from, to);
  });
  if (datesError) return NextResponse.json({ error: datesError }, { status: 500 });
  const dates = [...new Set(dateRows.map((r) => r.scan_date))];

  const params = new URL(req.url).searchParams;
  const asked = (name: string) => {
    const v = params.get(name);
    return v && DATE.test(v) ? v : null;
  };
  let later = asked("later") ?? dates[0] ?? null;
  let earlier = asked("earlier") ?? dates.find((d) => later !== null && d < later) ?? null;
  if (earlier && later && earlier > later) [earlier, later] = [later, earlier];
  const empty = (note: string) =>
    NextResponse.json({
      dates,
      earlier: null,
      later: null,
      rows: [],
      forwardByVersion: [],
      // The version names stay on the server; a screen reads the label only.
    replay: PUBLIC_REPLAY_RUNS,
      exactScoreDisplayEnabled: policy.exactScoreDisplayEnabled,
      note,
    });
  if (dates.length < 2) return empty("Fewer than two sessions are inside your plan's history.");
  if (!earlier || !later || !dates.includes(earlier) || !dates.includes(later)) {
    return empty("Pick two sessions from the list.");
  }
  if (earlier === later) return empty("Pick two different sessions.");

  const LIST_COLUMNS =
    "scan_date, symbol, direction, rank, score, output_state, entry, stop_loss, take_profit_1, master_profit, strategy_version, detail";
  const service = createServiceClient();
  const [earlierRead, laterRead, betweenRead, forwardRead] = await Promise.all([
    supabase.from("daily_scans").select(LIST_COLUMNS).eq("scan_date", earlier).order("rank"),
    supabase.from("daily_scans").select(LIST_COLUMNS).eq("scan_date", later).order("rank"),
    // Only the Executes between the two, for "caught later".
    readAll<DailyScanSelect>((from, to) =>
      supabase
        .from("daily_scans")
        .select(LIST_COLUMNS)
        .eq("output_state", "Execute")
        .gt("scan_date", earlier)
        .lt("scan_date", later)
        .order("scan_date")
        .order("direction")
        .order("rank")
        .range(from, to),
    ),
    // The forward test inside the member's reach, for the rows and the by-version panel.
    readAll<ShadowSelect>((from, to) => {
      let q = service
        .from("shadow_signals")
        .select("symbol, direction, scanned_at, entry, outcome, r_multiple, bars_held, fill_price, strategy_version");
      if (floor) q = q.gte("scanned_at", `${floor}T00:00:00Z`);
      return q.order("scanned_at", { ascending: false }).order("id").range(from, to);
    }),
  ]);
  const scansError = earlierRead.error?.message ?? laterRead.error?.message ?? betweenRead.error;
  if (scansError) return NextResponse.json({ error: scansError }, { status: 500 });
  if (forwardRead.error) console.error(`past-scans: forward test not read — ${forwardRead.error}`);
  const scanRows = [
    ...((earlierRead.data ?? []) as DailyScanSelect[]),
    ...((laterRead.data ?? []) as DailyScanSelect[]),
    ...betweenRead.rows,
  ];
  const shadowRows = forwardRead.error ? [] : forwardRead.rows;
  const shadowError = forwardRead.error;

  const listed = scanRows.filter((r) => isComplete(r) && !isInvalidated(r));
  const byDate = new Map<string, PastScanRow[]>();
  for (const r of listed) {
    const list = byDate.get(r.scan_date) ?? [];
    list.push(toPastRow(r));
    byDate.set(r.scan_date, list);
  }

  const forward: ForwardTestRow[] = shadowRows.map((r) => ({
    symbol: r.symbol,
    direction: r.direction,
    sessionDate: etDateKey(new Date(r.scanned_at)),
    scannedAt: r.scanned_at,
    entry: num(r.entry),
    outcome: r.outcome ?? null,
    rMultiple: num(r.r_multiple),
    barsHeld: r.bars_held ?? null,
    fillPrice: num(r.fill_price),
    strategyVersion: publicVersionLabel(r.strategy_version),
  }))
    // The read starts at midnight UTC, the evening before the floor in New
    // York; a recording from that earlier session is outside the reach.
    .filter((r) => !floor || r.sessionDate >= floor);

  const rows = comparePastScans({
    earlierDate: earlier,
    laterDate: later,
    earlier: byDate.get(earlier) ?? [],
    later: byDate.get(later) ?? [],
    between: [...byDate.entries()]
      .filter(([date]) => date > earlier && date < later)
      .map(([date, list]) => ({ date, rows: list })),
    forward,
  });

  return NextResponse.json({
    dates,
    earlier,
    later,
    rows,
    forwardByVersion: shadowError ? null : forwardTestByVersion(forward),
    replay: PUBLIC_REPLAY_RUNS,
    exactScoreDisplayEnabled: policy.exactScoreDisplayEnabled,
  });
}
