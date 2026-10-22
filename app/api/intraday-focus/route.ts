/**
 * GSPS — /api/intraday-focus: builds the next session's intraday focus list.
 *
 * Run by the database's scheduler after the close (migration 0098). Reads the
 * scan universe's daily bars in batched requests (100 symbols each), the
 * standing daily plans, and stores the stocks primed for the next session
 * with their reasons (`lib/scanner/focusList.ts`). The intraday scan times the
 * top of the list (`app/api/intraday-scan/route.ts`). Off every user's path:
 * nobody waits on it.
 *
 * Returns rather than drains (AGENTS.md, "Cycles as architecture"): each run
 * rebuilds the list from the charts, so a missed evening is recovered by the
 * next, and the intraday scan falls back to its core list meanwhile.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { syntheticDataRefusal } from "@/lib/data/feed-mode";
import { equitySession, etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { loadDailyPlans } from "@/lib/scanner/dailyPlans";
import { describeFocusReason, rankFocus, readFocus, type FocusReading } from "@/lib/scanner/focusList";
import type { DailyPlanLevels } from "@/lib/scanner/intraday";

export const maxDuration = 60;

/** Calendar days of daily bars read: the 13-week range plus the averages' warm-up. */
const HISTORY_DAYS = 150;
/** Symbols per daily-plan read, so the request stays a sensible length. */
const PLAN_CHUNK = 200;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const now = new Date();
  const provider = getMarketDataProvider();
  const refused = syntheticDataRefusal("build the intraday focus list", provider);
  if (refused) return NextResponse.json({ error: refused }, { status: 503 });
  if (!provider.fetchBarsBatch) {
    return NextResponse.json({ error: "The market data provider has no batched bars." }, { status: 503 });
  }

  const end = provider.isLive ? new Date(now.getTime() - 16 * 60 * 1000) : null;
  const start = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  let bars: Map<string, import("@/lib/types").Bar[]>;
  try {
    bars = await provider.fetchBarsBatch(LARGE_CAP_UNIVERSE, "1Day", start, end, "us_equity");
  } catch (err) {
    return NextResponse.json({ error: `Daily bars not read: ${String(err)}` }, { status: 502 });
  }

  const service = createServiceClient();
  const plans = new Map<string, DailyPlanLevels>();
  for (let i = 0; i < LARGE_CAP_UNIVERSE.length; i += PLAN_CHUNK) {
    const chunk = await loadDailyPlans(service, LARGE_CAP_UNIVERSE.slice(i, i + PLAN_CHUNK), null).catch(
      () => new Map<string, DailyPlanLevels>(),
    );
    for (const [symbol, plan] of chunk) plans.set(symbol, plan);
  }

  // Completed sessions only: before the close (pre-market or the regular
  // session) today's bar is not complete. After the close it is, so the 6 PM
  // run reads today; reading after-hours as "open" dropped today's bar and
  // left every stock a day behind the basis (2026-10-21's first run stored 0).
  const today = etDateKey(now);
  const session = equitySession(now);
  const sessionOpen = session === "pre" || session === "regular";
  const readings: FocusReading[] = [];
  const lastSession = new Map<string, string>();
  let basisDate = "";
  for (const symbol of LARGE_CAP_UNIVERSE) {
    const all = bars.get(symbol.toUpperCase()) ?? [];
    const sessions = sessionOpen ? all.filter((b) => etDateKey(new Date(b.t)) < today) : all;
    if (sessions.length === 0) continue;
    const last = etDateKey(new Date(sessions[sessions.length - 1].t));
    lastSession.set(symbol.toUpperCase(), last);
    if (last > basisDate) basisDate = last;
    const reading = readFocus(symbol.toUpperCase(), sessions, plans.get(symbol.toUpperCase()) ?? null);
    if (reading) readings.push(reading);
  }
  if (!basisDate) return NextResponse.json({ error: "No daily bars were returned." }, { status: 502 });

  // A stock whose last bar is older than the basis day did not trade it.
  // Read on the same completed sessions the readings used.
  const current = readings.filter((r) => lastSession.get(r.symbol) === basisDate);
  const ranked = rankFocus(current);
  const rows = ranked.map((r, i) => ({
    basis_date: basisDate,
    symbol: r.symbol,
    rank: i + 1,
    reasons: r.reasons,
    close: r.close,
    avg_dollar_volume: Math.round(r.avgDollarVolume),
    built_at: now.toISOString(),
    invalidated_at: null,
    invalidated_reason: null,
  }));

  if (rows.length > 0) {
    const { error } = await service.from("intraday_focus").upsert(rows, { onConflict: "basis_date,symbol" });
    if (error) return NextResponse.json({ error: `Focus list not stored: ${error.message}` }, { status: 500 });
    const { error: pruneError } = await service
      .from("intraday_focus")
      .delete()
      .eq("basis_date", basisDate)
      .not("symbol", "in", `(${rows.map((r) => `"${r.symbol}"`).join(",")})`);
    if (pruneError) console.warn("[intraday-focus] stale rows not pruned:", pruneError.message);
  }

  return NextResponse.json({
    basisDate,
    universe: LARGE_CAP_UNIVERSE.length,
    read: bars.size,
    primed: current.length,
    stored: rows.length,
    ms: Date.now() - startedAt,
    top: ranked.slice(0, 10).map((r) => ({ symbol: r.symbol, reasons: r.reasons.map(describeFocusReason) })),
  });
}
