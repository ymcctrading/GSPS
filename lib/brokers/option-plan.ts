/**
 * The owner's options plan (owner, 2026-11-13: "Go with A"; "Add the rules
 * to the live account as well. This what we're going to use to trade"). It
 * replaces the day's momentum rules on both of the owner's accounts: his
 * connected live account and, as practice at the live account's size, the
 * paper account. Plan text: project files, `options-plan/`, section 4.
 *
 * Each trade is a stock trade the app itself opened, carried as an option:
 * - **Selection.** An automated position the owner's Automated Portfolio
 *   Manager opened in the simulator (an armed plan, entered on the
 *   pullback once its entry confirmed on closed bars, `lib/trade/place-order.ts`),
 *   whose setup scores Execute grade (`EXECUTE_SCORE_THRESHOLD` or more of
 *   nine) in the trade's direction, followed within the hour. A call for a
 *   long, a put for a short. Monday to Thursday only, and not on the dates
 *   in `OPTION_PLAN.noEntryDates`.
 * - **Contract.** At least 7 calendar days out (never the expiring week),
 *   a spread within 20% of the ask (half the ask while a trade's budget is
 *   under $200, the owner's choice for the small account), the strike
 *   nearest the trade's TP1 when it has one (the owner's way: a cheaper
 *   contract out of the money at the target, sold early on a profit), open interest of 100 or more, the one
 *   closest to the money that a third of the account buys, then the
 *   expiration nearest 30 days. None qualifying means no trade.
 * - **Exits, whichever first.** The stock reaches the trade's TP1, breaks
 *   its stop, or the app closes the stock trade; the option doubles (a
 *   resting limit at +100%, or +50% while a trade's budget is under $200,
 *   the owner's choice for the small account); it falls to half its cost; once it has been up
 *   50% it is sold back at its cost (break-even); and every contract is sold
 *   in the last two runs of a Friday session.
 * - **Brakes.** At most two open (one under $20 of equity); none under $15
 *   or once the account is down 10% on the day; none on the day of a second
 *   loss in a row or the trading day after it, nor in a run that sold (its
 *   sale is not yet in the orders read); and one day trade always kept for
 *   an emergency same-day exit (a stop, a cut or the break-even) of each
 *   contract bought today, so a same-day take-profit uses a day trade only
 *   when another stays free.
 *
 * The half-hour schedule checks the stop, cut and break-even only twice an
 * hour: an option takes no stop order. Engineering choices, labelled: the
 * hour's follow window, the 15-minute entry cutoff, the Friday close-out
 * runs, the 45-day reach and the strike band read.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelOrder,
  closePosition,
  getOpenOrdersNested,
  getOrder,
  listOptionContracts,
  listOrders,
  placeOrder,
  type AlpacaAccount,
  type AlpacaCreds,
  type AlpacaOrder,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { fetchDayRanges, fetchOptionSnapshots } from "@/lib/data/alpaca";
import { LIVE_OPTION_BUDGET_FRACTION, chooseLiveContract, ceilTick, liveOptionBudget, type ChainSnapshot } from "@/lib/brokers/live-options";
import { MOMENTUM_DAY_LOSS_HOLD, MOMENTUM_EQUITY_FLOOR, nyDate, nyMinutes, nyWeekday } from "@/lib/brokers/live-momentum";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { tradingDisabled } from "@/lib/trade/kill-switch";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";

export const OPTION_PLAN = {
  /** Owner's plan: the option doubles. */
  takeProfit: 1,
  /** Owner, 2026-11-13 ("$5 wins are good. smaller wins are ok"): the take-profit while a trade's budget is under `smallBudget`. */
  smallBudgetTakeProfit: 0.5,
  /** Owner's plan: sold at half its cost. */
  cut: 0.5,
  /** Owner's plan: once up this much, the stop is the cost. */
  breakEvenAfter: 0.5,
  maxOpen: 2,
  /** Under this equity, one open trade at a time. */
  smallAccount: 20,
  minDays: 7,
  maxDays: 45,
  maxSpreadFrac: 0.2,
  /**
   * Owner, 2026-11-13 (decision card, "Loosen the spread rule"): while a
   * trade's budget is under `smallBudget`, a spread up to half the ask is
   * taken. A contract must still be bid. Engineering choices: the half, and
   * $200 (the cheapest contract within 20% on that day's setups was $187).
   */
  smallBudgetSpreadFrac: 0.5,
  smallBudget: 200,
  minOpenInterest: 100,
  minScore: EXECUTE_SCORE_THRESHOLD,
  /** Losses in a row that stop entries for the next trading day. */
  lossesInARow: 2,
  /** Day trades always kept for an emergency same-day exit. */
  dayTradeReserve: 1,
  /** No new entries (the Thanksgiving week's change window). */
  noEntryDates: ["2026-11-25", "2026-11-27"] as readonly string[],
  /** Engineering choice: a simulator open older than this is not followed. */
  followWindowMs: 60 * 60 * 1000,
  /** Engineering choice: no entry this close to the close. */
  entryStopsBeforeCloseMin: 15,
  /** Engineering choice: Friday's sales start this close to the close (two runs). */
  closeOutBeforeCloseMin: 55,
  /** Engineering choices: chains read in one run, and the strike band read. */
  chainsPerRun: 3,
  strikeBand: 0.5,
} as const;

