/**
 * GSPS — /api/notifications/history
 * GET: paginated list of the signed-in user's notification_log rows, most
 * recent first. Backs the settings page's alert-history dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const limit = clamp(Number(params.get("limit")) || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const { data, error, count } = await supabase
    .from("notification_log")
    .select("id, symbol, channel, status, message, provider_response, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Could not load notification history" }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? 0, limit, offset });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}
