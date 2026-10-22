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
 *   never-failing rule 9), in the session the signal trades
 *   (`shadowTradeSession`): its own when recorded before the close, the next
 *   one when recorded after it, as Gann chose at night and traded the next
 *   day. A closed regular-session execution bar of that session, after the
 *   scan, that trades into the buy zone (`tradedIntoBuyZone`)
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
import { regularSessionBars } from "@/lib/gann/intradayExit";
import { shadowSessionComplete, shadowTradeSession } from "@/lib/shadow/record";

/**
 * Sessions a filled shadow trade is held before being marked out at the last
 * close: the replay's limit (`maxBarsHeld`, 10 sessions), so the two measure
 * the same horizon. Engineering-chosen, not spec-derived.
 */
export const SHADOW_MAX_HOLD_DAYS = 10;

/** The execution bars the entry is read on, as production arms its plans. */
const SHADOW_EXECUTION_TIMEFRAME = "15Min" as const;

/**
 * Pending signals read a pass, least recently checked first, and walked this
 * many at a time. The pass rides the scheduled scan's 60-second budget ahead
 * of its fan-out, so it is bounded, and a trade still held is checked again
 * only after every other pending row has had its turn (`checked_at`), so
 * long-held trades never crowd out newer ones. Engineering choices.
 */
export const SHADOW_EVALUATIONS_PER_PASS = 30;
const SHADOW_EVALUATION_CONCURRENCY = 6;

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
  /** The fill, also on a `pending` trade that has filled and is still held. */
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
  // Filled on the session's last bar: the fill is known, the walk not yet.
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
  // Ran out of bars before an exit or the limit: still open, and filled.
  if (walked.reason === "open_at_end") return { ...PENDING, fillPrice: fill };

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
  session_date: string | null;
  fill_price: number | null;
}

/**
 * Evaluates the pending shadow signals whose session has begun and may have
 * ended (`session_date` today or earlier; a legacy row with no session once a
 * day old), least recently checked first and at most
 * `SHADOW_EVALUATIONS_PER_PASS` a pass, and writes each outcome back. A trade
 * that has filled and is still held gets its fill written and stays pending.
 * Best-effort per symbol: a provider failure for one symbol is logged and
 * skipped rather than aborting the whole pass.
 */
export async function evaluatePendingShadowSignals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ evaluated: number; stillPending: number; failed: number }> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const today = etDateKey(now);
  const { data, error } = await supabase
    .from("shadow_signals")
    .select("id, symbol, direction, entry, stop_loss, scanned_at, session_date, fill_price")
    .is("outcome", null)
    .or(`session_date.lte.${today},and(session_date.is.null,scanned_at.lte.${cutoff})`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .order("scanned_at", { ascending: true })
    .limit(SHADOW_EVALUATIONS_PER_PASS);

  if (error) {
    console.error(`shadow: pending-signal read failed — ${error.message}`);
    return { evaluated: 0, stillPending: 0, failed: 0 };
  }

  const rows = (data ?? []) as PendingShadowRow[];
  const provider = getMarketDataProvider();
  const tally = { evaluated: 0, stillPending: 0, failed: 0 };
  // One daily read a symbol a pass, shared by its rows in the same batch.
  const daily = new Map<string, ReturnType<typeof completedDailyBars>>();
  const dailyOf = (symbol: string) => {
    let read = daily.get(symbol);
    if (!read) {
      read = completedDailyBars(symbol, now);
      daily.set(symbol, read);
    }
    return read;
  };

  async function evaluateOne(row: PendingShadowRow): Promise<keyof typeof tally> {
    try {
      const crypto = isCryptoSymbol(row.symbol);
      const scannedAt = new Date(row.scanned_at);
      const sessionDate = row.session_date ?? shadowTradeSession(row.scanned_at, row.symbol);
      const sessionComplete = shadowSessionComplete(sessionDate, row.symbol, now);
      // The session still to come or still trading, and nothing filled yet:
      // nothing to read.
      if (!sessionComplete && row.fill_price == null && sessionDate >= today) return "stillPending";
      // Through the end of the session's New York day, whatever the season.
      const sessionEnd = new Date(Date.parse(`${sessionDate}T00:00:00Z`) + 36 * 3600_000);
      const [execution, { bars: daily, monthly }, ref] = await Promise.all([
        provider.fetchBars(
          row.symbol,
          SHADOW_EXECUTION_TIMEFRAME,
          scannedAt,
          sessionEnd,
          crypto ? "crypto" : "us_equity",
        ),
        dailyOf(row.symbol),
        crypto ? Promise.resolve(null) : getInstrumentReference(row.symbol),
      ]);
      // A US equity's limit entry works in the regular session only; a
      // pre-market print is not the reaction.
      const sessionBars = regularSessionBars(
        execution.filter(
          (b) => new Date(b.t).getTime() >= scannedAt.getTime() && etDateKey(new Date(b.t)) === sessionDate,
        ),
        crypto,
      );

      const result = walkShadowTrade({
        direction: row.direction,
        entry: Number(row.entry),
        stopLoss: Number(row.stop_loss),
        sessionBars,
        sessionComplete,
        dailyBars: daily,
        monthly,
        sharesOutstanding: ref?.sharesOutstanding ?? null,
      });
      if (result.outcome === "pending") {
        // Checked now, so the next pass turns to rows not yet read; a fill is
        // kept so the recorder knows the trade is on (lib/shadow/record.ts).
        const { error: checkError } = await supabase
          .from("shadow_signals")
          .update({ checked_at: now.toISOString(), fill_price: result.fillPrice ?? row.fill_price ?? null })
          .eq("id", row.id);
        if (checkError) console.error(`shadow: check write failed for ${row.symbol} — ${checkError.message}`);
        return "stillPending";
      }

      const { error: writeError } = await supabase
        .from("shadow_signals")
        .update({
          outcome: result.outcome,
          r_multiple: result.rMultiple,
          bars_held: result.barsHeld,
          fill_price: result.fillPrice,
          evaluated_at: now.toISOString(),
          checked_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (writeError) {
        console.error(`shadow: outcome write failed for ${row.symbol} — ${writeError.message}`);
        return "failed";
      }
      return "evaluated";
    } catch (err) {
      console.error(`shadow: evaluation failed for ${row.symbol} — ${String(err)}`);
      return "failed";
    }
  }

  for (let i = 0; i < rows.length; i += SHADOW_EVALUATION_CONCURRENCY) {
    const settled = await Promise.all(rows.slice(i, i + SHADOW_EVALUATION_CONCURRENCY).map(evaluateOne));
    for (const k of settled) tally[k]++;
  }
  return tally;
}
