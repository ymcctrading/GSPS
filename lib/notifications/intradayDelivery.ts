/**
 * GSPS — email and browser push for the scheduled intraday scan's new signals.
 *
 * Moved out of `app/api/intraday-scan/route.ts` (2026-10-21) when push was
 * added (#404 shipped the subscriptions and `sendPushToProfile`), so both
 * channels go through one loop and one set of checks, and can be tested.
 *
 * Who receives a signal: a member who turned the channel on in Settings
 * (email and push are opt-in since 2026-10-22, migration 0109; a member with no
 * row gets neither). Then, per member and channel:
 * - the member's tier lets the signal through, as the panel and the bell do
 *   (`alertsForTier`: no intraday access, nothing; Pro's module, only its
 *   confirmed bar lengths). Before 2026-10-21 email went to every member
 *   whatever their tier, so a Novice could be emailed a signal their plan
 *   does not show;
 * - the alert's 0-9 confidence reaches the member's `min_score`;
 * - the member is not inside quiet hours they turned on (`inQuietHours`);
 * - the same symbol, direction and score was not sent or tried on that channel
 *   in the last 24 hours (`notification_log`, per channel, so an email does
 *   not hold back the push or the reverse). A failed try counts too, on
 *   purpose: the scan runs every 15 minutes, and retrying a refused send
 *   (Resend's daily quota, a bad address) on each run multiplies the failures
 *   without reaching anyone.
 * Best-effort per member: one bad address or failed write never stops the rest.
 *
 * The message says what Gann's method uses an intraday signal for: timing a
 * daily plan, with no measured record yet (`buildIntradayBellRow`).
 *
 * Mandate: no Gann content of its own (a delivery channel), Dewey N/A. Cause
 * and Effect: a notice is written only when the scheduled scan saw the move.
 * Law of Creation: alert ⊗ member's settings; the send is neither alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { inQuietHours } from "@/lib/entitlements/delivery";
import { sendAlertEmail } from "@/lib/notifications/resend-handler";
import { sendPushToProfile, vapidConfig, type PushMessage } from "@/lib/notifications/web-push";
import { alertsForTier, buildIntradayBellRow } from "@/lib/notifications/intradayBell";
import { tickerHref } from "@/lib/routes";
import { NOTICE_SIGNALS } from "@/lib/scanner/intradayDisplay";
import { approachDue, approachLeadMinutes } from "@/lib/scanner/entryApproach";

/** How far back a notification_log row still counts as "already sent this". */
export const NOTIFICATION_DEDUP_HOURS = 24;

/**
 * What `app/api/notifications/preferences` (GET) promises a member who has
 * never saved a row: email off, push off (opt-in, 2026-10-22), score floor 5,
 * no quiet hours.
 */
const DEFAULT_PREFS = { email_enabled: false, push_enabled: false, min_score: 5, quiet_hours_enabled: false };

type Channel = "email" | "push";

interface SavedRow {
  user_id: string;
  email_enabled: boolean | null;
  push_enabled: boolean | null;
  min_score: number | null;
  quiet_hours_enabled: boolean | null;
  /** Minutes ahead a member is told price nears a plan's entry (migration 0124); absent before it. */
  entry_lead_minutes?: number | null;
}

/**
 * Every member's id, paginating through the admin API rather than trusting a
 * single page: a member with no saved preferences is still a recipient, so a
 * short page would silently drop real recipients.
 */
async function listAllUserIds(service: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < perPage) break;
  }
  return ids;
}

/**
 * The alerts due to a member with this lead: every signal but a heads-up that
 * price nears an entry, which waits until the time left is within the lead
 * plus one scan (`approachDue`).
 */
export function dueForLead(alerts: Alert[], leadMinutes: number): Alert[] {
  return alerts.filter((a) => a.type !== "entry_approach" || (a.approach != null && approachDue(a.approach.etaMinutes, leadMinutes)));
}

/**
 * The key a send is deduplicated on. A notice (nearing or at a plan's entry)
 * is keyed on its own type, so it goes out once a day on each channel and
 * never holds back, or is held back by, a trade signal with the same score.
 */
export function signalHashFor(alert: Alert): string {
  const direction = alert.direction === "up" ? "bullish" : "bearish";
  if (NOTICE_SIGNALS.has(alert.type)) return `${alert.symbol}-${alert.type}-${direction}`;
  return `${alert.symbol}-${direction}-${alertScore(alert)}`;
}

/** The alert's own 0-9 confidence, a whole number. */
export function alertScore(alert: Alert): number {
  return Math.max(0, Math.min(9, Math.round((alert.confidence / 100) * 9)));
}

