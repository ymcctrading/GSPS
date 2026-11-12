/**
 * GSPS — /api/cards/symbol?symbol=AM: the trade cards open on one stock for
 * the signed-in member, exactly as the Dashboard shows them
 * (lib/cards/readCards.ts `getOpenCardsForSymbol`, the same reader and
 * filters), for that stock's own page.
 *
 * Why: the Dashboard offered AM as a buy card while AM's page showed only the
 * daily plan, a sell (owner, 2026-11-12). A card that exists on the Dashboard
 * has to exist on the stock's page too.
 *
 * The response carries only what a member reads on the card: its label, the
 * order, entry, stop and targets. No kind id, no source, no rule.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOpenCardsForSymbol, tradeCardViewer } from "@/lib/cards/readCards";
import type { SymbolTradeCards } from "@/lib/cards/tickerCard";

const SYMBOL = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) return NextResponse.json({ error: "Missing or invalid 'symbol'" }, { status: 400 });
  const none: SymbolTradeCards = { signalDate: null, cards: [] };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json(none);
    const viewer = await tradeCardViewer(supabase, user.id);
    const open = await getOpenCardsForSymbol(createServiceClient(), viewer, symbol);
    const body: SymbolTradeCards = {
      signalDate: open.signalDate,
      cards: open.cards.map((c) => ({
        label: c.label,
        entry: c.entry,
        stop: c.stop,
        tp1: c.tp1,
        tp2: c.tp2,
        mtp: c.mtp,
        order: c.order,
        grade: c.grade,
      })),
    };
    return NextResponse.json(body);
  } catch {
    // A failed read shows no card rather than breaking the page, as on the Dashboard.
    return NextResponse.json(none);
  }
}
