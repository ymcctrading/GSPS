/**
 * GSPS — /api/cards/edge?part=k: tonight's engine cards ("edgeBottom":
 * entry, stop, TP1, TP2, MTP; lib/cards/edgeCard.ts) for one part of the scan
 * universe, written to `card_calls` beside the strategy modes' cards. The
 * nightly cards job (/api/cards/nightly) walks them with every other card.
 *
 * The engine reads each stock's whole daily history (about 0.2 s of compute
 * a stock, measured 2026-11-11 on 1,575-bar histories; a part of 104 stocks
 * took 16 s to read and 22 s to compute), so the 832-stock universe is split
 * into `EDGE_PARTS` (12) parts, one scheduled call each (migration 0150),
 * each about 25 to 30 s, inside the 60-second budget. Off every user's path:
 * nobody waits on it.
 *
 * Cycles as architecture: each night's run rebuilds every card from the
 * charts, so a missed part is simply not issued that night and the next
 * night reads that stock afresh (its card, if still open, is offered again).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { equitySession, etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { edgeCardFor, edgePart, rotateForDate, shownTargets, EDGE_HISTORY_START, EDGE_PARTS } from "@/lib/cards/edgeCard";
import { cardKindShown } from "@/lib/setups/cardRecords";

export const maxDuration = 60;

/** Stop computing new cards after this long; the rest of the part waits for the next night. */
const COMPUTE_DEADLINE_MS = 48_000;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const part = Number(req.nextUrl.searchParams.get("part"));
  if (!Number.isInteger(part) || part < 0 || part >= EDGE_PARTS) {
    return NextResponse.json({ error: `part must be 0..${EDGE_PARTS - 1}` }, { status: 400 });
  }
  const startedAt = Date.now();
  const now = new Date();
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("build the engine cards", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }
  if (!provider.fetchBarsBatch) {
    return NextResponse.json({ error: "The market data provider has no batched bars." }, { status: 503 });
  }

  const symbols = edgePart(LARGE_CAP_UNIVERSE, part);
  const end = provider.isLive ? new Date(now.getTime() - 16 * 60 * 1000) : null;
  let fetched;
  try {
    fetched = await provider.fetchBarsBatch(symbols, "1Day", new Date(`${EDGE_HISTORY_START}T00:00:00Z`), end, "us_equity");
  } catch (err) {
    return NextResponse.json({ error: `Daily bars not read: ${String(err)}` }, { status: 502 });
  }
  const fetchMs = Date.now() - startedAt;

  // Completed sessions only, as the nightly cards job reads them.
  const today = etDateKey(now);
  const session = equitySession(now);
  const sessionOpen = session === "pre" || session === "regular";
  let basisDate = "";
  const done = new Map<string, NonNullable<ReturnType<typeof fetched.get>>>();
  for (const [symbol, all] of fetched) {
    const bars = sessionOpen ? all.filter((b) => etDateKey(new Date(b.t)) < today) : all;
    if (bars.length === 0) continue;
    done.set(symbol.toUpperCase(), bars);
    const last = etDateKey(new Date(bars[bars.length - 1].t));
    if (last > basisDate) basisDate = last;
  }
  if (!basisDate) return NextResponse.json({ error: "No daily bars were returned." }, { status: 502 });

  const rows = [];
  let computed = 0;
  let skipped = 0;
  let failed = 0;
  // Read from a date-anchored start, so a deadline skips a different run of stocks each night.
  for (const symbol of rotateForDate([...done.keys()].sort(), basisDate)) {
    const bars = done.get(symbol)!;
    if (Date.now() - startedAt > COMPUTE_DEADLINE_MS) {
      skipped++;
      continue;
    }
    const signalBar = bars[bars.length - 1];
    if (etDateKey(new Date(signalBar.t)) !== basisDate) continue;
    computed++;
    let card;
    try {
      card = edgeCardFor(symbol, bars);
    } catch (err) {
      failed++;
      console.error(`[cards/edge] ${symbol}: ${String(err)}`);
      continue;
    }
    if (!card) continue;
    const targets = shownTargets(card);
    rows.push({
      kind: "edgeBottom",
      symbol,
      signal_date: basisDate,
      entry: card.entry,
      stop: card.stop,
      tp1: targets.tp1,
      tp2: targets.tp2,
      mtp: targets.mtp,
      signal_close: signalBar.c,
      published: cardKindShown("edgeBottom"),
    });
  }
  if (rows.length > 0) {
    const service = createServiceClient();
    const { error } = await service.from("card_calls").upsert(rows, { onConflict: "kind,symbol,signal_date", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: `Cards not stored: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    part,
    basisDate,
    symbols: symbols.length,
    read: done.size,
    computed,
    issued: rows.length,
    skippedForTime: skipped,
    failed,
    fetchMs,
    ms: Date.now() - startedAt,
  });
}
