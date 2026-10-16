/**
 * GSPS — GET /api/notifications/push/public-key
 *
 * The VAPID public key the browser needs for `pushManager.subscribe`, plus
 * whether push is configured at all on this deployment. Served from the
 * server rather than baked into the bundle so a deployment that sets the keys
 * (or rotates them) does not need a rebuild to start offering push, and so
 * the Settings UI can tell "not set up on this deployment" apart from
 * "this device declined", which it cannot do from a missing bundle constant.
 *
 * Public by design — this is the key clients encrypt *to*. The private half
 * is never read here.
 */

import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/notifications/webpush";

export async function GET() {
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: isWebPushConfigured() ? getVapidPublicKey() : null,
  });
}
