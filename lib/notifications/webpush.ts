/**
 * GSPS — Web Push transport.
 *
 * The channel that reaches a phone's own notification tray, the way any other
 * app's alert does. Closes ROADMAP.md's recorded backlog item ("no service
 * worker, manifest, or push SDK anywhere in the repo") against the Q1
 * initiative that already named it: "Notification system — email, SMS, and
 * browser push for high-confidence alerts."
 *
 * ## Three-question design basis (AGENTS.md mandate)
 *
 * 1. **Gann sourcing.** None, and none is claimed — a delivery transport is
 *    not a market technique, so question 1 does not apply in the sense
 *    AGENTS.md's Gann-grounding principle governs. What *is* Gann's, and is
 *    the reason this module exists at all, is his ordering of the factors:
 *    time is the one he ranks first, and every intraday detector this feeds
 *    (`lib/scanner/intraday.ts`) is explicitly a *confirmation* of a move
 *    already underway. A confirmation that arrives after the move has played
 *    out is not a late signal, it is not a signal. The transport is
 *    therefore load-bearing for a Gann-grounded platform even though it
 *    encodes no Gann rule of its own, and it must not be read as one.
 * 2. **Dewey / Tomes.** No periodicity or recurrence claim is made here, so
 *    Dewey's cycle checklist has nothing to score — stated plainly rather
 *    than padded with an answer that would look compliant. One cycle-theory
 *    property does carry over as an *engineering* property, the same
 *    distinction `lib/scan/universe-rotation.ts` draws in its own header:
 *    phase-resumption after distortion. A push subscription dies silently
 *    (browser reinstall, cleared site data, an expired FCM registration),
 *    and a channel that retried a dead endpoint forever would be a linear
 *    drain-and-halt design. `sendWebPushToProfile` prunes a subscription at
 *    the moment the push service reports it gone, so the member's next
 *    visit re-establishes a live one instead of inheriting a permanently
 *    failing row.
 * 3. **Hermetic principle — Correspondence**, with Cause and Effect second.
 *    Correspondence ("as above, so below") is the one that actually fits and
 *    is the reasoning behind AGENTS.md's cross-platform consistency rule: a
 *    notification that exists on one surface and not the others does not
 *    exist. That is the precise defect this module and the in-app write
 *    beside it repair — the intraday alert fan-out had exactly one surface
 *    (email), and with Resend still on its sandbox sender that surface
 *    delivered to nobody but the account owner, so a real SPY bearish alert
 *    (score 6, 2026-10-16 17:12 UTC) reached no member at all. Cause and
 *    Effect is the second: the alert is the cause and the member's own
 *    decision the effect, and a severed transport breaks that chain without
 *    reporting anything. Polarity, Rhythm, Vibration, Mentalism and Gender
 *    were read and set aside — Rhythm is tempting because of the poll
 *    cadence next door in the bell, but nothing here recurs on a schedule;
 *    push is event-driven by construction, which is the point of it.
 *
 * ## Configuration
 *
 * Needs a VAPID keypair in the environment. Absent it, `isWebPushConfigured`
 * is false and every send no-ops with a stated reason rather than throwing —
 * the same posture `lib/billing/stripe.ts` takes toward absent Stripe prices,
 * so a deployment without keys degrades to the in-app bell instead of
 * failing a scan. Keys are generated once (`scripts/generate-vapid-keys.mjs`)
 * and set as `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and
 * `WEB_PUSH_VAPID_SUBJECT`; `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` carries
 * the same public key to the browser, which needs it to subscribe.
 *
 * The private key is a signing credential: it never leaves the server, is
 * never returned by any route here, and is never logged.
 */

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/** What a service worker receives and renders. Kept deliberately small: a
 * push payload is size-capped by the push services (~4KB after encryption),
 * and nothing secret belongs in it — it is decrypted on a device that may be
 * showing a lock screen to whoever is holding it. Scores and levels are
 * already member-visible by the time an alert fans out, but there is no
 * reason for a payload to carry more than the member needs to decide whether
 * to open the app. */
