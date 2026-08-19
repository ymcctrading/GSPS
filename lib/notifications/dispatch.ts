/**
 * Wires a high-confidence intraday alert into the notification system added
 * in migration 0022 (`notification_preferences`, `notification_log`,
 * `is_in_quiet_hours`, `get_enabled_notification_channels`). That PR shipped
 * the schema and the email sender (`lib/notifications/resend-handler.ts`) but
 * deliberately left the alert path unwired — this is that wiring.
 *
 * Only email is actually sendable today (Resend). SMS/push toggles exist on
 * `notification_preferences` for the settings UI, but there's no SMS/push
 * provider yet, so `get_enabled_notification_channels` may report them
 * enabled without this function being able to act on it — that's a known gap,
 * not a bug here.
 */

import { sendAlertEmail } from "@/lib/notifications/resend-handler";

/** The minimal Supabase surface this needs — loose to keep both the server
 * and route-typed clients assignable without fighting generic inference. */
export interface DispatchSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null }>;
      };
    };
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface DispatchAlert {
  symbol: string;
  direction: "bullish" | "bearish";
  /** 0–9, same scale as `notification_preferences.min_score`. */
  score: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** 0–100 raw confidence, as intraday alerts carry it. */
  confidence: number;
}

/** Best-effort: every failure is caught and logged by the caller, never thrown. */
export async function dispatchNotification(
  supabase: DispatchSupabase,
  userId: string,
  userEmail: string | null,
  alert: DispatchAlert,
): Promise<void> {
  const { data: prefsRow } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = prefsRow as {
    email_enabled?: boolean;
    min_score?: number;
    quiet_hours_enabled?: boolean;
  } | null;

  // No row yet = the GET route's own defaults (email on, min_score 5).
  const emailEnabled = prefs ? prefs.email_enabled !== false : true;
  const minScore = prefs?.min_score ?? 5;
  if (!emailEnabled || alert.score < minScore || !userEmail) return;

  if (prefs?.quiet_hours_enabled) {
    const { data: quiet } = await supabase.rpc("is_in_quiet_hours", { user_id: userId });
    if (quiet === true) return;
  }

  const result = await sendAlertEmail({
    userEmail,
    symbol: alert.symbol,
    direction: alert.direction,
    score: alert.score,
    entry: alert.entry,
    stopLoss: alert.stopLoss,
    takeProfit: alert.takeProfit,
    verdict: "Execute",
    confidence: alert.confidence / 100,
  });

  const now = new Date().toISOString();
  await supabase.from("notification_log").insert({
    user_id: userId,
    symbol: alert.symbol,
    direction: alert.direction,
    score: alert.score,
    channel: "email",
    status: result.success ? "sent" : "failed",
    recipient: userEmail,
    triggered_at: now,
    sent_at: result.success ? now : null,
    failed_at: result.success ? null : now,
    error_message: result.success ? null : (result.error ?? "unknown error"),
    signal_hash: `${alert.symbol}-${alert.direction}-${alert.score}`,
  });
}
