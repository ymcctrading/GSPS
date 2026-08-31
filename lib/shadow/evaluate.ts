/**
 * Shadow-mode signal evaluation — walks a recorded shadow signal forward
 * against real subsequent bars to determine whether it would have hit its
 * target or stop, the same win/loss/timeout vocabulary
 * `lib/backtest/replay.ts` uses for a backtested trade. Deliberately
 * independent of `replay.ts`'s internals rather than sharing its bar-walk
 * loop: that loop is intraday-execution-timeframe shaped (STRAT pattern
 * triggers, ambiguous same-bar resolution tied to `costPerShare`), while a
 * shadow signal is evaluated on daily bars over a multi-day swing hold —
 * different enough inputs that sharing the loop would mean threading
 * intraday-only concepts through a daily-bar caller for no real reuse.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";

/**
 * Trading days a shadow signal is held before being marked out at the last
 * close rather than left pending forever. Matches the swing-hold horizon
 * this codebase already uses elsewhere for a multi-day setup (see
 * `HOLD_PERIOD_DAYS` in `lib/scanTicker.ts` for the shorter event-risk
 * window; this is the outcome-resolution window, not an event gate, so it
 * is longer — engineering-chosen, not spec-derived).
 */
export const SHADOW_MAX_HOLD_DAYS = 10;

export interface ShadowOutcome {
  outcome: "win" | "loss" | "timeout" | "pending";
  rMultiple: number | null;
  barsHeld: number | null;
}

/**
 * Walks `barsAfterSignal` (daily bars strictly after the signal's own bar,
 * oldest first) looking for a stop or target touch. `pending` means fewer
 * than `SHADOW_MAX_HOLD_DAYS` bars have elapsed and neither has fired yet —
 * the caller should try again once more bars exist, not treat it as a
 * result. Same same-bar-ambiguity convention as `replay.ts`: both stop and
 * target touched on one bar counts as the loss.
 */
export function walkShadowOutcome(
  barsAfterSignal: Bar[],
  direction: "bullish" | "bearish",
  entry: number,
  stopLoss: number,
  target: number,
  maxHoldDays: number = SHADOW_MAX_HOLD_DAYS,
): ShadowOutcome {
  const long = direction === "bullish";
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) return { outcome: "timeout", rMultiple: 0, barsHeld: 0 };

  const horizon = barsAfterSignal.slice(0, maxHoldDays);
  for (let i = 0; i < horizon.length; i++) {
    const b = horizon[i];
    const hitStop = long ? b.l <= stopLoss : b.h >= stopLoss;
    const hitTarget = long ? b.h >= target : b.l <= target;
    if (!hitStop && !hitTarget) continue;
    const outcome = hitStop ? "loss" : "win";
    const gross = outcome === "win" ? Math.abs(target - entry) : -risk;
    return { outcome, rMultiple: gross / risk, barsHeld: i + 1 };
  }

  if (horizon.length < maxHoldDays) {
    // Not enough bars have happened yet to call this pending-timeout — the
    // signal is still genuinely open.
    return { outcome: "pending", rMultiple: null, barsHeld: null };
  }

  // Held the full window without touching either — marked out at the last
  // available close, same convention as `replay.ts`'s timeout branch.
  const lastClose = horizon[horizon.length - 1].c;
  const dir = long ? 1 : -1;
  return {
    outcome: "timeout",
    rMultiple: (dir * (lastClose - entry)) / risk,
    barsHeld: horizon.length,
  };
}

interface PendingShadowRow {
  id: string;
  symbol: string;
  direction: "bullish" | "bearish";
  entry: number;
  stop_loss: number;
  target: number;
  scanned_at: string;
}

/**
 * Evaluates every pending shadow signal old enough that its outcome might
 * now be determinable (at least one full trading day since it was
 * recorded), fetching each symbol's daily bars since the signal and
 * writing the outcome back. Best-effort per symbol: a provider failure for
 * one symbol is logged and skipped rather than aborting the whole pass —
 * the same posture as `mapWithConcurrency`'s callers elsewhere in the scan
 * pipeline.
 */
export async function evaluatePendingShadowSignals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ evaluated: number; stillPending: number; failed: number }> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("shadow_signals")
    .select("id, symbol, direction, entry, stop_loss, target, scanned_at")
    .is("outcome", null)
    .lte("scanned_at", cutoff);

  if (error) {
    console.error(`shadow: pending-signal read failed — ${error.message}`);
    return { evaluated: 0, stillPending: 0, failed: 0 };
  }

  const rows = (data ?? []) as PendingShadowRow[];
  const provider = getMarketDataProvider();
  let evaluated = 0;
  let stillPending = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const assetClass = isCryptoSymbol(row.symbol) ? "crypto" : "us_equity";
      const signalDate = new Date(row.scanned_at);
      const bars = await provider.fetchBars(row.symbol, "1Day", signalDate, now, assetClass);
      // Only bars strictly after the signal's own session.
      const after = bars.filter((b) => new Date(b.t).getTime() > signalDate.getTime());

      const result = walkShadowOutcome(after, row.direction, row.entry, row.stop_loss, row.target);
      if (result.outcome === "pending") {
        stillPending++;
        continue;
      }

      const { error: writeError } = await supabase
        .from("shadow_signals")
        .update({
          outcome: result.outcome,
          r_multiple: result.rMultiple,
          bars_held: result.barsHeld,
          evaluated_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (writeError) {
        console.error(`shadow: outcome write failed for ${row.symbol} — ${writeError.message}`);
        failed++;
        continue;
      }
      evaluated++;
    } catch (err) {
      console.error(`shadow: evaluation failed for ${row.symbol} — ${String(err)}`);
      failed++;
    }
  }

  return { evaluated, stillPending, failed };
}
