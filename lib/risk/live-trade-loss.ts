/**
 * Live-only per-trade loss cascade, per the "GSPS Implementation Brief"
 * single-source-of-truth spec pack (2026-08-31)'s live-only risk policy.
 * Applies exclusively when `execution_mode = live`; never to paper trading
 * — paper positions never reach this module (see `evaluateLiveTradeLoss`'s
 * caller, `lib/trade/live-sync.ts`, which only runs for a connected live
 * account).
 *
 *   6%, 9%, 15%: email (+ SMS, once a channel exists) once per threshold per trade
 *   30%: hard warning, once per trade, regardless of membership level
 *
 * The spec pack's 50% force-close (pause automation, flatten, restrict live
 * trading) was removed 2026-10-16 (owner, Q11, "Switch all nine"): it has no
 * Gann source, and Gann's backstop is the stop every position carries
 * (A-STOP-01, enforced in `lib/trade/place-order.ts`). A restriction already
 * recorded is still honoured by `isLiveTradingRestricted`.
 *
 * "Loss thresholds are based on total funds allocated to the individual
 * trade." This reads Alpaca's own `unrealized_plpc` (already
 * (market_value - cost_basis) / cost_basis) rather than re-deriving cost
 * basis locally — negated, that's exactly the spec's
 * `(allocatedTradeFunds - currentTradeLiquidationValue) / allocatedTradeFunds`
 * formula, and it already accounts for realized partial exits changing the
 * position's remaining cost basis, which the broker tracks authoritatively.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlpacaCreds, AlpacaPosition } from "@/lib/brokers/alpaca";
import { sendLiveLossThresholdEmail } from "@/lib/notifications/live-risk-email";

const NOTIFY_THRESHOLDS = [6, 9, 15, 30] as const;

export interface LivePositionRow {
  id: string;
  symbol: string;
}

export interface LiveTradeLossOutcome {
  positionId: string;
  lossPct: number;
  newlyNotifiedThresholds: number[];
}

/** Pure: which of the fixed thresholds are newly crossed and not yet notified. */
export function thresholdsNewlyCrossed(lossPct: number, alreadyNotified: readonly number[]): number[] {
  return NOTIFY_THRESHOLDS.filter((t) => lossPct >= t && !alreadyNotified.includes(t));
}

export async function evaluateLiveTradeLoss(
  supabase: SupabaseClient,
  creds: AlpacaCreds,
  userId: string,
  position: LivePositionRow,
  live: AlpacaPosition,
): Promise<LiveTradeLossOutcome | null> {
  const plpc = Number(live.unrealized_plpc);
  if (!Number.isFinite(plpc) || plpc >= 0) return null; // no loss, nothing to do
  const lossPct = -plpc * 100;

  const { data: stateRow } = await supabase
    .from("risk_trade_loss_state")
    .select("*")
    .eq("position_id", position.id)
    .maybeSingle();

  const alreadyNotified: number[] = (stateRow?.notified_thresholds as number[] | null) ?? [];

  if (!stateRow) {
    await supabase.from("risk_trade_loss_state").insert({
      position_id: position.id,
      user_id: userId,
      notified_thresholds: [],
    });
  }

  const newlyCrossed = thresholdsNewlyCrossed(lossPct, alreadyNotified);
  if (newlyCrossed.length > 0) {
    const email = await resolveUserEmail(supabase, userId);
    if (email) {
      for (const threshold of newlyCrossed) {
        await sendLiveLossThresholdEmail({
          userEmail: email,
          symbol: position.symbol,
          thresholdPct: threshold,
          lossPct,
          hardWarning: threshold === 30,
        }).catch((err) => console.error(`evaluateLiveTradeLoss: email failed for ${position.symbol} — ${String(err)}`));
      }
    }
    await supabase
      .from("risk_trade_loss_state")
      .update({ notified_thresholds: [...alreadyNotified, ...newlyCrossed], updated_at: new Date().toISOString() })
      .eq("position_id", position.id);
  }

  return { positionId: position.id, lossPct, newlyNotifiedThresholds: newlyCrossed };
}

async function resolveUserEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/** Read-only check other server code (place-order.ts) can gate live entries on. */
export async function isLiveTradingRestricted(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("live_trading_restrictions")
    .select("restricted, school_completed_at, restricted_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.restricted) return false;
  // Lifted only once a school completion timestamp is newer than the restriction.
  if (data.school_completed_at && data.restricted_at && data.school_completed_at > data.restricted_at) {
    return false;
  }
  return true;
}
