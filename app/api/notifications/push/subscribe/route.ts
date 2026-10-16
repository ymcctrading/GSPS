/**
 * GSPS — POST /api/notifications/push/subscribe
 *
 * Stores one browser's push subscription against the signed-in member, so an
 * alert fan-out has somewhere to send. Body: `{ subscription }`, the object
 * `PushSubscription.toJSON()` produces.
 *
 * Upserts on `endpoint` (the push service's own address for this device):
 * re-subscribing the same device returns the same endpoint with rotated keys,
 * and two rows for one endpoint would deliver every alert to that tray twice.
 *
 * Writes through the service-role client — `push_subscriptions` deliberately
 * has no client insert/update policy (migration 0087), the same rule
 * migrations 0036 and 0067 state for the delivery tables this pairs with.
 * The profile the row is attached to comes from the verified session only,
 * never from the request body.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolvePushRouteUserId } from "@/lib/notifications/push-auth";

type IncomingSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(req: NextRequest) {
  const profileId = await resolvePushRouteUserId(req);
  if (!profileId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { subscription?: IncomingSubscription };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const subscription = body.subscription;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  // All three are required to encrypt a payload; a row missing any of them
  // would be a permanently failing send, so reject it here instead.
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json(
      { error: "subscription must carry an endpoint and both p256dh and auth keys" },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { error } = await service.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint,
      p256dh,
      auth,
      // Truncated: a diagnostic hint for telling one listed device from
      // another, not a field anything parses.
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push/subscribe] could not store subscription:", error);
    return NextResponse.json({ error: "Could not save this device" }, { status: 500 });
  }

  return NextResponse.json({ subscribed: true });
}
