/**
 * Browser push: the third alert channel (ROADMAP.md Q1 "Notification system";
 * docs/SYNTHESIZED_ROADMAP.md Part 5 item 2). Standard Web Push with VAPID
 * keys, so no paid service is involved: the browser's own push service
 * (Google's, Mozilla's, Apple's) carries the message, encrypted end to end.
 *
 * Configuration: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the browser subscribes with
 * it), `VAPID_PRIVATE_KEY` (Sensitive) and `VAPID_SUBJECT` (a `mailto:` or
 * site URL the push services can contact). Generate a pair once with
 * `npx web-push generate-vapid-keys`. Until all three are set the channel is
 * off: a push delivery is recorded `skipped` with the reason, never `failed`,
 * and the settings toggle says so.
 *
 * Subscriptions live in `push_subscriptions` (migration 0099), one row per
 * browser. A push service answering 404 or 410 means that browser has
 * unsubscribed, so its row is removed; nothing else is retried here (the
 * delivery ledger's retry sweep owns retries).
 *
 * What a push may say is what the in-app notification already says
 * (`recordInAppNotification`): symbol, side, the score out of 9, entry, stop
 * and target. Nothing from the scorecard's breakdown or the Gann readings
 * behind it (`lib/scoring/public-summary.ts`'s rule).
 *
 * Three-question basis: 1. Gann: none; a delivery channel, not a technique.
 * 2. Cycles: no periodicity claim. 3. Hermetic: Correspondence, the same alert
 * reaches the trader on every channel they chose, saying the same thing.
 * Law of Creation: a mixture, not a creation. A channel adds reach, not
 * substance, so a push carries nothing an email or the bell does not.
 */

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPayload } from "@/lib/entitlements/delivery";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { priceText } from "@/lib/strat/priceText";
import { tickerHref } from "@/lib/routes";

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is clicked. Always a path on this site. */
  url: string;
  /** A notification with the same tag replaces the earlier one on the device. */
  tag: string;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The VAPID keys, or null while any of the three is unset. */
export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** The push for a monitor transition, worded as the in-app notification is. */
export function deliveryPushMessage(payload: NotificationPayload): PushMessage {
  if (payload.verdict === "INVALIDATED") {
    return {
      title: `${payload.symbol} invalidated`,
      body: `The setup you were tracking on ${payload.symbol} no longer holds: price broke the level it was staked on.`,
      url: tickerHref(payload.symbol),
      tag: `setup-${payload.symbol}`,
    };
  }
  const score = `${formatScore(payload.score, payload.exactScoreDisplayEnabled)}/${SCORE_MAX}`;
  const side = payload.direction === "bullish" ? "Buy" : "Sell";
  return {
    title: `${payload.symbol}: ${payload.verdict} (${score})`,
    body: `${side} setup confirmed at ${score}. Entry ${priceText(payload.entry)}, stop ${priceText(payload.stopLoss)}, target ${priceText(payload.takeProfit)}.`,
    url: tickerHref(payload.symbol),
    tag: `setup-${payload.symbol}`,
  };
}

/** The push for a custom price alert (`/api/price-alerts/sweep`). */
export function priceAlertPushMessage(args: {
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}): PushMessage {
  const verb = args.direction === "above" ? "rose above" : "fell below";
  return {
    title: `${args.symbol} ${verb} $${priceText(args.targetPrice)}`,
    body: `${args.symbol} ${verb} your alert level of $${priceText(args.targetPrice)}. Last price checked: $${priceText(args.currentPrice)}.`,
    url: tickerHref(args.symbol),
    tag: `price-${args.symbol}`,
  };
}

/** Only an https endpoint on a push service, with both keys, is stored. */
export function parseSubscription(
  raw: unknown,
): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://") || sub.endpoint.length > 1000) return null;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (p256dh.length === 0 || p256dh.length > 200 || auth.length === 0 || auth.length > 100) return null;
  return { endpoint: sub.endpoint, p256dh, auth };
}

export type PushSendResult =
  | { success: true; sent: number }
  | { success: false; skipped: true; error: string }
  | { success: false; skipped?: false; error: string };

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends `message` to every browser `profileId` subscribed. Succeeds when at
 * least one browser accepted it; skipped (not failed) when push isn't
 * configured or the profile has no subscribed browser, since neither is a
 * transport error worth retrying.
 */
export async function sendPushToProfile(
  service: SupabaseClient,
  profileId: string,
  message: PushMessage,
): Promise<PushSendResult> {
  const config = vapidConfig();
  if (!config) {
    return { success: false, skipped: true, error: "Browser push is not configured (VAPID keys unset)." };
  }

  const { data, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);
  if (error) return { success: false, error: `push subscriptions not read: ${error.message}` };
  const rows = (data ?? []) as SubscriptionRow[];
  if (rows.length === 0) {
    return { success: false, skipped: true, error: "No browser is subscribed to push for this account." };
  }

  const body = JSON.stringify(message);
  const delivered: string[] = [];
  const failures: string[] = [];
  const gone: string[] = [];
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        { vapidDetails: config, TTL: 60 * 60 },
      );
      delivered.push(row.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(row.id);
      else failures.push(`${status ?? "error"}: ${(err as Error).message ?? String(err)}`);
    }
  }

  if (gone.length > 0) {
    await service.from("push_subscriptions").delete().in("id", gone);
  }
  if (delivered.length > 0) {
    await service
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", delivered);
    return { success: true, sent: delivered.length };
  }
  if (failures.length === 0) {
    return { success: false, skipped: true, error: "Every subscribed browser has unsubscribed." };
  }
  return { success: false, error: failures.join("; ").slice(0, 500) };
}
