/**
 * GSPS — POST /api/notifications/push/unsubscribe
 *
 * Removes one device's push subscription. Body: `{ endpoint }`.
 *
 * Scoped to the caller's own rows (`profile_id` from the verified session, as
 * well as the endpoint) so posting someone else's endpoint cannot silence
 * their alerts.
 *
 * Idempotent: an endpoint that is already gone — the member revoked it on
 * another tab, or a fan-out pruned it as dead — is a success, not a 404.
 * The caller's goal ("this device should not receive alerts") is satisfied
 * either way, and reporting failure would make the UI show an error for the
 * state it was asking for.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolvePushRouteUserId } from "@/lib/notifications/push-auth";

export async function POST(req: NextRequest) {
  const profileId = await resolvePushRouteUserId(req);
  if (!profileId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("push_subscriptions")
    .delete()
    .eq("profile_id", profileId)
    .eq("endpoint", body.endpoint);

  if (error) {
    console.error("[push/unsubscribe] could not remove subscription:", error);
    return NextResponse.json({ error: "Could not remove this device" }, { status: 500 });
  }

  return NextResponse.json({ unsubscribed: true });
}
