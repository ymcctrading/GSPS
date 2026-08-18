/**
 * Notification dispatch — given a user and an alert, loads that user's
 * preferences, checks the score threshold and quiet hours, and sends through
 * every enabled channel. Every attempt (sent / failed / skipped) writes one
 * `notification_log` row, which is what the history dashboard reads.
 *
 * Providers and the Supabase client are injected rather than imported as
 * singletons so tests can substitute fakes without touching the network or a
 * real database. Production call sites (the dispatcher's default export
 * wiring) pass the real ones.
 */

import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import { isEmailEnabled, sendEmail } from "@/lib/notifications/providers/email";
import { isSmsEnabled, sendSms } from "@/lib/notifications/providers/sms";
import { isPushEnabled, sendPush, type PushSubscriptionJson } from "@/lib/notifications/providers/push";

export type Channel = "email" | "sms" | "push";
export type LogStatus = "sent" | "failed" | "skipped_quiet_hours" | "skipped_preference";

export interface AlertPayload {
  /** Row id from `intraday_alerts`, when this dispatch is tied to one. */
  alertId?: string;
  symbol: string;
  /** 0-9, matching `intraday_alerts.score` / lib/scoring/score.ts. */
  score: number;
  message: string;
}

export interface NotificationPreferencesRow {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  phone_number: string | null;
  push_subscription: PushSubscriptionJson | null;
  min_score: number;
}

export interface DispatchResult {
  channel: Channel;
  status: LogStatus;
  detail?: string;
}

/** Minimal shape of the Supabase client operations dispatch needs. */
export interface DispatchSupabase {
  from(table: string): {
    select: (...args: unknown[]) => {
      eq: (...args: unknown[]) => {
        maybeSingle: () => Promise<{ data: NotificationPreferencesRow | null; error: unknown }>;
      };
    };
    insert: (rows: unknown) => Promise<{ error: unknown }>;
  };
}

export interface DispatchProviders {
  isEmailEnabled: typeof isEmailEnabled;
  sendEmail: typeof sendEmail;
  isSmsEnabled: typeof isSmsEnabled;
  sendSms: typeof sendSms;
  isPushEnabled: typeof isPushEnabled;
  sendPush: typeof sendPush;
}

export const defaultProviders: DispatchProviders = {
  isEmailEnabled,
  sendEmail,
  isSmsEnabled,
  sendSms,
  isPushEnabled,
  sendPush,
};

const EMAIL_SUBJECT_PREFIX = "GSPS alert";

/**
 * Recipient contact info destined for a specific channel — kept separate
 * from `NotificationPreferencesRow` because the caller may want to notify an
 * address that hasn't round-tripped through the preferences row yet (e.g.
 * the test-alert route reuses the signed-in user's stored preferences, but a
 * future caller could override just the email).
 */
export interface DispatchTarget {
  email?: string | null;
}

/**
 * Dispatches one alert to a single user across every channel their
 * preferences enable. Always resolves — a provider failure becomes a
 * 'failed' log row, never a thrown error, so one bad send can't take down a
 * batch of alerts fanning out to many users.
 */
export async function dispatchNotification(
  supabase: DispatchSupabase,
  userId: string,
  alert: AlertPayload,
  target: DispatchTarget = {},
  providers: DispatchProviders = defaultProviders,
): Promise<DispatchResult[]> {
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!prefs) {
    // No row = user never opted into anything. Nothing to send, nothing to
    // log — this is not an attempt, it's the absence of any configuration.
    return [];
  }

  const results: DispatchResult[] = [];
  const now = new Date();

  const belowThreshold = alert.score < prefs.min_score;
  const inQuietHours = isWithinQuietHours(
    {
      enabled: prefs.quiet_hours_enabled,
      start: prefs.quiet_hours_start,
      end: prefs.quiet_hours_end,
      timezone: prefs.timezone,
    },
    now,
  );

  const channels: { channel: Channel; enabled: boolean }[] = [
    { channel: "email", enabled: prefs.email_enabled },
    { channel: "sms", enabled: prefs.sms_enabled },
    { channel: "push", enabled: prefs.push_enabled },
  ];

  for (const { channel, enabled } of channels) {
    if (!enabled) continue; // Not opted into this channel at all — nothing to log.

    let result: DispatchResult;
    if (belowThreshold) {
      result = { channel, status: "skipped_preference", detail: `score ${alert.score} < min ${prefs.min_score}` };
    } else if (inQuietHours) {
      result = { channel, status: "skipped_quiet_hours" };
    } else {
      result = await sendOnChannel(channel, alert, prefs, target, providers);
    }

    results.push(result);
    await logAttempt(supabase, userId, alert, result);
  }

  return results;
}

async function sendOnChannel(
  channel: Channel,
  alert: AlertPayload,
  prefs: NotificationPreferencesRow,
  target: DispatchTarget,
  providers: DispatchProviders,
): Promise<DispatchResult> {
  const message = alert.message;

  if (channel === "email") {
    if (!providers.isEmailEnabled()) {
      return { channel, status: "failed", detail: "Email is not configured" };
    }
    if (!target.email) {
      return { channel, status: "failed", detail: "No email address on file" };
    }
    const res = await providers.sendEmail({
      to: target.email,
      subject: `${EMAIL_SUBJECT_PREFIX}: ${alert.symbol}`,
      body: message,
    });
    return res.ok
      ? { channel, status: "sent" }
      : { channel, status: "failed", detail: res.error };
  }

  if (channel === "sms") {
    if (!providers.isSmsEnabled()) {
      return { channel, status: "failed", detail: "SMS is not configured" };
    }
    if (!prefs.phone_number) {
      return { channel, status: "failed", detail: "No phone number on file" };
    }
    const res = await providers.sendSms({ to: prefs.phone_number, body: message });
    return res.ok
      ? { channel, status: "sent" }
      : { channel, status: "failed", detail: res.error };
  }

  // push
  if (!providers.isPushEnabled()) {
    return { channel, status: "failed", detail: "Push is not configured" };
  }
  if (!prefs.push_subscription) {
    return { channel, status: "failed", detail: "No push subscription on file" };
  }
  const res = await providers.sendPush(prefs.push_subscription, {
    title: `${alert.symbol} — score ${alert.score}`,
    body: message,
  });
  return res.ok ? { channel, status: "sent" } : { channel, status: "failed", detail: res.error };
}

async function logAttempt(
  supabase: DispatchSupabase,
  userId: string,
  alert: AlertPayload,
  result: DispatchResult,
): Promise<void> {
  const { error } = await supabase.from("notification_log").insert({
    user_id: userId,
    alert_id: alert.alertId ?? null,
    symbol: alert.symbol,
    channel: result.channel,
    status: result.status,
    message: alert.message,
    provider_response: result.detail ?? null,
  });
  if (error) {
    console.error("[notifications] failed to write notification_log row:", error);
  }
}