/**
 * Same-day test days on the paper account only (owner, 2026-11-13: "Have
 * the paper account take some same day trades today, just to test"). On
 * these New York dates paper may enter on any weekday, follows the day's
 * Execute-grade setups as well as the app's own trades (the runner adds
 * them), and sells everything before the close. Never read for live.
 */
export const PAPER_TEST_DAYS: readonly string[] = ["2026-11-13"];
/** Engineering choice: a same-day test buys nothing in the session's last hour. */
const PAPER_TEST_ENTRY_STOPS_BEFORE_CLOSE_MIN = 60;

const PDT_EQUITY = 25_000;
const PDT_MAX = 3;
const CLIENT_PREFIX = "gsps-plan-";

/** A stock trade the simulator holds, as the plan reads it. */
export interface PlanStockLine {
  positionId: string;
  symbol: string;
  side: "long" | "short";
  stop: number | null;
  tp1: number | null;
  openedAt: string;
  automated: boolean;
  /** Stocks when unset. */
  assetClass?: string;
  /** The setup's current score out of nine, in the trade's direction (null when unread). */
  score: number | null;
}

export type PlanExitReason = "trade_closed" | "stock_stop" | "cut" | "break_even" | "tp1" | "close_out";
/** Exits that may spend the reserved day trade. */
export const EMERGENCY_EXITS: ReadonlySet<PlanExitReason> = new Set(["trade_closed", "stock_stop", "cut", "break_even"]);

/** Why a held contract is sold this run, or null. */
export function planExit(p: {
  avgEntry: number;
  current: number;
  /** The option has been up `breakEvenAfter` at a run. */
  armed: boolean;
  /** The stock trade the contract carries, or null once the app has closed it. */
  stock: { side: "long" | "short"; price: number; stop: number | null; tp1: number | null } | null;
  toClose: number;
  weekday: number;
  /** A same-day test day (paper only): sold before the close on any weekday. */
  sameDay?: boolean;
}): PlanExitReason | null {
  if (!p.stock) return "trade_closed";
  const { side, price, stop, tp1 } = p.stock;
  if (Number.isFinite(price) && stop != null && (side === "long" ? price <= stop : price >= stop)) return "stock_stop";
  const priced = Number.isFinite(p.current) && p.avgEntry > 0;
  if (priced && p.current <= p.avgEntry * (1 - OPTION_PLAN.cut) + 1e-9) return "cut";
  if (priced && p.armed && p.current <= p.avgEntry) return "break_even";
  if (Number.isFinite(price) && tp1 != null && (side === "long" ? price >= tp1 : price <= tp1)) return "tp1";
  if ((p.weekday === 5 || p.sameDay) && !(p.toClose > OPTION_PLAN.closeOutBeforeCloseMin)) return "close_out";
  return null;
}

