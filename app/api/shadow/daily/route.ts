/**
 * GSPS — /api/shadow/daily (owner only)
 *
 * The forward test's daily record: every Execute call recorded, by the session
 * it trades, with its outcome, losses and non-fills included
 * (`lib/shadow/daily.ts`). Shown to the owner's two accounts only
 * (`lib/auth/owner.ts`), so the record can be checked before any live trading
 * or public figure; everyone else gets a 404, so the route discloses nothing.
 *
 * Usage: GET /api/shadow/daily?days=30 (1 to 180; every rule version, each
 * call labelled with its version).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ownerOf } from "@/lib/auth/owner";
import { etDateKey } from "@/lib/market/session";
import { buildShadowDays, shadowTotals, type ShadowRecordRow } from "@/lib/shadow/daily";
import { STORED_STRATEGY_VERSION } from "@/lib/backtest/publicVersion";

const MAX_DAYS = 180;
const PAGE = 1000;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!ownerOf(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysParam) ? Math.min(MAX_DAYS, Math.max(1, Math.floor(daysParam))) : 30;
  const since = etDateKey(new Date(Date.now() - days * 24 * 3600_000));

  const service = createServiceClient();
  const rows: ShadowRecordRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from("shadow_signals")
      .select("symbol, direction, strategy_version, entry, stop_loss, score, source, scanned_at, session_date, outcome, r_multiple, bars_held, fill_price")
      // A row stored before sessions were recorded has none: read it by its scan time.
      .or(`session_date.gte.${since},and(session_date.is.null,scanned_at.gte.${since})`)
      .order("scanned_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`shadow daily: read failed — ${error.message}`);
      return NextResponse.json({ error: "Record unavailable" }, { status: 503 });
    }
    rows.push(...((data ?? []) as ShadowRecordRow[]));
    if (!data || data.length < PAGE) break;
  }

  const record = buildShadowDays(rows);
  return NextResponse.json(
    { days, since, currentVersion: STORED_STRATEGY_VERSION, totals: shadowTotals(record), record },
    { headers: { "Cache-Control": "no-store" } },
  );
}
