/**
 * Driving the protocol's staged exit — simulated-broker version.
 * -----------------------------------------------------------------------------
 * `lib/trade/exit-manager.ts` drives the same four rules (stop / TP1 / master
 * target / trailing stop — see `lib/trade/protocol-exit.ts`) against a real
 * broker, where the profit tranches rest as orders and fill on their own. The
 * simulator has no external broker for them to rest at, so this module
 * evaluates all four rules itself, once per poll, and executes a tranche's
 * fill the instant its level is crossed rather than waiting for a resting
 * order to report back.
 *
 * That collapses most of what makes the real exit manager complex: there is
 * no "is the entry still filling" wait (a simulated entry fills synchronously,
 * before the plan even exists), no claim/replace/OCO bookkeeping (nothing
 * rests anywhere to race against), and no pending → settle two-step for the
 * trade log (the exit price is known the moment it happens). What's left is
 * the actual decision logic, reused unchanged from `protocol-exit.ts`, plus
 * bookkeeping for which of the three tranches has already fired.
 *
 * "Reached" is judged against `high_water` (extended every pass, same as the
 * stop side), not the single live quote sampled this pass — a price that
 * touched a level between polls and came back is still a touch, matching how
 * `planStopAdjustment` already reasons about the stop.
 */

import { executeFill, quotePrice, assetClassOf } from "@/lib/brokers/simulator";
import { insertTradeLog } from "@/lib/portfolio/trade-log-insert";
import {
  extendHighWater,
  LIVE_EXIT_RULE,
  planStopAdjustment,
  type StopReason,
} from "@/lib/trade/protocol-exit";
import { handleAutomatedStopOut, reversalOffer } from "@/lib/automation/stop-out";
import type { ReversalCause } from "@/lib/gann/reverse";
import { readLiveBadNews, readLiveGannExit, readLiveRebuy } from "@/lib/trade/gann-exit-live";
import { badNewsOffer } from "@/lib/gann/badNews";
import { positionTradeStyle, traderStyleHistory } from "@/lib/trade/exit-style";
import type { TradeStyleChange } from "@/lib/gann/traderPrefs";
import { rebuyOffer } from "@/lib/gann/rebuy";
import type { createClient } from "@/lib/supabase/server";
import { ledgerWriter } from "@/lib/supabase/ledger";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface SimPlanRow {
  id: string;
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
  /** The `orders` row this exit plan's entry came from — used to trace a stop-out back to its `trade_plans` row. See lib/automation/stop-out.ts. */
  entry_order_id: string | null;
  high_water: number | null;
  applied_stop: number | null;
  applied_stop_reason: StopReason | null;
  status: "working" | "closed";
  created_at: string;
}

export interface SimManageRun {
  managed: number;
  /** Tranche fills executed on this pass (across every plan). */
  filled: number;
  /** Plans that finished on this pass. */
  closed: number;
  notes: string[];
  error: string | null;
}

const idle = (): SimManageRun => ({ managed: 0, filled: 0, closed: 0, notes: [], error: null });

function reached(side: "long" | "short", best: number | null, level: number | null): boolean {
  if (level == null || best == null) return false;
  return side === "long" ? best >= level : best <= level;
}

/**
 * Advance every working simulated exit plan for this user by one pass.
 *
 * Scoped to `mode = 'paper'` — now that live plans exist too (written by
 * `lib/trade/place-order.ts`'s live branch, advanced by the real
 * `lib/trade/exit-manager.ts` instead), an unscoped read here would pick up a
 * live plan and try to advance it against nothing (this module has no broker
 * positions to check it against), misreading a live position as flat and
 * closing its plan.
 */
export async function manageSimulatedExits(supabase: Supabase, userId: string): Promise<SimManageRun> {
  const { data, error } = await supabase
    .from("protocol_exits")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", "paper")
    .eq("status", "working")
    .limit(50);

  if (error) return { ...idle(), error: error.message };
  const plans = (data ?? []).map(normalizePlan);
  if (plans.length === 0) return idle();

  const run: SimManageRun = { ...idle(), managed: plans.length };
  const styleHistory = await traderStyleHistory(supabase, userId);
  for (const plan of plans) {
    try {
      await advance(supabase, userId, plan, run, styleHistory);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`exit-manager-sim: ${plan.symbol} plan ${plan.id} — ${detail}`);
      run.error = `The protocol's exit rules for ${plan.symbol} couldn't be advanced this pass (${detail}).`;
    }
  }
  return run;
}

