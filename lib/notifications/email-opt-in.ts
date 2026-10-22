/**
 * Whether a member has switched email on in Settings.
 *
 * Email is opt-in (owner, 2026-10-22: "turn the notifications off for
 * everyone ... It can be a feature that they toggle on or off for
 * themselves"): a member with no `notification_preferences` row, or with
 * `email_enabled` off, gets no email. Migration 0109 made the column default
 * false and `get_enabled_notification_channels` answer a missing row with no
 * channels; the alert, intraday, journal and order-invalidated emails all read
 * the same switch. Account emails (sign-up, password reset) are not
 * notifications and never read it.
 *
 * A failed read sends nothing: a missed email is recoverable, an unwanted one
 * is not.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function emailOptedIn(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`emailOptedIn: preferences not read for ${userId} — ${error.message}`);
    return false;
  }
  return data?.email_enabled === true;
}
