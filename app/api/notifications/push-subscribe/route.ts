/**
 * GSPS — /api/notifications/push-subscribe
 * POST: stores the browser's Web Push subscription onto the signed-in user's
 * notification_preferences row. Called by the client-side hook in
 * lib/notifications/push-client.ts after `pushManager.subscribe()` succeeds.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      push_subscription: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Could not save push subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
