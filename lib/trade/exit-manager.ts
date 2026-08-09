/**
 * Driving the protocol's staged exit.
 * -----------------------------------------------------------------------------
 * `lib/trade/protocol-exit.ts` decides *what* should happen. This module is the
 * half that talks to the broker and the database. On each pass it reads every
 * working plan and does one of four things:
 *
 *   1. Waits, when the entry hasn't filled yet.
 *   2. Attaches the exits, the first time there is a position to attach them to
 *      — 60% at TP1, half the remainder at the master target, the rest behind a
 *      stop.
 *   3. Moves the protective stop, once the trade has earned a tighter one.
 *   4. Closes the plan, when the position is gone or the master-target reversal
 *      rule fires.
 *
 * Why the exits aren't a bracket on the entry
 * -------------------------------------------
 * A bracket attaches to an entry, and an entry carries exactly one. Three
 * tranches would need three bracketed buys, and Alpaca refuses a buy while a
 * sell is working on the same symbol ("potential wash trade detected") — the
 * first bracket's legs go live the moment it fills, and the next two entries are
 * rejected. So the entry carries a single full-size stop, which is the rule that
 * has to be atomic (it is the one that caps the loss), and the profit tranches
 * are placed as sell-side OCO orders once the shares are held.
 *
 * What runs where
 * ---------------
 * The tranche orders rest at the broker. They fill whether or not this app is
 * running — that is what makes "60% out at TP1, everything out at the stop" a
 * promise rather than a hope. The trailing stop and the reversal rule cannot
 * rest as orders, because both depend on where price has *been*; they advance
 * on this pass, which runs while the app polls. Between polls the protection in
 * the market is the last stop this pass placed: never nothing, but never
 * tighter than the last sample either.
 *
 * Every write is idempotent. A pass with nothing to do issues no broker calls.
 */

import {
  cancelOrder,
  closePosition,
  getOrder,
  placeExitOrder,
  replaceOrder,
  type AlpacaCreds,
  type AlpacaOrder,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import {
  extendHighWater,
  planProtocolExit,
  planStopAdjustment,
  type StopReason,
} from "@/lib/trade/protocol-exit";
import { describeProtocolSignal, recordPendingExit } from "@/lib/portfolio/trade-log-record";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The plan row this module reads and writes. */
export interface PlanRow {
  id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  entry_order_id: string | null;
  stop_loss: number;
  take_profit_1: number;
  master_profit: number | null;
  scale_out_order_id: string | null;
  master_order_id: string | null;
  runner_order_id: string | null;
  exits_attached_at: string | null;
  high_water: number | null;
  applied_stop: number | null;
  applied_stop_reason: StopReason | null;
  created_at: string;
}

export interface ManageRun {
  /** Working plans inspected on this pass. */
  managed: number;
  /** Plans whose exit orders were placed on this pass. */
  attached: number;
  /** Plans whose protective stop was moved. */
  adjusted: number;
  /** Plans that finished — flat at the broker, or closed by the reversal rule. */
  closed: number;
  /** One sentence per action taken, for the Portfolio's sync line. */
  notes: string[];
  /** Non-null when something couldn't be applied; the counts are then partial. */
  error: string | null;
}

const idle = (): ManageRun => ({
  managed: 0,
  attached: 0,
  adjusted: 0,
  closed: 0,
  notes: [],
  error: null,
});

/** Broker statuses that mean an order is still live and can be replaced. */
const RESTING = new Set(["new", "accepted", "held", "pending_new", "replaced", "partially_filled"]);
/** Statuses that mean an entry ended without ever producing a position. */
const DEAD = new Set(["canceled", "cancelled", "expired", "rejected", "done_for_day", "replaced"]);

/**
 * Advance every working exit plan for this user.
 *
 * `positions` must be the broker's complete open-position list. A plan whose
 * symbol is absent from it is treated as finished, so an empty list from a
 * failed fetch would close plans that are still live — which is why the caller
 * passes null on failure and this returns early rather than guessing.
 */
export async function manageProtocolExits(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  positions: AlpacaPosition[] | null,
): Promise<ManageRun> {
  if (positions === null) {
    return {
      ...idle(),
      error: "Couldn't read open positions, so the protocol's exit rules didn't advance this pass.",
    };
  }

  const { data, error } = await supabase
    .from("protocol_exits")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "working")
    .limit(50);

  if (error) return { ...idle(), error: error.message };
  const plans = (data ?? []) as PlanRow[];
  if (plans.length === 0) return idle();

  const bySymbol = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
  const run: ManageRun = { ...idle(), managed: plans.length };

  for (const plan of plans) {
    try {
      await advance(supabase, creds, userId, normalizePlan(plan), bySymbol, run);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`exit-manager: ${plan.symbol} plan ${plan.id} — ${detail}`);
      run.error = `The protocol's exit rules for ${plan.symbol} couldn't be applied at the broker. Check the resting orders there before relying on them.`;
    }
  }

  return run;
}

