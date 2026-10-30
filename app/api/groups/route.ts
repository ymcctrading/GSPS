/**
 * GSPS — /api/groups
 *
 * Read side of the Scanner's "Groups" tab (Q3 item 3): the industry groups
 * ranked by standing, each with its stocks in rank order, and the universe's
 * breadth. See `lib/scanner/groupView.ts` for the design basis.
 *
 * Reads the same monthly reading the scan's rank reads (`getUniverseStrength`:
 * the month's stored row, else one batched read that is then stored), so no
 * new data source and, on a month already read, no request to the feed.
 * Signed-in members only; the reading is the same for every tier.
 *
 * Read at the New York day's noon UTC, as the scan's rank is (`scanTicker.ts`'s
 * `sessionNoon`), so the page and the score read the same month. On the one
 * cold instance a month that finds no stored row, the member's request makes
 * the month's batched read (about 9 requests) and stores it, as a symbol
 * page's scan would; `maxDuration` gives it the scan routes' budget, and a
 * read that fails returns the 503 message.
 */

import { NextResponse } from "next/server";
import { etDateKey } from "@/lib/market/session";
import { createClient } from "@/lib/supabase/server";
import { getUniverseStrength } from "@/lib/data/universeStrength";
import { readGroupView } from "@/lib/scanner/groupView";

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = new Date();
  const asOf = new Date(`${etDateKey(now)}T12:00:00Z`);
  const view = readGroupView(await getUniverseStrength(now), asOf);
  if (!view) return NextResponse.json({ error: "Group standings aren't available right now. Try again later." }, { status: 503 });
  return NextResponse.json(view);
}
