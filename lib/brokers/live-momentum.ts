/**
 * Momentum options on the owner's own live account (owner, 2026-11-13: "I'd
 * prefer to find a top riser/caller and ride its momentum throughout the
 * day, Thats how we can expedite this process"; "You are to buy options";
 * "I ok'd trades up to 33% of what is currently in the account (up until
 * we've amassed enough money to use [the method])"; "If we made three
 * $10 trades today, and profited $5 from each trade. Thats a win").
 *
 * This is the owner's own trading on his own account, by his word, and not
 * the platform's method: it reaches no scan, score, plan, member or replay.
 * It runs only inside the mirror's run: on his connected live keys (stopped
 * by his Pause, `LIVE_MIRROR_DISABLED` or `TRADING_DISABLED`), and on his
 * paper account as practice at the live account's size ("I thought I asked
 * you to place practice option trades", 2026-11-13; `PAPER_MIRROR_DISABLED`).
 *
 * Each half-hour run in the session:
 * - Exits first. A contract held is sold once it is worth half what it cost
 *   (the premium is the whole risk, so this keeps half of it), and in the
 *   runs within 55 minutes of the close (the broker's clock, so a half day
 *   closes early too); a resting day limit takes the +50% gain the
 *   owner named ($10 to $15). A same-day sell the day-trade rule would
 *   refuse is held to the next session.
 * - Then at most one entry, from 10:00 to 15:00 New York: the day's biggest
 *   mover over $5 and 5% that is still running (within 3% of its high for a
 *   riser, its low for a faller), a call on a riser, a put on a faller, the
 *   contract closest to the money that a third of the account buys, 1 to 21
 *   days out.
 * - No entry once three are open, three were bought today, or the account
 *   is under its floor or down its day limit. With the day trades used (3 in
 *   five sessions under $25,000), a buy is held to the next session instead
 *   of sold the same day, and none is made on a Friday: the owner wants out
 *   of every trade by the end of the week ("I would actually prefer to be
 *   out of all trades by the end of the trading week").
 * Every figure here is an engineering choice the owner can change, except
 * the third (his) and the +50% (his example).
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelOrder,
  closePosition,
  getOpenOrdersNested,
  getOrder,
  listOrders,
  placeOrder,
  type AlpacaAccount,
  type AlpacaCreds,
  type AlpacaOrder,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { fetchDayRanges, fetchMovers, fetchOptionSnapshots, type Mover } from "@/lib/data/alpaca";
import { chooseLiveContract, ceilTick, liveOptionBudget, type ChainSnapshot } from "@/lib/brokers/live-options";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { tradingDisabled } from "@/lib/trade/kill-switch";

export const MOMENTUM = {
  /** New York minutes: entries from 10:00 to 15:00. */
  entryFrom: 10 * 60,
  entryUntil: 15 * 60,
  /** No entry this close to the session's close (a half day ends early). */
  entryStopsBeforeCloseMin: 80,
  /**
   * Close-out begins this close to the session's close: on the half-hour
   * schedule that is two runs (about 3:10 and 3:40 on a full day), so one
   * refused or raced sell is tried again before the bell.
   */
  closeOutBeforeCloseMin: 55,
  minPrice: 5,
  minMovePct: 5,
  /** Still running: within this fraction of the day's high (riser) or low (faller). */
  maxPullback: 0.03,
  /** Owner's example: $10 that makes $5. */
  takeProfit: 0.5,
  /** Sold once worth half its cost. */
  cut: 0.5,
  maxOpen: 3,
  maxEntriesADay: 3,
  /** Never a contract that expires the next session (a hold overnight would ride it into expiry). */
  minDays: 2,
  maxDays: 21,
  /** Movers whose chains are read in one run, strongest first. */
  chainsPerRun: 5,
  /** Strikes read around the price (a cheap contract on a big mover sits far out). */
  strikeBand: 0.5,
} as const;

/** The owner's floor and day-loss hold, as the live mirror keeps them. */
export const MOMENTUM_EQUITY_FLOOR = 15;
export const MOMENTUM_DAY_LOSS_HOLD = 0.1;
const PDT_EQUITY = 25_000;
const PDT_MAX = 3;
const CLIENT_PREFIX = "gsps-momo-";

/** Minutes since midnight in New York. */
export function nyMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

/** The New York calendar date, YYYY-MM-DD. */
export function nyDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export interface MomentumPick {
  symbol: string;
  type: "call" | "put";
  price: number;
  pct: number;
}

