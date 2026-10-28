/**
 * GSPS — /api/positions/held?symbol=AAPL
 *
 * The signed-in member's open paper position in one symbol, for the order
 * ticket: a sell setup on shares already owned is a reason to sell them, not
 * to open a short (and a buy setup on a short held, to cover it), so the
 * ticket offers the close first. `managed` says a working exit plan runs the
 * position, which is then closed whole (lib/trade/close-position.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenPosition, hasWorkingPlan } from "@/lib/brokers/simulator";

const NO_STORE = { "Cache-Control": "private, no-store" };

export interface HeldPosition {
  side: "long" | "short";
  qty: number;
  managed: boolean;
}

export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim();
  if (!symbol) return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const position = await getOpenPosition(supabase, user.id, symbol);
    if (!position || !(position.qty > 0)) return NextResponse.json({ held: null }, { headers: NO_STORE });
    const held: HeldPosition = {
      side: position.side,
      qty: position.qty,
      // Unread counts as managed: the offer then closes it whole, as the server would.
      managed: (await hasWorkingPlan(supabase, user.id, symbol)) !== false,
    };
    return NextResponse.json({ held }, { headers: NO_STORE });
  } catch {
    // Unread: the ticket shows no held-position offer and the server still
    // treats a sell against a long as a close (lib/trade/place-order.ts).
    return NextResponse.json({ held: null }, { headers: NO_STORE });
  }
}
