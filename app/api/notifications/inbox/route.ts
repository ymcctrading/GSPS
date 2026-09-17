/**
 * GSPS — /api/notifications/inbox
 *
 * The bell's own read: a member's in-app notification inbox
 * (`in_app_notifications`, migration 0067). RLS on that table already
 * restricts a select to the caller's own rows (`auth.uid() = profile_id`),
 * so this reads through the plain per-request client rather than the
 * service-role one — there is no ownership check to duplicate here.
 *
 * `?unreadOnly=1` narrows to `read_at is null`; otherwise the most recent
 * `limit` rows (default 20, capped at 50) regardless of read state, newest
 * first — what the bell's dropdown shows on open.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "1";
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

  let query = supabase
    .from("in_app_notifications")
    .select("id, symbol, verdict, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A separate, unbounded count -- `limit` above caps the *list*, not how
  // many the bell's badge should claim exist. head:true never fetches rows.
  const { count: unreadCount, error: countError } = await supabase
    .from("in_app_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [], unreadCount: unreadCount ?? 0 });
}
