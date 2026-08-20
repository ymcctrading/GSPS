/**
 * Entry points the scan routes call after persisting their results. Each one
 * turns a scan's raw output into AlertItem[], loads the users who should hear
 * about it, and hands off to dispatchToUser — see dispatch.ts for the
 * score/quiet-hours/channel gating that happens there.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPreferences, loadPreferencesForSource } from "./preferences";
import { dispatchToUser } from "./dispatch";
import type { AlertItem } from "./types";
import type { DailyScanRow } from "@/lib/scan/publish";
import { SIGNAL_LABELS, type Alert } from "@/lib/scanner/intraday";

export { isEmailConfigured } from "./email";
export { isSmsConfigured } from "./sms";
export { loadPreferences, savePreferences } from "./preferences";
export type { PreferencesUpdate } from "./preferences";
export type { NotificationPreferences } from "./types";

function dailyScanRowToAlert(row: DailyScanRow, direction: "bullish" | "bearish"): AlertItem {
  return {
    symbol: row.symbol,
    score: row.score,
    headline: `${direction === "bullish" ? "Bullish" : "Bearish"} — ${row.output_state}`,
    body: `Entry ${row.entry.toFixed(2)} · Stop ${row.stop_loss.toFixed(2)} · Target ${row.take_profit_1.toFixed(2)}`,
    sourceId: `${row.scan_date}:${direction}:${row.symbol}`,
  };
}

/**
 * Fan out the daily market scan to every user who has it enabled. Called
 * only from the cron path (see app/api/market-scan/route.ts) — a manual
 * refresh must not re-notify everyone every time someone clicks "Refresh".
 */
export async function dispatchDailyScanNotifications(
  supabase: SupabaseClient,
  bullish: DailyScanRow[],
  bearish: DailyScanRow[],
): Promise<void> {
  const alerts = [
    ...bullish.map((r) => dailyScanRowToAlert(r, "bullish")),
    ...bearish.map((r) => dailyScanRowToAlert(r, "bearish")),
  ];
  if (alerts.length === 0) return;

  const recipients = await loadPreferencesForSource(supabase, "daily_scan");
  await Promise.all(recipients.map((prefs) => dispatchToUser(supabase, prefs, "daily_scan", alerts)));
}

/**
 * Notify the requesting user about their own intraday scan's new alerts.
 * Intraday scanning is per-user and on-demand (see app/api/intraday-scan) —
 * there is no cross-user fan-out here.
 */
export async function dispatchIntradayAlertNotifications(
  supabase: SupabaseClient,
  userId: string,
  alerts: Alert[],
): Promise<void> {
  if (alerts.length === 0) return;

  const prefs = await loadPreferences(supabase, userId);
  if (!prefs) return;

  const items: AlertItem[] = alerts.map((a) => ({
    symbol: a.symbol,
    score: Math.max(0, Math.min(9, Math.round((a.confidence / 100) * 9))),
    headline: SIGNAL_LABELS[a.type],
    body: a.whyThisAppeared,
    sourceId: `${a.triggerTime}:${a.type}:${a.symbol}`,
  }));

  await dispatchToUser(supabase, prefs, "intraday_alert", items);
}
