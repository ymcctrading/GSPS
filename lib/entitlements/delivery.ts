/**
 * Phase 3E/Phase 5: idempotent notification-delivery recording for a
 * notify-worthy monitor transition -- a confirmed WATCH -> EXECUTE, or a
 * tracked setup breaking (WATCH/EXECUTE -> INVALIDATED) -- plus (Phase 5)
 * the actual send.
 *
 * `recordNotificationDelivery` inserts the ledger row *and* the entitled
 * payload it was recorded with -- the unique constraint on
 * `idempotency_key` is what guarantees a retry or duplicate evaluation
 * lands it once. `dispatchNotificationDelivery` is the send step: it
 * re-reads the row immediately before sending and only proceeds if it is
 * still `pending`, so calling it twice for the same delivery (a retry sweep
 * racing the original inline call, a crash after a successful send but
 * before the caller observed the response) never sends twice -- the second
 * caller sees a non-pending status and no-ops. It reads the payload back
 * from the row rather than trusting a caller-supplied one, so a retry sweep
 * with no scan context of its own can dispatch a stuck delivery using
 * exactly what was recorded at evaluation time -- never a payload
 * reconstructed from current (possibly since-changed) data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlertEmail, sendSetupInvalidatedEmail } from "@/lib/notifications/resend-handler";
import { sendWebPushToProfile, type PushPayload } from "@/lib/notifications/webpush";
import { tickerHref } from "@/lib/routes";
import { isPreviewEnvironment } from "@/lib/env/preview";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";

export type DeliveryChannel = "email" | "sms" | "push";

/**
 * Only what an entitled, visible WATCH -> EXECUTE alert may disclose --
 * built by the caller from `visible_scan_results`/monitor state, never from
 * raw scan internals. Deliberately narrower than `ScanResult`.
 *
 * `signal` is the Signal and Regime Engine's own rollup (already redacted —
 * see `lib/signals/publicSummary.ts`), attached as informational context
 * alongside the Gann/STRAT verdict above. It never decides whether this
 * alert fires: the WATCH -> EXECUTE transition that triggers a notification
 * is computed from `verdict`/`score` alone, same as before this field
 * existed. `null`/absent when no state evaluated as tradeable.
 */
export type EntitledAlertPayload = {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  /** See lib/scoring/display.ts — the recipient's own tier, resolved once. */
  exactScoreDisplayEnabled: boolean;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  // Narrower than `ScanDecision["outputState"]`'s own type only in that it
  // excludes "INVALIDATED" -- which is never a scan verdict, only a monitor
  // state -- so this stays disjoint from `EntitledInvalidationPayload.verdict`
  // and `payload.verdict === "INVALIDATED"` actually narrows the union below.
  verdict: "Execute" | "Watch" | "Reject";
  confidence: number;
  signal?: PublicSignalSummary | null;
};

/**
 * A tracked setup breaking (WATCH/EXECUTE -> INVALIDATED). Deliberately
 * narrower than `EntitledAlertPayload` -- the evaluation that produces this
 * (a symbol that dropped out of a scan's qualifying results) has no fresh
 * entry/stop/target/score to disclose, only that the setup the user was
 * being tracked on no longer holds. `verdict` is the discriminant `payload`
 * consumers (`dispatchNotificationDelivery`) switch on to pick a template.
 */
export type EntitledInvalidationPayload = {
  symbol: string;
  verdict: "INVALIDATED";
};

export type NotificationPayload = EntitledAlertPayload | EntitledInvalidationPayload;

export type RecordDeliveryResult =
  | { recorded: true; deliveryId: string }
  | { recorded: false; deliveryId: null };

/**
 * Inserts a `pending` notification_deliveries row for `transitionId` +
 * `channel`, keyed by `idempotencyKey`, storing `payload` alongside it. If
 * that key was already recorded -- a retry, a duplicate evaluation, two
 * concurrent callers -- the unique constraint on
 * notification_deliveries.idempotency_key rejects the second insert and
 * this returns `recorded: false` rather than throwing: the caller's job
 * (send once) is already done or already someone else's turn.
 */