/**
 * The movers worth a contract, strongest first: over the price floor, moving
 * at least the minimum, still running, and not already held.
 */
export function rankMovers(
  movers: { gainers: Mover[]; losers: Mover[] },
  ranges: Map<string, { price: number; high: number; low: number }>,
  heldUnderlyings: Set<string>,
): MomentumPick[] {
  const out: MomentumPick[] = [];
  const consider = (m: Mover, type: "call" | "put") => {
    const sym = m.symbol.toUpperCase();
    if (heldUnderlyings.has(sym) || !/^[A-Z]{1,5}$/.test(sym)) return;
    const r = ranges.get(sym);
    if (!r || !(r.price >= MOMENTUM.minPrice)) return;
    if (type === "call" ? !(m.pct >= MOMENTUM.minMovePct) : !(m.pct <= -MOMENTUM.minMovePct)) return;
    const running = type === "call" ? r.price >= r.high * (1 - MOMENTUM.maxPullback) : r.price <= r.low * (1 + MOMENTUM.maxPullback);
    if (!running) return;
    out.push({ symbol: sym, type, price: r.price, pct: m.pct });
  };
  for (const g of movers.gainers) consider(g, "call");
  for (const l of movers.losers) consider(l, "put");
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** The candidates a run reads ranges for: over the floors, strongest first. */
export function moverCandidates(movers: { gainers: Mover[]; losers: Mover[] }, limit = 20): string[] {
  return [...movers.gainers.filter((m) => m.pct >= MOMENTUM.minMovePct), ...movers.losers.filter((m) => m.pct <= -MOMENTUM.minMovePct)]
    .filter((m) => m.price >= MOMENTUM.minPrice && /^[A-Z]{1,5}$/.test(m.symbol.toUpperCase()))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, limit)
    .map((m) => m.symbol.toUpperCase());
}

/**
 * The resting take-profit for a contract bought at `avgEntry`: +50% in
 * cents (a penny-pilot class), and on the coarse tick every class takes.
 */
export function takeProfitPrice(avgEntry: number): number {
  return Number((Math.ceil(avgEntry * (1 + MOMENTUM.takeProfit) * 100 - 1e-7) / 100).toFixed(2));
}
export function takeProfitCoarse(avgEntry: number): number {
  return ceilTick(avgEntry * (1 + MOMENTUM.takeProfit));
}

/**
 * What to do with a held contract this run: sell it ("cut" at half its cost,
 * "close_out" at the end of the session), hold it (a same-day sell the
 * day-trade rule would refuse), or nothing.
 */
export function momentumExit(p: {
  avgEntry: number;
  current: number;
  /** Minutes to the session's close (the broker's clock); not finite reads as closing. */
  toClose: number;
  openedToday: boolean;
  sameDaySellOk: boolean;
}): "cut" | "close_out" | "held_for_day_trades" | null {
  const closing = !(p.toClose > MOMENTUM.closeOutBeforeCloseMin);
  const why = Number.isFinite(p.current) && p.avgEntry > 0 && p.current <= p.avgEntry * (1 - MOMENTUM.cut) ? "cut" : closing ? "close_out" : null;
  if (!why) return null;
  if (p.openedToday && !p.sameDaySellOk) return "held_for_day_trades";
  return why;
}

/** 0 Sunday to 6 Saturday, in New York. */
export function nyWeekday(ms: number): number {
  return new Date(`${nyDate(ms)}T12:00:00Z`).getUTCDay();
}

export interface MomentumGateInput {
  minutes: number;
  /** Minutes to the session's close. */
  toClose: number;
  /** New York weekday, 0 Sunday to 6 Saturday. */
  weekday: number;
  marketOpen: boolean;
  halted: boolean;
  equity: number;
  lastEquity: number;
  dayTrades: number;
  openContracts: number;
  boughtToday: number;
  /** Day trades still free for a same-day sell after those already spoken for (Infinity at $25,000 and over). */
  dayTradesFree: number;
}

/**
 * Why no entry is made this run, or null when one may be. With the day
 * trades used, a contract may still be bought and held to the next session
 * (selling it then is no day trade), except on Friday: the owner wants out
 * of every trade by the end of the week (2026-11-13).
 */