/**
 * One pass of `manageSimulatedExits` for every account with a working paper
 * exit plan. Until 2026-10-21 the simulator's exits only moved when their
 * owner opened the portfolio or orders page, so a paper stop or Gann exit
 * could go unread for days (NEE's plan was last managed 2026-10-16). The
 * scheduled portfolio-manager run calls this every pass, before it opens
 * anything new, so a stop is read on the same cadence an entry is.
 */
export async function manageAllSimulatedExits(supabase: Supabase): Promise<{ accounts: number; filled: number; closed: number; errors: string[] }> {
  const out = { accounts: 0, filled: 0, closed: 0, errors: [] as string[] };
  const { data, error } = await supabase
    .from("protocol_exits")
    .select("user_id")
    .eq("mode", "paper")
    .eq("status", "working")
    .limit(500);
  if (error) {
    out.errors.push(`Could not list working paper exits: ${error.message}`);
    return out;
  }
  const users = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  for (const userId of users) {
    out.accounts++;
    const run = await manageSimulatedExits(supabase, userId).catch((err: unknown) => ({
      ...idle(),
      error: err instanceof Error ? err.message : String(err),
    }));
    out.filled += run.filled;
    out.closed += run.closed;
    if (run.error) out.errors.push(`${userId}: ${run.error}`);
  }
  return out;
}

function normalizePlan(row: Record<string, unknown>): SimPlanRow {
  const num = (v: unknown): number => Number(v);
  const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    side: row.side === "short" ? "short" : "long",
    qty: num(row.qty),
    entry_price: num(row.entry_price),
    stop_loss: num(row.stop_loss),
    take_profit_1: num(row.take_profit_1),
    master_profit: numOrNull(row.master_profit),
    scale_out_qty: num(row.scale_out_qty),
    master_qty: num(row.master_qty),
    runner_qty: num(row.runner_qty),
    scale_out_order_id: (row.scale_out_order_id as string | null) ?? null,
    master_order_id: (row.master_order_id as string | null) ?? null,
    runner_order_id: (row.runner_order_id as string | null) ?? null,
    scale_out_fill_price: numOrNull(row.scale_out_fill_price),
    master_fill_price: numOrNull(row.master_fill_price),
    runner_fill_price: numOrNull(row.runner_fill_price),
    entry_order_id: (row.entry_order_id as string | null) ?? null,
    high_water: numOrNull(row.high_water),
    applied_stop: numOrNull(row.applied_stop),
    applied_stop_reason: (row.applied_stop_reason as StopReason | null) ?? null,
    status: row.status === "closed" ? "closed" : "working",
    created_at: String(row.created_at),
  };
}

interface Tranche {
  key: "scale_out" | "master" | "runner";
  qty: number;
  orderId: string | null;
  fillPrice: number | null;
}

function tranches(plan: SimPlanRow): Tranche[] {
  const all: Tranche[] = [
    { key: "scale_out", qty: plan.scale_out_qty, orderId: plan.scale_out_order_id, fillPrice: plan.scale_out_fill_price },
    { key: "master", qty: plan.master_qty, orderId: plan.master_order_id, fillPrice: plan.master_fill_price },
    { key: "runner", qty: plan.runner_qty, orderId: plan.runner_order_id, fillPrice: plan.runner_fill_price },
  ];
  return all.filter((t) => t.qty > 0);
}

/**
 * Decide what should fill this pass, claim it with a conditional write, and
 * only then execute the position/cash mutation. The claim is what stops two
 * overlapping polls (a second tab, a request that outlived the interval) from
 * both seeing the same "TP1 reached" state and each debiting/crediting the
 * fill twice: the update below only succeeds if the tranche columns it's
 * claiming are still null, so the loser of the race gets zero rows back and
 * walks away having mutated nothing.
 */
