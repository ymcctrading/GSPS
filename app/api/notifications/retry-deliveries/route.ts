/**
 * GSPS — /api/notifications/retry-deliveries
 *
 * Phase 5 hardening: a periodic safety net for notification_deliveries rows
 * stuck `pending` (the inline dispatch right after evaluation never ran, or
 * crashed mid-flight) or `failed` (a transport error worth retrying) below
 * the attempt ceiling (lib/entitlements/delivery.ts#MAX_DISPATCH_ATTEMPTS).
 *
 * Same trusted-job bearer-secret pattern as every other cron-invoked route
 * (app/api/AGENTS.md). Scheduled via GitHub Actions
 * (.github/workflows/notification-delivery-retry.yml) rather than
 * vercel.json -- both Vercel Hobby cron slots are already spent (see
 * docs/THIRD_PARTY_LIMITS.md), and this needs a sub-daily cadence anyway,
 * which the Hobby plan's cron cap doesn't allow even if a slot were free.
 *
 * dispatchNotificationDelivery (called per-row by sweepStuckDeliveries)
 * carries its own preview guard, so this route needs no separate one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sweepStuckDeliveries } from "@/lib/entitlements/delivery";

/** Rows younger than this are left alone -- the inline dispatch on the original evaluation path may still be in flight. */
const RETRY_AFTER_MS = 5 * 60 * 1000;

function isAuthorized(authorizationHeader: string | null): boolean {
  return Boolean(process.env.CRON_SECRET) && authorizationHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  try {
    const summary = await sweepStuckDeliveries(service, { olderThanMs: RETRY_AFTER_MS });
    console.log(JSON.stringify({ event: "notification_retry_sweep", environment: process.env.VERCEL_ENV ?? "unknown", ...summary }));
    return NextResponse.json(summary);
  } catch (err) {
    console.error(`retry-deliveries: sweep failed — ${String(err)}`);
    return NextResponse.json({ error: "Sweep failed" }, { status: 503 });
  }
}
