/**
 * Writing a paused paper position's walk (`pausedPaperExits.ts`) through the
 * normal settlement path, with every exit dated when it happened.
 *
 * Why (2026-11-09): the walk says what each of the 15 paper positions left
 * unmanaged by the Oct 31 pause would have done, bar by bar. Booking that
 * result through `exit-manager-sim.ts` as it stands would stamp each exit at
 * the moment of the write, so a stop hit on Nov 5 would show as a close on the
 * day of the write, and reach that evening's 5 PM ET journal email
 * (`app/api/trade-journal/daily-email`, which counts trades whose
 * `exit_timestamp` falls today in New York) and Friday's weekly digest. Here
 * each fill keeps its bar's time.
 *
 * What it writes, in the live manager's own order (`advance`, then `finish`):
 * 1. one conditional claim on the `protocol_exits` row: the walk's fills as
 *    tranche order ids and fill prices, the stop the walk ended on and its
 *    best price. It matches only a row still `working`, at the quantity and
 *    `last_managed_at` the walk read, with the walked tranches still unfilled;
 *    anything else means the row moved since, and nothing is written for it.
 *    The claim leaves `last_managed_at` alone, so the after-the-pause hold's
 *    policy ("working and managed before Oct 31") keeps the row hidden from
 *    the member pages until the row is complete;
 * 2. each fill through `executeFill`, the one paper fill path (cash and
 *    position in one transaction);
 * 3. for a closed walk, the trade log through `insertTradeLog`, with
 *    `exit_timestamp` at the last fill's bar;
 * 4. the release, last: a closed walk's row is closed with `closed_at` at the
 *    last fill's bar; every row gets `last_managed_at` at the walk's end. Only
 *    then does the hold's policy stop hiding it;
 * 5. for an automated trade closed on a stop or an exit signal, the plan
 *    ended through `handleAutomatedStopOut` at the bar's time, with
 *    `seedFollowOns: false`: no reversal or re-buy is seeded weeks after the
 *    break (the walk models neither; the script prints this for each row).
 *
 * A failure after the claim leaves the row claimed (its tranche ids read
 * `sim_walk_…`) but not released. A later run's claim then matches nothing;
 * the row is re-read, and if it carries this walk's ids it is reported as
 * PARTIAL with what is and isn't in place, never as an ordinary skip. Nothing
 * resumes it automatically: whether a fill was booked is a person's check
 * (the paper position), so a fill is never booked twice.
 *
 * The planning is pure (`planSettlement`) and the writes take their
 * dependencies as arguments, so both are tested without a database.
 *
 * Mandate questions (AGENTS.md): (1) Gann: nothing is decided here; the
 * decisions are the walk's, which reads his exit rules through
 * `readGannExitFromBars`. The fill is dated on the bar it happened, as his
 * records date a trade by the day it closed. (2) Cycles: none claimed.
 * (3) Hermetic: Cause and Effect, in that an exit is recorded at its cause's
 * time, not at the time it was noticed. (4) Law of Creation: the walk and the
 * stored row are joined into a settled record; a mixture, nothing new made.
 */

import type { PausedWalk, WalkFill } from "@/lib/recovery/pausedPaperExits";
import type { StopReason } from "@/lib/trade/protocol-exit";
import { storedStopReason } from "@/lib/trade/protocol-exit";
import type { GannStopReason } from "@/lib/gann/exitRules";

/** The `protocol_exits` columns the settlement reads. */
export interface PausedExitRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  master_profit: number | null;
  scale_out_qty: number;
  master_qty: number;
  runner_qty: number;
  scale_out_order_id: string | null;
  master_order_id: string | null;
  runner_order_id: string | null;
  scale_out_fill_price: number | null;
  master_fill_price: number | null;
  runner_fill_price: number | null;
  applied_stop: number | null;
  applied_stop_reason: StopReason | null;
  high_water: number | null;
  entry_order_id: string | null;
  created_at: string;
  last_managed_at: string | null;
}

export type ExitCondition = "tp1" | "master_target" | "stop_loss";

