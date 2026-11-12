/**
 * GSPS — /api/trade-notes
 * PUT { tradeLogId, note }: write, change or (with an empty note) remove the
 * signed-in member's own note on one of their closed trades (Q3 plan item 2,
 * migration 0151).
 *
 * A note is the member's words, not the ledger: it is written on the member's
 * own session under row security, never through `ledgerWriter`, and it never
 * changes the trade. The trade must be the member's and closed; a trade still
 * open has nothing to look back on yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TRADE_NOTE_MAX, cleanTradeNote } from "@/lib/portfolio/tradeRecord";

const NoteSchema = z.object({
  tradeLogId: z.string().uuid(),
  note: z.string().max(TRADE_NOTE_MAX * 2),
});

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = NoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid note" }, { status: 400 });
  const note = cleanTradeNote(parsed.data.note);
  if (note && note.length > TRADE_NOTE_MAX) {
    return NextResponse.json({ error: `A note can be up to ${TRADE_NOTE_MAX} characters.` }, { status: 400 });
  }

  try {
    const { data: trade, error: tradeError } = await supabase
      .from("trade_logs")
      .select("id, outcome, exit_timestamp")
      .eq("id", parsed.data.tradeLogId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (tradeError) throw tradeError;
    const row = trade as { id: string; outcome: string | null; exit_timestamp: string | null } | null;
    if (!row) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (row.exit_timestamp == null || (row.outcome !== "profit" && row.outcome !== "loss")) {
      return NextResponse.json({ error: "Notes go on closed trades." }, { status: 409 });
    }

    if (!note) {
      const { error } = await supabase.from("trade_notes").delete().eq("trade_log_id", row.id).eq("user_id", user.id);
      if (error) throw error;
      return NextResponse.json({ note: null, updatedAt: null });
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("trade_notes")
      .upsert({ trade_log_id: row.id, user_id: user.id, note, updated_at: updatedAt }, { onConflict: "trade_log_id" });
    if (error) throw error;
    return NextResponse.json({ note, updatedAt });
  } catch (err) {
    console.error("[trade-notes]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The note could not be saved. Try again in a moment." }, { status: 500 });
  }
}
