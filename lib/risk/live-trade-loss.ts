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
 *   50%: pause automation on this symbol, close/flatten the position
 *        (which also cancels its resting orders — see closePosition),
 *        restrict live trading, keep paper access untouched
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
import { closePosition } from "@/lib/brokers/alpaca";
import { sendLiveLossThresholdEmail } from "@/lib/notifications/live-risk-email";

const NOTIFY_THRESHOLDS = [6, 9, 15, 30] as const;
const FORCE_CLOSE_THRESHOLD = 50;

export interface LivePositionRow {
  id: string;
  symbol: string;
}

export interface LiveTradeLossOutcome {
  positionId: string;
  lossPct: number;
  newlyNotifiedThresholds: number[];
  forcedClose: boolean;
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
  const pausedAt: string | null = stateRow?.paused_at ?? null;

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

  let forcedClose = false;
  if (lossPct >= FORCE_CLOSE_THRESHOLD && pausedAt == null) {
    forcedClose = true;
    await forceCloseAndRestrict(supabase, creds, userId, position);
  }

  return { positionId: position.id, lossPct, newlyNotifiedThresholds: newlyCrossed, forcedClose };
}

async function forceCloseAndRestrict(
  supabase: SupabaseClient,
  creds: AlpacaCreds,
  userId: string,
  position: LivePositionRow,
): Promise<void> {
  // 1. Pause any active live automation profile pointed at a plan for this symbol.
  const { data: profiles } = await supabase
    .from("automation_profiles")
    .select("profile_id, plan_id")
    .eq("user_id", userId)
    .eq("execution_mode", "live")
    .eq("status", "active");
  const { data: plansForSymbol } = await supabase
    .from("trade_plans")
    .select("plan_id")
    .eq("user_id", userId)
    .eq("instrument", position.symbol);
  const symbolPlanIds = new Set((plansForSymbol ?? []).map((p) => p.plan_id as string));

  for (const row of (profiles ?? []) as { profile_id: string; plan_id: string }[]) {
    if (!symbolPlanIds.has(row.plan_id)) continue;
    await supabase
      .from("automation_profiles")
      .update({ status: "paused", paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("profile_id", row.profile_id);
    await supabase.from("automation_events").insert({
      profile_id: row.profile_id,
      user_id: userId,
      kind: "paused",
      detail: { reason: "live_trade_loss_50pct" },
    });
  }

  // 2. Cancel pending orders + flatten. closePosition cancels resting
  // orders on the symbol as part of liquidation (lib/brokers/alpaca.ts).
  let flattenResult: unknown = null;
  let flattenError: string | null = null;
  try {
    flattenResult = await closePosition(creds, position.symbol);
  } catch (err) {
    flattenError = err instanceof Error ? err.message : String(err);
  }

  await supabase
    .from("risk_trade_loss_state")
    .update({
      paused_at: new Date().toISOString(),
      flatten_attempted_at: new Date().toISOString(),
      flatten_order_result: flattenError ? { error: flattenError } : flattenResult,
      updated_at: new Date().toISOString(),
    })
    .eq("position_id", position.id);

  // 3. Restrict live trading account-wide until GSPS School re-completion
  // is verified. Paper access is untouched — no code path here reaches it.
  await supabase.from("live_trading_restrictions").upsert({
    user_id: userId,
    restricted: true,
    reason: `Live position ${position.symbol} reached a 50% allocated-funds loss.`,
    restricted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
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
