/**
 * GSPS — /api/positions/pyramid?symbol=XYZ
 *
 * Whether an open, protocol-managed position has earned an add under Gann's
 * pyramiding rules (lib/gann/pyramid.ts), for the Portfolio's suggestion line.
 * Advisory only: nothing is placed. The trader decides, and places any add
 * through the order ticket like any other order.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { pyramidLineFromRows, readPyramidAdd, type WorkingLotRow } from "@/lib/gann/pyramid";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { etDateKey } from "@/lib/market/session";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol || symbol.length > 24) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Every working lot of the symbol, oldest first: Gann's lots are sized
  // from the first (100/50/30/20/10, lib/gann/pyramid.ts), so the reading
  // needs them all, as the replay walks them.
  const { data: plans } = await supabase
    .from("protocol_exits")
    .select("side, mode, qty, entry_price, stop_loss, applied_stop, created_at, lots")
    .is("merged_into", null)
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .eq("status", "working")
    .order("created_at", { ascending: true });
  const line = pyramidLineFromRows((plans ?? []) as WorkingLotRow[], etDateKey);
  if (!line) return NextResponse.json({ add: null, reason: null });

  try {
    const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    const provider = getMarketDataProvider();
    const now = new Date();
    const [bars, price, reference] = await Promise.all([
      provider.fetchBars(symbol, "1Day", new Date(now.getTime() - 400 * 86_400_000), null, assetClass),
      provider.fetchLatestPrice(symbol, assetClass),
      assetClass === "us_equity" ? getInstrumentReference(symbol) : Promise.resolve(null),
    ]);
    const today = etDateKey(now);
    const reading = readPyramidAdd({
      ...line,
      daily: bars.filter((b) => b.t.slice(0, 10) < today),
      price,
      // Rule 21: the stored share count picks which side a stock is added to on.
      ...(assetClass === "us_equity" ? { capitalStock: reference?.sharesOutstanding ?? null } : {}),
    });
    return NextResponse.json(reading);
  } catch (err) {
    return NextResponse.json({ add: null, reason: null, error: err instanceof Error ? err.message : String(err) });
  }
}