export interface SettlementPlan {
  rowId: string;
  /** Columns the claim writes (besides `updated_at`, stamped at write time). */
  patch: Record<string, unknown>;
  /** `last_managed_at` for the release, written last. */
  managedAt: string;
  /** The walk's fills, each kept at its bar's time. */
  fills: WalkFill[];
  /** Present once every tranche has a fill. */
  close: null | {
    at: string;
    exitPrice: number;
    exitQty: number;
    profitLossDollars: number;
    profitLossPercent: number | null;
    exitCondition: ExitCondition;
    /** The walk ended on a stop or an exit signal (a stop-out for an automated plan). */
    stoppedOut: boolean;
  };
}

const KEYS = ["scale_out", "master", "runner"] as const;

/** The tranche order id the walk's claim writes; how a re-run recognises its own claim. */
export const walkOrderId = (rowId: string, key: WalkFill["key"]) => `sim_walk_${rowId.slice(0, 8)}_${key}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The walk's stop reason as the column stores it. */
export function storedWalkStopReason(walk: Pick<PausedWalk, "stopReason">, row: Pick<PausedExitRow, "applied_stop_reason">): StopReason {
  if (walk.stopReason === "applied") return row.applied_stop_reason ?? "protocol";
  if (walk.stopReason === "protocol") return "protocol";
  return storedStopReason(walk.stopReason as GannStopReason);
}

const isStopOut = (f: WalkFill) => f.reason.startsWith("stop") || f.reason.startsWith("exit signal");

/**
 * What the write would do for one row, from its walk. Throws when the walk
 * and the row disagree (a fill for a tranche the row already filled, or a
 * row id that differs), so a mismatched file never reaches the database.
 */
export function planSettlement(row: PausedExitRow, walk: PausedWalk, end: Date): SettlementPlan {
  const long = row.side === "long";
  const patch: Record<string, unknown> = {};
  for (const f of walk.fills) {
    if (row[`${f.key}_order_id`] != null) throw new Error(`${row.id}: the walk fills ${f.key}, which the row already filled`);
    if (!Number.isFinite(f.price) || !Number.isFinite(Date.parse(f.at))) throw new Error(`${row.id}: a fill has no price or time`);
    patch[`${f.key}_order_id`] = walkOrderId(row.id, f.key);
    patch[`${f.key}_fill_price`] = f.price;
  }
  const startStop = row.applied_stop ?? row.stop_loss;
  if (walk.stop !== startStop) {
    patch.applied_stop = walk.stop;
    patch.applied_stop_reason = storedWalkStopReason(walk, row);
  }
  if (walk.best != null && walk.best !== row.high_water) patch.high_water = walk.best;
  const managedAt = end.toISOString();

  if (walk.state !== "closed") return { rowId: row.id, patch, managedAt, fills: walk.fills, close: null };

  // Every tranche now carries a fill: the ones before the pause and the walk's.
  const priced = KEYS.map((key) => {
    const qty = Number(row[`${key}_qty`]) || 0;
    const walked = walk.fills.find((f) => f.key === key);
    const price = walked ? walked.price : row[`${key}_fill_price`];
    return { key, qty, price: price == null ? null : Number(price), filled: walked != null || row[`${key}_order_id`] != null };
  }).filter((t) => t.qty > 0);
  if (priced.some((t) => !t.filled)) throw new Error(`${row.id}: the walk is closed but a tranche has no fill`);
  const withPrice = priced.filter((t) => t.price != null);
  const exitQty = withPrice.reduce((n, t) => n + t.qty, 0);
  const exitPrice = exitQty > 0 ? withPrice.reduce((n, t) => n + t.qty * (t.price as number), 0) / exitQty : row.entry_price;
  const perShare = long ? exitPrice - row.entry_price : row.entry_price - exitPrice;
  const last = walk.fills.reduce<WalkFill | null>((a, f) => (a == null || Date.parse(f.at) >= Date.parse(a.at) ? f : a), null);
  if (!last) throw new Error(`${row.id}: the walk is closed with no fill of its own`);
  const stoppedOut = isStopOut(last);
  const masterFilled = walk.fills.some((f) => f.key === "master" && !isStopOut(f)) || row.master_order_id != null;
  const exitCondition: ExitCondition = stoppedOut ? "stop_loss" : masterFilled ? "master_target" : "tp1";
  // The live manager logs the blended exit price, not rounded (finish()).
  return {
    rowId: row.id,
    patch,
    managedAt,
    fills: walk.fills,
    close: {
      at: last.at,
      exitPrice,
      exitQty,
      profitLossDollars: round2(perShare * exitQty),
      profitLossPercent: row.entry_price === 0 ? null : round2((perShare / row.entry_price) * 100),
      exitCondition,
      stoppedOut,
    },
  };
}

/** What the writer needs; the script passes the real ones, the tests fakes. */
export interface SettleDeps {
  /** The service-role client (it names every row's user explicitly). */
  db: {
    from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  executeFill(userId: string, fill: { symbol: string; side: "buy" | "sell"; qty: number; price: number }): Promise<unknown>;
  insertTradeLog(row: Record<string, unknown>): Promise<{ error: { message: string } | null; duplicate: boolean }>;
  /** Ends an automated plan on a stop-out, without follow-ons. */
  stopOut(userId: string, args: { planId: string; entryFillPrice: number; stoppedAt: string; exitPrice: number; extreme: number | null }): Promise<void>;
  signalCalled(row: PausedExitRow): string;
  now(): Date;
}

export interface SettleResult {
  rowId: string;
  /** "partial": an earlier run claimed this row and stopped before releasing it. */
  outcome: "settled" | "updated" | "skipped" | "partial";
  detail: string;
  /**
   * Set when the row settled but its automated plan could not be ended. A
   * re-run reads the row as already settled and won't retry it, so the
   * script lists these at the end for a person.
   */
  planNotEnded?: { planId: string; error: string };
}

/** Apply one row's plan. Returns "skipped" when the row moved since it was read. */
export async function applySettlement(row: PausedExitRow, plan: SettlementPlan, deps: SettleDeps): Promise<SettleResult> {
  if (plan.rowId !== row.id) throw new Error(`plan for ${plan.rowId} applied to ${row.id}`);
  const nowIso = deps.now().toISOString();
  let claim = deps.db
    .from("protocol_exits")
    .update({ ...plan.patch, updated_at: nowIso })
    .eq("id", row.id)
    .eq("user_id", row.user_id)
    .eq("mode", "paper")
    .eq("status", "working")
    .eq("qty", row.qty);
  claim = row.last_managed_at == null ? claim.is("last_managed_at", null) : claim.eq("last_managed_at", row.last_managed_at);
  for (const f of plan.fills) claim = claim.is(`${f.key}_order_id`, null);
  const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
  if (claimError) throw new Error(`${row.id}: claim failed, nothing written: ${claimError.message}`);
  if (!claimed) return explainUnclaimed(row, plan, deps);

  let stage = "claimed";
  try {
    const closingSide: "buy" | "sell" = row.side === "long" ? "sell" : "buy";
    let booked = 0;
    for (const f of plan.fills) {
      stage = `claimed; ${booked} of ${plan.fills.length} fill(s) booked`;
      await deps.executeFill(row.user_id, { symbol: row.symbol, side: closingSide, qty: f.qty, price: f.price });
      booked++;
    }
    stage = `claimed; ${booked} of ${plan.fills.length} fill(s) booked`;

    const c = plan.close;
    let duplicate = false;
    if (c) {
      const log = await deps.insertTradeLog({
        user_id: row.user_id,
        symbol: row.symbol.toUpperCase(),
        asset_class: "us_equity",
        direction: row.side === "long" ? "buy" : "sell",
        quantity: c.exitQty,
        entry_timestamp: row.created_at,
        entry_price: row.entry_price,
        exit_timestamp: c.at,
        exit_price: c.exitPrice,
        outcome: c.profitLossDollars >= 0 ? "profit" : "loss",
        profit_loss_dollars: c.profitLossDollars,
        profit_loss_percent: c.profitLossPercent,
        exit_condition: c.exitCondition,
        signal_called: deps.signalCalled(row),
        signal_adherence: "yes",
        exit_plan_id: row.id,
        order_id: row.entry_order_id,
      });
      if (log.error) throw new Error(`trade log not written: ${log.error.message}`);
      duplicate = log.duplicate;
      stage += "; trade log written";
    }

    // The release, last: only now does the hold's policy stop hiding the row.
    const release: Record<string, unknown> = { last_managed_at: plan.managedAt, updated_at: deps.now().toISOString() };
    if (c) {
      release.status = "closed";
      release.closed_at = c.at;
    }
    const { data: released, error: releaseError } = await deps.db
      .from("protocol_exits")
      .update(release)
      .eq("id", row.id)
      .eq("user_id", row.user_id)
      .eq("status", "working")
      .select("id")
      .maybeSingle();
    if (releaseError) throw new Error(`row not released: ${releaseError.message}`);
    if (!released) throw new Error("row not released: the release matched no working row");
    stage += c ? "; row closed" : "; row released";
    if (!c) return { rowId: row.id, outcome: "updated", detail: `${plan.fills.length} fill(s); still open` };

    let ended = "";
    if (c.stoppedOut && row.entry_order_id) {
      const { data: order } = await deps.db.from("orders").select("source_plan_id, intraday_sourced").eq("id", row.entry_order_id).maybeSingle();
      const planId = (order?.source_plan_id as string | null) ?? null;
      if (planId && order?.intraday_sourced !== true) {
        try {
          await deps.stopOut(row.user_id, {
            planId,
            entryFillPrice: row.entry_price,
            stoppedAt: c.at,
            exitPrice: c.exitPrice,
            extreme: (plan.patch.high_water as number | undefined) ?? row.high_water,
          });
          ended = "; automated plan ended, no reversal or re-buy seeded";
        } catch (err) {
          // The row is settled and released; only the plan's ending failed. Not an ERROR for the row.
          const error = err instanceof Error ? err.message : String(err);
          const detail = `closed ${c.exitCondition} at ${c.exitPrice.toFixed(2)} on ${c.at}; automated plan ${planId} NOT ended: ${error}`;
          return { rowId: row.id, outcome: "settled", detail, planNotEnded: { planId, error } };
        }
      }
    }
    return { rowId: row.id, outcome: "settled", detail: `closed ${c.exitCondition} at ${c.exitPrice.toFixed(2)} on ${c.at}${duplicate ? " (trade log already present)" : ""}${ended}` };
  } catch (err) {
    throw new Error(`${row.id}: stopped after: ${stage}. ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The claim matched nothing: an ordinary change since the dry run, or this walk's own earlier, unfinished claim. */
