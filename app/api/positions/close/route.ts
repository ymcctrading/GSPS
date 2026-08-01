/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { closePosition, envCreds } from "@/lib/brokers/alpaca";

const CloseSchema = z.object({
  symbol: z.string().min(1).max(24),
  /** Omit to close the entire position. */
  qty: z.number().positive().max(100000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { symbol, qty } = parsed.data;

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    const order = await closePosition(creds, symbol.toUpperCase(), qty);

    // Mark the local ledger closed so the portfolio reflects the exit even
    // before the broker's fill lands. A failure here doesn't undo the exit.
    await supabase
      .from("positions")
      .update({ closed: true, closed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("symbol", symbol.toUpperCase())
      .eq("closed", false);

    return NextResponse.json({ ok: true, order });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Alpaca 404s when the position is already flat — that's the desired state,
    // not a failure the user needs to act on.
    if (raw.includes("(404)")) {
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }
    return NextResponse.json({ error: raw }, { status: 502 });
  }
}