export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path the notification opens, e.g. `/ticker/SPY`. */
  url: string;
  /** Collapse key — a second push with the same tag replaces the first in the
   * tray rather than stacking, so a re-fired alert for one symbol does not
   * bury the rest. */
  tag?: string;
};

export type PushSendResult = {
  sent: number;
  failed: number;
  /** Subscriptions the push service reported gone, now deleted. */
  pruned: number;
  /** Set when nothing was attempted; distinguishes "no devices" and "not
   * configured" from "tried and failed", which a bare `sent: 0` cannot. */
  skippedReason?: "not_configured" | "no_subscriptions";
};

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
}

/** The public half, for the browser's `pushManager.subscribe`. Safe to serve
 * to anyone — it is the key a client encrypts *to*. Reads the server-side
 * variable first so a deployment that set only one of the pair still works. */
export function getVapidPublicKey(): string | null {
  return (
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ??
    null
  );
}

/** Which keypair `setVapidDetails` was last called with. Memoizes the call
 * without memoizing the *decision*: the presence of keys is re-checked on
 * every send, so an absent keypair always reports unconfigured rather than
 * inheriting a `true` from an earlier call. */
let configuredPublicKey: string | null = null;

function configureVapid(): boolean {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (configuredPublicKey === publicKey) return true;

  // A mailto:/https: subject is required by RFC 8292 — the push services use
  // it to reach an operator about a misbehaving sender. Falls back to a
  // GSPS-owned address rather than failing the send.
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:alerts@gsps.app";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configuredPublicKey = publicKey;
  return true;
}

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** A push service reports a subscription permanently gone with 404 or 410.
 * Anything else (429, 5xx, a network error) is transient and leaves the row
 * alone for the next alert to retry — deleting on a transient failure would
 * silently unsubscribe a member whose push service was briefly down. */
const GONE_STATUS_CODES = new Set([404, 410]);

/**
 * Sends one payload to every device a member has registered.
 *
 * Takes the service-role client because it both reads rows RLS scopes to the
 * owning member and deletes dead ones on that member's behalf — the callers
 * are server-side fan-outs (a scan, a monitor transition) acting for a member
 * who is not making the request.
 *
 * Never throws: a transport failure on a notification must not fail the scan
 * that produced it. Every outcome is counted and returned for the caller to
 * log.
 */
export async function sendWebPushToProfile(
  service: SupabaseClient,
  profileId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!configureVapid()) {
    return { sent: 0, failed: 0, pruned: 0, skippedReason: "not_configured" };
  }

  const { data, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);

  if (error) {
    console.error(`[webpush] could not read subscriptions for ${profileId}:`, error);
    return { sent: 0, failed: 1, pruned: 0 };
  }

  const rows = (data ?? []) as SubscriptionRow[];
  if (rows.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, skippedReason: "no_subscriptions" };
  }

  const body = JSON.stringify(payload);
  let failed = 0;
  const deadIds: string[] = [];
  const sentIds: string[] = [];

  for (const row of rows) {
    const subscription: WebPushSubscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(subscription, body);
      sentIds.push(row.id);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode != null && GONE_STATUS_CODES.has(statusCode)) {
        deadIds.push(row.id);
      } else {
        failed += 1;
        console.error(`[webpush] send failed for ${profileId} (status ${statusCode ?? "none"})`);
      }
    }
  }

  if (deadIds.length > 0) {
    const { error: pruneError } = await service.from("push_subscriptions").delete().in("id", deadIds);
    if (pruneError) console.error("[webpush] could not prune dead subscriptions:", pruneError);
  }

  if (sentIds.length > 0) {
    const { error: stampError } = await service
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", sentIds);
    if (stampError) console.error("[webpush] could not stamp last_success_at:", stampError);
  }

  return { sent: sentIds.length, failed, pruned: deadIds.length };
}
