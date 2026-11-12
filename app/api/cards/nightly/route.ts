/**
 * GSPS — /api/cards/nightly: builds the next session's trade cards and scores
 * the earlier ones (lib/cards/cardCalls.ts).
 *
 * Run by the database's scheduler after the close (migration 0148). Reads the
 * scan universe's daily bars in batched requests, arms each daily strategy
 * mode's long cards on the last completed bar, and records them, marking as
 * published only the kinds whose held-out record passed
 * (lib/setups/cardRecords.ts); for the stocks with an RSI reversal card it
 * also reads the long daily history Rule 10 needs (the "rsiReversalTimed"
 * kind, `timedCards`). Then walks every card still pending or open
 * over the same bars: no fill, good call or bad call, losses kept. Off every
 * user's path: nobody waits on it.
 *
 * Returns rather than drains ("Cycles as architecture"): each run rebuilds
 * from the charts, so a missed evening is recovered by the next run's walk
 * (the cards of a missed evening are simply not issued, never back-filled).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { equitySession, etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { buildCards, rangeCardCalls, timedCards, walkCardCall, CARD_WINDOW_BARS, TIMED_HISTORY_START, type CardCall } from "@/lib/cards/cardCalls";
import { cardKindOrder, cardKindShown, type CardKind } from "@/lib/setups/cardRecords";
import type { Bar } from "@/lib/types";

export const maxDuration = 60;

/**
 * Calendar days of daily bars read. Enough that a card still inside the walk's
 * reach (WALK_LOOKBACK_DAYS) can have the GOOD_CALL_MAX_SESSIONS + 1 sessions
 * after it that settle it as unresolved: 390 calendar days hold about 268
 * sessions. Also covers the modes' 250-bar window, and the range cards'
 * `RANGE_MIN_BARS` (332 sessions: a year before the range, plus the runner of
 * any earlier trade still open), which needs about 482 calendar days; 520
 * days hold about 358 sessions, a margin for holidays. Raised from 420 on
 * 2026-11-12 for the range cards: about 24% more daily bars read a night.
 */
