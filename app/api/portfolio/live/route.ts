/**
 * GSPS — /api/portfolio/live
 * The signed-in member's own live Alpaca account for the Portfolio page's
 * Live view: account figures, positions and working orders, read from the
 * broker with the keys the member connected in Settings
 * (`lib/brokers/live-creds.ts`). Read only: nothing here places, changes or
 * cancels an order. No live connection answers `{ connected: false }`.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";
import { getAccount, getOrders, getPositions, type AlpacaOrder } from "@/lib/brokers/alpaca";
import { summarizeLiveAccount } from "@/lib/portfolio/live-account";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const conn = await readLiveAlpacaConnection(supabase, user.id);
  if (!conn || conn.creds.mode !== "live") return NextResponse.json({ connected: false });

  try {
    const [account, positions, orders] = await Promise.all([
      getAccount(conn.creds),
      getPositions(conn.creds),
      getOrders(conn.creds, "open") as Promise<AlpacaOrder[]>,
    ]);
    return NextResponse.json(summarizeLiveAccount(account, positions, orders ?? []));
  } catch (err) {
    console.error("portfolio/live:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Your live account couldn't be read from the broker just now." }, { status: 502 });
  }
}
