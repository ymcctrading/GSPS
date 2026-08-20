import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPreferences } from "./types";

interface PreferencesRow {
  user_id: string;
  email: string | null;
  phone_number: string | null;
  email_enabled: boolean;
  sms_enabled: boolean;
  daily_scan_enabled: boolean;
  intraday_alert_enabled: boolean;
  min_score: number;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string;
}

function fromRow(row: PreferencesRow): NotificationPreferences {
  return {
    userId: row.user_id,
    email: row.email,
    phoneNumber: row.phone_number,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    dailyScanEnabled: row.daily_scan_enabled,
    intradayAlertEnabled: row.intraday_alert_enabled,
    minScore: row.min_score,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    timezone: row.timezone,
  };
}

/** One user's preferences, or null if they've never saved any (defaults apply client-side). */
export async function loadPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as PreferencesRow);
}

/**
 * Every user opted into a given alert source, for the daily-scan dispatch
 * fan-out. Service-role only — this crosses user boundaries by design.
 */
export async function loadPreferencesForSource(
  supabase: SupabaseClient,
  source: "daily_scan" | "intraday_alert",
): Promise<NotificationPreferences[]> {
  const column = source === "daily_scan" ? "daily_scan_enabled" : "intraday_alert_enabled";
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq(column, true);
  if (error || !data) return [];
  return (data as PreferencesRow[]).map(fromRow);
}

export interface PreferencesUpdate {
  email?: string | null;
  phoneNumber?: string | null;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  dailyScanEnabled?: boolean;
  intradayAlertEnabled?: boolean;
  minScore?: number;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  timezone?: string;
}

export async function savePreferences(
  supabase: SupabaseClient,
  userId: string,
  update: PreferencesUpdate,
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (update.email !== undefined) row.email = update.email;
  if (update.phoneNumber !== undefined) row.phone_number = update.phoneNumber;
  if (update.emailEnabled !== undefined) row.email_enabled = update.emailEnabled;
  if (update.smsEnabled !== undefined) row.sms_enabled = update.smsEnabled;
  if (update.dailyScanEnabled !== undefined) row.daily_scan_enabled = update.dailyScanEnabled;
  if (update.intradayAlertEnabled !== undefined) row.intraday_alert_enabled = update.intradayAlertEnabled;
  if (update.minScore !== undefined) row.min_score = update.minScore;
  if (update.quietHoursStart !== undefined) row.quiet_hours_start = update.quietHoursStart;
  if (update.quietHoursEnd !== undefined) row.quiet_hours_end = update.quietHoursEnd;
  if (update.timezone !== undefined) row.timezone = update.timezone;

  const { error } = await supabase.from("notification_preferences").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
