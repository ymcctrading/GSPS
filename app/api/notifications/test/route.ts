/**
 * GSPS — /api/notifications/test
 * POST: sends a one-off test notification through the dispatcher to the
 * signed-in user, for the settings UI's "send test alert" button. Useful even
 * with no provider credentials configured — it reports "not configured" per
 * channel the same way a real alert would, via the notification_log rows it
 * writes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchNotification, type DispatchSupabase } from "@/lib/notifications/dispatch";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const results = await dispatchNotification(supabase as unknown as DispatchSupabase, user.id, {
    symbol: "TEST",
    score: 9,
    message: "This is a test alert from GSPS notification settings.",
  }, { email: user.email });

  if (results.length === 0) {
    return NextResponse.json({
      results: [],
      note: "No notification preferences saved yet — enable a channel first.",
    });
  }

  return NextResponse.json({ results });
}
