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
import { deliveryPushMessage, sendPushToProfile } from "@/lib/notifications/web-push";
import { isPreviewEnvironment } from "@/lib/env/preview";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { etDateKey } from "@/lib/market/session";

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
  | { dispatched: true; status: "sent" | "failed" | "skipped" }
  | {
      dispatched: false;
      reason: "not_pending" | "channel_unsupported" | "no_email" | "preview_suppressed" | "max_attempts" | "channels_unread";
    };

/** Attempt ceiling for a stuck `pending`/`failed` delivery the retry sweep will pick back up. */
export const MAX_DISPATCH_ATTEMPTS = 5;

/**
 * A delivery older than this is skipped, never sent: an alert is about the
 * session it was made in (a plan lasts its session, Q17), and a burst of old
 * sends, such as rows left pending while push had no sender, would open plans
 * the scan has since moved past. Push only until 2026-10-22; email had no age
 * limit, so the retry sweep kept re-sending failed setup emails from as far
 * back as 2026-09-28 (7,643 retryable rows), spending Resend's daily quota on
 * plans weeks dead and failing the day's live alerts behind them.
 */
export const DELIVERY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** @deprecated Every channel now ages out; kept for callers that named push. */
export const PUSH_MAX_AGE_MS = DELIVERY_MAX_AGE_MS;

/** Statuses this function will still attempt to send for. `sent` (and `bounced`) are terminal -- never re-dispatched. */
const DISPATCHABLE_STATUSES = ["pending", "failed"];

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
 * Email (`sendAlertEmail`) and browser push (`sendPushToProfile`, standard
 * Web Push) send. SMS has no provider (it needs a paid one), so an sms row is
 * left `pending` rather than falsely marked `sent`.
 *
 * The member's own filters hold a send before it goes out, on every channel:
 * quiet hours, and the minimum score for an alert (an invalidation is always
 * sent outside quiet hours, since it tells the member a tracked setup broke).
 * A held send is `skipped` with the reason, never retried. The intraday push
 * path (`notifySubscribedUsers`) applies both too.
 *
 * Email is kept for what the member must act on (owner, 2026-10-28, item 6):
 * a broken plan is emailed only when they hold the symbol, and a symbol's
 * Execute once a New York day; the rest go by push and the bell. Every email
 * also takes a slot of the daily budget (`lib/notifications/email-budget.ts`).
 *
 * The channel is read again at send time (2026-10-22): a row recorded before
 * the member turned the channel off (or before opt-in, migration 0109) is
 * skipped, not retried into their inbox. When the channel list can't be read
 * the row is left as it is for the next sweep, never sent unchecked.
 */