async function explainUnclaimed(row: PausedExitRow, plan: SettlementPlan, deps: SettleDeps): Promise<SettleResult> {
  const cols = KEYS.map((k) => `${k}_order_id`).join(", ");
  const { data: now } = await deps.db.from("protocol_exits").select(`status, last_managed_at, ${cols}`).eq("id", row.id).eq("user_id", row.user_id).maybeSingle();
  const ours = now != null && plan.fills.length > 0 && plan.fills.every((f) => now[`${f.key}_order_id`] === walkOrderId(row.id, f.key));
  if (!ours) return { rowId: row.id, outcome: "skipped", detail: "the row changed since it was read; nothing written" };
  const released = now.last_managed_at === plan.managedAt;
  if (released && (plan.close == null || now.status === "closed")) {
    return { rowId: row.id, outcome: "skipped", detail: "already settled by an earlier run; nothing written" };
  }
  let logs = 0;
  if (plan.close) {
    // A list, not maybeSingle: two logs for one plan must read as written (and be named), never as none.
    const { data: found } = await deps.db.from("trade_logs").select("id").eq("exit_plan_id", row.id).eq("user_id", row.user_id).limit(2);
    logs = Array.isArray(found) ? found.length : 0;
  }
  return {
    rowId: row.id,
    outcome: "partial",
    detail: `an earlier run claimed this row and stopped: status ${now.status}, ${released ? "released" : "not released (still hidden by the hold)"}${plan.close ? `, trade log ${logs === 0 ? "not written" : logs === 1 ? "written" : "written more than once"}` : ""}. Check the paper position for the fills before finishing it by hand.`,
  };
}