export function momentumEntryHold(g: MomentumGateInput): string | null {
  if (g.halted) return "Trading is halted.";
  if (!g.marketOpen) return "Market closed.";
  if (g.minutes < MOMENTUM.entryFrom || g.minutes >= MOMENTUM.entryUntil || !(g.toClose >= MOMENTUM.entryStopsBeforeCloseMin)) {
    return "Outside the entry window (10:00 to 15:00 New York, and not within 80 minutes of the close).";
  }
  if (!(g.equity >= MOMENTUM_EQUITY_FLOOR)) return `Account under the $${MOMENTUM_EQUITY_FLOOR} floor.`;
  if (!(g.lastEquity > 0) || (g.equity - g.lastEquity) / g.lastEquity <= -MOMENTUM_DAY_LOSS_HOLD) return `Account down ${MOMENTUM_DAY_LOSS_HOLD * 100}% or more today.`;
  if (g.openContracts >= MOMENTUM.maxOpen) return `${MOMENTUM.maxOpen} contracts already open.`;
  if (g.boughtToday >= MOMENTUM.maxEntriesADay) return `${MOMENTUM.maxEntriesADay} bought today already.`;
  if (!(g.dayTradesFree >= 1) && g.weekday === 5) {
    return `Day trades used (${Number.isFinite(g.dayTrades) ? g.dayTrades : "unknown"} of ${PDT_MAX} in five sessions, with today's holdings), and a Friday buy must be sold today.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The pass: reads the broker, sells, then buys at most one.
// ---------------------------------------------------------------------------

const num = (v: unknown): number => (typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MomentumResult {
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

/** The trade id a momentum order carries in its client order id. */
function tradeIdOf(clientOrderId: string | undefined): string | null {
  const m = /^gsps-momo-(?:tp-)?([0-9a-f-]{36})/.exec(clientOrderId ?? "");
  return m ? m[1] : null;
}

/** Rests the +50% take-profit: in cents, else (a class that quotes in nickels) on the coarse tick. */
async function restTakeProfit(creds: AlpacaCreds, symbol: string, qty: number, avg: number, clientOrderId: string): Promise<{ order: AlpacaOrder; tp: number }> {
  const fine = takeProfitPrice(avg);
  try {
    return { order: (await placeOrder(creds, { symbol, side: "sell", qty, type: "limit", limitPrice: fine, clientOrderId })) as AlpacaOrder, tp: fine };
  } catch (err) {
    const coarse = takeProfitCoarse(avg);
    if (coarse === fine) throw err;
    return { order: (await placeOrder(creds, { symbol, side: "sell", qty, type: "limit", limitPrice: coarse, clientOrderId: `${clientOrderId}-c` })) as AlpacaOrder, tp: coarse };
  }
}

async function settle(creds: AlpacaCreds, id: string): Promise<AlpacaOrder> {
  let o = await getOrder(creds, id);
  for (let i = 0; i < 3 && !["filled", "canceled", "expired", "rejected", "done_for_day"].includes(o.status); i++) {
    await sleep(500);
    o = await getOrder(creds, id);
  }
  return o;
}

/**
 * One momentum pass on the live account. `positions` and `account` are this
 * run's reads; `mirrorSymbols` are symbols the mirror owns (never touched).
 */
export async function momentumPass(
  supabase: SupabaseClient,
  creds: AlpacaCreds,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  clock: { isOpen: boolean; nextClose: number },
  mirrorSymbols: Set<string>,
  deadline: number,
  now = Date.now(),
  opts: { mode?: "paper" | "live"; fixedBudget?: number } = {},
): Promise<MomentumResult> {
  const mode = opts.mode ?? "live";
  const result: MomentumResult = { placed: 0, held: [], errors: [] };
  const marketOpen = clock.isOpen;
  if (!marketOpen) return result;
  const minutes = nyMinutes(now);
  const toClose = (clock.nextClose - now) / 60_000;
  const today = nyDate(now);
  const equity = num(account.equity);
  const lastEquity = num(account.last_equity);
  const dayTrades = num(account.daytrade_count ?? NaN);

  // Momentum's contracts: every option the account holds that the mirror doesn't own.
  const recent = await listOrders(creds, { since: new Date(now - 30 * 86_400_000), maxPages: 1 });
  const momoBuys = recent.filter((o) => o.side === "buy" && (o.client_order_id ?? "").startsWith(CLIENT_PREFIX) && num(o.filled_qty) > 0);
  // Only contracts momentum bought: an option the owner trades by hand is never touched.
  const momoSymbols = new Set(momoBuys.map((o) => o.symbol));
  const held = positions.filter((p) => parseOccSymbol(p.symbol) && momoSymbols.has(p.symbol) && !mirrorSymbols.has(p.symbol) && num(p.qty) > 0);
  // A buy part filled then cancelled may carry no fill time: its last update dates it.
  const boughtAt = (o: AlpacaOrder) => o.filled_at ?? o.updated_at ?? o.submitted_at ?? o.created_at ?? null;
  const boughtTodaySyms = new Set(momoBuys.filter((o) => { const t = boughtAt(o); return t != null && nyDate(Date.parse(t)) === today; }).map((o) => o.symbol));
  const tradeIdFor = (symbol: string) => tradeIdOf(momoBuys.find((o) => o.symbol === symbol)?.client_order_id) ?? randomUUID();
  let open = await getOpenOrdersNested(creds);
  const restingSells = (symbol: string) => open.filter((o) => o.symbol === symbol && o.side === "sell");

  // Day trades: each contract bought today that will be sold today spends
  // one. Those with a sell already resting are counted first; the rest are
  // given a same-day sell only while one is free.
  let free = equity >= PDT_EQUITY ? Infinity : Number.isFinite(dayTrades) ? Math.max(0, PDT_MAX - dayTrades) : 0;
  const sameDay = held.filter((p) => boughtTodaySyms.has(p.symbol));
  const mayDayTrade = new Set<string>();
  for (const p of [...sameDay].sort((a, b) => Number(restingSells(b.symbol).length > 0) - Number(restingSells(a.symbol).length > 0))) {
    if (free >= 1) {
      mayDayTrade.add(p.symbol);
      free -= 1;
    }
  }
  const sellOk = (symbol: string) => !boughtTodaySyms.has(symbol) || mayDayTrade.has(symbol);

  // Exits, then the take-profit on what stays.
  const stillHeld: AlpacaPosition[] = [];
  for (const p of held) {
    if (Date.now() > deadline) break;
    const avg = num(p.avg_entry_price);
    const current = num(p.current_price);
    const qty = num(p.qty);
    const openedToday = boughtTodaySyms.has(p.symbol);
    const exit = momentumExit({ avgEntry: avg, current, toClose, openedToday, sameDaySellOk: sellOk(p.symbol) });
    const id = tradeIdFor(p.symbol);
    try {
      if (exit === "held_for_day_trades") {
        result.held.push(`${p.symbol}: sell held to the next session (day trades used).`);
        stillHeld.push(p);
      } else if (exit) {
        // The resting take-profit reserves the contracts: each cancel is
        // confirmed before the sell, which is tried twice.
        for (const o of restingSells(p.symbol)) {
          await cancelOrder(creds, o.id).catch(() => undefined);
          const c = await settle(creds, o.id).catch(() => null);
          if (c && c.status === "filled") throw new Error(`take-profit ${o.id} filled before the sell; nothing more to sell.`);
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
        const s = await settle(creds, out.id).catch(() => out);
        await logEvent(supabase, {
          position_id: id, symbol: p.symbol, side: "long", action: "momentum_close", qty, sim_price: current, stop_price: null,
          broker_order_id: out.id, status: s.status,
          note: exit === "cut" ? `Worth half its cost (${current} against ${avg}); sold.` : "End of session; sold.", ...fills(s),
        }, mode);
      } else {
        stillHeld.push(p);
      }
    } catch (err) {
      result.errors.push(`momentum exit ${p.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const p of stillHeld) {
    if (Date.now() > deadline) break;
    if (restingSells(p.symbol).length > 0) continue;
    // A same-day take-profit is a day trade: none rests unless one is free for it.
    if (!sellOk(p.symbol)) continue;
    const avg = num(p.avg_entry_price);
    if (!(avg > 0)) continue;
    const id = tradeIdFor(p.symbol);
    try {
      const { order: o, tp } = await restTakeProfit(creds, p.symbol, num(p.qty), avg, `${CLIENT_PREFIX}tp-${id}-${now}`);
      result.placed++;
      await logEvent(supabase, { position_id: id, symbol: p.symbol, side: "long", action: "momentum_take_profit", qty: num(p.qty), sim_price: null, stop_price: null, broker_order_id: o.id, status: o.status, note: `Limit ${tp} (+50%).` }, mode);
    } catch (err) {
      result.errors.push(`momentum take-profit ${p.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // At most one entry.
  const hold = momentumEntryHold({
    minutes, toClose, weekday: nyWeekday(now), marketOpen, halted: tradingDisabled(), equity, lastEquity, dayTrades,
    openContracts: stillHeld.length, boughtToday: boughtTodaySyms.size, dayTradesFree: free,
  });
  if (hold) {
    result.held.push(`momentum: ${hold}`);
    return result;
  }
  const optionsBp = num((account as unknown as { options_buying_power?: string }).options_buying_power);
  const cash = Number.isFinite(optionsBp) ? Math.min(num(account.cash), optionsBp) : num(account.cash);
  // Paper practices the same picks at the live account's size, not its own $100,000.
  const budget = opts.fixedBudget != null ? Math.min(opts.fixedBudget, liveOptionBudget(equity, cash)) : liveOptionBudget(equity, cash);
  try {
    const movers = await fetchMovers(50);
    const candidates = moverCandidates(movers);
    if (candidates.length === 0) {
      result.held.push("momentum: no mover over $5 and 5%.");
      return result;
    }
    const ranges = await fetchDayRanges(candidates);
    const heldUnderlyings = new Set(held.map((p) => parseOccSymbol(p.symbol)?.underlying ?? ""));
    const picks = rankMovers(movers, ranges, heldUnderlyings).slice(0, MOMENTUM.chainsPerRun);
    const reasons: string[] = [];
    for (const pick of picks) {
      if (Date.now() > deadline) break;
      const end = nyDate(now + MOMENTUM.maxDays * 86_400_000);
      const start = nyDate(now + MOMENTUM.minDays * 86_400_000);
      const chain = (await fetchOptionSnapshots({
        underlying: pick.symbol,
        filters: {
          type: pick.type, expiration_date_gte: start, expiration_date_lte: end,
          ...(pick.type === "call"
            ? { strike_price_gte: String(Math.floor(pick.price * (1 - MOMENTUM.strikeBand / 5))), strike_price_lte: String(Math.ceil(pick.price * (1 + MOMENTUM.strikeBand))) }
            : { strike_price_gte: String(Math.floor(pick.price * (1 - MOMENTUM.strikeBand))), strike_price_lte: String(Math.ceil(pick.price * (1 + MOMENTUM.strikeBand / 5))) }),
        },
      }).catch(() => ({}))) as Record<string, ChainSnapshot>;
      const c = chooseLiveContract(chain, { underlying: pick.symbol, type: pick.type, underlyingPrice: pick.price, budget, today, minDays: MOMENTUM.minDays, maxDays: MOMENTUM.maxDays });
      if ("reason" in c) {
        reasons.push(`${pick.symbol} ${pick.pct.toFixed(1)}%: ${c.reason}`);
        continue;
      }
      const id = randomUUID();
      if (Date.now() > deadline) break;
      const order = (await placeOrder(creds, { symbol: c.symbol, side: "buy", qty: c.qty, type: "limit", limitPrice: c.limitPrice, clientOrderId: `${CLIENT_PREFIX}${id}` })) as AlpacaOrder;
      result.placed++;
      let s = await settle(creds, order.id);
      if (!["filled", "canceled", "expired", "rejected", "done_for_day"].includes(s.status)) {
        // Not left resting: the moment it was bought for has passed.
        await cancelOrder(creds, order.id).catch(() => undefined);
        s = await settle(creds, order.id);
      }
      await logEvent(supabase, {
        position_id: id, symbol: c.symbol, side: "long", action: "momentum_open", qty: c.qty, sim_price: c.ask, stop_price: null,
        broker_order_id: order.id, status: s.status,
        note: `${pick.symbol} ${pick.pct >= 0 ? "+" : ""}${pick.pct.toFixed(1)}% today at ${pick.price}; ${pick.type} ${c.strike} ${c.expiration}, limit ${c.limitPrice} (budget $${budget.toFixed(2)}).`,
        ...fills(s),
      }, mode);
      const got = num(s.filled_qty);
      // Its take-profit rests today only with a day trade free for it;
      // otherwise the next session's run places it.
      if (got > 0 && free >= 1) {
        const { order: tpOrder, tp } = await restTakeProfit(creds, c.symbol, got, num(s.filled_avg_price), `${CLIENT_PREFIX}tp-${id}-${now}`);
        result.placed++;
        await logEvent(supabase, { position_id: id, symbol: c.symbol, side: "long", action: "momentum_take_profit", qty: got, sim_price: null, stop_price: null, broker_order_id: tpOrder.id, status: tpOrder.status, note: `Limit ${tp} (+50%).` }, mode);
      }
      return result;
    }
    result.held.push(`momentum: nothing bought. ${reasons.join(" | ") || "No mover still running."}`.slice(0, 800));
  } catch (err) {
    result.errors.push(`momentum entry: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}