async function advance(supabase: Supabase, userId: string, plan: SimPlanRow, run: SimManageRun, styleHistory: readonly TradeStyleChange[] = []): Promise<void> {
  const price = await quotePrice(plan.symbol, assetClassOf(plan.symbol));
  if (price == null) return; // no data this pass; try again next poll

  const highWater = extendHighWater(plan.side, plan.high_water, price);
  const generatedId = () => `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const list = tranches(plan);
  const scaleOut = list.find((t) => t.key === "scale_out");
  const master = list.find((t) => t.key === "master");

  // ---- Decide, from the row as read at the top of this pass. -----------
  const toFill: { key: "scale_out" | "master" | "runner"; qty: number; price: number }[] = [];
  if (scaleOut && !scaleOut.orderId && reached(plan.side, highWater, plan.take_profit_1)) {
    toFill.push({ key: "scale_out", qty: scaleOut.qty, price: plan.take_profit_1 });
  }
  if (master && !master.orderId && plan.master_profit != null && reached(plan.side, highWater, plan.master_profit)) {
    toFill.push({ key: "master", qty: master.qty, price: plan.master_profit });
  }
  const stillOpenAfterTargets = tranches(plan).filter(
    (t) => !t.orderId && !toFill.some((f) => f.key === t.key),
  );
  const remainingQty = stillOpenAfterTargets.reduce((n, t) => n + t.qty, 0);

  let stopAction: ReturnType<typeof planStopAdjustment> | null = null;
  // Why the trade is leaving this pass, for the reversal (lib/gann/reverse.ts).
  let caught: ReversalCause | null = null;
  // The level that broke, for the reversal: the stop, or the price a signal left at.
  let brokenLevel: number | null = null;
  if (remainingQty > 1e-9) {
    const gann =
      LIVE_EXIT_RULE !== "bracket"
        ? await readLiveGannExit({
            symbol: plan.symbol,
            side: plan.side,
            entryPrice: plan.entry_price,
            initialStop: plan.stop_loss,
            openedAt: plan.created_at,
            best: highWater,
            // A paper exit row is written at the fill, so `created_at` is the day bought.
            style: await positionTradeStyle(supabase, styleHistory, plan.created_at, plan.entry_order_id, "id"),
          })
        : null;
    stopAction = planStopAdjustment({
      side: plan.side,
      entryPrice: plan.entry_price,
      levels: { stopLoss: plan.stop_loss, takeProfit1: plan.take_profit_1, masterProfit: plan.master_profit },
      highWater,
      lastPrice: price,
      appliedStop: plan.applied_stop,
      gann,
    });
    // `planStopAdjustment` answers "none" once the stop it would place is the
    // one already applied. For a real broker that's right: the stop rests there
    // as an order and fills on its own. Nothing rests in the simulator, so a
    // crossed stop that hasn't moved has to be enforced here or it never fires.
    // This covers a manual stop (`updateProtocolExit` writes `applied_stop`) and
    // any stop an earlier pass placed. It fills at the market price seen now,
    // as a triggered stop-market order would, not at the stop itself.
    if (stopAction.kind === "none" && (plan.side === "long" ? price <= stopAction.stop : price >= stopAction.stop)) {
      stopAction = {
        kind: "close_all",
        stop: stopAction.stop,
        reason: plan.applied_stop_reason ?? stopAction.reason,
        explanation: `Price traded through the stop at ${stopAction.stop.toFixed(2)}, so the position closed at the market.`,
        atMarket: true,
      };
    }
    if (stopAction.kind === "close_all") {
      caught = gann?.exit && stopAction.atMarket ? gann.exit.reason : "stop";
      // Every close here happens with the market already through the stop (or
      // on a Gann signal), so it fills at the price seen now, as the broker
      // exit manager's market close does. Filling a stop the price had already
      // passed at the stop itself paid the trade a better price than the
      // market offered (review finding R-010).
      const fillAt = price;
      // The level that broke, for the reversal. A stop reverses at the stop
      // itself, as the replay (`done(stop, ...)`) and the broker exit manager
      // do, even when the quote gapped through it and the fill came at the
      // market (lib/gann/reverse.ts: "the stop that was hit"). A Gann exit
      // signal reverses where the last shares left. Never the blended exit:
      // after a TP1 scale-out the blend is no price the position left at
      // (2026-10-21).
      brokenLevel = caught === "stop" ? stopAction.stop : fillAt;
      for (const t of stillOpenAfterTargets) toFill.push({ key: t.key, qty: t.qty, price: fillAt });
    }
  }

  // Cover shorts on bad news (A-EXIT-04): offered while the short stays open.
  if (remainingQty > 1e-9 && !caught && plan.side === "short") {
    const news = await readLiveBadNews({ symbol: plan.symbol, side: plan.side, entryPrice: plan.entry_price });
    if (news) run.notes.push(badNewsOffer(plan.symbol, news));
  }

  // ---- Claim: a single conditional write, before anything is mutated. --
  const patch: Record<string, unknown> = {};
  for (const f of toFill) {
    patch[`${f.key}_order_id`] = generatedId();
    patch[`${f.key}_fill_price`] = f.price;
  }
  if (stopAction && stopAction.kind !== "none") {
    patch.applied_stop = stopAction.stop;
    patch.applied_stop_reason = stopAction.reason;
  }
  if (highWater !== plan.high_water) patch.high_water = highWater;

  if (Object.keys(patch).length === 0) return; // nothing to do this pass

  let query = ledgerWriter(supabase)
    .from("protocol_exits")
    .update({ ...patch, last_managed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", plan.id)
    .eq("user_id", userId)
    .eq("status", "working");
  for (const f of toFill) query = query.is(`${f.key}_order_id`, null);

  const { data: claimed } = await query.select("id").maybeSingle();
  if (!claimed) return; // lost the race, or the plan finished under us — next pass reassesses

  // ---- Only the claim's winner executes the actual fills. ---------------
  for (const f of toFill) {
    await executeTrancheFill(supabase, userId, plan, f.qty, f.price);
  }
  if (toFill.length > 0) run.filled++;
  for (const f of toFill) {
    const label = f.key === "scale_out" ? "TP1" : f.key === "master" ? "master target" : "stop";
    run.notes.push(`${plan.symbol}: ${label} reached — took ${f.qty} shares at ${f.price.toFixed(2)}.`);
  }
  if (stopAction && stopAction.kind === "replace_stop") {
    run.notes.push(`${plan.symbol}: ${stopAction.explanation}`);
  }

  // Finished once every tranche carries a fill.
  const finalPlan = { ...plan, ...patch } as SimPlanRow;
  const done = tranches(finalPlan).every((t) => t.orderId);
  if (done) {
    await finish(supabase, userId, finalPlan, run, caught, brokenLevel);
  }
}

/**
 * Execute one tranche's simulated fill — the position/cash mutation only,
 * via the same atomic `executeFill` every other simulated fill goes
 * through (migration `0012` locks the position row for the length of the
 * fill, so this can't race a concurrent poll or a manual close). Trade-log
 * writing happens once in `finish`, after every tranche is in, so the log
 * carries one blended exit price for the whole trade rather than one row
 * per tranche — `executeFill`'s own closed-fill result is intentionally
 * discarded here rather than logged.
 */
async function executeTrancheFill(
  supabase: Supabase,
  userId: string,
  plan: SimPlanRow,
  qty: number,
  price: number,
): Promise<void> {
  const closingSide: "buy" | "sell" = plan.side === "long" ? "sell" : "buy";
  await executeFill(supabase, userId, {
    symbol: plan.symbol,
    assetClass: assetClassOf(plan.symbol),
    side: closingSide,
    qty,
    price,
  });
}

/** Blended exit price across whichever tranches actually filled. */
function blendedExit(plan: SimPlanRow): { price: number; qty: number } {
  const filled = tranches(plan).filter((t) => t.fillPrice != null);
  const qty = filled.reduce((n, t) => n + t.qty, 0);
  const notional = filled.reduce((n, t) => n + t.qty * (t.fillPrice as number), 0);
  return { price: qty > 0 ? notional / qty : plan.entry_price, qty };
}

async function finish(
  supabase: Supabase,
  userId: string,
  plan: SimPlanRow,
  run: SimManageRun,
  caught: ReversalCause | null = null,
  /** Where the last of the position left on a stop or signal; the blended price otherwise. */
  brokenLevel: number | null = null,
  /** The person closed the position by hand: logged as such, and never reversed. */
  manual = false,
): Promise<void> {
  const { price: exitPrice, qty: exitQty } = blendedExit(plan);
  const direction: "buy" | "sell" = plan.side === "long" ? "buy" : "sell";
  const perShare = direction === "buy" ? exitPrice - plan.entry_price : plan.entry_price - exitPrice;
  const dollars = round2(perShare * exitQty);
  const percent = plan.entry_price === 0 ? null : round2((perShare / plan.entry_price) * 100);
  // The protective stop only ever moves (and its reason is only ever set)
  // when `planStopAdjustment` actually closed something — a stop hit before
  // TP1 ("protocol"), the trailing/break-even stop, or the master-reversal
  // close. Any of those means the *last* thing to happen was a stop-driven
  // close, whichever tranches it covered. No stop reason at all means the
  // plan finished purely on tranches reaching their own targets.
  //
  // A close by hand is "manual" whatever the stop had trailed to. Read from
  // the stop reason alone, it logged as a stop-loss once the stop had moved
  // even once, and an automated trade closed by hand (or by the close-all
  // button) was then reversed as if caught (review finding R-009).
  const exitCondition: "tp1" | "master_target" | "stop_loss" | "manual" = manual
    ? "manual"
    : plan.applied_stop_reason === "master_reversal"
      ? "master_target"
      : plan.applied_stop_reason === "trailing" ||
          plan.applied_stop_reason === "break_even" ||
          plan.applied_stop_reason === "protocol" ||
          plan.applied_stop_reason === "manual"
        ? "stop_loss"
        : plan.master_order_id
          ? "master_target"
          : "tp1";

  const { error: logError } = await insertTradeLog(supabase, {
    user_id: userId,
    symbol: plan.symbol.toUpperCase(),
    asset_class: assetClassOf(plan.symbol),
    direction,
    quantity: exitQty,
    entry_timestamp: plan.created_at,
    entry_price: plan.entry_price,
    exit_timestamp: new Date().toISOString(),
    exit_price: exitPrice,
    outcome: dollars >= 0 ? "profit" : "loss",
    profit_loss_dollars: dollars,
    profit_loss_percent: percent,
    exit_condition: exitCondition,
    signal_called: describeSimSignal(plan),
    signal_adherence: "yes",
    exit_plan_id: plan.id,
    // The order that opened the trade, so the record reaches back from the
    // outcome to the order (review finding S-07).
    order_id: plan.entry_order_id,
  });
  if (logError) {
    console.error(`exit-manager-sim: trade log for plan ${plan.id} not written — ${logError.message}`);
  }

  await ledgerWriter(supabase)
    .from("protocol_exits")
    .update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", plan.id)
    .eq("user_id", userId)
    .eq("status", "working");

  // A real stop-loss (not TP1, not the master target) ends the automated
  // plan's lifecycle (lib/automation/stop-out.ts), and a trade the rules
  // reverse on (lib/gann/reverse.ts, Q15) is reversed: automatically for a
  // trade automation placed, offered in a note for one a person placed.
  if (exitCondition === "stop_loss") {
    const cause: ReversalCause = caught ?? "stop";
    const extreme = plan.high_water ?? plan.entry_price;
    let sourcePlanId: string | null = null;
    if (plan.entry_order_id) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("source_plan_id")
        .eq("id", plan.entry_order_id)
        .maybeSingle();
      sourcePlanId = (orderRow?.source_plan_id as string | null) ?? null;
    }
    if (sourcePlanId) {
      await handleAutomatedStopOut(supabase, userId, {
        planId: sourcePlanId,
        entryFillPrice: plan.entry_price,
        stoppedAt: new Date().toISOString(),
        exitPrice,
        cause,
        brokenLevel: brokenLevel ?? exitPrice,
        extreme,
      }).catch((err) => {
        console.error(`exit-manager-sim: stop-out handling for plan ${sourcePlanId} failed — ${String(err)}`);
      });
    } else {
      const offer = reversalOffer({ symbol: plan.symbol, side: plan.side, cause, brokenLevel: brokenLevel ?? exitPrice, extreme });
      if (offer) run.notes.push(offer);
    }
    // A-PYRAMID-07: a trailing stop while the trend still runs this way is
    // bought again on the reaction (lib/gann/rebuy.ts). Offered in a note,
    // for automation's trades as well: no plan is seeded for it yet.
    const rebuy = await readLiveRebuy({ symbol: plan.symbol, side: plan.side, cause, extreme, entryPrice: plan.entry_price });
    if (rebuy) run.notes.push(rebuyOffer(plan.symbol, rebuy));
  }

  run.closed++;
  run.notes.push(`${plan.symbol}: exit plan finished — logged at ${exitPrice.toFixed(2)}.`);
}

function describeSimSignal(plan: SimPlanRow): string {
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const master = plan.master_profit != null ? `, master ${usd(plan.master_profit)}` : "";
  return `Protocol levels — stop ${usd(plan.stop_loss)}, TP1 ${usd(plan.take_profit_1)}${master}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * End a plan because the user closed the position by hand (the manual escape
 * hatch — mirrors `closePlanForSymbol` in the real exit manager). Whatever
 * tranches never got the chance to fill are attributed to this close instead.
 */
export async function closeSimPlanForSymbol(
  supabase: Supabase,
  userId: string,
  symbol: string,
  exitPrice: number,
): Promise<SimPlanRow | null> {
  // Scoped to mode = 'paper' — a live plan for the same symbol (a user can
  // hold both a paper and a live position in the same name) must not be
  // matched and closed by a paper close action.
  const { data } = await supabase
    .from("protocol_exits")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol.toUpperCase())
    .eq("mode", "paper")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const plan = normalizePlan(data);
  if (plan.status !== "working") return plan;

  const generatedId = () => `sim_manual_${Date.now()}`;
  const patch: Record<string, unknown> = {};
  for (const t of tranches(plan)) {
    if (!t.orderId) {
      patch[`${t.key}_order_id`] = generatedId();
      patch[`${t.key}_fill_price`] = exitPrice;
    }
  }
  const finalPlan = { ...plan, ...patch } as SimPlanRow;
  const run = idle();
  await finish(supabase, userId, finalPlan, run, null, null, true);
  return finalPlan;
}