/** Supabase returns numerics as strings; every rule here is arithmetic. */
function normalizePlan(plan: PlanRow): PlanRow {
  const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    ...plan,
    qty: Number(plan.qty),
    entry_price: Number(plan.entry_price),
    stop_loss: Number(plan.stop_loss),
    take_profit_1: Number(plan.take_profit_1),
    master_profit: numOrNull(plan.master_profit),
    high_water: numOrNull(plan.high_water),
    applied_stop: numOrNull(plan.applied_stop),
  };
}

async function advance(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  plan: PlanRow,
  bySymbol: Map<string, AlpacaPosition>,
  run: ManageRun,
): Promise<void> {
  const position = bySymbol.get(plan.symbol.toUpperCase());

  if (!position) {
    // No position and no exits ever attached means the entry hasn't filled —
    // a resting limit order, most often. Closing the plan here would abandon a
    // trade that is about to start, so it waits. Only an entry that ended
    // without filling retires the plan, and it retires without a trade log:
    // nothing was ever traded to log.
    if (!plan.exits_attached_at) {
      if (await entryIsDead(creds, plan)) {
        await closePlan(supabase, userId, plan, {});
        run.closed++;
        run.notes.push(`${plan.symbol}: the entry never filled, so its exit plan was retired.`);
      }
      return;
    }

    // Exits were attached and the position is gone: every tranche is out. The
    // trade gets its audit row, with the exit left pending — the fills that
    // closed it are what settlement reads, not a price guessed here.
    await finish(supabase, userId, plan, "flat");
    run.closed++;
    run.notes.push(`${plan.symbol} is flat — logged, waiting on the broker's exit prices.`);
    return;
  }

  const held = Math.abs(Number(position.qty));
  const price = Number(position.current_price);
  // The broker's own average entry replaces whatever the ticket submitted:
  // break-even has to mean the price actually paid.
  const entryPrice = Number(position.avg_entry_price) || plan.entry_price;
  const highWater = extendHighWater(plan.side, plan.high_water, Number.isFinite(price) ? price : null);

  if (!plan.exits_attached_at) {
    await attachExits(supabase, creds, userId, plan, held, entryPrice, highWater, run);
    return;
  }

  const action = planStopAdjustment({
    side: plan.side,
    entryPrice,
    levels: {
      stopLoss: plan.stop_loss,
      takeProfit1: plan.take_profit_1,
      masterProfit: plan.master_profit,
    },
    highWater,
    lastPrice: Number.isFinite(price) ? price : null,
    appliedStop: plan.applied_stop,
  });

  if (action.kind === "close_all") {
    await closePosition(creds, plan.symbol);
    await finish(supabase, userId, plan, "reversal", { highWater, entryPrice });
    run.closed++;
    run.notes.push(`${plan.symbol}: ${action.explanation}`);
    return;
  }

  if (action.kind === "replace_stop") {
    const moved = await moveStops(supabase, creds, userId, plan, action.stop);
    await patchPlan(supabase, userId, plan, {
      entry_price: entryPrice,
      high_water: highWater,
      ...(moved > 0 ? { applied_stop: action.stop, applied_stop_reason: action.reason } : {}),
    });
    if (moved > 0) {
      run.adjusted++;
      run.notes.push(`${plan.symbol}: ${action.explanation}`);
    }
    return;
  }

  // Nothing to move, but the high-water mark and the true entry price are worth
  // keeping current — they are what the next pass reasons from.
  const unchanged =
    highWater === plan.high_water && Math.abs(entryPrice - plan.entry_price) < 1e-9;
  if (!unchanged) {
    await patchPlan(supabase, userId, plan, { entry_price: entryPrice, high_water: highWater });
  }
}

