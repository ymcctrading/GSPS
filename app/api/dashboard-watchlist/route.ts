/**
 * GSPS — /api/dashboard-watchlist
 *
 * The Dashboard's "Default watchlist", made the signed-in user's own
 * (lib/dashboard/watchlist.ts): 3 to 9 US stocks or crypto pairs.
 *
 * GET    -> { symbols, isDefault, min, max }
 * PUT    -> replace the list. Body { symbols: string[] }. A symbol that isn't
 *           already on the list is checked against Alpaca's tradable-asset
 *           list when a US stock; the check is a convenience against typos, so
 *           an upstream failure lets the save through rather than blocking it.
 * DELETE -> back to the platform default.
 *
 * Signed-in users only, scoped to their own rows (RLS is the backstop; every
 * query also filters on the user id).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envCreds, searchAssets } from "@/lib/brokers/alpaca";
import {
  DASHBOARD_WATCHLIST_MAX,
  DASHBOARD_WATCHLIST_MIN,
  getDashboardWatchlist,
  isCryptoWatchSymbol,
  normalizeDashboardWatchlist,
  resetDashboardWatchlist,
  saveDashboardWatchlist,
} from "@/lib/dashboard/watchlist";

const BOUNDS = { min: DASHBOARD_WATCHLIST_MIN, max: DASHBOARD_WATCHLIST_MAX };

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    return NextResponse.json({ ...(await getDashboardWatchlist(supabase, user.id)), ...BOUNDS });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
  const normalized = normalizeDashboardWatchlist(body?.symbols);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  try {
    const current = await getDashboardWatchlist(supabase, user.id);
    const unknown = await findUnknownEquities(
      normalized.symbols.filter((s) => !current.symbols.includes(s) && !isCryptoWatchSymbol(s)),
    );
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} a tradable US stock symbol.` },
        { status: 400 },
      );
    }

    await saveDashboardWatchlist(supabase, user.id, normalized.symbols);
    return NextResponse.json({ symbols: normalized.symbols, isDefault: false, ...BOUNDS });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    await resetDashboardWatchlist(supabase, user.id);
    return NextResponse.json({ ...(await getDashboardWatchlist(supabase, user.id)), ...BOUNDS });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Symbols Alpaca's tradable list doesn't carry. Empty on any failure to ask —
 * no credentials, or the list didn't load — since this only guards against a
 * mistyped ticker and must not stop a save on an outage. `searchAssets` ranks
 * prefix matches first and truncates, so it's asked for far more results than
 * it will return (the list is cached in memory) and matched exactly.
 */
async function findUnknownEquities(symbols: string[]): Promise<string[]> {
  if (symbols.length === 0) return [];
  const creds = envCreds("paper");
  if (!creds) return [];

  try {
    const unknown: string[] = [];
    for (const symbol of symbols) {
      const matches = await searchAssets(creds, symbol, 5000);
      if (!matches.some((m) => m.symbol.toUpperCase() === symbol)) unknown.push(symbol);
    }
    return unknown;
  } catch {
    return [];
  }
}
