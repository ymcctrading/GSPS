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
import { readPyramidAdd } from "@/lib/gann/pyramid";
import { etDateKey } from "@/lib/market/session";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol || symbol.length > 24) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: plan } = await supabase
    .from("protocol_exits")
    .select("side, qty, entry_price, stop_loss, applied_stop, created_at")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .eq("status", "working")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ add: null, reason: null });

  try {
    const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    const provider = getMarketDataProvider();
    const now = new Date();
    const [bars, price] = await Promise.all([
      provider.fetchBars(symbol, "1Day", new Date(now.getTime() - 400 * 86_400_000), null, assetClass),
      provider.fetchLatestPrice(symbol, assetClass),
    ]);
    const today = etDateKey(now);
    const row = plan as {
      side: "long" | "short";
      qty: number;
      entry_price: number;
      stop_loss: number;
      applied_stop: number | null;
      created_at: string;
    };
    const reading = readPyramidAdd({
      side: row.side,
      lots: [{ qty: Number(row.qty), price: Number(row.entry_price), date: etDateKey(new Date(row.created_at)) }],
      stop: Number(row.applied_stop ?? row.stop_loss),
      initialStop: Number(row.stop_loss),
      daily: bars.filter((b) => b.t.slice(0, 10) < today),
      price,
    });
    return NextResponse.json(reading);
  } catch (err) {
    return NextResponse.json({ add: null, reason: null, error: err instanceof Error ? err.message : String(err) });
  }
}
