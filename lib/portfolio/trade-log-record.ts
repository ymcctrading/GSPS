/**
 * Writing the trade log at the moment a trade ends.
 *
 * Three things end a trade: the user closing it at market, the protocol's own
 * exit rules taking the last tranche out, and a stop or target filling at the
 * broker while nobody is watching. All three land here, and all three write the
 * same shape of row — the entry facts, which are known, and a pending exit,
 * which is not.
 *
 * The exit is deliberately left empty. At the instant a position is liquidated
 * the fill has not happened yet; writing the last quote into `exit_price` would
 * put a number in the audit trail that no execution ever produced.
 * `settlePendingTradeLogs` comes back for it once the broker reports the fill.
 */

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PendingExitLog {
  symbol: string;
  assetClass?: string;
  /** The entry side: `buy` for a long, `sell` for a short. */
  direction: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  entryTimestamp?: string | null;
  positionId?: string | null;
  orderId?: string | null;
  /**
   * The staged-exit plan this trade closes out, when there is one. Carries a
   * database-enforced uniqueness: two writers racing to log the same finished
   * plan (a poll's own `finish` and a manual close landing at nearly the same
   * moment) both attempt this insert, and the one that loses the race gets a
   * `duplicate` result instead of a second row — see migration `0009`.
   */
  exitPlanId?: string | null;
  /** What was called at entry. Required by the table, so it is never blank. */
  signalCalled: string;
}

export type RecordExitResult =
  | { status: "recorded"; id: string }
  /** Another writer already logged this plan. Not a failure — treat it as done. */
  | { status: "duplicate" }
  | { status: "failed" };

/** Postgres's own code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Record a trade that has just been closed out, exit unknown.
 *
 * A failure is logged and reported as `failed` rather than thrown, because the
 * exit itself has already happened at the broker and an audit-trail failure
 * must not be surfaced to the user as a failed close. A unique-constraint hit
 * on `exit_plan_id` is reported separately as `duplicate`, because it isn't a
 * failure at all — it means a concurrent pass already wrote this trade's row,
 * and the caller should treat the trade as logged rather than retry.
 */
export async function recordPendingExit(
  supabase: Supabase,
  userId: string,
  input: PendingExitLog,
): Promise<RecordExitResult> {
  const { data, error } = await supabase
    .from("trade_logs")
    .insert({
      user_id: userId,
      symbol: input.symbol.toUpperCase(),
      asset_class: input.assetClass ?? "us_equity",
      direction: input.direction,
      quantity: input.quantity,
      entry_timestamp: input.entryTimestamp ?? new Date().toISOString(),
      entry_price: input.entryPrice,
      position_id: input.positionId ?? null,
      order_id: input.orderId ?? null,
      exit_plan_id: input.exitPlanId ?? null,
      exit_timestamp: null,
      exit_price: null,
      outcome: "pending",
      exit_condition: "pending",
      signal_called: input.signalCalled,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { status: "duplicate" };
    console.error(`trade-log: exit for ${input.symbol} not recorded — ${error.message}`);
    return { status: "failed" };
  }
  if (!data?.id) return { status: "failed" };
  return { status: "recorded", id: String(data.id) };
}

/** How a protocol entry is described in the log, from the levels it was given. */
export function describeProtocolSignal(levels: {
  stopLoss: number;
  takeProfit1: number;
  masterProfit?: number | null;
}): string {
  const usd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const master = levels.masterProfit != null ? `, master ${usd(levels.masterProfit)}` : "";
  return `Protocol levels — stop ${usd(levels.stopLoss)}, TP1 ${usd(levels.takeProfit1)}${master}`;
}