const EXIT_NOTE: Record<PlanExitReason, string> = {
  trade_closed: "The app closed the stock trade; sold.",
  stock_stop: "The stock broke the trade's stop; sold.",
  cut: "Worth half its cost; sold.",
  break_even: "Back to its cost after a 50% gain; sold at break-even.",
  tp1: "The stock reached the trade's TP1; sold.",
  close_out: "Close-out before the bell (Friday, or a same-day test); sold.",
};

export interface PlanGateInput {
  minutes: number;
  toClose: number;
  weekday: number;
  today: string;
  marketOpen: boolean;
  halted: boolean;
  equity: number;
  lastEquity: number;
  openContracts: number;
  /** Day trades free after those spoken for (Infinity at $25,000 and over). */
  dayTradesFree: number;
  /** The New York date of the second loss in a row, when the last two closed trades lost. */
  lossStreakDate: string | null;
  /** A same-day test day (paper only): any weekday, entries stop an hour before the close. */
  sameDay?: boolean;
}

/** The next weekday after `day` (YYYY-MM-DD). */
export function nextWeekday(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Why no entry is made this run, or null when one may be. */
export function planEntryHold(g: PlanGateInput): string | null {
  if (g.halted) return "Trading is halted.";
  if (!g.marketOpen) return "Market closed.";
  if (g.sameDay) {
    if (!(g.toClose >= PAPER_TEST_ENTRY_STOPS_BEFORE_CLOSE_MIN)) return "Same-day test: no entry in the last hour.";
  } else {
    if (g.weekday < 1 || g.weekday > 4) return "Entries Monday to Thursday only (held overnight; flat by Friday's close).";
    if (OPTION_PLAN.noEntryDates.includes(g.today)) return `No new entries on ${g.today} (the plan's holiday window).`;
    if (!(g.toClose >= OPTION_PLAN.entryStopsBeforeCloseMin)) return "Too close to the close for an entry.";
  }
  if (!(g.equity >= MOMENTUM_EQUITY_FLOOR)) return `Account under the $${MOMENTUM_EQUITY_FLOOR} floor.`;
  if (!(g.lastEquity > 0) || (g.equity - g.lastEquity) / g.lastEquity <= -MOMENTUM_DAY_LOSS_HOLD) return `Account down ${MOMENTUM_DAY_LOSS_HOLD * 100}% or more today.`;
  if (g.lossStreakDate && (g.today === g.lossStreakDate || g.today === nextWeekday(g.lossStreakDate))) {
    return `${OPTION_PLAN.lossesInARow} losses in a row (the last on ${g.lossStreakDate}): no entry until the trading day after next.`;
  }
  const cap = g.equity < OPTION_PLAN.smallAccount ? 1 : OPTION_PLAN.maxOpen;
  if (g.openContracts >= cap) return `${cap} trade${cap === 1 ? "" : "s"} already open${cap === 1 ? ` (under $${OPTION_PLAN.smallAccount})` : ""}.`;
  if (!(g.dayTradesFree >= OPTION_PLAN.dayTradeReserve)) return "No day trade free to keep in reserve for an emergency exit.";
  return null;
}

/** The widest spread taken, as a fraction of the ask, at this trade budget. */
export function planSpreadLimit(budget: number): number {
  return budget < OPTION_PLAN.smallBudget - 1e-6 ? OPTION_PLAN.smallBudgetSpreadFrac : OPTION_PLAN.maxSpreadFrac;
}

/** The take-profit gain at this trade budget: +50% while small, else +100%. */
export function planTakeProfitGain(budget: number): number {
  return budget < OPTION_PLAN.smallBudget - 1e-6 ? OPTION_PLAN.smallBudgetTakeProfit : OPTION_PLAN.takeProfit;
}

/** The resting sell at `gain` (default +100%): in cents, or on the coarse tick. */
export function planTakeProfit(avg: number, gain: number = OPTION_PLAN.takeProfit): { fine: number; coarse: number } {
  const target = avg * (1 + gain);
  return { fine: Number((Math.ceil(target * 100 - 1e-7) / 100).toFixed(2)), coarse: ceilTick(target) };
}

const num = (v: unknown): number => (typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DONE = ["filled", "canceled", "expired", "rejected", "done_for_day"];

/** The simulator position a plan order carries in its client order id. */
export function planTradeId(clientOrderId: string | undefined): string | null {
  const m = /^gsps-plan-(?:tp-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(clientOrderId ?? "");
  return m ? m[1] : null;
}

/**
 * The New York date of the second of the last two closed trades when both
 * lost, else null. A trade is a contract the plan bought that is no longer
 * held, priced by its filled buys and sells.
 */
export function lossStreakDate(orders: AlpacaOrder[], heldSymbols: Set<string>): string | null {
  const planSyms = new Set(orders.filter((o) => o.side === "buy" && (o.client_order_id ?? "").startsWith(CLIENT_PREFIX) && num(o.filled_qty) > 0).map((o) => o.symbol));
  const trades: { pnl: number; at: number }[] = [];
  for (const sym of planSyms) {
    if (heldSymbols.has(sym)) continue;
    const filled = orders.filter((o) => o.symbol === sym && num(o.filled_qty) > 0 && Number.isFinite(num(o.filled_avg_price)));
    const side = (s: string) => filled.filter((o) => o.side === s);
    const avg = (os: AlpacaOrder[]) => {
      const q = os.reduce((a, o) => a + num(o.filled_qty), 0);
      return q > 0 ? os.reduce((a, o) => a + num(o.filled_qty) * num(o.filled_avg_price), 0) / q : NaN;
    };
    const sells = side("sell");
    const at = Math.max(...sells.map((o) => Date.parse(o.filled_at ?? o.updated_at ?? "")).filter(Number.isFinite));
    const pnl = avg(sells) - avg(side("buy"));
    if (sells.length > 0 && Number.isFinite(pnl) && Number.isFinite(at)) trades.push({ pnl, at });
  }
  trades.sort((a, b) => b.at - a.at);
  const last = trades.slice(0, OPTION_PLAN.lossesInARow);
  if (last.length < OPTION_PLAN.lossesInARow || !last.every((t) => t.pnl < 0)) return null;
  return nyDate(last[0].at);
}

export interface PlanResult {
  placed: number;
  held: string[];
  errors: string[];
}

interface EventRow {
  position_id: string;
  symbol: string;
  side: "long";
  action: string;
  qty: number | null;
  sim_price: number | null;
  stop_price: number | null;
  broker_order_id: string | null;
  status: string;
  note: string | null;
  fill_price?: number | null;
  filled_qty?: number | null;
  filled_at?: string | null;
}

async function logEvent(supabase: SupabaseClient, row: EventRow, mode: "paper" | "live"): Promise<void> {
  const { error } = await supabase.from("paper_mirror_events").insert({ ...row, mode });
  if (error) throw new Error(`paper_mirror_events: ${error.message}`);
}

const fills = (o: AlpacaOrder | null) =>
  o?.status === "filled" ? { fill_price: num(o.filled_avg_price), filled_qty: num(o.filled_qty), filled_at: o.filled_at ?? null } : {};

async function settle(creds: AlpacaCreds, id: string): Promise<AlpacaOrder> {
  let o = await getOrder(creds, id);
  for (let i = 0; i < 3 && !DONE.includes(o.status); i++) {
    await sleep(500);
    o = await getOrder(creds, id);
  }
  return o;
}

async function restTakeProfit(creds: AlpacaCreds, symbol: string, qty: number, avg: number, clientOrderId: string, gain: number): Promise<{ order: AlpacaOrder; tp: number }> {
  const { fine, coarse } = planTakeProfit(avg, gain);
  try {
    return { order: (await placeOrder(creds, { symbol, side: "sell", qty, type: "limit", limitPrice: fine, timeInForce: "day", clientOrderId })) as AlpacaOrder, tp: fine };
  } catch (err) {
    if (coarse === fine) throw err;
    return { order: (await placeOrder(creds, { symbol, side: "sell", qty, type: "limit", limitPrice: coarse, timeInForce: "day", clientOrderId: `${clientOrderId}-c` })) as AlpacaOrder, tp: coarse };
  }
}

/**
 * One pass of the plan on one account. `lines` are the simulator's open
 * stock trades for the owner (with their scores); `mirrorSymbols` are
 * symbols the mirror owns (never touched). Only contracts the plan bought
 * are managed: an option traded by hand, or by the retired momentum rules,
 * is left alone.
 */
export async function optionPlanPass(
  supabase: SupabaseClient,
  creds: AlpacaCreds,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  clock: { isOpen: boolean; nextClose: number },
  lines: PlanStockLine[],
  mirrorSymbols: Set<string>,
  deadline: number,
  now = Date.now(),
  opts: { mode?: "paper" | "live"; fixedBudget?: number } = {},
): Promise<PlanResult> {
  const mode = opts.mode ?? "live";
  const sameDay = mode === "paper" && PAPER_TEST_DAYS.includes(nyDate(now));
  const result: PlanResult = { placed: 0, held: [], errors: [] };
  if (!clock.isOpen) return result;
  const minutes = nyMinutes(now);
  const toClose = (clock.nextClose - now) / 60_000;
  const today = nyDate(now);
  const weekday = nyWeekday(now);
  const equity = num(account.equity);
  const dayTrades = num(account.daytrade_count ?? NaN);
  const optionsBp = num((account as unknown as { options_buying_power?: string }).options_buying_power);
  const cash = Number.isFinite(optionsBp) ? Math.min(num(account.cash), optionsBp) : num(account.cash);
  const budget = opts.fixedBudget != null ? Math.min(opts.fixedBudget, liveOptionBudget(equity, cash)) : liveOptionBudget(equity, cash);
  // The take-profit follows today's trade budget (a third of the account): +50% while small.
  const tpGain = planTakeProfitGain(opts.fixedBudget != null ? opts.fixedBudget : LIVE_OPTION_BUDGET_FRACTION * equity);
  const tpLabel = `+${Math.round(tpGain * 100)}%`;

  const recent = await listOrders(creds, { since: new Date(now - 30 * 86_400_000), maxPages: 1 });
  const planBuys = recent.filter((o) => o.side === "buy" && (o.client_order_id ?? "").startsWith(CLIENT_PREFIX) && num(o.filled_qty) > 0);
  const planSymbols = new Set(planBuys.map((o) => o.symbol));
  const held = positions.filter((p) => parseOccSymbol(p.symbol) && planSymbols.has(p.symbol) && !mirrorSymbols.has(p.symbol) && num(p.qty) > 0);
  const boughtAt = (o: AlpacaOrder) => o.filled_at ?? o.updated_at ?? o.submitted_at ?? o.created_at ?? null;
  const boughtToday = new Set(planBuys.filter((o) => { const t = boughtAt(o); return t != null && nyDate(Date.parse(t)) === today; }).map((o) => o.symbol));
  const tradeIdFor = (symbol: string) => planTradeId(planBuys.find((o) => o.symbol === symbol)?.client_order_id);
  const lineById = new Map(lines.map((l) => [l.positionId, l]));
  let open = await getOpenOrdersNested(creds);
  const restingSells = (symbol: string) => open.filter((o) => o.symbol === symbol && o.side === "sell");

  // The stock price behind each contract held.
  const underlyings = [...new Set(held.map((p) => parseOccSymbol(p.symbol)?.underlying ?? "").filter(Boolean))];
  const ranges = underlyings.length > 0 ? await fetchDayRanges(underlyings).catch(() => new Map<string, { price: number }>()) : new Map<string, { price: number }>();

  // Contracts already up 50% at an earlier run.
  const ids = held.map((p) => tradeIdFor(p.symbol)).filter((x): x is string => !!x);
  const armed = new Set<string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("paper_mirror_events").select("position_id").eq("mode", mode).eq("action", "plan_breakeven_armed").in("position_id", ids);
    if (error) result.errors.push(`plan break-even read: ${error.message}`);
    for (const r of data ?? []) armed.add(r.position_id as string);
  }

  // Day trades: a same-day contract with a sell already resting holds one;
  // an emergency exit may take the last free one; any other same-day sell
  // only while one more stays free.
  let free = equity >= PDT_EQUITY ? Infinity : Number.isFinite(dayTrades) ? Math.max(0, PDT_MAX - dayTrades) : 0;
  for (const p of held) if (boughtToday.has(p.symbol) && restingSells(p.symbol).length > 0) free -= 1;
  free = Math.max(free, 0);

  const plans = held.map((p) => {
    const id = tradeIdFor(p.symbol);
    const line = id ? lineById.get(id) : undefined;
    const avg = num(p.avg_entry_price);
    const current = num(p.current_price);
    const u = parseOccSymbol(p.symbol)?.underlying ?? "";
    const stock = line ? { side: line.side, price: num(ranges.get(u)?.price), stop: line.stop, tp1: line.tp1 } : null;
    const reason = planExit({ avgEntry: avg, current, armed: !!id && armed.has(id), stock, toClose, weekday, sameDay });
    return { p, id: id ?? randomUUID(), avg, current, reason };
  });
  // Emergencies first, so they get the reserve.
  plans.sort((a, b) => Number(!!b.reason && EMERGENCY_EXITS.has(b.reason)) - Number(!!a.reason && EMERGENCY_EXITS.has(a.reason)));

  const stillHeld: typeof plans = [];
  // Sold this run; anything else (held back, an exit that errored, past the deadline) still counts as open.
  const sold = new Set<string>();
  for (const x of plans) {
    if (Date.now() > deadline) break;
    const { p, id, avg, current, reason } = x;
    try {
      if (!reason) {
        stillHeld.push(x);
        continue;
      }
      if (boughtToday.has(p.symbol) && restingSells(p.symbol).length === 0) {
        const need = EMERGENCY_EXITS.has(reason) ? 1 : 1 + OPTION_PLAN.dayTradeReserve;
        if (!(free >= need)) {
          result.held.push(`${p.symbol}: ${reason} sale held to the next session (day trades).`);
          stillHeld.push(x);
          continue;
        }
        free -= 1;
      }
      for (const o of restingSells(p.symbol)) {
        await cancelOrder(creds, o.id).catch(() => undefined);
        const c = await settle(creds, o.id).catch(() => null);
        if (c && c.status === "filled") throw new Error(`take-profit ${o.id} filled before the sale; nothing more to sell.`);
      }
      open = open.filter((o) => o.symbol !== p.symbol);
      let out: AlpacaOrder;
      try {
        out = (await closePosition(creds, p.symbol)) as AlpacaOrder;
      } catch {
        await sleep(1000);
        out = (await closePosition(creds, p.symbol)) as AlpacaOrder;
      }
      result.placed++;
      sold.add(p.symbol);
      const s = await settle(creds, out.id).catch(() => out);
      await logEvent(supabase, {
        position_id: id, symbol: p.symbol, side: "long", action: "plan_close", qty: num(p.qty), sim_price: current, stop_price: null,
        broker_order_id: out.id, status: s.status, note: `${EXIT_NOTE[reason]} (${current} against a cost of ${avg})`, ...fills(s),
      }, mode);
    } catch (err) {
      result.errors.push(`plan exit ${p.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const { p, id, avg, current } of stillHeld) {
    if (Date.now() > deadline) break;
    try {
      if (avg > 0 && Number.isFinite(current) && current >= avg * (1 + OPTION_PLAN.breakEvenAfter) - 1e-9 && !armed.has(id)) {
        armed.add(id);
        await logEvent(supabase, { position_id: id, symbol: p.symbol, side: "long", action: "plan_breakeven_armed", qty: num(p.qty), sim_price: current, stop_price: avg, broker_order_id: null, status: "armed", note: `Up 50% (${current} against ${avg}); the stop is now the cost.` }, mode);
      }
      if (restingSells(p.symbol).length > 0 || !(avg > 0)) continue;
      if (boughtToday.has(p.symbol)) {
        if (!(free >= 1 + OPTION_PLAN.dayTradeReserve)) continue;
        free -= 1;
      }
      const { order: o, tp } = await restTakeProfit(creds, p.symbol, num(p.qty), avg, `${CLIENT_PREFIX}tp-${id}-${now}`, tpGain);
      result.placed++;
      await logEvent(supabase, { position_id: id, symbol: p.symbol, side: "long", action: "plan_take_profit", qty: num(p.qty), sim_price: null, stop_price: null, broker_order_id: o.id, status: o.status, note: `Limit ${tp} (${tpLabel}).` }, mode);
    } catch (err) {
      result.errors.push(`plan take-profit ${p.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const heldSyms = new Set(held.map((p) => p.symbol).filter((sym) => !sold.has(sym)));
  // A sale this run is not in this run's order read, so the loss streak
  // can't see it: a run that sold buys nothing, and the next run reads it.
  if (sold.size > 0) {
    result.held.push("plan: sold this run; the next run decides any entry on fresh orders.");
    return result;
  }
  // One day trade kept for each contract bought today with no sell resting,
  // and one more for the contract an entry would add.
  const sameDayUnreserved = [...heldSyms].filter((sym) => boughtToday.has(sym) && restingSells(sym).length === 0).length;
  const hold = planEntryHold({
    minutes, toClose, weekday, today, marketOpen: clock.isOpen, halted: tradingDisabled(), equity, lastEquity: num(account.last_equity),
    openContracts: heldSyms.size, dayTradesFree: free - sameDayUnreserved, lossStreakDate: lossStreakDate(recent, heldSyms), sameDay,
  });
  if (hold) {
    result.held.push(`plan: ${hold}`);
    return result;
  }

  // The app's own trades, Execute grade, opened within the hour, not yet carried.
  const carried = new Set(planBuys.map((o) => planTradeId(o.client_order_id)).filter(Boolean));
  const heldUnderlyings = new Set([...heldSyms].map((sym) => parseOccSymbol(sym)?.underlying ?? ""));
  const picks = lines
    .filter((l) => l.automated && (l.assetClass ?? "us_equity") === "us_equity" && l.stop != null && !carried.has(l.positionId))
    .filter((l) => now - Date.parse(l.openedAt) <= OPTION_PLAN.followWindowMs && !heldUnderlyings.has(l.symbol.toUpperCase()))
    .filter((l) => l.score != null && l.score >= OPTION_PLAN.minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.openedAt) - Date.parse(a.openedAt))
    .slice(0, OPTION_PLAN.chainsPerRun);
  if (picks.length === 0) {
    result.held.push("plan: no Execute-grade trade opened by the app within the hour.");
    return result;
  }
  const reasons: string[] = [];
  try {
    const prices = await fetchDayRanges(picks.map((l) => l.symbol.toUpperCase()));
    for (const l of picks) {
      if (Date.now() > deadline) break;
      const sym = l.symbol.toUpperCase();
      const price = num(prices.get(sym)?.price);
      if (!(price > 0)) {
        reasons.push(`${sym}: no price.`);
        continue;
      }
      const type = l.side === "long" ? "call" : "put";
      const start = nyDate(now + OPTION_PLAN.minDays * 86_400_000);
      const end = nyDate(now + OPTION_PLAN.maxDays * 86_400_000);
      const band = OPTION_PLAN.strikeBand;
      const lo = type === "call" ? price * (1 - band / 5) : price * (1 - band);
      const hi = type === "call" ? price * (1 + band) : price * (1 + band / 5);
      const [chain, contracts] = await Promise.all([
        fetchOptionSnapshots({
          underlying: sym,
          filters: { type, expiration_date_gte: start, expiration_date_lte: end, strike_price_gte: String(Math.floor(lo)), strike_price_lte: String(Math.ceil(hi)) },
        }).catch(() => ({})) as Promise<Record<string, ChainSnapshot>>,
        listOptionContracts(creds, { underlying: sym, type, price, pct: band, expirationBefore: end }).catch(() => []),
      ]);
      const oi = new Map<string, number>();
      for (const c of contracts) {
        const n = num(c.open_interest);
        if (Number.isFinite(n)) oi.set(c.symbol.toUpperCase(), n);
      }
      const c = chooseLiveContract(chain, {
        underlying: sym, type, underlyingPrice: price, budget, today, minDays: OPTION_PLAN.minDays, maxDays: OPTION_PLAN.maxDays,
        maxSpreadFrac: planSpreadLimit(budget), strikeTarget: l.tp1, openInterest: oi, minOpenInterest: OPTION_PLAN.minOpenInterest,
      });
      if ("reason" in c) {
        reasons.push(`${sym} (${l.score}/9): ${c.reason}`);
        continue;
      }
      if (Date.now() > deadline) break;
      const order = (await placeOrder(creds, { symbol: c.symbol, side: "buy", qty: c.qty, type: "limit", limitPrice: c.limitPrice, timeInForce: "day", clientOrderId: `${CLIENT_PREFIX}${l.positionId}-${now}` })) as AlpacaOrder;
      result.placed++;
      let s = await settle(creds, order.id);
      if (!DONE.includes(s.status)) {
        await cancelOrder(creds, order.id).catch(() => undefined);
        s = await settle(creds, order.id);
      }
      await logEvent(supabase, {
        position_id: l.positionId, symbol: c.symbol, side: "long", action: "plan_open", qty: c.qty, sim_price: c.ask, stop_price: l.stop,
        broker_order_id: order.id, status: s.status,
        note: `${sym} ${l.side} (${l.score}/9) at ${price}, stop ${l.stop}, TP1 ${l.tp1 ?? "none"}; ${type} ${c.strike} ${c.expiration}, limit ${c.limitPrice} (budget $${budget.toFixed(2)}).`,
        ...fills(s),
      }, mode);
      const got = num(s.filled_qty);
      // Bought today: its take-profit rests today only with a day trade to spare beyond the reserve.
      if (got > 0 && free >= 1 + OPTION_PLAN.dayTradeReserve) {
        const { order: tpOrder, tp } = await restTakeProfit(creds, c.symbol, got, num(s.filled_avg_price), `${CLIENT_PREFIX}tp-${l.positionId}-${now}`, tpGain);
        result.placed++;
        await logEvent(supabase, { position_id: l.positionId, symbol: c.symbol, side: "long", action: "plan_take_profit", qty: got, sim_price: null, stop_price: null, broker_order_id: tpOrder.id, status: tpOrder.status, note: `Limit ${tp} (${tpLabel}).` }, mode);
      }
      return result;
    }
    result.held.push(`plan: nothing bought. ${reasons.join(" | ")}`.slice(0, 800));
  } catch (err) {
    result.errors.push(`plan entry: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}