export async function recordNotificationDelivery(
  service: SupabaseClient,
  args: {
    transitionId: string;
    profileId: string;
    channel: DeliveryChannel;
    idempotencyKey: string;
    payload: NotificationPayload;
  },
): Promise<RecordDeliveryResult> {
  const { data, error } = await service
    .from("notification_deliveries")
    .insert({
      transition_id: args.transitionId,
      profile_id: args.profileId,
      channel: args.channel,
      idempotency_key: args.idempotencyKey,
      status: "pending",
      payload: args.payload,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { recorded: false, deliveryId: null };
    throw new Error(`recordNotificationDelivery: ${error.message}`);
  }
  return { recorded: true, deliveryId: (data as { id: string }).id };
}

/** Reads a profile's enabled channels via the service-role-only RPC (migration 0025/0026). */
export async function getEnabledChannels(service: SupabaseClient, profileId: string): Promise<DeliveryChannel[]> {
  const { data, error } = await service.rpc("get_enabled_notification_channels", { user_id: profileId });
  if (error) throw new Error(`getEnabledChannels: ${error.message}`);
  return (data ?? []) as DeliveryChannel[];
}

export type DispatchOutcome =
  | { dispatched: true; status: "sent" | "failed" }
  | { dispatched: false; reason: "not_pending" | "channel_unsupported" | "no_email" | "preview_suppressed" | "max_attempts" };

/** Attempt ceiling for a stuck `pending`/`failed` delivery the retry sweep will pick back up. */
export const MAX_DISPATCH_ATTEMPTS = 5;

/** Statuses this function will still attempt to send for. `sent` (and `bounced`) are terminal -- never re-dispatched. */
const DISPATCHABLE_STATUSES = ["pending", "failed"];

/**
 * The tray-sized version of a notification payload. A push body is read on a
 * lock screen in a glance, so it carries the decision (which symbol, which
 * way, at what levels) and nothing else -- the app is one tap away for the
 * rest. `tag` is the symbol, so a re-fired alert for one symbol replaces its
 * own previous entry instead of burying every other symbol's.
 */
function pushPayloadFor(payload: NotificationPayload): PushPayload {
  if (payload.verdict === "INVALIDATED") {
    return {
      title: `${payload.symbol} invalidated`,
      body: `The setup you were tracking on ${payload.symbol} no longer holds.`,
      url: tickerHref(payload.symbol),
      tag: `gsps-${payload.symbol}`,
    };
  }
  const score = formatScore(payload.score, payload.exactScoreDisplayEnabled);
  return {
    title: `${payload.symbol} — ${payload.verdict} (${score}/${SCORE_MAX})`,
    body: `${payload.direction === "bullish" ? "Buy" : "Sell"} setup. Entry ${payload.entry}, stop ${payload.stopLoss}, target ${payload.takeProfit}.`,
    url: tickerHref(payload.symbol),
    tag: `gsps-${payload.symbol}`,
  };
}

/**
 * Sends the notification for an already-recorded delivery row still in a
 * dispatchable status (`pending` or `failed`) and updates its status.
 * Re-reads the row's current status first: if it has already reached `sent`
 * (by an earlier call -- the inline dispatch, or a concurrent sweep), this
 * no-ops rather than sending again -- that guard, not caller discipline, is
 * what keeps a retry sweep safe to run concurrently with the inline
 * dispatch on the original evaluation path. The final status update is
 * itself conditioned on the row still being in a dispatchable status, so
 * two concurrent callers racing the same row can't both record a send.
 *
 * Never sends a real notification in preview -- checked here, not only at
 * the scheduled-job call site, so `/api/batch-scan`'s manual scan path
 * (which has no preview guard of its own) can't leak a real email out of a
 * preview deployment either. The row is left untouched, so preview activity
 * never fabricates a `sent`/`failed` record.
 *
 * Email (`sendAlertEmail`) and push (`sendWebPushToProfile`) are the two
 * channels with a real provider. SMS is still recorded but not dispatchable
 * and is left `pending` for a future channel implementation rather than
 * falsely marked `sent`.
 */
export async function dispatchNotificationDelivery(
  service: SupabaseClient,
  args: { deliveryId: string; profileId: string },
): Promise<DispatchOutcome> {
  if (isPreviewEnvironment()) {
    return { dispatched: false, reason: "preview_suppressed" };
  }

  const { data: current, error: readError } = await service
    .from("notification_deliveries")
    .select("id, status, channel, payload, attempt_count")
    .eq("id", args.deliveryId)
    .single();
  if (readError || !current) throw new Error(`dispatchNotificationDelivery: ${readError?.message ?? "not found"}`);
  if (!DISPATCHABLE_STATUSES.includes(current.status)) return { dispatched: false, reason: "not_pending" };
  if ((current.attempt_count ?? 0) >= MAX_DISPATCH_ATTEMPTS) return { dispatched: false, reason: "max_attempts" };

  if (current.channel === "sms") {
    return { dispatched: false, reason: "channel_unsupported" };
  }

  const payload = current.payload as NotificationPayload;
  let succeeded: boolean;
  let providerRef: string | null = null;

  if (current.channel === "push") {
    // A push send has no single provider id to record — one delivery fans out
    // to every device the member registered — so `provider_ref` stays null and
    // the per-device outcome is `webpush`'s own concern (including pruning a
    // subscription the push service reports gone). One device reached is a
    // delivered notification: the member saw it.
    const push = await sendWebPushToProfile(service, args.profileId, pushPayloadFor(payload));
    succeeded = push.sent > 0;
  } else {
    const { data: userRecord } = await service.auth.admin.getUserById(args.profileId);
    const email = userRecord?.user?.email;
    if (!email) return { dispatched: false, reason: "no_email" };

    const result =
      payload.verdict === "INVALIDATED"
        ? await sendSetupInvalidatedEmail({ userEmail: email, symbol: payload.symbol })
        : await sendAlertEmail({ userEmail: email, ...payload });
    succeeded = result.success;
    providerRef = result.success ? (result.id ?? null) : null;
  }

  const status: "sent" | "failed" = succeeded ? "sent" : "failed";

  await service
    .from("notification_deliveries")
    .update({
      status,
      provider_ref: providerRef,
      attempt_count: (current.attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.deliveryId)
    .in("status", DISPATCHABLE_STATUSES);

  return { dispatched: true, status };
}

/** Idempotency guard for `recordInAppNotification` -- a unique index on
 * (transition_id, profile_id) would need a schema change this table doesn't
 * have (transition_id is nullable, for future non-transition notifications),
 * so dedup is a pre-check instead: a retry or duplicate evaluation must not
 * leave two bell entries for the one transition. */
async function inAppNotificationAlreadyRecorded(
  service: SupabaseClient,
  args: { transitionId: string; profileId: string },
): Promise<boolean> {
  const { data } = await service
    .from("in_app_notifications")
    .select("id")
    .eq("transition_id", args.transitionId)
    .eq("profile_id", args.profileId)
    .limit(1)
    .maybeSingle();
  return data != null;
}

/**
 * Writes the in-app ("on the platform itself") notification for a
 * notify-worthy monitor transition -- always, independent of a profile's
 * email/sms/push channel preferences (see `in_app_notifications`'s own
 * migration comment for why this isn't a `DeliveryChannel`). No dispatch
 * step: unlike email, there is no external provider and no failure mode
 * short of the insert itself failing, so this is the whole lifecycle.
 * Best-effort from the caller's point of view -- a thrown error here must
 * never hold up the email path already handled by the same evaluation.
 */
export async function recordInAppNotification(
  service: SupabaseClient,
  args: { transitionId: string; profileId: string; payload: NotificationPayload },
): Promise<void> {
  if (await inAppNotificationAlreadyRecorded(service, args)) return;

  const { payload } = args;
  const row =
    payload.verdict === "INVALIDATED"
      ? {
          symbol: payload.symbol,
          verdict: "INVALIDATED" as const,
          title: `${payload.symbol} invalidated`,
          body: `The setup you were tracking on ${payload.symbol} no longer holds -- price broke the level it was staked on.`,
        }
      : {
          symbol: payload.symbol,
          verdict: "Execute" as const,
          title: `${payload.symbol} — Execute (${formatScore(payload.score, payload.exactScoreDisplayEnabled)}/${SCORE_MAX})`,
          body: `${payload.direction === "bullish" ? "Buy" : "Sell"} setup confirmed at ${formatScore(payload.score, payload.exactScoreDisplayEnabled)}/${SCORE_MAX}. Entry ${payload.entry}, stop ${payload.stopLoss}, target ${payload.takeProfit}.`,
        };

  const { error } = await service.from("in_app_notifications").insert({
    profile_id: args.profileId,
    transition_id: args.transitionId,
    ...row,
  });
  if (error) throw new Error(`recordInAppNotification: ${error.message}`);
}

/** What an intraday system alert needs to reach the bell and a phone. Flatter
 * than `EntitledAlertPayload` because an intraday alert has no scored verdict
 * or tier-dependent score display to carry -- its 0-9 confidence is already a
 * whole number (see `notifySubscribedUsers`'s own note on why the Novice/Pro
 * rounding split does not apply to it). */
export type IntradayAlertNotification = {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  /** The level the move was confirmed at. */
  entry: number;
  invalidation: number | null;
  /** Null where no Gann level lies ahead -- `lib/scanner/intraday.ts` leaves
   * the target unset rather than inventing one ("never fix a target price"),
   * and the copy here has to say so rather than print a number. */
  firstTarget: number | null;
};

function intradayBody(alert: IntradayAlertNotification): string {
  const side = alert.direction === "bullish" ? "Upside" : "Downside";
  const stop = alert.invalidation != null ? `, invalidation ${alert.invalidation}` : "";
  const target =
    alert.firstTarget != null
      ? `, first target ${alert.firstTarget}`
      : ", no target fixed — the stop trails";
  return `${side} move confirmed at ${alert.entry}${stop}${target}.`;
}

/**
 * Writes the in-app ("on the platform itself") notification for an intraday
 * system alert, and pushes it to the member's registered devices.
 *
 * Why this exists next to `recordInAppNotification` rather than inside it:
 * that one serves a monitor transition and keys its dedup on
 * `transition_id`, which an intraday alert does not have. The caller
 * (`app/api/intraday-scan/route.ts#notifySubscribedUsers`) dedups on its own
 * `notification_log` signal hash over a 24-hour window before reaching here,
 * so this does not repeat that check -- stated explicitly because a second,
 * differently-keyed dedup would be the kind of silent divergence AGENTS.md's
 * cross-platform consistency rule exists to catch.
 *
 * `verdict` is 'Watch', not 'Execute'. An intraday alert is a confirmation
 * that a move is underway, not a scored Execute verdict -- the same rule
 * `applyMonitorsForUser` already applies when it opens a WATCH monitor and
 * never an EXECUTE one for these alerts (project owner, 2026-09-28).
 *
 * Best-effort: never throws. A bell row or a push that fails must not stop
 * the rest of the fan-out, and must not fail the scan that produced it.
 */
export async function notifyIntradayAlert(
  service: SupabaseClient,
  args: { profileId: string; alert: IntradayAlertNotification; pushEnabled: boolean },
): Promise<{ inApp: boolean; pushSent: number }> {
  const { alert } = args;
  const direction = alert.direction === "bullish" ? "Bullish" : "Bearish";
  const title = `${alert.symbol} — intraday ${direction.toLowerCase()} (${alert.score}/${SCORE_MAX})`;
  const body = intradayBody(alert);

  let inApp = false;
  try {
    const { error } = await service.from("in_app_notifications").insert({
      profile_id: args.profileId,
      // No monitor transition produced this one -- the column is nullable
      // exactly so this table could generalize past transitions (0067).
      transition_id: null,
      symbol: alert.symbol,
      verdict: "Watch",
      title,
      body,
    });
    if (error) console.error("[notifyIntradayAlert] in-app insert failed:", error);
    else inApp = true;
  } catch (err) {
    console.error("[notifyIntradayAlert] in-app insert threw:", err);
  }

  let pushSent = 0;
  if (args.pushEnabled) {
    try {
      const result = await sendWebPushToProfile(service, args.profileId, {
        title,
        body,
        url: tickerHref(alert.symbol),
        tag: `gsps-${alert.symbol}`,
      });
      pushSent = result.sent;
    } catch (err) {
      console.error("[notifyIntradayAlert] push threw:", err);
    }
  }

  return { inApp, pushSent };
}

/**
 * Retry sweep: picks up deliveries stuck `pending` (an inline dispatch that
 * never ran or crashed mid-flight) or `failed` (a transport error worth
 * retrying) below the attempt ceiling, and dispatches each with the exact
 * payload it was originally recorded with. `olderThanMs` avoids racing the
 * inline dispatch that runs immediately after `recordNotificationDelivery`
 * on the original evaluation path -- only rows old enough that the inline
 * attempt has certainly already happened (or never will) are candidates.
 */
export async function sweepStuckDeliveries(
  service: SupabaseClient,
  args: { olderThanMs: number; limit?: number },
): Promise<{ swept: number; sent: number; failed: number; suppressed: number }> {
  const cutoff = new Date(Date.now() - args.olderThanMs).toISOString();
  const { data: rows, error } = await service
    .from("notification_deliveries")
    .select("id, profile_id")
    .in("status", ["pending", "failed"])
    .lt("attempt_count", MAX_DISPATCH_ATTEMPTS)
    .lt("created_at", cutoff)
    .limit(args.limit ?? 200);

  if (error) throw new Error(`sweepStuckDeliveries: ${error.message}`);

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  for (const row of (rows ?? []) as { id: string; profile_id: string }[]) {
    try {
      const outcome = await dispatchNotificationDelivery(service, { deliveryId: row.id, profileId: row.profile_id });
      if (outcome.dispatched && outcome.status === "sent") sent += 1;
      else if (outcome.dispatched && outcome.status === "failed") failed += 1;
      else if (!outcome.dispatched) suppressed += 1;
    } catch (err) {
      console.error(`sweepStuckDeliveries: dispatch failed for delivery ${row.id} — ${String(err)}`);
    }
  }

  return { swept: (rows ?? []).length, sent, failed, suppressed };
}
