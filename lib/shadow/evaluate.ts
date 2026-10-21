/**
 * Shadow-mode signal evaluation: walks a recorded Execute signal forward
 * against the bars that came after it, the way production would have traded
 * it (review finding R-032, 2026-10-21).
 *
 * It used to fill at the plan's entry the moment the signal was recorded and
 * hold a fixed stop and the master target for ten days. Production does
 * neither, so the forward test measured a rule no account trades. Now:
 *
 * - **Entry: the reaction, as production enters** (PLAN.md item 4,
 *   never-failing rule 9). After the scan, a closed execution bar of the
 *   signal's own session that trades into the buy zone (`tradedIntoBuyZone`)
 *   makes the entry a market order at the next bar's open. A bar that closes
 *   through the stop first calls the plan off (`retired`). A plan that sees
 *   neither by the end of its session never filled (`expired`, Q17: a plan
 *   lasts its session). The same reading the replay's `entryRule: "reaction"`
 *   makes.
 * - **Exit: Gann's, with no fixed target** (`LIVE_EXIT_RULE` "gann", Q14). The
 *   trade is walked by the replay's own `walkGannExit` over the rest of the
 *   session's execution bars and then the completed daily sessions, with the
 *   crossed level read exactly as the live exit manager reads it
 *   (`entryCrossedLevel`). Nothing sells at a target.
 * - **R is measured on the plan's risk** (entry to stop), as the replay
 *   measures it; a fill away from the entry moves the P&L, not the unit.
 *
 * A trade still open after `SHADOW_MAX_HOLD_DAYS` sessions is marked out at the
 * last close (`timeout`), the replay's 10-session limit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { walkGannExit } from "@/lib/backtest/replay";
import { tradedIntoBuyZone } from "@/lib/gann/entryTrigger";
import { completedDailyBars, entryCrossedLevel } from "@/lib/trade/gann-exit-live";
import { etDateKey } from "@/lib/market/session";

/**
 * Sessions a filled shadow trade is held before being marked out at the last
 * close: the replay's limit (`maxBarsHeld`, 10 sessions), so the two measure
 * the same horizon. Engineering-chosen, not spec-derived.
 */
export const SHADOW_MAX_HOLD_DAYS = 10;

/** The execution bars the entry is read on, as production arms its plans. */
const SHADOW_EXECUTION_TIMEFRAME = "15Min" as const;

export interface ShadowOutcome {
  /**
   * `win`/`loss`/`timeout` are filled trades. `expired` never reacted into the
   * zone in its session and `retired` closed through its stop first: neither
   * is a trade, and neither counts in the summary. `pending` is not a result.
   */
  outcome: "win" | "loss" | "timeout" | "expired" | "retired" | "pending";
  rMultiple: number | null;
  /** Sessions held, the fill's session included. */
  barsHeld: number | null;
  fillPrice: number | null;
}

const PENDING: ShadowOutcome = { outcome: "pending", rMultiple: null, barsHeld: null, fillPrice: null };

export interface ShadowWalkInput {
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  /** The signal session's execution bars that opened at or after the scan, oldest first. */
  sessionBars: Bar[];
  /** True once the signal's session has closed, so no more of its bars can come. */
  sessionComplete: boolean;
  /** Completed daily sessions, the history before the signal and the sessions after it. */
  dailyBars: Bar[];
  monthly?: Bar[];
  sharesOutstanding?: number | null;
  maxHoldDays?: number;
}