const HISTORY_DAYS = 520;
/** Unresolved cards walked a run, least recently checked first. Engineering choice, sized to the 60-second budget. */
const WALKS_PER_RUN = 2000;
/** Rows a read asks for at once: PostgREST's default max rows. */
const READ_PAGE = 1000;
/** Rows written back per request. */
const WRITE_BATCH = 500;
/** Cards older than this are past the walk's reach (the bars read) and left as they stand. */
const WALK_LOOKBACK_DAYS = HISTORY_DAYS - 30;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const now = new Date();
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("build the trade cards", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }
  if (!provider.fetchBarsBatch) {
    return NextResponse.json({ error: "The market data provider has no batched bars." }, { status: 503 });
  }

  const end = provider.isLive ? new Date(now.getTime() - 16 * 60 * 1000) : null;
  const start = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  let fetched: Map<string, Bar[]>;
  try {
    fetched = await provider.fetchBarsBatch(LARGE_CAP_UNIVERSE, "1Day", start, end, "us_equity");
  } catch (err) {
    return NextResponse.json({ error: `Daily bars not read: ${String(err)}` }, { status: 502 });
  }

  // Completed sessions only, as the intraday focus list reads them.
  const today = etDateKey(now);
  const session = equitySession(now);
  const sessionOpen = session === "pre" || session === "regular";
  const bars = new Map<string, Bar[]>();
  let basisDate = "";
  for (const [symbol, all] of fetched) {
    const done = sessionOpen ? all.filter((b) => etDateKey(new Date(b.t)) < today) : all;
    if (done.length === 0) continue;
    bars.set(symbol.toUpperCase(), done);
    const last = etDateKey(new Date(done[done.length - 1].t));
    if (last > basisDate) basisDate = last;
  }
  if (!basisDate) return NextResponse.json({ error: "No daily bars were returned." }, { status: 502 });

  // 1. Tonight's cards: stocks that traded the basis day, with a full window.
  const service = createServiceClient();
  const built: CardCall[] = [];
  for (const [symbol, daily] of bars) {
    if (daily.length < CARD_WINDOW_BARS) continue;
    if (etDateKey(new Date(daily[daily.length - 1].t)) !== basisDate) continue;
    built.push(...buildCards(symbol, daily));
  }

  // 1b. The RSI reversal cards on a Rule 10 day ("rsiReversalTimed"). The
  // rule reads each stock's bars from the research data's first session
  // (lib/gann/changeInTrend.ts), so only the stocks with an RSI card tonight
  // are read that far back: a few a night, one batched request.
  const timedStarted = Date.now();
  const rsiSymbols = [...new Set(built.filter((c) => c.kind === "rsiReversal").map((c) => c.symbol))];
  let timedError: string | null = null;
  if (rsiSymbols.length > 0) {
    try {
      const long = await provider.fetchBarsBatch(rsiSymbols, "1Day", new Date(`${TIMED_HISTORY_START}T00:00:00Z`), end, "us_equity");
      for (const [symbol, all] of long) {
        const done = sessionOpen ? all.filter((b) => etDateKey(new Date(b.t)) < today) : all;
        built.push(...timedCards(built.filter((c) => c.symbol === symbol.toUpperCase()), done));
      }
    } catch (err) {
      // The plain cards still go out; the timed kind is simply not issued tonight.
      timedError = String(err);
      console.error(`[cards/nightly] long history not read: ${timedError}`);
    }
  }
  const timedMs = Date.now() - timedStarted;

  // 1c. The range cards (lib/cards/rangeCards.ts): read across the whole
  // universe at once, since a stock is active against the day's median.
  const rangeStarted = Date.now();
  const ranged = rangeCardCalls(bars, basisDate);
  built.push(...ranged);
  const rangeMs = Date.now() - rangeStarted;

  const rows = built.map((c) => ({
    kind: c.kind,
    symbol: c.symbol,
    signal_date: c.signalDate,
    entry: c.entry,
    stop: c.stop,
    tp1: c.tp1,
    tp2: c.tp2 ?? null,
    mtp: c.mtp ?? null,
    signal_close: c.signalClose,
    published: cardKindShown(c.kind),
  }));
  if (rows.length > 0) {
    // A rerun the same night keeps the first record of each card untouched.
    const { error } = await service.from("card_calls").upsert(rows, { onConflict: "kind,symbol,signal_date", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: `Cards not stored: ${error.message}` }, { status: 500 });
  }

  // 2. Score the cards still pending or open.
  const since = etDateKey(new Date(now.getTime() - WALK_LOOKBACK_DAYS * 86_400_000));
  // Read in pages: PostgREST caps one response at its max rows (1,000 by default).
  const open: Record<string, unknown>[] = [];
  let readError: { message: string } | null = null;
  for (let from = 0; from < WALKS_PER_RUN; from += READ_PAGE) {
    const { data, error } = await service
      .from("card_calls")
      .select("id, kind, symbol, signal_date, entry, stop, tp1, signal_close, published, created_at, call_outcome, fill_price, session_date")
      .in("call_outcome", ["pending", "open"])
      .lt("signal_date", basisDate)
      .gte("signal_date", since)
      .order("checked_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, Math.min(from + READ_PAGE, WALKS_PER_RUN) - 1);
    if (error) {
      readError = error;
      break;
    }
    open.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < READ_PAGE) break;
  }
  if (readError) return NextResponse.json({ error: `Open cards not read: ${readError.message}` }, { status: 500 });

  const tally = { good: 0, bad: 0, open: 0, unresolved: 0, no_fill: 0, pending: 0, unread: 0 };
  const checkedAt = now.toISOString();
  // Whole rows, written back in bulk (an upsert on the id), so a night's
  // walk is a few requests rather than one per card.
  const updates = [];
  for (const row of open) {
    const daily = bars.get(String(row.symbol).toUpperCase());
    if (!daily) {
      // Not in tonight's bars (it left the universe, or the feed missed it):
      // checked, so it goes to the back of the queue, and read again later.
      tally.unread++;
      updates.push({ ...row, checked_at: checkedAt });
      continue;
    }
    const r = walkCardCall(
      {
        signalDate: String(row.signal_date),
        entry: Number(row.entry),
        stop: Number(row.stop),
        tp1: Number(row.tp1),
        signalClose: row.signal_close == null ? null : Number(row.signal_close),
      },
      daily,
      cardKindOrder(String(row.kind) as CardKind),
    );
    tally[r.call]++;
    const resolved = r.call === "good" || r.call === "bad" || r.call === "no_fill" || r.call === "unresolved";
    updates.push({
      ...row,
      call_outcome: r.call,
      fill_price: r.fill,
      session_date: r.session,
      checked_at: checkedAt,
      ...(resolved ? { resolved_at: checkedAt } : {}),
    });
  }
  let writeFailures = 0;
  for (let i = 0; i < updates.length; i += WRITE_BATCH) {
    const chunk = updates.slice(i, i + WRITE_BATCH);
    const { error } = await service.from("card_calls").upsert(chunk, { onConflict: "id" });
    if (error) {
      writeFailures += chunk.length;
      console.error(`[cards/nightly] walk write failed: ${error.message}`);
    }
  }

  return NextResponse.json({
    basisDate,
    universe: LARGE_CAP_UNIVERSE.length,
    read: bars.size,
    issued: rows.length,
    published: rows.filter((r) => r.published).length,
    range: {
      rangeLow: ranged.filter((c) => c.kind === "rangeLow").length,
      rangeBreakout: ranged.filter((c) => c.kind === "rangeBreakout").length,
      ms: rangeMs,
    },
    timed: { read: rsiSymbols.length, issued: built.filter((c) => c.kind === "rsiReversalTimed").length, ms: timedMs, error: timedError },
    walked: tally,
    writeFailures,
    ms: Date.now() - startedAt,
  });
}
