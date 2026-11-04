/**
 * GSPS — sends the weekly digest (`./weeklyDigest.ts`) to every member, from
 * the evening journal's cron on a Friday (`/api/trade-journal/daily-email`).
 *
 * Each member's digest goes to the bell and push ("Summary", `keyNotice.ts`),
 * and by email only when they turned email on and the day's "digest" budget
 * allows. It runs after the day's journal emails, so on a Friday the daily
 * digest keeps its place in the budget.
 *
 * Idempotent within the week: a member whose bell already holds this week's
 * digest is skipped, so a rerun of the cron sends nothing twice.
 *
 * The groups are read once for everyone, from the same monthly reading the
 * Scanner's Groups tab reads (`getUniverseStrength`); a failed read leaves the
 * groups line out and still sends the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { getUniverseStrength } from "@/lib/data/universeStrength";
import { readGroupView } from "@/lib/scanner/groupView";
import { emailOptedIn } from "@/lib/notifications/email-opt-in";
import { deliverKeyNotice, PORTFOLIO_PATH } from "@/lib/notifications/keyNotice";
import { sendWeeklyDigestEmail } from "@/lib/notifications/resend-handler";
import {
  buildWeeklyDigest,
  isFirstWeekOfMonth,
  weekStartKey,
  weeklyGroups,
  type DigestMonitor,
  type DigestTrade,
  type WeeklyGroups,
} from "@/lib/notifications/weeklyDigest";

export interface WeeklyDigestRunResult {
  weekOf: string;
  delivered: number;
  alreadySent: number;
  emailed: number;
  emailSkipped: number;
  failed: number;
}

/** The groups line's reading, once for every member. Null when unread. */
async function readWeeklyGroups(now: Date): Promise<WeeklyGroups | null> {
  try {
    const universe = await getUniverseStrength(now);
    const today = etDateKey(now);
    const current = readGroupView(universe, new Date(`${today}T12:00:00Z`));
    // Noon on the last day of the previous month.
    const lastMonth = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    lastMonth.setUTCDate(0);
    const previous = readGroupView(universe, lastMonth);
    return weeklyGroups(current, previous, isFirstWeekOfMonth(now));
  } catch (err) {
    console.warn(`[weekly-digest] groups not read — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function sendWeeklyDigests(
  supabase: SupabaseClient,
  users: readonly { id: string; email: string }[],
  now: Date,
): Promise<WeeklyDigestRunResult> {
  const weekOf = weekStartKey(now);
  const result: WeeklyDigestRunResult = { weekOf, delivered: 0, alreadySent: 0, emailed: 0, emailSkipped: 0, failed: 0 };
  const groups = await readWeeklyGroups(now);
  // Eight days back covers Monday 00:00 ET from any Friday; rows are then
  // kept by their New York date.
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();

  for (const user of users) {
    try {
      const [tradesRead, monitorsRead] = await Promise.all([
        supabase
          .from("trade_logs")
          .select("exit_timestamp, outcome, profit_loss_dollars")
          .eq("user_id", user.id)
          .gte("exit_timestamp", since)
          .limit(5000),
        supabase
          .from("active_monitors")
          .select("symbol, state, created_at, updated_at")
          .eq("profile_id", user.id)
          .or(`created_at.gte.${since},updated_at.gte.${since}`)
          .order("updated_at", { ascending: false })
          .limit(500),
      ]);
      if (tradesRead.error || monitorsRead.error) {
        result.failed++;
        console.error(`[weekly-digest] ${user.id} not read — ${(tradesRead.error ?? monitorsRead.error)?.message}`);
        continue;
      }
      const monitors = ((monitorsRead.data ?? []) as (DigestMonitor & { created_at: string; updated_at: string })[]).filter(
        (m) => etDateKey(new Date(m.updated_at)) >= weekOf || etDateKey(new Date(m.created_at)) >= weekOf,
      );
      const digest = buildWeeklyDigest({ now, trades: (tradesRead.data ?? []) as DigestTrade[], monitors, groups });

      const { data: existing } = await supabase
        .from("in_app_notifications")
        .select("id")
        .eq("profile_id", user.id)
        .eq("verdict", "Summary")
        .eq("title", digest.title)
        .gte("created_at", since)
        .limit(1);
      if ((existing ?? []).length > 0) {
        result.alreadySent++;
        continue;
      }

      const notice = await deliverKeyNotice(
        user.id,
        {
          verdict: "Summary",
          symbol: "",
          title: digest.title,
          body: digest.lines.join(" "),
          pushBody: digest.pushBody,
          url: PORTFOLIO_PATH,
          tag: `weekly-${weekOf}`,
        },
        supabase,
      );
      if (notice.bell || notice.pushed) result.delivered++;
      else result.failed++;

      if (await emailOptedIn(supabase, user.id)) {
        const sent = await sendWeeklyDigestEmail({ userEmail: user.email, title: digest.title, lines: digest.lines });
        if (sent.success) result.emailed++;
        else result.emailSkipped++;
      }
    } catch (err) {
      result.failed++;
      console.error(`[weekly-digest] ${user.id} failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
