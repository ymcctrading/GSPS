/**
 * GSPS — POST /api/notifications/inbox/read-all
 *
 * Marks every unread in-app notification for the caller read — the bell's
 * "mark all read" action. Same service-role-plus-ownership-filter pattern
 * as the single-notification route; see that route's own comment.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("in_app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
