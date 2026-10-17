/**
 * GSPS — POST /api/notifications/push/test
 *
 * Sends one push to the caller's own registered devices. Exists because every
 * other link in this chain is invisible from the UI: a member can grant
 * permission, store a subscription, and still receive nothing (keys not set
 * on the deployment, a service worker that never activated, an endpoint the
 * push service has already expired). This is the one call that proves the
 * whole path end to end, from the server through the push service to the
 * tray — and it reports which link failed instead of a bare "sent".
 *
 * Self-addressed only: it pushes to the verified caller, never to a profile
 * named in the request, so it cannot be used to send anyone else a
 * notification.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolvePushRouteUserId } from "@/lib/notifications/push-auth";
import { sendWebPushToProfile } from "@/lib/notifications/webpush";

export async function POST(req: NextRequest) {
  const profileId = await resolvePushRouteUserId(req);
  if (!profileId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await sendWebPushToProfile(createServiceClient(), profileId, {
    title: "GSPS test alert",
    body: "Push is working on this device. Real alerts will arrive the same way.",
    url: "/dashboard",
    tag: "gsps-test",
  });

  if (result.skippedReason === "not_configured") {
    return NextResponse.json(
      { error: "Push is not configured on this deployment (no VAPID keys set)." },
      { status: 503 },
    );
  }
  if (result.skippedReason === "no_subscriptions") {
    return NextResponse.json(
      { error: "No devices registered yet — enable alerts on this device first." },
      { status: 400 },
    );
  }
  if (result.sent === 0) {
    return NextResponse.json(
      {
        error:
          result.pruned > 0
            ? "This device's registration had expired and was removed — enable alerts again."
            : "Could not reach any registered device.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    message: `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`,
    sent: result.sent,
    pruned: result.pruned,
  });
}