/**
 * Place the staged exits against a position that now exists.
 *
 * The tranche split is recomputed from the quantity actually held rather than
 * the quantity ordered: a partially-filled entry should scale out of what it
 * got, not out of what it asked for.
 *
 * Sequencing is deliberate. The entry's full-size stop is cancelled first
 * because it reserves every share — nothing else can be placed while it rests —
 * and the replacements go on largest-first, so each call restores protection to
 * a bigger slice of the position than the last. If one of them fails, whatever
 * is left unprotected gets a plain stop immediately and the run says so out
 * loud; a position left naked because a placement 502'd is the one outcome this
 * function must never produce quietly.
 */
async function attachExits(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  plan: PlanRow,
  heldQty: number,
  entryPrice: number,
  highWater: number | null,
  run: ManageRun,
): Promise<void> {
  const closingSide = plan.side === "long" ? "sell" : "buy";
  const split = planProtocolExit(heldQty, {
    stopLoss: plan.stop_loss,
    takeProfit1: plan.take_profit_1,
    masterProfit: plan.master_profit,
  });

  await cancelEntryStop(creds, plan);

  const ids: Partial<Record<"scale_out" | "master" | "runner" | "single", string>> = {};
  let placedQty = 0;
  let failure: string | null = null;

  for (const tranche of split.tranches) {
    try {
      const order = await placeExitOrder(creds, {
        symbol: plan.symbol,
        side: closingSide,
        qty: tranche.qty,
        takeProfit: tranche.takeProfit,
        stopLoss: plan.stop_loss,
      });
      ids[tranche.key] = String(order.id);
      placedQty += tranche.qty;
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  // Best-effort restore: anything the loop didn't cover gets a plain stop, so
  // the position is never left without one.
  const uncovered = heldQty - placedQty;
  if (failure && uncovered > 0) {
    try {
      const order = await placeExitOrder(creds, {
        symbol: plan.symbol,
        side: closingSide,
        qty: uncovered,
        stopLoss: plan.stop_loss,
      });
      ids.runner = String(order.id);
      run.error = `${plan.symbol}: the profit targets couldn't all be placed, so the remaining ${uncovered} share${uncovered === 1 ? "" : "s"} carry a stop only. Set the target by hand at the broker.`;
    } catch {
      run.error = `${plan.symbol}: ${uncovered} share${uncovered === 1 ? "" : "s"} have no stop at the broker — the exit orders were refused (${failure}). Close the position or place a stop manually.`;
    }
  }

  await patchPlan(supabase, userId, plan, {
    qty: heldQty,
    entry_price: entryPrice,
    high_water: highWater,
    scale_out_qty: split.scaleOutQty,
    master_qty: split.masterQty,
    runner_qty: split.runnerQty,
    scale_out_order_id: ids.scale_out ?? ids.single ?? null,
    master_order_id: ids.master ?? null,
    runner_order_id: ids.runner ?? null,
    exits_attached_at: new Date().toISOString(),
    applied_stop: plan.stop_loss,
    applied_stop_reason: "protocol",
  });

  run.attached++;
  run.notes.push(`${plan.symbol}: ${split.summary}`);
}

/** Free the shares the entry's own stop reserves, so the tranches can be placed. */
async function cancelEntryStop(creds: AlpacaCreds, plan: PlanRow): Promise<void> {
  if (!plan.entry_order_id) return;
  const entry = await getOrder(creds, plan.entry_order_id, { nested: true }).catch(() => null);
  const leg = entry ? liveStopOrder(entry) : null;
  if (leg) await cancelOrder(creds, leg.id).catch(() => undefined);
}

/**
 * Push a new stop price onto every tranche that still has one resting.
 *
 * Alpaca replaces rather than edits: the old order is cancelled and a new one
 * takes its place. For an OCO tranche the replacement happens on the *leg*, and
 * the parent's id is unchanged, so nothing needs storing. A plain stop has no
 * parent — replacing it mints a new id, which is written back to the plan or the
 * next pass would patch an order that no longer exists.
 *
 * A tranche that has already filled or been cancelled has no resting stop and
 * is skipped: that is the normal state of the scale-out tranche after TP1.
 */
async function moveStops(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  plan: PlanRow,
  stop: number,
): Promise<number> {
  const tranches = [
    { column: "scale_out_order_id", id: plan.scale_out_order_id },
    { column: "master_order_id", id: plan.master_order_id },
    { column: "runner_order_id", id: plan.runner_order_id },
  ] as const;

  let moved = 0;
  for (const tranche of tranches) {
    if (!tranche.id) continue;
    const order = await getOrder(creds, tranche.id, { nested: true }).catch(() => null);
    const target = order ? liveStopOrder(order) : null;
    if (!target) continue;

    const replaced = await replaceOrder(creds, target.id, { stopPrice: stop });
    moved++;

    // The tranche we hold the id for *is* the stop when there's no OCO wrapper,
    // so its id has just changed.
    if (target.id === tranche.id && replaced?.id) {
      await patchPlan(supabase, userId, plan, { [tranche.column]: String(replaced.id) });
    }
  }
  return moved;
}

/** The resting stop within an order — the order itself, or its stop leg. */
function liveStopOrder(order: AlpacaOrder): AlpacaOrder | null {
  const isRestingStop = (o: AlpacaOrder) =>
    (o.type === "stop" || o.type === "stop_limit") && RESTING.has(String(o.status ?? "").toLowerCase());
  if (isRestingStop(order)) return order;
  return (order.legs ?? []).find(isRestingStop) ?? null;
}

/** True when the entry ended without ever producing a position. */
async function entryIsDead(creds: AlpacaCreds, plan: PlanRow): Promise<boolean> {
  if (!plan.entry_order_id) return false;
  const entry = await getOrder(creds, plan.entry_order_id).catch(() => null);
  if (!entry) return false;
  return DEAD.has(String(entry.status ?? "").toLowerCase());
}

/**
 * Close the plan out and write its trade log.
 *
 * The entry timestamp is the plan's own creation time — when the entry was
 * submitted — which is what settlement measures the closing fills from. The
 * exit stays pending until those fills are read.
 */
async function finish(
  supabase: Supabase,
  userId: string,
  plan: PlanRow,
  cause: "flat" | "reversal",
  ctx?: { highWater: number | null; entryPrice: number },
): Promise<void> {
  // A manual close writes this row itself and then retires the plan. A poll
  // landing between those two calls would see a flat symbol and a still-working
  // plan, and log the same trade twice. The plan's creation time is the key
  // both paths write, so it is what rules the second write out.
  const { data: already } = await supabase
    .from("trade_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", plan.symbol.toUpperCase())
    .eq("entry_timestamp", plan.created_at)
    .eq("outcome", "pending")
    .limit(1)
    .maybeSingle();

  if (already) {
    await closePlan(supabase, userId, plan, {
      high_water: ctx?.highWater ?? plan.high_water,
      entry_price: ctx?.entryPrice ?? plan.entry_price,
    });
    return;
  }

  await recordPendingExit(supabase, userId, {
    symbol: plan.symbol,
    direction: plan.side === "long" ? "buy" : "sell",
    quantity: plan.qty,
    entryPrice: ctx?.entryPrice ?? plan.entry_price,
    entryTimestamp: plan.created_at,
    signalCalled: describeProtocolSignal({
      stopLoss: plan.stop_loss,
      takeProfit1: plan.take_profit_1,
      masterProfit: plan.master_profit,
    }),
  });

  await closePlan(supabase, userId, plan, {
    high_water: ctx?.highWater ?? plan.high_water,
    entry_price: ctx?.entryPrice ?? plan.entry_price,
    ...(cause === "reversal" ? { applied_stop_reason: "master_reversal" as const } : {}),
  });
}

async function closePlan(
  supabase: Supabase,
  userId: string,
  plan: PlanRow,
  fields: Record<string, unknown>,
): Promise<void> {
  await patchPlan(supabase, userId, plan, {
    ...fields,
    status: "closed",
    closed_at: new Date().toISOString(),
  });
}

async function patchPlan(
  supabase: Supabase,
  userId: string,
  plan: PlanRow,
  fields: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("protocol_exits")
    .update({ ...fields, last_managed_at: now, updated_at: now })
    .eq("id", plan.id)
    .eq("user_id", userId);
  if (error) console.error(`exit-manager: plan ${plan.id} not updated — ${error.message}`);
}

/**
 * End a plan because the user closed the position by hand — rule 3's second
 * escape hatch. Without this the manager would keep re-arming stops against a
 * position that is gone, and would later log the trade a second time.
 *
 * Returns the plan it closed, so the caller can log the trade with the levels
 * that were actually being run.
 */
export async function closePlanForSymbol(
  supabase: Supabase,
  userId: string,
  symbol: string,
): Promise<PlanRow | null> {
  const { data } = await supabase
    .from("protocol_exits")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol.toUpperCase())
    .eq("status", "working")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const plan = normalizePlan(data as PlanRow);
  await closePlan(supabase, userId, plan, {});
  return plan;
}
