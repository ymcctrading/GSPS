/**
 * Browser push via the Web Push protocol. Web Push requires VAPID
 * (Voluntary Application Server Identification) — every payload is signed
 * with an EC key pair and encrypted per the RFC 8291 scheme, which is genuinely
 * painful to hand-roll against a raw `fetch` the way `email.ts` / `sms.ts` do.
 * `web-push` is the standard library for this, small, with no heavy
 * transitive deps, so it is used here rather than reimplementing ECDH/AES-GCM.
 *
 * Same feature-flag shape as the other providers: `isPushEnabled()` gates
 * every call, and sending without VAPID keys configured reports "not
 * configured" instead of throwing.
 */

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

export function isPushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/** Shape stored in `notification_preferences.push_subscription` (jsonb). */
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SendPushArgs {
  title: string;
  body: string;
  url?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export async function sendPush(
  subscription: PushSubscriptionJson,
  payload: SendPushArgs,
): Promise<SendResult> {
  if (!isPushEnabled()) {
    return {
      ok: false,
      error: "Push is not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT unset)",
    };
  }

  ensureConfigured();

  try {
    await webpush.sendNotification(
      subscription as WebPushSubscription,
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown push send error" };
  }
}
