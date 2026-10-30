/**
 * GSPS — notices that must reach a member whatever the email does
 * (2026-10-29, email capacity; owner 2026-10-28, item 6: email for what is
 * most pertinent, "everything else should be a mobile/in platform
 * notification").
 *
 * Email is budgeted (`email-budget.ts`) and the free plan takes 100 a day.
 * Until this, three notices reached a member by email or not at all: an order
 * cancelled because its plan broke, a live position crossing a loss threshold,
 * and the evening digest once the budget was spent. A skipped or failed email
 * then dropped them with nothing to show for it. Now each is written to the
 * bell and pushed (when the member turned push on) as well, so the email is
 * one channel of several and never the only one.
 *
 * - "Your trade": the bell and push always, beside the email; push ignores
 *   quiet hours here, as the email always has, since the member's own money is
 *   moving.
 * - "Summary": the evening digest, written only when its email did not go
 *   (over budget or refused), and pushed outside quiet hours.
 *
 * Best effort: a failed bell write or push is logged and never stops the caller
 * (an order cancel or a loss-threshold record must not fail on a notice).
 *
 * Mandate: no market content (a delivery channel), Dewey N/A. Cause and
 * Effect: a notice is owed because something happened to the member's own
 * trade; the channel that carries it is secondary and must not decide whether
 * it arrives. Law of Creation: email ⊗ bell is a mixture, two copies of one
 * notice; what is created is the guarantee neither gives alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "@/lib/notifications/web-push";

export type KeyNoticeVerdict = "Your trade" | "Summary";

export interface KeyNotice {
  verdict: KeyNoticeVerdict;
  /** The symbol the notice is about; empty for the summary. */
  symbol: string;
  title: string;
  body: string;
  /** Where the push opens. A path on this site. */
  url: string;
  /** Replaces an earlier push with the same tag on the device. */
  tag: string;
}

export interface KeyNoticeResult {
  bell: boolean;
  pushed: boolean;
}

/** Writes the notice to the member's bell and pushes it when they have push on. */
export async function deliverKeyNotice(
  profileId: string,
  notice: KeyNotice,
  client?: SupabaseClient,
): Promise<KeyNoticeResult> {
  let service: SupabaseClient;
  try {
    service = client ?? createServiceClient();
  } catch (err) {
    console.error(`[key-notice] no service client for ${profileId}:`, err);
    return { bell: false, pushed: false };
  }
  let bell = false;
  try {
    const { error } = await service.from("in_app_notifications").insert({
      profile_id: profileId,
      symbol: notice.symbol,
      verdict: notice.verdict,
      title: notice.title,
      body: notice.body,
    });
    if (error) console.error(`[key-notice] bell not written for ${profileId}: ${error.message}`);
    else bell = true;
  } catch (err) {
    console.error(`[key-notice] bell not written for ${profileId}:`, err);
  }

  let pushed = false;
  try {
    if (await pushWanted(service, profileId, notice.verdict === "Summary")) {
      const result = await sendPushToProfile(service, profileId, {
        title: notice.title,
        body: notice.body,
        url: notice.url,
        tag: notice.tag,
      });
      pushed = result.success;
      if (!result.success && !result.skipped) console.error(`[key-notice] push not sent for ${profileId}: ${result.error}`);
    }
  } catch (err) {
    console.error(`[key-notice] push not sent for ${profileId}:`, err);
  }
  return { bell, pushed };
}

/** Push on, and outside quiet hours when asked. An unread preference sends no push; the bell still holds the notice. */
async function pushWanted(service: SupabaseClient, profileId: string, respectQuietHours: boolean): Promise<boolean> {
  const { data, error } = await service
    .from("notification_preferences")
    .select("push_enabled")
    .eq("user_id", profileId)
    .maybeSingle();
  if (error || (data as { push_enabled?: boolean } | null)?.push_enabled !== true) return false;
  if (!respectQuietHours) return true;
  const { data: quiet } = await service.rpc("is_in_quiet_hours", { user_id: profileId });
  return quiet !== true;
}

/** Where a member reads their own orders, positions and journal. */
export const PORTFOLIO_PATH = "/portfolio";