/** Pure: production's entry and exit over the bars after one shadow signal. */
export function walkShadowTrade(input: ShadowWalkInput): ShadowOutcome {
  const { direction, entry, stopLoss, sessionBars, sessionComplete, dailyBars, monthly = [] } = input;
  const maxHoldDays = input.maxHoldDays ?? SHADOW_MAX_HOLD_DAYS;
  const long = direction === "bullish";
  const risk = Math.abs(entry - stopLoss);
  // No risk to measure, or no bar after the scan: nothing can fill.
  if (!(risk > 0) || sessionBars.length === 0) return sessionComplete ? { ...PENDING, outcome: "expired" } : PENDING;

  const sessionDate = sessionBars[0].t.slice(0, 10);
  const later = dailyBars.filter((d) => d.t.slice(0, 10) > sessionDate);
  const bars = [...sessionBars, ...later];

  // The reaction: a closed bar into the zone, filled at the next bar's open.
  let from = -1;
  for (let k = 0; k < sessionBars.length; k++) {
    const closed = sessionBars[k];
    if (long ? closed.c <= stopLoss : closed.c >= stopLoss) return { ...PENDING, outcome: "retired" };
    if (tradedIntoBuyZone(closed, direction, entry)) {
      from = k + 1;
      break;
    }
  }
  if (from < 0) return sessionComplete ? { ...PENDING, outcome: "expired" } : PENDING;
  if (from >= bars.length) return PENDING;

  const fill = bars[from].o;
  const maxBarsHeld = Math.max(0, sessionBars.length - from) + maxHoldDays;
  const crossedLevel = entryCrossedLevel(long ? "long" : "short", fill, bars[from].t, dailyBars, monthly);
  const walked = walkGannExit({
    bars,
    from,
    maxBarsHeld,
    long,
    entry: fill,
    stop: stopLoss,
    dailyBars,
    crossedLevel,
    sharesOn: () => input.sharesOutstanding ?? null,
    isStock: input.sharesOutstanding != null,
  });
  // Ran out of bars before an exit or the limit: still open.
  if (walked.reason === "open_at_end") return PENDING;

  const rMultiple = ((long ? 1 : -1) * (walked.exit - fill)) / risk;
  const sessions = new Set(bars.slice(from, from + walked.barsHeld).map((b) => b.t.slice(0, 10))).size;
  return {
    outcome: walked.reason === "held_to_limit" ? "timeout" : rMultiple > 0 ? "win" : "loss",
    rMultiple,
    barsHeld: sessions,
    fillPrice: fill,
  };
}

interface PendingShadowRow {
  id: string;
  symbol: string;
  direction: "bullish" | "bearish";
  entry: number;
  stop_loss: number;
  scanned_at: string;
}

/**
 * Evaluates every pending shadow signal old enough that its outcome might now
 * be determinable (at least one full day since it was recorded), and writes
 * the outcome back. Best-effort per symbol: a provider failure for one symbol
 * is logged and skipped rather than aborting the whole pass.
 */
export async function evaluatePendingShadowSignals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ evaluated: number; stillPending: number; failed: number }> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("shadow_signals")
    .select("id, symbol, direction, entry, stop_loss, scanned_at")
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
      const crypto = isCryptoSymbol(row.symbol);
      const scannedAt = new Date(row.scanned_at);
      const sessionDate = etDateKey(scannedAt);
      const [execution, { bars: daily, monthly }, ref] = await Promise.all([
        provider.fetchBars(
          row.symbol,
          SHADOW_EXECUTION_TIMEFRAME,
          scannedAt,
          new Date(scannedAt.getTime() + 24 * 3600_000),
          crypto ? "crypto" : "us_equity",
        ),
        completedDailyBars(row.symbol, now),
        crypto ? Promise.resolve(null) : getInstrumentReference(row.symbol),
      ]);
      const sessionBars = execution.filter(
        (b) => new Date(b.t).getTime() >= scannedAt.getTime() && etDateKey(new Date(b.t)) === sessionDate,
      );

      const result = walkShadowTrade({
        direction: row.direction,
        entry: Number(row.entry),
        stopLoss: Number(row.stop_loss),
        sessionBars,
        sessionComplete: etDateKey(now) > sessionDate,
        dailyBars: daily,
        monthly,
        sharesOutstanding: ref?.sharesOutstanding ?? null,
      });
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
          fill_price: result.fillPrice,
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
