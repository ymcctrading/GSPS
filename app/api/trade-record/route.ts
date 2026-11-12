/**
 * GSPS — /api/trade-record
 * GET: the signed-in member's own record read back (Q3 plan item 2): runs of
 * winning and losing trades, where each pause after a series of losses fell,
 * and the closed trades themselves, newest first, each with the member's note.
 *
 * Reads the trades the loss-series pause reads (closed paper and live trades,
 * `lib/risk/lossSeries.ts`) through `lib/portfolio/tradeRecord.ts`, so the
 * page and the rule can't disagree. Reads only, on the member's own session
 * and its row security.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readTradeRecord, type RecordTrade } from "@/lib/portfolio/tradeRecord";

/** Closed trades the runs are read over: a year of active trading and more. */
const RECORD_TRADES = 1000;
/** Trades listed by default, newest first. */
const LIST_DEFAULT = 50;
const LIST_MAX = 200;

interface Row {
  id: string;
  symbol: string | null;
  direction: "buy" | "sell";
  quantity: number | string;
  entry_timestamp: string;
  entry_price: number | string;
  exit_timestamp: string;
  exit_price: number | string | null;
  outcome: "profit" | "loss";
  profit_loss_dollars: number | string | null;
  exit_condition: string | null;
  mode: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const asked = Number(req.nextUrl.searchParams.get("limit"));
  const listLimit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, LIST_MAX) : LIST_DEFAULT;

  try {
    const [trades, reset] = await Promise.all([
      supabase
        .from("trade_logs")
        .select("id, symbol, direction, quantity, entry_timestamp, entry_price, exit_timestamp, exit_price, outcome, profit_loss_dollars, exit_condition, mode")
        .eq("user_id", user.id)
        // The trades the pause reads: GSPS placed them, paper or live. A
        // journal entry is typed by hand and never checked (R-002).
        .in("mode", ["paper", "live"])
        .in("outcome", ["profit", "loss"])
        .not("exit_timestamp", "is", null)
        .order("exit_timestamp", { ascending: false })
        .limit(RECORD_TRADES),
      supabase.from("loss_series_resets").select("reset_at").eq("user_id", user.id).maybeSingle(),
    ]);
    if (trades.error) throw trades.error;
    const rows = (trades.data ?? []) as Row[];
    const resetAt = reset.error ? null : ((reset.data as { reset_at?: string } | null)?.reset_at ?? null);

    const record = readTradeRecord(
      rows.map(
        (r): RecordTrade => ({
          id: r.id,
          symbol: r.symbol,
          outcome: r.outcome,
          exitTimestamp: r.exit_timestamp,
          profitLossDollars: num(r.profit_loss_dollars),
        }),
      ),
      resetAt,
    );

    const listed = rows.slice(0, listLimit);
    const notes = new Map<string, { note: string; updatedAt: string }>();
    if (listed.length) {
      const { data: noteRows, error: noteError } = await supabase
        .from("trade_notes")
        .select("trade_log_id, note, updated_at")
        .in("trade_log_id", listed.map((r) => r.id));
      // Notes are the member's additions; an unreadable notes table still
      // shows the record itself, without them.
      if (noteError) console.warn("[trade-record] notes unread:", noteError.message);
      else for (const n of (noteRows ?? []) as { trade_log_id: string; note: string; updated_at: string }[]) {
        notes.set(n.trade_log_id, { note: n.note, updatedAt: n.updated_at });
      }
    }
    const pauseStarts = new Set(record.pauses.map((p) => p.tradeId));

    return NextResponse.json({
      record,
      total: rows.length,
      trades: listed.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        quantity: num(r.quantity),
        entryTimestamp: r.entry_timestamp,
        entryPrice: num(r.entry_price),
        exitTimestamp: r.exit_timestamp,
        exitPrice: num(r.exit_price),
        outcome: r.outcome,
        profitLossDollars: num(r.profit_loss_dollars),
        exitCondition: r.exit_condition,
        account: r.mode === "live" ? "live" : "paper",
        startedPause: pauseStarts.has(r.id),
        note: notes.get(r.id)?.note ?? null,
        noteUpdatedAt: notes.get(r.id)?.updatedAt ?? null,
      })),
    });
  } catch (err) {
    console.error("[trade-record]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Your record could not be read. Try again in a moment." }, { status: 500 });
  }
}