/** The push for an intraday signal, worded as the bell notice is. */
export function intradayPushMessage(alert: Alert): PushMessage {
  const row = buildIntradayBellRow(alert);
  return { title: row.title, body: row.body, url: tickerHref(alert.symbol), tag: `intraday-${alert.symbol}` };
}

async function alreadySent(
  service: SupabaseClient,
  userId: string,
  channel: Channel,
  signalHash: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - NOTIFICATION_DEDUP_HOURS * 3600_000).toISOString();
  const { data } = await service
    .from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("signal_hash", signalHash)
    .gte("triggered_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Emails and pushes each new system-scan alert to the members whose tier and
 * settings let it through. Returns how many sends succeeded, per channel.
 */
export async function notifySubscribedUsers(
  service: SupabaseClient,
  alerts: Alert[],
  args: { intervalBySymbol: Map<string, number>; now?: Date },
): Promise<{ email: number; push: number }> {
  const sent = { email: 0, push: 0 };
  if (alerts.length === 0) return sent;
  const emailOn = Boolean(process.env.RESEND_API_KEY);
  const pushOn = vapidConfig() !== null;
  if (!emailOn && !pushOn) return sent;
  const now = args.now ?? new Date();

  const { data: saved, error } = await service
    .from("notification_preferences")
    // Every column, so the read works before and after migration 0124 adds
    // `entry_lead_minutes`.
    .select("*");
  if (error) return sent;
  const savedByUser = new Map(((saved ?? []) as SavedRow[]).map((p) => [p.user_id, p]));

  for (const userId of await listAllUserIds(service)) {
    try {
      const row = savedByUser.get(userId);
      const channels: Channel[] = [];
      if (emailOn && (row?.email_enabled ?? DEFAULT_PREFS.email_enabled)) channels.push("email");
      if (pushOn && (row?.push_enabled ?? DEFAULT_PREFS.push_enabled)) channels.push("push");
      if (channels.length === 0) continue;

      const minScore = row?.min_score ?? DEFAULT_PREFS.min_score;
      const policy = await getUserEntitlementPolicy(service, userId);
      const mine = dueForLead(
        alertsForTier(alerts, policy, args.intervalBySymbol).filter((a) => alertScore(a) >= minScore),
        approachLeadMinutes(row?.entry_lead_minutes),
      );
      if (mine.length === 0) continue;
      if ((row?.quiet_hours_enabled ?? DEFAULT_PREFS.quiet_hours_enabled) && (await inQuietHours(service, userId))) {
        continue;
      }

      let email: string | null | undefined;
      for (const alert of mine) {
        const direction = alert.direction === "up" ? "bullish" : "bearish";
        const score = alertScore(alert);
        const signalHash = signalHashFor(alert);
        for (const channel of channels) {
          if (await alreadySent(service, userId, channel, signalHash, now)) continue;

          let result: { success: boolean; skipped?: boolean; error?: string };
          let recipient: string | null = null;
          if (channel === "email") {
            if (email === undefined) {
              const { data: user } = await service.auth.admin.getUserById(userId);
              email = user?.user?.email ?? null;
            }
            if (!email) continue;
            recipient = email;
            result = await sendAlertEmail({
              userEmail: email,
              symbol: alert.symbol,
              direction,
              score,
              // The alert's own 0-9 confidence, already a whole number, so
              // the protocol score's tier rounding does not apply.
              exactScoreDisplayEnabled: true,
              entry: alert.continuationPlan.entry ?? alert.move.current,
              stopLoss: alert.invalidation ?? alert.move.current,
              takeProfit: alert.continuationPlan.firstTarget,
              masterProfit: alert.continuationPlan.masterTarget ?? null,
              verdict: "Execute",
              confidence: alert.confidence / 100,
            });
            // No deliverable sender (the sandbox address or an invalid
            // RESEND_FROM) is not a send either: nothing to log or retry,
            // as for push below. notification_log has no "skipped" status.
            if (!result.success && result.skipped) continue;
          } else {
            result = await sendPushToProfile(service, userId, intradayPushMessage(alert));
            // No subscribed browser is not a send: nothing to log or retry.
            if (!result.success && result.skipped) continue;
          }

          if (result.success) sent[channel] += 1;
          const stamp = now.toISOString();
          const { error: logError } = await service.from("notification_log").insert({
            user_id: userId,
            symbol: alert.symbol,
            direction,
            score,
            channel,
            status: result.success ? "sent" : "failed",
            recipient,
            triggered_at: stamp,
            sent_at: result.success ? stamp : null,
            failed_at: result.success ? null : stamp,
            error_message: result.success ? null : (result.error ?? null),
            signal_hash: signalHash,
          });
          if (logError) console.error("[intraday-notify] could not log notification:", logError.message);
        }
      }
    } catch (err) {
      console.error("[intraday-notify] member skipped:", err);
    }
  }
  return sent;
}
