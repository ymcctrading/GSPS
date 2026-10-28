/**
 * GSPS — browser push for the scheduled intraday scan's new signals.
 *
 * Push and the bell only, never email (owner, 2026-10-28: email carries only
 * the key alerts). Resend refused sends once a day's quota of about 200 was
 * spent, and intraday signals were about 90% of email (10-23: 184 intraday
 * and 16 monitor sends before the first refusal), so a member's own trades and
 * a tracked symbol turning Execute went unsent. The day's signals reach the
 * inbox in the evening digest instead.
 *
 * Moved out of `app/api/intraday-scan/route.ts` (2026-10-21) when push was
 * added (#404 shipped the subscriptions and `sendPushToProfile`), so it can be
 * tested.
 *
 * Who receives a signal: a member who turned push on in Settings (opt-in since
 * 2026-10-22, migration 0109; a member with no row gets none). Then, per
 * member:
 * - the member's tier lets the signal through, as the panel and the bell do
 *   (`alertsForTier`: no intraday access, nothing; Pro's module, only its
 *   confirmed bar lengths);
 * - the alert's 0-9 confidence reaches the member's `min_score`;
 * - the member is not inside quiet hours they turned on (`inQuietHours`);
 * - the move is new (`notification_log`): a signal goes once a move, as the
 *   bell's does (`isNewMove`), so the same symbol and signal is sent again on
 *   the same New York day only after it turned the other way; a notice
 *   (nearing or at a plan's entry), once in 24 hours. Gann acts on the first
 *   change in trend (Master Course Ch. 13). Until 2026-10-28 a signal was
 *   keyed on its symbol, direction and 0-9 score, so a score that drifted
 *   between scans sent the same standing move again: on 10-27, 150 emails for
 *   63 member-symbol-direction pairs, every repeat a new score. A failed try
 *   counts too, on purpose: the scan runs every 15 minutes, and retrying a
 *   refused send on each run multiplies the failures without reaching anyone.
 * Best-effort per member: one failed send or write never stops the rest.
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
import { sendPushToProfile, vapidConfig, type PushMessage } from "@/lib/notifications/web-push";
import { alertsForTier, buildIntradayBellRow } from "@/lib/notifications/intradayBell";
import { tickerHref } from "@/lib/routes";
import { etDateKey } from "@/lib/market/session";
import { NOTICE_SIGNALS } from "@/lib/scanner/intradayDisplay";
import { approachDue, approachLeadMinutes } from "@/lib/scanner/entryApproach";

/** How far back a notice's notification_log row still counts as "already pushed". */
export const NOTIFICATION_DEDUP_HOURS = 24;

/** Wide enough to hold the whole New York day; a signal's rows are filtered to it. */
const SIGNAL_READ_HOURS = 30;

/**
 * What `app/api/notifications/preferences` (GET) promises a member who has
 * never saved a row: push off (opt-in, 2026-10-22), score floor 5, no quiet
 * hours.
 */
const DEFAULT_PREFS = { push_enabled: false, min_score: 5, quiet_hours_enabled: false };

type Channel = "push";

interface SavedRow {
  user_id: string;
  push_enabled: boolean | null;
  min_score: number | null;
  quiet_hours_enabled: boolean | null;
  /** Minutes ahead a member is told price nears a plan's entry (migration 0125); absent before it. */
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
 * The key a send is deduplicated on: the symbol, the signal and its
 * direction, never the score, which drifts between scans while the move
 * stands. Each signal and notice is keyed on its own type, so none holds
 * another back.
 */
export function signalHashFor(alert: Pick<Alert, "symbol" | "type" | "direction">): string {
  const direction = alert.direction === "up" ? "bullish" : "bearish";
  return `${alert.symbol}-${alert.type}-${direction}`;
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

/**
 * True when this alert's move was already sent or tried on the channel: a
 * notice inside `NOTIFICATION_DEDUP_HOURS`; a signal when the latest send
 * today (New York day) for its symbol and signal went the same way. An
 * unread log counts as sent, so a failed read never repeats every standing
 * signal on each scan.
 */
async function alreadySent(
  service: SupabaseClient,
  userId: string,
  channel: Channel,
  alert: Alert,
  now: Date,
): Promise<boolean> {
  const hash = signalHashFor(alert);
  const notice = NOTICE_SIGNALS.has(alert.type);
  const keys = notice ? [hash] : [hash, signalHashFor({ ...alert, direction: alert.direction === "up" ? "down" : "up" })];
  const hours = notice ? NOTIFICATION_DEDUP_HOURS : SIGNAL_READ_HOURS;
  const since = new Date(now.getTime() - hours * 3600_000).toISOString();
  const { data, error } = await service
    .from("notification_log")
    .select("signal_hash, triggered_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .in("signal_hash", keys)
    .gte("triggered_at", since);
  if (error) {
    console.error("[intraday-notify] log read failed:", error.message);
    return true;
  }
  const rows = (data ?? []) as { signal_hash: string; triggered_at: string }[];
  if (notice) return rows.length > 0;
  const today = etDateKey(now);
  let latest: { signal_hash: string; triggered_at: string } | null = null;
  for (const r of rows) {
    if (etDateKey(new Date(r.triggered_at)) !== today) continue;
    if (!latest || r.triggered_at > latest.triggered_at) latest = r;
  }
  return latest?.signal_hash === hash;
}

/**
 * Pushes each new system-scan alert to the members whose tier and settings
 * let it through. Returns how many pushes succeeded.
 */
export async function notifySubscribedUsers(
  service: SupabaseClient,
  alerts: Alert[],
  args: { intervalBySymbol: Map<string, number>; now?: Date },
): Promise<{ push: number }> {
  const sent = { push: 0 };
  if (alerts.length === 0 || vapidConfig() === null) return sent;
  const now = args.now ?? new Date();

  const { data: saved, error } = await service
    .from("notification_preferences")
    // Every column, so the read works before and after migration 0125 adds
    // `entry_lead_minutes`.
    .select("*");
  if (error) return sent;
  const savedByUser = new Map(((saved ?? []) as SavedRow[]).map((p) => [p.user_id, p]));

  for (const userId of await listAllUserIds(service)) {
    try {
      const row = savedByUser.get(userId);
      if (!(row?.push_enabled ?? DEFAULT_PREFS.push_enabled)) continue;

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

      for (const alert of mine) {
        if (await alreadySent(service, userId, "push", alert, now)) continue;
        const result = await sendPushToProfile(service, userId, intradayPushMessage(alert));
        // No subscribed browser is not a send: nothing to log or retry.
        if (!result.success && result.skipped) continue;
        if (result.success) sent.push += 1;
        const stamp = now.toISOString();
        const { error: logError } = await service.from("notification_log").insert({
          user_id: userId,
          symbol: alert.symbol,
          direction: alert.direction === "up" ? "bullish" : "bearish",
          score: alertScore(alert),
          channel: "push",
          status: result.success ? "sent" : "failed",
          recipient: null,
          triggered_at: stamp,
          sent_at: result.success ? stamp : null,
          failed_at: result.success ? null : stamp,
          error_message: result.success ? null : (result.error ?? null),
          signal_hash: signalHashFor(alert),
        });
        if (logError) console.error("[intraday-notify] could not log notification:", logError.message);
      }
    } catch (err) {
      console.error("[intraday-notify] member skipped:", err);
    }
  }
  return sent;
}
