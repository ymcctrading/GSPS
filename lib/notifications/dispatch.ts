/**
 * Turns a batch of alerts into delivered notifications for one user.
 *
 * Every alert source (daily scan, intraday scan) funnels through
 * `dispatchToUser` so the score floor, quiet hours, and channel gating are
 * enforced in exactly one place. A send failure — or a channel simply not
 * being configured — is logged, never thrown: notification delivery is
 * best-effort and must not take down the scan that produced the alerts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isQuietHours } from "./quiet-hours";
import { isEmailConfigured, sendEmail } from "./email";
import { isSmsConfigured, sendSms } from "./sms";
import type { AlertItem, NotificationChannel, NotificationPreferences, NotificationSource, NotificationStatus } from "./types";

interface LogRow {
  user_id: string;
  channel: NotificationChannel;
  source: NotificationSource;
  source_id: string;
  symbols: string[];
  subject: string;
  status: NotificationStatus;
  error: string | null;
}

export async function dispatchToUser(
  supabase: SupabaseClient,
  prefs: NotificationPreferences,
  source: NotificationSource,
  alerts: AlertItem[],
  now: Date = new Date(),
): Promise<void> {
  const qualifying = alerts.filter((a) => a.score >= prefs.minScore);
  if (qualifying.length === 0) return;

  const sourceId = qualifying.map((a) => a.sourceId).join(",");
  const symbols = qualifying.map((a) => a.symbol);
  const subject = subjectFor(source, qualifying);
  const logs: LogRow[] = [];

  if (isQuietHours(now, prefs.timezone, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    if (prefs.emailEnabled && prefs.email) {
      logs.push(logRow(prefs.userId, "email", source, sourceId, symbols, subject, "skipped_quiet_hours"));
    }
    if (prefs.smsEnabled && prefs.phoneNumber) {
      logs.push(logRow(prefs.userId, "sms", source, sourceId, symbols, subject, "skipped_quiet_hours"));
    }
    await writeLog(supabase, logs);
    return;
  }

  if (prefs.emailEnabled && prefs.email) {
    if (!isEmailConfigured()) {
      logs.push(logRow(prefs.userId, "email", source, sourceId, symbols, subject, "skipped_disabled"));
    } else {
      const result = await sendEmail(prefs.email, subject, bodyFor(qualifying));
      logs.push(
        logRow(prefs.userId, "email", source, sourceId, symbols, subject, result.ok ? "sent" : "failed", result.error),
      );
    }
  }

  if (prefs.smsEnabled && prefs.phoneNumber) {
    if (!isSmsConfigured()) {
      logs.push(logRow(prefs.userId, "sms", source, sourceId, symbols, subject, "skipped_disabled"));
    } else {
      const result = await sendSms(prefs.phoneNumber, smsBodyFor(qualifying));
      logs.push(
        logRow(prefs.userId, "sms", source, sourceId, symbols, subject, result.ok ? "sent" : "failed", result.error),
      );
    }
  }

  await writeLog(supabase, logs);
}

function logRow(
  userId: string,
  channel: NotificationChannel,
  source: NotificationSource,
  sourceId: string,
  symbols: string[],
  subject: string,
  status: NotificationStatus,
  error?: string,
): LogRow {
  return { user_id: userId, channel, source, source_id: sourceId, symbols, subject, status, error: error ?? null };
}

async function writeLog(supabase: SupabaseClient, logs: LogRow[]): Promise<void> {
  if (logs.length === 0) return;
  const { error } = await supabase.from("notification_log").insert(logs);
  if (error) console.error("[notifications] could not write notification_log:", error);
}

function subjectFor(source: NotificationSource, alerts: AlertItem[]): string {
  const label = source === "daily_scan" ? "Daily scan" : "Intraday alert";
  if (alerts.length === 1) return `GSPS ${label}: ${alerts[0].symbol}`;
  return `GSPS ${label}: ${alerts.length} symbols (${alerts.slice(0, 3).map((a) => a.symbol).join(", ")}${alerts.length > 3 ? ", …" : ""})`;
}

function bodyFor(alerts: AlertItem[]): string {
  return alerts
    .map((a) => `${a.symbol} — ${a.headline} (score ${a.score}/9)\n${a.body}`)
    .join("\n\n");
}

function smsBodyFor(alerts: AlertItem[]): string {
  return alerts.map((a) => `${a.symbol}: ${a.headline} (${a.score}/9)`).join(" | ");
}