export async function dispatchNotificationDelivery(
  service: SupabaseClient,
  args: { deliveryId: string; profileId: string; enabledChannels?: DeliveryChannel[] },
): Promise<DispatchOutcome> {
  if (isPreviewEnvironment()) {
    return { dispatched: false, reason: "preview_suppressed" };
  }

  const { data: current, error: readError } = await service
    .from("notification_deliveries")
    .select("id, status, channel, payload, attempt_count, created_at")
    .eq("id", args.deliveryId)
    .single();
  if (readError || !current) throw new Error(`dispatchNotificationDelivery: ${readError?.message ?? "not found"}`);
  if (!DISPATCHABLE_STATUSES.includes(current.status)) return { dispatched: false, reason: "not_pending" };
  if ((current.attempt_count ?? 0) >= MAX_DISPATCH_ATTEMPTS) return { dispatched: false, reason: "max_attempts" };

  if (current.channel !== "email" && current.channel !== "push") {
    return { dispatched: false, reason: "channel_unsupported" };
  }

  const payload = current.payload as NotificationPayload;
  let result: { success: boolean; id?: string | null; error?: string; skipped?: boolean };
  const createdAt = Date.parse((current as { created_at?: string }).created_at ?? "");
  const stale = Number.isFinite(createdAt) && Date.now() - createdAt > DELIVERY_MAX_AGE_MS;
  let held: string | null = stale ? "Older than its session: the plan is read again on the next scan." : null;
  if (!held) {
    // The inline dispatch passes the list it read a moment ago; the sweep reads it.
    let enabled: DeliveryChannel[];
    try {
      enabled = args.enabledChannels ?? (await getEnabledChannels(service, args.profileId));
    } catch {
      return { dispatched: false, reason: "channels_unread" };
    }
    held = enabled.includes(current.channel)
      ? await preferenceHold(service, args.profileId, payload)
      : "The member has this channel turned off.";
  }
  if (!held && current.channel === "email" && payload.verdict === "INVALIDATED" && !(await holdsSymbol(service, args.profileId, payload.symbol))) {
    held = INVALIDATION_EMAIL_HOLD;
  }
  if (!held && current.channel === "email" && payload.verdict === "Execute" && (await executeEmailedToday(service, args.profileId, payload.symbol, args.deliveryId))) {
    held = EXECUTE_REPEAT_HOLD;
  }
  if (held) {
    result = { success: false, skipped: true, error: held };
  } else if (current.channel === "push") {
    const pushed = await sendPushToProfile(service, args.profileId, deliveryPushMessage(payload));
    result = pushed.success ? { success: true, id: null } : pushed;
  } else {
    const { data: userRecord } = await service.auth.admin.getUserById(args.profileId);
    const email = userRecord?.user?.email;
    if (!email) return { dispatched: false, reason: "no_email" };
    result =
      payload.verdict === "INVALIDATED"
        ? await sendSetupInvalidatedEmail({ userEmail: email, symbol: payload.symbol })
        : await sendAlertEmail({ userEmail: email, ...payload });
  }
  // A send the sandbox sender cannot deliver is `skipped`, not `failed`, and
  // never retried; every other failure keeps Resend's own reason (S-04).
  const status: "sent" | "failed" | "skipped" = result.success
    ? "sent"
    : "skipped" in result && result.skipped
      ? "skipped"
      : "failed";

  await service
    .from("notification_deliveries")
    .update({
      status,
      provider_ref: result.success ? (result.id ?? null) : null,
      error: result.success ? null : (result.error ?? null),
      attempt_count: (current.attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.deliveryId)
    .in("status", DISPATCHABLE_STATUSES);

  return { dispatched: true, status };
}

/**
 * Email is kept for what a member must act on (owner, 2026-10-28, item 6). A
 * tracked plan breaking before it was entered changes nothing they hold, so
 * it goes by push and the bell (written for every transition); it is emailed
 * only when the member has an open position in the symbol.
 */
export const INVALIDATION_EMAIL_HOLD = "A broken plan on a symbol the member doesn't hold goes by push and the bell, not email.";

/**
 * A tracked symbol turning Execute is emailed once a New York day: a monitor
 * that drops to Watch and comes back is the same setup, and the repeat goes
 * by push and the bell.
 */
export const EXECUTE_REPEAT_HOLD = "This symbol's Execute alert was already emailed today; the repeat goes by push and the bell.";

/** Whether another email delivery for this member's symbol turning Execute was sent since midnight New York time. */
export async function executeEmailedToday(
  service: SupabaseClient,
  profileId: string,
  symbol: string,
  deliveryId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("notification_deliveries")
      .select("id, payload, created_at")
      .eq("profile_id", profileId)
      .eq("channel", "email")
      .eq("status", "sent")
      .neq("id", deliveryId)
      .gte("created_at", new Date(now.getTime() - 30 * 3600_000).toISOString());
    if (error) return false;
    const today = etDateKey(now);
    return ((data ?? []) as { payload: { symbol?: string; verdict?: string } | null; created_at: string }[]).some(
      (r) => r.payload?.symbol === symbol && r.payload?.verdict === "Execute" && etDateKey(new Date(r.created_at)) === today,
    );
  } catch {
    return false;
  }
}

/**
 * Whether the member has an open position (paper or live) in the symbol. An
 * unreadable ledger reads as held, so the email goes out rather than being
 * dropped on a read error.
 */
export async function holdsSymbol(service: SupabaseClient, profileId: string, symbol: string): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("positions")
      .select("id")
      .eq("user_id", profileId)
      .eq("symbol", symbol.toUpperCase())
      .eq("closed", false)
      .limit(1);
    if (error) return true;
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

/**
 * Why the member's own notification filters hold this send, or null when it
 * may go out. Unreadable preferences hold nothing: a member who never saved
 * any gets the defaults the settings API promises (no quiet hours, score
 * floor 5), and an Execute alert always clears 5.
 */
export async function preferenceHold(
  service: SupabaseClient,
  profileId: string,
  payload: NotificationPayload,
): Promise<string | null> {
  try {
    const { data: prefs } = await service
      .from("notification_preferences")
      .select("min_score, quiet_hours_enabled")
      .eq("user_id", profileId)
      .maybeSingle();
    if (!prefs) return null;
    const minScore = (prefs as { min_score: number | null }).min_score;
    if (payload.verdict !== "INVALIDATED" && minScore != null && payload.score < minScore) {
      return `Below the member's minimum score (${payload.score} < ${minScore}).`;
    }
    if ((prefs as { quiet_hours_enabled: boolean | null }).quiet_hours_enabled && (await inQuietHours(service, profileId))) {
      return "Inside the member's quiet hours.";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the member is inside quiet hours they turned on. Every send that
 * reaches a member outside the app reads it (setup alerts, price alerts,
 * intraday alerts). Fails open on an unreadable preference, as
 * `preferenceHold` does.
 */
export async function inQuietHours(service: SupabaseClient, profileId: string): Promise<boolean> {
  try {
    const { data } = await service.rpc("is_in_quiet_hours", { user_id: profileId });
    return data === true;
  } catch {
    return false;
  }
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
): Promise<{ swept: number; sent: number; failed: number; suppressed: number; unread: number }> {
  // Rows past their session are closed in one write before the batch is
  // picked, so a backlog of old rows can't hold today's failed sends out of
  // the batch until they too age out unsent. Best-effort: the dispatch below
  // skips an old row anyway.
  const staleBefore = new Date(Date.now() - DELIVERY_MAX_AGE_MS).toISOString();
  const { error: staleError } = await service
    .from("notification_deliveries")
    .update({
      status: "skipped",
      error: "Older than its session: the plan is read again on the next scan.",
      updated_at: new Date().toISOString(),
    })
    .in("status", DISPATCHABLE_STATUSES)
    .lt("created_at", staleBefore);
  if (staleError) console.error(`sweepStuckDeliveries: stale rows not closed — ${staleError.message}`);

  const cutoff = new Date(Date.now() - args.olderThanMs).toISOString();
  const { data: rows, error } = await service
    .from("notification_deliveries")
    .select("id, profile_id")
    .in("status", ["pending", "failed"])
    .lt("attempt_count", MAX_DISPATCH_ATTEMPTS)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 200);

  if (error) throw new Error(`sweepStuckDeliveries: ${error.message}`);

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let unread = 0;
  for (const row of (rows ?? []) as { id: string; profile_id: string }[]) {
    try {
      const outcome = await dispatchNotificationDelivery(service, { deliveryId: row.id, profileId: row.profile_id });
      if (outcome.dispatched && outcome.status === "sent") sent += 1;
      else if (outcome.dispatched && outcome.status === "failed") failed += 1;
      else if (!outcome.dispatched && outcome.reason === "channels_unread") unread += 1;
      else if (!outcome.dispatched) suppressed += 1;
    } catch (err) {
      console.error(`sweepStuckDeliveries: dispatch failed for delivery ${row.id} — ${String(err)}`);
    }
  }

  return { swept: (rows ?? []).length, sent, failed, suppressed, unread };
}
