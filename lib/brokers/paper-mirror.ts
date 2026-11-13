/**
 * The broker paper mirror: the owner's automated paper trades, placed again
 * as real orders in the platform's own Alpaca **paper** account.
 * -----------------------------------------------------------------------------
 * Owner, 2026-11-12: he asked how the platform could trade his account for
 * him. His standing rule ("Only the real": no live trading on the platform's
 * signals until replay and a forward test verify the edge) bars real money,
 * so this is the rehearsal: the Automated Portfolio Manager keeps trading the
 * owner's profile in the simulator (`lib/brokers/simulator.ts`), and this
 * module copies each of those positions into Alpaca's paper account, where
 * fills are a real broker's fills. Each copied order is logged beside the
 * simulator's price, so the record measures what a real broker does to the
 * same plan (slippage, partial fills, rejects, a protective stop resting at
 * the broker).
 *
 * Two accounts, kept apart by `MirrorMode`. The paper pass uses
 * `envCreds("paper")` (the app's one Alpaca key, which reaches
 * `paper-api.alpaca.markets` only). The live pass (owner, 2026-11-12, see
 * `LIVE_MIRROR_AUTHORIZED`) uses only the owner's own live keys, connected by
 * him in Settings (`broker_connections`, `alpaca_live`), never `envCreds`.
 * Each mode has its own lines, events and run lease; the live pass adds the
 * small-account rules below. Both run in the manager's scheduled call, one
 * after the other, each within `MIRROR_BUDGET_MS`, so together they add up
 * to 30 seconds to that call (no person waits on it).
 *
 * Only the owner's account (`OWNER_EMAILS[0]`, `lib/auth/owner.ts`), and only
 * the positions automation opened after `MIRROR_START`. Members are never
 * mirrored, and the owner's own manual paper trades are left alone.
 *
 * The simulator stays the source of truth for every decision: the mirror
 * never decides an entry, a stop or an exit of its own. It opens what the
 * simulator opened, sells what the simulator sold, and keeps one resting
 * good-till-cancelled stop at the simulator's current stop. The one thing it
 * never does is re-buy: if the broker's stop fills before the simulator's,
 * the line is marked `broker_stopped` and left flat.
 *
 * Safety rails (each fails closed):
 * - `PAPER_MIRROR_DISABLED=true` stops the mirror entirely.
 * - `TRADING_DISABLED=true` (`lib/trade/kill-switch.ts`) stops new opens and
 *   adds; reductions and closes still go, so a halt never strands a position.
 * - No opens once the paper account is down `DAILY_LOSS_HOLD_PCT` on the day.
 * - At most `MAX_OPEN_LINES` mirrored lines at once.
 * - An open more than `MAX_OPEN_LAG_MS` after the simulator's fill is not
 *   chased; the line is marked `missed` and never opened.
 * - Market orders only while the market is open (Alpaca's clock).
 *
 * Three-question basis:
 * 1. Method: the per-trade capital rule and "Safety must be your first
 *    principle" (ref: SRC-004 p.46, Rule 1) govern the rails; the five-line
 *    ceiling is the same source's five-stock spread. Tier A, as cited.
 * 2. Cycles: no periodicity claim; the mirror follows each plan's own clock.
 * 3. Hermetic: Correspondence (the same plan at the simulator and at a real
 *    broker), Cause and Effect (every order logged with its cause).
 * Law of Creation: plan ⊗ real broker. The third the join creates is the
 * fill-gap record (broker fill minus simulator fill), which neither side
 * holds alone and which re-enters as the replay's friction figure.
 *
 * Engineering choices, labelled: `DAILY_LOSS_HOLD_PCT` and `MAX_OPEN_LAG_MS`
 * are not figures the method gives.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelOrder,
  closePosition,
  envCreds,
  getAccount,
  getAsset,
  getNetDeposits,
  getOrder,
  getOrderByClientId,
  getPositions,
  placeExitOrder,
  placeOrder,
  replaceOrder,
  type AlpacaCreds,
  type AlpacaOrder,
  type AlpacaPosition,
  type ExitOrderInput,
} from "@/lib/brokers/alpaca";
import { tradingDisabled } from "@/lib/trade/kill-switch";
import { OWNER_EMAILS } from "@/lib/auth/owner";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";

/** Positions opened before this are never mirrored (they'd be bought at today's price). */
export const MIRROR_START = "2026-11-12T15:45:00Z";
/** Most mirrored lines open at once (ref: SRC-004 p.46, five stocks). */
export const MAX_OPEN_LINES = 5;
/** Engineering choice: no new opens once the paper account is down this much on the day. */
export const DAILY_LOSS_HOLD_PCT = 0.03;
/** Engineering choice: an open later than this after the simulator's fill is not chased. */
export const MAX_OPEN_LAG_MS = 60 * 60 * 1000;

export type Side = "long" | "short";
export type AssetClass = "us_equity" | "crypto" | "option";

/**
 * A crypto pair in the form the mirror keys it by ("BTC/USD"). The broker
 * lists a held coin as "BTCUSD"; orders take either.
 */
export function cryptoPair(symbol: string): string {
  const s = symbol.toUpperCase().replace("-", "/");
  return s.includes("/") ? s : s.replace(/(USDT|USDC|USD)$/, "/$1");
}

/** Mirror lines key crypto by its pair, so a slash marks one (no stock symbol carries a slash). */
export function isCryptoPair(symbol: string): boolean {
  return symbol.includes("/");
}

/** How an asset is ordered: whole shares, or a coin's own lot (the broker's minimum and step). */
export interface Lot {
  increment: number;
  min: number;
  /** The step between prices; cents (a millionth under $1) when the broker gives none. */
  priceIncrement?: number;
  /** How far under the stop the protective order may fill (a coin's stop-limit). */
  stopGap?: number;
  /** The broker's fee on each side, as a fraction of the trade. */
  feeRate?: number;
}
export const WHOLE_SHARES: Lot = { increment: 1, min: 1 };

const stepDecimals = (step: number) => Math.min(9, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
/** `x` rounded down to a multiple of `step`, without float dust. */
export function floorTo(x: number, step: number): number {
  return Number((Math.floor(x / step + 1e-7) * step).toFixed(stepDecimals(step)));
}
/** `x` rounded to the nearest multiple of `step`, without float dust. */
export function roundTo(x: number, step: number): number {
  return Number((Math.round(x / step) * step).toFixed(stepDecimals(step)));
}

export interface SimLine {
  positionId: string;
  symbol: string;
  side: Side;
  qty: number;
  /** The simulator's current stop: the exit plan's applied stop, else the position's. */
  stop: number | null;
  /** The simulator's average fill. */
  price: number;
  openedAt: string;
  /** Opened by automation (an entry order carrying a plan id). */
  automated: boolean;
  /** Stocks when unset. */
  assetClass?: AssetClass;
  /** Live only: the open goes as a day limit at this price, the most the account's caps allow a share. */
  limitPrice?: number;
}

export type MirrorStatus = "open" | "closed" | "broker_stopped" | "missed";

export interface MirrorLine {
  positionId: string;
  symbol: string;
  side: Side;
  status: MirrorStatus;
  /** Shares the line should hold at the broker (what was opened, added and reduced to). */
  targetQty: number;
  /**
   * The simulator's own quantity the mirror last acted on. An add follows
   * only a rise in the simulator's quantity above this, never a shortfall
   * at the broker, so shares a broker stop sold (or a part-filled open left
   * unbought) are never bought back.
   */
  simQty: number;
  /** The broker order that opened the line. */
  openOrderId: string | null;
  /** The last add's broker order, while the line waits on it. */
  addOrderId: string | null;
  /** Adds placed so far: each add's client order id carries the next number. */
  addSeq: number;
  stopOrderId: string | null;
  stopPrice: number | null;
  stopQty: number | null;
  /** When the line was opened at the broker (for the day-trade rule). */
  openedAt?: string;
}

export interface MirrorGate {
  disabled: boolean;
  /** Most lines open at once on this account. */
  maxOpenLines?: number;
  /** Whether pyramid adds are mirrored (a small live account has no capital for them). */
  allowAdds?: boolean;
  /**
   * The broker would refuse a sell on a line opened today (the day-trade
   * rule). Such a reduce or close is held, and its stop stays sized to the
   * shares held.
   */
  sameDaySellBlocked?: boolean;
  /**
   * The day trades left would not cover a same-day exit: stock and option
   * opens are held (crypto has no day-trade rule), with `pdtNote` as reason.
   */
  pdtOpenHold?: boolean;
  pdtNote?: string;
  /** Why opens are held, when `dayLossHold` is set (the account's own wording). */
  holdNote?: string;
  tradingHalted: boolean;
  marketOpen: boolean;
  dayLossHold: boolean;
  now: number;
}

export type MirrorAction =
  | { kind: "open"; positionId: string; symbol: string; side: Side; qty: number; simPrice: number; stop: number | null; limitPrice?: number }
  | { kind: "add"; positionId: string; symbol: string; side: Side; qty: number; simPrice: number; targetAfter: number; simAfter: number }
  | { kind: "reduce"; positionId: string; symbol: string; side: Side; qty: number; simPrice: number; targetAfter: number }
  | { kind: "close"; positionId: string; symbol: string; side: Side; qty: number }
  | { kind: "set_stop"; positionId: string; symbol: string; side: Side; qty: number; stop: number }
  | { kind: "broker_stopped"; positionId: string; symbol: string }
  | { kind: "check_open"; positionId: string; symbol: string }
  | { kind: "missed"; positionId: string; symbol: string; side: Side; reason: string }
  | { kind: "hold"; positionId: string; symbol: string; reason: string };

/** Only a positive, finite stop is placed; the broker refuses one on the wrong side of the market, and that refusal is logged. */
function usableStop(stop: number | null): stop is number {
  return typeof stop === "number" && Number.isFinite(stop) && stop > 0;
}

/**
 * The orders that bring the broker's paper account in line with the
 * simulator. Pure: every read is passed in, so the whole rule set is tested
 * without a broker.
 *
 * `brokerQty` is the shares the broker holds per symbol, unsigned, on the
 * side of the mirrored line for that symbol. `brokerHeld` is every symbol
 * held on either side: a new line never opens on a symbol the account
 * already holds, so an open can never net against, or flip, a position the
 * mirror doesn't own.
 */
export function planMirrorActions(
  sim: SimLine[],
  mirror: MirrorLine[],
  brokerQty: Map<string, number>,
  gate: MirrorGate,
  brokerHeld: Set<string> = new Set(brokerQty.keys()),
): MirrorAction[] {
  if (gate.disabled) return [];
  const actions: MirrorAction[] = [];
  const bySim = new Map(sim.map((s) => [s.positionId, s]));
  const byMirror = new Map(mirror.map((m) => [m.positionId, m]));
  const openMirror = mirror.filter((m) => m.status === "open");
  // Lines the simulator has left are closed first (below); their symbols
  // free up next run, so a symbol the simulator reopened waits, not misses.
  const closing = new Set(openMirror.filter((m) => !bySim.has(m.positionId)).map((m) => m.symbol));
  let openLines = openMirror.length;
  const maxOpen = gate.maxOpenLines ?? MAX_OPEN_LINES;
  // Crypto trades around the clock and has no day-trade rule.
  const marketOpenFor = (symbol: string) => gate.marketOpen || isCryptoPair(symbol);
  const pdtHeld = (symbol: string) => gate.pdtOpenHold === true && !isCryptoPair(symbol);
  const canOpen = (symbol: string) => !gate.tradingHalted && marketOpenFor(symbol) && !gate.dayLossHold && !pdtHeld(symbol);
  const openReason = (symbol: string) =>
    gate.tradingHalted
      ? "Trading is halted (TRADING_DISABLED)."
      : !marketOpenFor(symbol)
        ? "Market closed."
        : gate.dayLossHold
          ? (gate.holdNote ?? `Account down ${DAILY_LOSS_HOLD_PCT * 100}% or more today.`)
          : pdtHeld(symbol)
            ? (gate.pdtNote ?? "Day trades used: no new opens under $25,000.")
            : "Not opened.";
  const mirroredSymbols = new Set(openMirror.map((m) => m.symbol));
  const today = nyDay(gate.now);
  const sellHeld = (m: MirrorLine) =>
    gate.sameDaySellBlocked === true && !isCryptoPair(m.symbol) && (!m.openedAt || nyDay(Date.parse(m.openedAt)) === today);
  const SELL_HELD = "Same-day sell held by the day-trade rule; the broker stop stays in place.";

  for (const m of openMirror) {
    if (bySim.has(m.positionId)) continue;
    const held = brokerQty.get(m.symbol) ?? 0;
    if (held <= 0) {
      actions.push(m.stopOrderId ? { kind: "broker_stopped", positionId: m.positionId, symbol: m.symbol } : { kind: "check_open", positionId: m.positionId, symbol: m.symbol });
      continue;
    }
    if (!marketOpenFor(m.symbol)) actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: "Close waits for the open market." });
    else if (sellHeld(m)) actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: SELL_HELD });
    else actions.push({ kind: "close", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: held });
  }

  for (const s of sim) {
    if (!s.automated || s.openedAt < MIRROR_START || !(s.qty > 0)) continue;
    const m = byMirror.get(s.positionId);
    if (!m) {
      const lag = gate.now - Date.parse(s.openedAt);
      if (!(lag <= MAX_OPEN_LAG_MS)) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: "The simulator's fill is more than an hour old; not chased." });
      } else if (!canOpen(s.symbol)) {
        actions.push({ kind: "hold", positionId: s.positionId, symbol: s.symbol, reason: openReason(s.symbol) });
      } else if (closing.has(s.symbol)) {
        actions.push({ kind: "hold", positionId: s.positionId, symbol: s.symbol, reason: "Waits for the earlier line in this symbol to close." });
      } else if (openLines >= maxOpen) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: `Already ${maxOpen} mirrored lines open.` });
      } else if (s.side === "short" && isCryptoPair(s.symbol)) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: "The broker doesn't short crypto." });
      } else if (mirroredSymbols.has(s.symbol) || brokerHeld.has(s.symbol)) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: "The account already holds this symbol." });
      } else {
        actions.push({
          kind: "open", positionId: s.positionId, symbol: s.symbol, side: s.side, qty: s.qty, simPrice: s.price, stop: usableStop(s.stop) ? s.stop : null,
          ...(s.limitPrice != null ? { limitPrice: s.limitPrice } : {}),
        });
        openLines++;
        mirroredSymbols.add(s.symbol);
      }
      continue;
    }
    if (m.status !== "open") continue;
    const held = brokerQty.get(m.symbol) ?? 0;
    if (held <= 0) {
      // A line that had a stop and now holds nothing: the broker's stop took
      // it. Never re-buy. A line with no stop yet: its open is checked.
      actions.push(m.stopOrderId ? { kind: "broker_stopped", positionId: m.positionId, symbol: m.symbol } : { kind: "check_open", positionId: m.positionId, symbol: m.symbol });
      continue;
    }
    if (held < m.targetQty) {
      // An open or add still filling: nothing moves until the broker settles.
      // (The runner re-targets a line whose orders have all settled short of
      // its target, before planning, so this wait always ends.)
      continue;
    }
    if (s.qty > m.simQty && gate.allowAdds !== false) {
      if (canOpen(m.symbol)) {
        // The stop below stays sized to the shares already held; it follows
        // the add next run, once those shares are held too.
        actions.push({ kind: "add", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: s.qty - m.simQty, simPrice: s.price, targetAfter: m.targetQty + (s.qty - m.simQty), simAfter: s.qty });
      } else {
        actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: `Add not placed: ${openReason(m.symbol)}` });
      }
    }
    let after = held;
    if (s.qty < held) {
      if (marketOpenFor(m.symbol) && sellHeld(m)) {
        actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: SELL_HELD });
      } else if (marketOpenFor(m.symbol)) {
        actions.push({ kind: "reduce", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: held - s.qty, simPrice: s.price, targetAfter: s.qty });
        after = s.qty;
      } else {
        actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: "Reduce waits for the open market." });
      }
    }
    if (usableStop(s.stop) && (m.stopPrice !== s.stop || m.stopQty !== after || !m.stopOrderId)) {
      actions.push({ kind: "set_stop", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: after, stop: s.stop });
    }
  }
  return actions;
}

/** The order side that opens (`entering`) or closes a line. */
export function orderSide(side: Side, entering: boolean): "buy" | "sell" {
  return (side === "long") === entering ? "buy" : "sell";
}

/** True once the paper account is down `DAILY_LOSS_HOLD_PCT` or more on the day. */
export function dayLossHold(equity: number, lastEquity: number): boolean {
  if (!(lastEquity > 0) || !Number.isFinite(equity)) return true; // unreadable: fail closed
  return (equity - lastEquity) / lastEquity <= -DAILY_LOSS_HOLD_PCT;
}

// ---------------------------------------------------------------------------
// The runner: reads, plans, places, logs.
// ---------------------------------------------------------------------------

/** Engineering choice: the mirror's share of the scheduled run's 60-second budget. */
export const MIRROR_BUDGET_MS = 15_000;
/**
 * Engineering choice: the run lease. Far past the budget, so a run slowed by
 * a hung broker call still holds it, and far inside the 30-minute schedule,
 * so a run cut off frees the mirror by the next one.
 */
const LEASE_MS = 5 * 60 * 1000;

export interface MirrorRunResult {
  ran: boolean;
  reason?: string;
  placed: number;
  held: string[];
  errors: string[];
  elapsedMs?: number;
}

interface EventRow {
  position_id: string;
  symbol: string;
  side: Side | null;
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

const num = (v: unknown): number => (typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN);
const TERMINAL_UNFILLED = ["canceled", "expired", "rejected", "done_for_day"];

function fillFields(o: AlpacaOrder | null): Pick<EventRow, "fill_price" | "filled_qty" | "filled_at"> {
  if (o?.status !== "filled") return {};
  return { fill_price: num(o.filled_avg_price), filled_qty: num(o.filled_qty), filled_at: o.filled_at ?? null };
}

/** A Supabase write that throws on failure, so no broker step goes unrecorded silently. */
async function must(p: PromiseLike<{ error: { message: string } | null }>, what: string): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Every event is written the moment its order is placed, so a cut-off run still leaves its record. */
async function logEvent(supabase: SupabaseClient, mode: MirrorMode, row: EventRow): Promise<void> {
  await must(supabase.from("paper_mirror_events").insert({ ...row, mode }), "paper_mirror_events");
}

async function isMarketOpen(creds: AlpacaCreds): Promise<boolean> {
  try {
    const host = creds.mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
    const res = await fetch(`${host}/v2/clock`, {
      headers: { "APCA-API-KEY-ID": creds.key, "APCA-API-SECRET-KEY": creds.secret },
    });
    if (!res.ok) return false;
    const clock = (await res.json()) as { is_open?: boolean };
    return clock.is_open === true;
  } catch {
    return false;
  }
}

async function ownerUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;
  const owner = OWNER_EMAILS[0];
  const u = data.users.find((x) => (x.email ?? "").toLowerCase() === owner);
  return u?.id ?? null;
}

async function readSimLines(supabase: SupabaseClient, userId: string): Promise<SimLine[]> {
  const { data: positions, error } = await supabase
    .from("positions")
    .select("id, symbol, side, qty, avg_entry_price, stop_loss, opened_at, asset_class")
    .eq("user_id", userId)
    .eq("mode", "paper")
    .eq("closed", false)
    .gte("opened_at", MIRROR_START);
  if (error) throw new Error(`positions: ${error.message}`);
  const rows = (positions ?? []).filter((p) => ["us_equity", "crypto", "option"].includes(p.asset_class as string));
  if (rows.length === 0) return [];
  const symbols = rows.map((p) => p.symbol as string);
  const [exitsRes, entriesRes] = await Promise.all([
    supabase
      .from("protocol_exits")
      .select("symbol, applied_stop, stop_loss, status, created_at")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .neq("status", "closed")
      .in("symbol", symbols)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("symbol, created_at")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .not("source_plan_id", "is", null)
      .gte("created_at", MIRROR_START)
      .in("symbol", symbols),
  ]);
  if (exitsRes.error) throw new Error(`protocol_exits: ${exitsRes.error.message}`);
  if (entriesRes.error) throw new Error(`orders: ${entriesRes.error.message}`);
  const FIVE_MIN = 5 * 60 * 1000;
  return rows.map((p) => {
    const openedMs = Date.parse(p.opened_at as string);
    // The exit plan written for this position: same symbol, made no earlier
    // than five minutes before the position opened (newest first).
    const exit = (exitsRes.data ?? []).find(
      (e) => e.symbol === p.symbol && Date.parse(e.created_at as string) >= openedMs - FIVE_MIN,
    );
    const applied = exit && exit.applied_stop != null ? num(exit.applied_stop) : NaN;
    const exitStop = Number.isFinite(applied) ? applied : exit ? num(exit.stop_loss) : NaN;
    const stop = Number.isFinite(exitStop) ? exitStop : num(p.stop_loss);
    // Automated: a plan-carrying entry order for the symbol within five
    // minutes either side of the position's opening.
    const automated = (entriesRes.data ?? []).some(
      (o) => o.symbol === p.symbol && Math.abs(Date.parse(o.created_at as string) - openedMs) <= FIVE_MIN,
    );
    const assetClass = p.asset_class as AssetClass;
    return {
      positionId: p.id as string,
      symbol: assetClass === "crypto" ? cryptoPair(p.symbol as string) : (p.symbol as string),
      assetClass,
      side: (p.side === "short" ? "short" : "long") as Side,
      qty: num(p.qty),
      stop: Number.isFinite(stop) && stop > 0 ? stop : null,
      price: num(p.avg_entry_price),
      openedAt: new Date(openedMs).toISOString(),
      automated,
    };
  });
}

/** Every open line, plus any line (missed, closed, stopped) for a position the simulator still holds. */
async function readMirrorLines(supabase: SupabaseClient, mode: MirrorMode, simIds: string[]): Promise<MirrorLine[]> {
  const cols = "position_id, symbol, side, status, target_qty, sim_qty, open_order_id, add_order_id, add_seq, stop_order_id, stop_price, stop_qty, opened_at";
  const query = supabase.from("paper_mirror_lines").select(cols).eq("mode", mode);
  const { data, error } =
    simIds.length > 0 ? await query.or(`status.eq.open,position_id.in.(${simIds.join(",")})`) : await query.eq("status", "open");
  if (error) throw new Error(`paper_mirror_lines: ${error.message}`);
  return (data ?? []).map((r) => ({
    positionId: r.position_id as string,
    symbol: r.symbol as string,
    side: (r.side === "short" ? "short" : "long") as Side,
    status: r.status as MirrorStatus,
    targetQty: num(r.target_qty),
    simQty: Number.isFinite(num(r.sim_qty)) ? num(r.sim_qty) : num(r.target_qty),
    openOrderId: (r.open_order_id as string | null) ?? null,
    addOrderId: (r.add_order_id as string | null) ?? null,
    addSeq: Number.isFinite(num(r.add_seq)) ? num(r.add_seq) : 0,
    stopOrderId: (r.stop_order_id as string | null) ?? null,
    stopPrice: r.stop_price == null ? null : num(r.stop_price),
    stopQty: r.stop_qty == null ? null : num(r.stop_qty),
    openedAt: (r.opened_at as string | null) ?? undefined,
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads an order until it leaves `pending_*`/`new`, up to three reads. */
async function settleOrder(creds: AlpacaCreds, id: string): Promise<AlpacaOrder> {
  let o = await getOrder(creds, id);
  for (let i = 0; i < 2 && !["filled", "canceled", ...TERMINAL_UNFILLED].includes(o.status); i++) {
    await sleep(400);
    o = await getOrder(creds, id);
  }
  return o;
}

/**
 * Cancels a line's resting stop and confirms it. Returns the stop order when
 * it had already filled (the broker stopped the line), else null once it is
 * cancelled; throws when neither is confirmed, so no sell goes out against
 * shares the stop still reserves.
 */
async function cancelStop(creds: AlpacaCreds, stopId: string, hops = 0): Promise<AlpacaOrder | null> {
  await cancelOrder(creds, stopId).catch(() => undefined);
  const o = await settleOrder(creds, stopId);
  // A replaced stop lives on under its new id; that one is cancelled.
  if (o.status === "replaced" && o.replaced_by && hops < 3) return cancelStop(creds, o.replaced_by, hops + 1);
  if (o.status === "filled") return o;
  if (o.status === "canceled" || TERMINAL_UNFILLED.includes(o.status)) return null;
  throw new Error(`Stop ${stopId} not confirmed cancelled (${o.status}); sell not sent.`);
}

export type MirrorMode = "paper" | "live";

/**
 * The live account (owner, 2026-11-12: "its not about proving an edge, as
 * much its about testing what we've done 'with real bullets'", a $30 account,
 * live from Nov 13). This is the owner's own word in this conversation, and
 * the key is his own act: the live mirror trades only once he connects his
 * live keys in Settings (`broker_connections`, `alpaca_live`), and his Pause
 * there, `LIVE_MIRROR_DISABLED=true` or `TRADING_DISABLED` stops it. It is
 * separate from the Automated Portfolio Manager's members' live path, which
 * stays on paper (`AUTONOMOUS_PROVING_PERIOD`). No public record is kept.
 *
 * The owner's own rules for this account (2026-11-12), each fails closed:
 * - Crypto and options only: "Equities don't create a large enough profit
 *   margin for my liking." A stock trade stays on paper and is logged as
 *   one the live account skipped. (Futures and forex aren't offered by the
 *   broker; margin needs $2,000.)
 * - At most a third of the account in one trade: "No more than 1/3 of the
 *   account can be 'invested' on one trade."
 * - The loss allowed on one trade steps up with what trading has made,
 *   never with deposits (his "Go" to this schedule on a $30 start, and "I'll
 *   be adding money incrementally"): `liveRiskFraction`. Options open at the
 *   third step, the premium counted as the loss; they aren't placed yet.
 * Small-account rules, each fails closed:
 * - Long only (an account under $2,000 cannot borrow shares).
 * - Whole shares, or a coin's own lot, so every line carries a broker stop.
 * - No adds (no capital for them), at most `LIVE_MAX_OPEN_LINES` lines.
 * - No opens once the account is down `LIVE_DAY_LOSS_HOLD_PCT` on the day,
 *   or below `LIVE_EQUITY_FLOOR`.
 * Every open the account can't take is logged with its reason, as a record
 * of what a small account meets.
 */
export const LIVE_MIRROR_AUTHORIZED = { by: "owner", on: "2026-11-12" } as const;
/** Live opens begin with positions opened from this time (owner: "start live trading tomorrow"). */
export const LIVE_MIRROR_START = "2026-11-13T14:30:00Z";
/** Owner, 2026-11-12: live trades these only; stocks stay on paper. */
export const LIVE_ASSET_CLASSES: readonly AssetClass[] = ["crypto", "option"];
/** Owner, 2026-11-12: "No more than 1/3 of the account can be 'invested' on one trade." */
export const LIVE_MAX_POSITION_FRACTION = 1 / 3;
/** The loss allowed on one trade before trading has made anything (ref: SRC-004 p.46, Rule 1). */
export const LIVE_BASE_RISK_FRACTION = 0.1;
/**
 * The step-ups the owner agreed to (2026-11-12, "Go"): on the $30 start, a
 * fifth from $45 and a third from $75. Counted in trading gains (equity less
 * net deposits), so money he adds never moves a step.
 */
export const LIVE_RISK_STEPS: readonly { fromGain: number; fraction: number }[] = [
  { fromGain: 45, fraction: 1 / 3 },
  { fromGain: 15, fraction: 0.2 },
];
/** Options open at the third step (the account at $75 on the $30 start). */
export const LIVE_OPTIONS_FROM_GAIN = 45;
/** Engineering choice: no live order under a dollar (the broker's floor for a crypto order). */
export const LIVE_MIN_ORDER_USD = 1;
/**
 * Engineering choice: crypto takes no plain stop order, so its protective
 * stop is a stop-limit this far under the stop. Ordinary slippage still
 * fills; a fall straight through the limit leaves the line to the next run,
 * which closes it at market once the simulator has exited.
 */
export const CRYPTO_STOP_LIMIT_GAP = 0.02;
/** The broker's highest crypto fee a side (its first volume tier, taker), counted in a coin's risk. */
export const CRYPTO_FEE_RATE = 0.0025;
/** Engineering choice: one full-size loss at the first step is the day's hold. */
export const LIVE_DAY_LOSS_HOLD_PCT = 0.1;
/** Engineering choice: half the $30 starting account. */
export const LIVE_EQUITY_FLOOR = 15;
/** Engineering choice: a $30 account holds one line at a time in practice; two leaves room for a cheap second. */
export const LIVE_MAX_OPEN_LINES = 2;

/** Under this equity a fourth day trade in five sessions is refused (the pattern day trader rule). */
export const PDT_EQUITY = 25_000;
/** Day trades allowed in five sessions under `PDT_EQUITY`. */
export const PDT_MAX_DAY_TRADES = 3;

/** The New York calendar date of an instant, as YYYY-MM-DD. */
export function nyDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * Whether a same-day sell on a line opened today would be the day trade the
 * broker refuses: under `PDT_EQUITY`, once `PDT_MAX_DAY_TRADES` are used.
 * An unreadable count fails closed.
 */
export function dayTradeBlocked(dayTradeCount: number, equity: number): boolean {
  if (equity >= PDT_EQUITY) return false;
  return !(dayTradeCount < PDT_MAX_DAY_TRADES);
}

/** The share of equity one trade may lose, by what trading has made. An unreadable gain takes the first step. */
export function liveRiskFraction(tradingGain: number): number {
  if (!Number.isFinite(tradingGain)) return LIVE_BASE_RISK_FRACTION;
  for (const step of LIVE_RISK_STEPS) if (tradingGain >= step.fromGain) return step.fraction;
  return LIVE_BASE_RISK_FRACTION;
}

const usd = (v: number) => `$${v.toFixed(2)}`;

/**
 * The quantity a small live account can take for one line, or the reason it
 * can't: at most a third of the account (within the cash on hand), losing at
 * most `riskFraction` of equity at the stop, in whole shares or the coin's
 * lot. The open goes as a limit at the most a unit may cost and still keep
 * both caps at the real fill.
 */
export function liveOpenQty(
  side: Side,
  price: number,
  stop: number | null,
  equity: number,
  cash: number,
  riskFraction: number = LIVE_BASE_RISK_FRACTION,
  lot: Lot = WHOLE_SHARES,
): { qty: number; limitPrice?: number; reason?: string } {
  if (side !== "long") return { qty: 0, reason: "Live account is long only (shorting needs $2,000 or more)." };
  if (!(price > 0)) return { qty: 0, reason: "No price." };
  if (!usableStop(stop) || !(stop < price)) return { qty: 0, reason: "No protective stop below the entry." };
  if (!(equity > 0) || !(riskFraction > 0)) return { qty: 0, reason: "Account equity unreadable." };
  const spend = Math.min(0.95 * Math.max(cash, 0), LIVE_MAX_POSITION_FRACTION * equity);
  const byCash = floorTo(spend / price, lot.increment);
  if (byCash < lot.min || byCash * price < LIVE_MIN_ORDER_USD) {
    const unit = lot === WHOLE_SHARES ? `One share costs ${usd(price)}` : `The smallest order costs ${usd(Math.max(lot.min * price, LIVE_MIN_ORDER_USD))}`;
    return { qty: 0, reason: `${unit}, more than the ${usd(spend)} one trade may use (a third of the account, within the cash on hand).` };
  }
  const riskAmt = riskFraction * equity;
  // The loss a unit can take: bought at the price plus the fee, sold at the
  // worst the protective order may fill (a coin's stop-limit, under the
  // stop) less the fee.
  const fee = lot.feeRate ?? 0;
  const worstExit = stop * (1 - (lot.stopGap ?? 0)) * (1 - fee);
  const perUnit = price * (1 + fee) - worstExit;
  const byRisk = floorTo(riskAmt / perUnit, lot.increment);
  if (byRisk < lot.min || byRisk * price < LIVE_MIN_ORDER_USD) {
    return { qty: 0, reason: `Risk of ${usd(perUnit)} a unit to the stop is over the per-trade loss limit (${usd(riskAmt)} on a ${usd(equity)} account).` };
  }
  const qty = Math.min(byCash, byRisk);
  const cap = Math.min((worstExit + riskAmt / qty) / (1 + fee), spend / qty);
  const limitPrice = floorTo(cap, lot.priceIncrement ?? (price >= 1 ? 0.01 : 1e-6));
  if (!(limitPrice > stop)) return { qty: 0, reason: "No room between the stop and the most a unit may cost." };
  return { qty, limitPrice };
}

/**
 * The simulator's lines in live units. A line not yet opened is sized for
 * the account under the owner's rules (or dropped with its reason); an open
 * line follows the simulator in proportion to its opening size: whole
 * shares rounded, so a one-share line keeps its share until the simulator's
 * last tranche goes, and a coin rounded down to its lot.
 */
export function scaleSimForLive(
  sim: SimLine[],
  mirror: MirrorLine[],
  scaleOf: Map<string, number>,
  equity: number,
  cash: number,
  opts: { tradingGain?: number; lots?: Map<string, Lot> } = {},
): { lines: SimLine[]; refused: { line: SimLine; reason: string }[] } {
  const byMirror = new Map(mirror.map((m) => [m.positionId, m]));
  const gain = opts.tradingGain ?? NaN;
  const lines: SimLine[] = [];
  const refused: { line: SimLine; reason: string }[] = [];
  for (const s of sim) {
    if (!s.automated || s.openedAt < LIVE_MIRROR_START) continue;
    const m = byMirror.get(s.positionId);
    const assetClass = s.assetClass ?? "us_equity";
    if (!m) {
      if (!LIVE_ASSET_CLASSES.includes(assetClass)) {
        refused.push({ line: s, reason: "Stock trade: the live account trades crypto and options only (owner's rule); it stays on paper." });
      } else if (assetClass === "option") {
        refused.push({
          line: s,
          reason: Number.isFinite(gain) && gain >= LIVE_OPTIONS_FROM_GAIN
            ? "Options aren't placed on the live account yet."
            : `Options open once trading has made ${usd(LIVE_OPTIONS_FROM_GAIN)} (so far ${Number.isFinite(gain) ? usd(gain) : "unknown"}).`,
        });
      } else {
        const lot = opts.lots?.get(s.symbol);
        const { qty, limitPrice, reason } = lot
          ? liveOpenQty(s.side, s.price, s.stop, equity, cash, liveRiskFraction(gain), lot)
          : { qty: 0, limitPrice: undefined, reason: "The coin's order size couldn't be read from the broker." };
        if (!(qty > 0)) refused.push({ line: s, reason: reason ?? "Not sized." });
        else lines.push({ ...s, qty, limitPrice });
      }
      continue;
    }
    const scale = scaleOf.get(s.positionId);
    if (isCryptoPair(m.symbol)) {
      const lot = opts.lots?.get(m.symbol);
      const scaled = scale && scale > 0 ? floorTo(s.qty * scale, lot?.increment ?? 1e-9) : m.simQty;
      lines.push({ ...s, qty: s.qty > 0 ? Math.max(lot?.min ?? 0, scaled) : 0 });
      continue;
    }
    // While the simulator holds any shares the line keeps at least one, so a
    // one-share line leaves only with the simulator's last tranche.
    const scaled = scale && scale > 0 ? Math.round(s.qty * scale) : m.simQty;
    lines.push({ ...s, qty: s.qty > 0 ? Math.max(1, scaled) : 0 });
  }
  return { lines, refused };
}

/**
 * One mirror pass for the owner's paper account. Called in the Automated
 * Portfolio Manager's scheduled run, so it sees the book that run left.
 */
export async function runPaperMirror(supabase: SupabaseClient): Promise<MirrorRunResult> {
  return runMirror(supabase, "paper");
}

/** One mirror pass for the owner's live account, when he has connected it. */
export async function runLiveMirror(supabase: SupabaseClient): Promise<MirrorRunResult> {
  return runMirror(supabase, "live");
}

async function runMirror(supabase: SupabaseClient, mode: MirrorMode): Promise<MirrorRunResult> {
  const started = Date.now();
  const deadline = started + MIRROR_BUDGET_MS;
  const result: MirrorRunResult = { ran: false, placed: 0, held: [], errors: [] };
  const off = (name: string) => (process.env[name] ?? "").trim().toLowerCase() === "true";
  if (mode === "paper" && off("PAPER_MIRROR_DISABLED")) return { ...result, reason: "PAPER_MIRROR_DISABLED" };
  if (mode === "live" && off("LIVE_MIRROR_DISABLED")) return { ...result, reason: "LIVE_MIRROR_DISABLED" };

  const userId = await ownerUserId(supabase);
  if (!userId) return { ...result, reason: "Owner account not found." };

  let creds: AlpacaCreds | null;
  if (mode === "paper") {
    creds = envCreds("paper");
    if (!creds || creds.mode !== "paper") return { ...result, reason: "No paper Alpaca key." };
  } else {
    // The owner's own connected live account, or nothing: never env keys.
    const conn = await readLiveAlpacaConnection(supabase, userId);
    creds = conn && conn.creds.mode === "live" ? conn.creds : null;
    if (!creds) return { ...result, reason: "No live account connected (or paused) in Settings." };
  }

  // One run at a time per account: overlapping runs would each act on the
  // same snapshot. The lease lapses on its own, so a run cut off mid-way
  // never locks the mirror for good.
  const lockId = mode === "paper" ? 1 : 2;
  const nowIso = new Date().toISOString();
  const lease = await supabase
    .from("paper_mirror_lock")
    .update({ held_until: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq("id", lockId)
    .lt("held_until", nowIso)
    .select("id");
  if (lease.error) throw new Error(`paper_mirror_lock: ${lease.error.message}`);
  if (!lease.data || lease.data.length === 0) {
    // Reported as an error so the route logs it: a lock row that never
    // frees (or is missing) would otherwise stop the mirror silently.
    return { ...result, reason: "Another mirror run is in progress.", errors: [`Mirror lease not taken for ${mode} (another run, or the lock row is missing).`] };
  }
  try {
    await mirrorPass(supabase, mode, creds, userId, deadline, result);
  } finally {
    await supabase.from("paper_mirror_lock").update({ held_until: new Date().toISOString() }).eq("id", lockId);
  }
  await settleFills(supabase, mode, creds, deadline).catch((err) => result.errors.push(`settle: ${String(err)}`));
  result.elapsedMs = Date.now() - started;
  return result;
}

/**
 * A line holding fewer shares than its target, with no order of its own
 * still working (its last add, or else its open, has settled), is
 * re-targeted to what the broker holds, so the planner never waits on it for
 * good (a partial fill, a part-filled broker stop, a write that failed after
 * a sale). The mismatch is logged. Mutates `mirror` in place.
 */
async function settleShortLines(
  supabase: SupabaseClient,
  mode: MirrorMode,
  creds: AlpacaCreds,
  mirror: MirrorLine[],
  brokerQty: Map<string, number>,
): Promise<void> {
  for (const m of mirror) {
    if (m.status !== "open") continue;
    const held = brokerQty.get(m.symbol) ?? 0;
    if (!(held > 0) || held >= m.targetQty) continue;
    const pendingId = m.addOrderId ?? m.openOrderId;
    const o = pendingId
      ? await getOrder(creds, pendingId).catch(() => null)
      : await getOrderByClientId(creds, `gsps-mirror-open-${m.positionId}`).catch(() => null);
    if (!o || !["filled", ...TERMINAL_UNFILLED].includes(o.status)) continue; // still working, or unreadable
    await must(
      supabase.from("paper_mirror_lines").update({ target_qty: held, add_order_id: null }).eq("position_id", m.positionId).eq("mode", mode),
      "line retarget",
    );
    await logEvent(supabase, mode, {
      position_id: m.positionId, symbol: m.symbol, side: m.side, action: "retarget", qty: held, sim_price: null, stop_price: null,
      broker_order_id: null, status: "adjusted", note: `Broker holds ${held}, below the line's ${m.targetQty}; re-targeted to what is held.`,
    });
    m.targetQty = held;
    m.addOrderId = null;
  }
}

/** A broker position's symbol as the mirror keys it (a held coin comes back as "BTCUSD"). */
function mirrorSymbol(p: AlpacaPosition): string {
  return p.asset_class === "crypto" ? cryptoPair(p.symbol) : p.symbol;
}

/** The symbol for a position call ("BTCUSD" for a coin). */
function brokerSymbol(symbol: string): string {
  return symbol.replace("/", "");
}

/** Each live line's opening size as a fraction of the simulator's, by position. */
async function readLiveScales(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from("paper_mirror_lines").select("position_id, scale").eq("mode", "live").in("position_id", ids);
  if (error) throw new Error(`paper_mirror_lines scale: ${error.message}`);
  for (const r of data ?? []) if (r.scale != null) out.set(r.position_id as string, num(r.scale));
  return out;
}

async function mirrorPass(
  supabase: SupabaseClient,
  mode: MirrorMode,
  creds: AlpacaCreds,
  userId: string,
  deadline: number,
  result: MirrorRunResult,
): Promise<void> {
  const simAll = await readSimLines(supabase, userId);
  const [mirror, marketOpen, account, positions] = await Promise.all([
    readMirrorLines(supabase, mode, simAll.map((s) => s.positionId)),
    isMarketOpen(creds),
    getAccount(creds),
    getPositions(creds),
  ]);
  const brokerQty = new Map<string, number>();
  const brokerHeld = new Set<string>();
  const sideOf = new Map(mirror.filter((m) => m.status === "open").map((m) => [m.symbol, m.side]));
  for (const p of positions) {
    if (!(Math.abs(num(p.qty)) > 0)) continue;
    const sym = mirrorSymbol(p);
    brokerHeld.add(sym);
    const want = sideOf.get(sym);
    if (want && p.side === want) brokerQty.set(sym, Math.abs(num(p.qty)));
  }
  // Each coin's lot (smallest order, size step, price step), read once a run.
  const lots = new Map<string, Lot>();
  const coins = new Set([...simAll.map((s) => s.symbol), ...mirror.filter((m) => m.status === "open").map((m) => m.symbol)].filter(isCryptoPair));
  await Promise.all(
    [...coins].map(async (sym) => {
      const a = await getAsset(creds, sym).catch(() => getAsset(creds, brokerSymbol(sym))).catch(() => null);
      if (a && a.tradable) {
        lots.set(sym, {
          increment: a.minTradeIncrement ?? 1e-9, min: a.minOrderSize ?? 0, priceIncrement: a.priceIncrement ?? undefined,
          stopGap: CRYPTO_STOP_LIMIT_GAP, feeRate: CRYPTO_FEE_RATE,
        });
      }
    }),
  );
  const priceStep = (sym: string, price: number) => lots.get(sym)?.priceIncrement ?? (price >= 1 ? 0.01 : 1e-6);
  /** The protective stop for a line: a stop-limit for a coin (the broker takes no plain stop on crypto). */
  const protect = (symbol: string, side: Side, qty: number, stop: number) => {
    const input: ExitOrderInput = { symbol, side: orderSide(side, false), qty, stopLoss: stop };
    if (isCryptoPair(symbol)) {
      input.stopLoss = roundTo(stop, priceStep(symbol, stop));
      input.stopLimit = floorTo(stop * (1 - CRYPTO_STOP_LIMIT_GAP), priceStep(symbol, stop));
    }
    return placeExitOrder(creds, input);
  };
  /** A coin's buy pays its fee in the coin, so what is held is read back rather than taken from the fill. */
  const boughtQty = async (symbol: string, filled: number): Promise<number> => {
    if (!isCryptoPair(symbol)) return filled;
    for (let i = 0; i < 2; i++) {
      const now = await getPositions(creds).catch(() => [] as AlpacaPosition[]);
      const p = now.find((x) => mirrorSymbol(x) === symbol);
      const q = p ? Math.abs(num(p.qty)) : NaN;
      if (q > 0 && q <= filled) return q;
      if (i === 0) await sleep(400);
    }
    // Unread: the fill less the most the fee can take, so the stop is never
    // sized above what is held.
    return floorTo(filled * (1 - CRYPTO_FEE_RATE), lots.get(symbol)?.increment ?? 1e-9);
  };
  const equity = num(account.equity);
  const lastEquity = num(account.last_equity);
  const dayTrades = num(account.daytrade_count ?? NaN);
  // Options aren't mirrored: the broker takes no stop order on a contract.
  let sim = simAll.filter((s) => s.assetClass !== "option");
  let gate: MirrorGate;
  if (mode === "paper") {
    gate = {
      disabled: false,
      tradingHalted: tradingDisabled(),
      marketOpen,
      dayLossHold: dayLossHold(equity, lastEquity),
      holdNote: `Paper account down ${DAILY_LOSS_HOLD_PCT * 100}% or more today.`,
      now: Date.now(),
    };
  } else {
    // Every line opened today may need a same-day sell, which is a day
    // trade: opens stop while the day trades left would not cover each of
    // them, so no line is opened that the broker won't let us close today.
    const today = nyDay(Date.now());
    const openToday = mirror.filter((m) => m.status === "open" && !isCryptoPair(m.symbol) && m.openedAt && nyDay(Date.parse(m.openedAt)) === today).length;
    const pdtHold = equity < PDT_EQUITY && !(dayTrades + openToday < PDT_MAX_DAY_TRADES);
    const belowFloor = !(equity >= LIVE_EQUITY_FLOOR);
    const downOnDay = !(lastEquity > 0) || (equity - lastEquity) / lastEquity <= -LIVE_DAY_LOSS_HOLD_PCT;
    gate = {
      disabled: false,
      tradingHalted: tradingDisabled(),
      marketOpen,
      dayLossHold: belowFloor || downOnDay,
      holdNote: belowFloor ? `Live account below the $${LIVE_EQUITY_FLOOR} floor.` : `Live account down ${LIVE_DAY_LOSS_HOLD_PCT * 100}% or more today.`,
      pdtOpenHold: pdtHold,
      pdtNote: `Day trades used (${Number.isFinite(dayTrades) ? dayTrades : "unknown"} of ${PDT_MAX_DAY_TRADES} in five sessions, ${openToday} line(s) opened today): no new opens under $25,000.`,
      maxOpenLines: LIVE_MAX_OPEN_LINES,
      sameDaySellBlocked: dayTradeBlocked(dayTrades, equity),
      allowAdds: false,
      now: Date.now(),
    };
    const scaleOf = await readLiveScales(supabase, mirror.map((m) => m.positionId));
    // What trading has made: equity less the cash put in, so a deposit never
    // moves a step. Unreadable transfers leave the first step.
    // No deposits on record means the record can't be trusted (the account
    // was funded): the first step, never equity read as all gain.
    const deposits = await getNetDeposits(creds).catch(() => NaN);
    const netDeposits = deposits > 0 ? deposits : NaN;
    const scaled = scaleSimForLive(simAll, mirror, scaleOf, equity, num(account.cash), { tradingGain: equity - netDeposits, lots });
    sim = scaled.lines;
    // What the small account could not take is recorded once per position,
    // and only while the open would otherwise have been placed (in session,
    // within the lag), so the record shows what a small account meets.
    for (const { line, reason } of scaled.refused) {
      if ((!marketOpen && !isCryptoPair(line.symbol)) || gate.now - Date.parse(line.openedAt) > MAX_OPEN_LAG_MS) continue;
      const { error } = await supabase.from("paper_mirror_lines").insert({
        mode, position_id: line.positionId, symbol: line.symbol, side: line.side, status: "missed", target_qty: 0, note: reason,
      });
      if (!error) {
        await logEvent(supabase, mode, {
          position_id: line.positionId, symbol: line.symbol, side: line.side, action: "missed", qty: null, sim_price: line.price,
          stop_price: line.stop, broker_order_id: null, status: "skipped", note: reason,
        });
      }
    }
  }
  result.ran = true;
  await settleShortLines(supabase, mode, creds, mirror, brokerQty);
  const actions = planMirrorActions(sim, mirror, brokerQty, gate, brokerHeld);
  const mirrorById = new Map(mirror.map((m) => [m.positionId, m]));
  const lines = () => supabase.from("paper_mirror_lines");

  const markBrokerStopped = async (positionId: string, symbol: string, stop: AlpacaOrder | null) => {
    const m = mirrorById.get(positionId);
    finished.add(positionId);
    await must(lines().update({ status: "broker_stopped", closed_at: new Date().toISOString() }).eq("position_id", positionId).eq("mode", mode), "line stopped");
    await logEvent(supabase, mode, {
      position_id: positionId, symbol, side: m?.side ?? null, action: "broker_stopped", qty: m?.stopQty ?? null, sim_price: null,
      stop_price: m?.stopPrice ?? null, broker_order_id: m?.stopOrderId ?? null, status: stop?.status ?? "unknown",
      note: stop?.status === "filled" ? "The broker's stop filled before the simulator's exit; not re-bought." : "The broker holds no shares for this line; not re-bought.",
      ...fillFields(stop),
    });
  };

  // A line the broker stopped mid-run takes no further action this run.
  const finished = new Set<string>();
  for (const a of actions) {
    if (finished.has(a.positionId)) continue;
    if (a.kind === "hold") {
      result.held.push(`${a.symbol}: ${a.reason}`);
      continue;
    }
    if (Date.now() > deadline) {
      result.held.push(`${a.symbol}: ${a.kind} left for the next run (time budget).`);
      continue;
    }
    try {
      switch (a.kind) {
        case "missed": {
          await must(lines().insert({ mode, position_id: a.positionId, symbol: a.symbol, side: a.side, status: "missed", target_qty: 0, note: a.reason }), "line missed");
          await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "missed", qty: null, sim_price: null, stop_price: null, broker_order_id: null, status: "skipped", note: a.reason });
          break;
        }
        case "open": {
          // The line is claimed before the order: its primary key stops a
          // second run from opening it again, and the client order id stops
          // the broker from taking the same open twice.
          const simQtyNow = simAll.find((x) => x.positionId === a.positionId)?.qty ?? a.qty;
          await must(
            lines().insert({ mode, position_id: a.positionId, symbol: a.symbol, side: a.side, status: "open", target_qty: a.qty, sim_qty: a.qty, scale: simQtyNow > 0 ? a.qty / simQtyNow : 1 }),
            "claim line",
          );
          const clientId = `gsps-mirror-open-${a.positionId}`;
          let order: AlpacaOrder;
          try {
            order = (await placeOrder(
              creds,
              {
                ...(a.limitPrice != null
                  ? { symbol: a.symbol, side: orderSide(a.side, true), qty: a.qty, type: "limit" as const, limitPrice: a.limitPrice, clientOrderId: clientId }
                  : { symbol: a.symbol, side: orderSide(a.side, true), qty: a.qty, type: "market" as const, clientOrderId: clientId }),
                // Crypto takes no day order: immediate-or-cancel, so a coin's
                // open can never rest unprotected.
                ...(isCryptoPair(a.symbol) ? { timeInForce: "ioc" as const } : {}),
              },
            )) as AlpacaOrder;
          } catch (err) {
            // An error can come after the order reached the broker (a
            // timeout): the broker is asked before the line is given up.
            const reached = await getOrderByClientId(creds, clientId).catch(() => null);
            if (!reached) {
              await lines().update({ status: "missed", note: `Open refused: ${String(err).slice(0, 300)}` }).eq("position_id", a.positionId).eq("mode", mode);
              throw err;
            }
            order = reached;
          }
          result.placed++;
          await must(lines().update({ open_order_id: order.id }).eq("position_id", a.positionId).eq("mode", mode), "line open order");
          let settled = await settleOrder(creds, order.id);
          if (a.limitPrice != null && !["filled", ...TERMINAL_UNFILLED].includes(settled.status)) {
            // A limit the market has moved past is not left resting: the
            // simulator's moment has gone. Whatever filled is kept.
            await cancelOrder(creds, order.id).catch(() => undefined);
            settled = await settleOrder(creds, order.id);
          }
          await logEvent(supabase, mode, {
            position_id: a.positionId, symbol: a.symbol, side: a.side, action: "open", qty: a.qty, sim_price: a.simPrice, stop_price: null, broker_order_id: order.id, status: settled.status,
            note: a.limitPrice != null ? `Limit ${a.limitPrice}.` : null, ...fillFields(settled),
          });
          const partial = TERMINAL_UNFILLED.includes(settled.status) && num(settled.filled_qty) > 0 ? await boughtQty(a.symbol, num(settled.filled_qty)) : num(settled.filled_qty);
          if (TERMINAL_UNFILLED.includes(settled.status) && !(partial > 0)) {
            await must(lines().update({ status: "missed", note: `Broker ${settled.status} the open.` }).eq("position_id", a.positionId).eq("mode", mode), "line missed");
          } else if (TERMINAL_UNFILLED.includes(settled.status)) {
            // Part filled, the rest cancelled: the line keeps what it holds,
            // and its stop goes on now, sized to those shares.
            await must(lines().update({ target_qty: partial, note: `Open part filled (${partial} of ${a.qty}).` }).eq("position_id", a.positionId).eq("mode", mode), "line target");
            if (a.stop != null) {
              const stopOrder = await protect(a.symbol, a.side, partial, a.stop);
              await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: partial }).eq("position_id", a.positionId).eq("mode", mode), "line stop");
              await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty: partial, sim_price: null, stop_price: a.stop, broker_order_id: stopOrder.id, status: stopOrder.status, note: null });
            }
          } else if (settled.status === "filled" && a.stop != null && !(a.side === "long" ? num(settled.filled_avg_price) > a.stop : num(settled.filled_avg_price) < a.stop)) {
            // Filled at or past the stop (a gap): the broker would refuse the
            // stop, and the plan's exit has already been met. Out at once.
            const qty = await boughtQty(a.symbol, num(settled.filled_qty));
            let out: AlpacaOrder;
            try {
              out = (await closePosition(creds, brokerSymbol(a.symbol), qty)) as AlpacaOrder;
            } catch (err) {
              // The sell was refused: the stop goes on instead, so the shares
              // are never left bare (the broker may refuse it too while the
              // price is under it; then set_stop tries again each run).
              let stopOrder: AlpacaOrder;
              try {
                stopOrder = await protect(a.symbol, a.side, qty, a.stop);
              } catch (stopErr) {
                throw new Error(`${err instanceof Error ? err.message : String(err)}; stop not placed: ${stopErr instanceof Error ? stopErr.message : String(stopErr)}`);
              }
              await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: qty }).eq("position_id", a.positionId).eq("mode", mode), "line stop");
              throw err;
            }
            result.placed++;
            await must(lines().update({ status: "closed", closed_at: new Date().toISOString(), note: "Filled at or past the stop; closed at once." }).eq("position_id", a.positionId).eq("mode", mode), "line closed");
            const outSettled = await settleOrder(creds, out.id);
            await logEvent(supabase, mode, {
              position_id: a.positionId, symbol: a.symbol, side: a.side, action: "close", qty, sim_price: null, stop_price: a.stop, broker_order_id: out.id, status: outSettled.status,
              note: `Open filled at ${num(settled.filled_avg_price).toFixed(2)}, at or past the stop ${a.stop.toFixed(2)}.`, ...fillFields(outSettled),
            });
          } else if (settled.status === "filled" && a.stop != null) {
            const filled = num(settled.filled_qty);
            const qty = await boughtQty(a.symbol, filled);
            const stopOrder = await protect(a.symbol, a.side, qty, a.stop);
            // A coin's fee comes out of the coin: the line targets what is held.
            const target = qty < filled ? { target_qty: qty } : {};
            await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: qty, ...target }).eq("position_id", a.positionId).eq("mode", mode), "line stop");
            await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty, sim_price: null, stop_price: a.stop, broker_order_id: stopOrder.id, status: stopOrder.status, note: null });
          }
          break;
        }
        case "add": {
          const m = mirrorById.get(a.positionId);
          const before = m?.targetQty ?? 0;
          const seq = (m?.addSeq ?? 0) + 1;
          // Each add has its own number in its client order id, so the
          // broker refuses only a true repeat of the same add, never a later
          // one. Target first (the planner reads an unfilled add as "still
          // filling"), then the order.
          const clientId = `gsps-mirror-add-${a.positionId}-${seq}`;
          await must(lines().update({ target_qty: a.targetAfter }).eq("position_id", a.positionId).eq("mode", mode), "line target");
          let order: AlpacaOrder;
          try {
            order = (await placeOrder(creds, {
              symbol: a.symbol, side: orderSide(a.side, true), qty: a.qty, type: "market", clientOrderId: clientId,
              // Crypto takes no day order.
              ...(isCryptoPair(a.symbol) ? { timeInForce: "ioc" as const } : {}),
            })) as AlpacaOrder;
          } catch (err) {
            const reached = await getOrderByClientId(creds, clientId).catch(() => null);
            if (!reached) {
              await lines().update({ target_qty: before }).eq("position_id", a.positionId).eq("mode", mode);
              throw err;
            }
            order = reached;
          }
          result.placed++;
          await must(lines().update({ add_order_id: order.id, add_seq: seq, sim_qty: a.simAfter }).eq("position_id", a.positionId).eq("mode", mode), "line add order");
          if (m) {
            m.addSeq = seq;
            m.addOrderId = order.id;
          }
          const settled = await settleOrder(creds, order.id);
          if (TERMINAL_UNFILLED.includes(settled.status)) {
            const got = num(settled.filled_qty);
            await must(lines().update({ target_qty: before + (got > 0 ? got : 0) }).eq("position_id", a.positionId).eq("mode", mode), "line target");
          }
          await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "add", qty: a.qty, sim_price: a.simPrice, stop_price: null, broker_order_id: order.id, status: settled.status, note: null, ...fillFields(settled) });
          break;
        }
        case "reduce":
        case "close": {
          // The resting stop reserves the shares: it is cancelled and the
          // cancel confirmed first. If it had already filled, the line was
          // stopped at the broker and no sell goes out.
          const m = mirrorById.get(a.positionId);
          const priorStop = m?.stopOrderId ? { price: m.stopPrice, qty: m.stopQty } : null;
          if (m?.stopOrderId) {
            const filledStop = await cancelStop(creds, m.stopOrderId);
            if (filledStop) {
              await markBrokerStopped(a.positionId, a.symbol, filledStop);
              break;
            }
            await must(lines().update({ stop_order_id: null, stop_qty: null }).eq("position_id", a.positionId).eq("mode", mode), "line stop cleared");
            m.stopOrderId = null;
          }
          // closePosition never sells more than the account holds, so it can
          // never open a short.
          let order: AlpacaOrder;
          try {
            order = (await closePosition(creds, brokerSymbol(a.symbol), a.qty)) as AlpacaOrder;
          } catch (err) {
            // The sell was refused after the stop came off: the stop goes
            // back on before anything else, so the shares are never bare.
            if (priorStop && usableStop(priorStop.price) && m) {
              const qty = brokerQty.get(a.symbol) ?? priorStop.qty ?? a.qty;
              let back: AlpacaOrder;
              try {
                back = await protect(a.symbol, a.side, qty, priorStop.price);
              } catch (restoreErr) {
                // Both are reported: the sell's refusal and the stop's.
                throw new Error(`${err instanceof Error ? err.message : String(err)}; stop not restored: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
              }
              await must(lines().update({ stop_order_id: back.id, stop_price: priorStop.price, stop_qty: qty }).eq("position_id", a.positionId).eq("mode", mode), "line stop restored");
              m.stopOrderId = back.id;
              m.stopQty = qty;
              await logEvent(supabase, mode, {
                position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty, sim_price: null, stop_price: priorStop.price,
                broker_order_id: back.id, status: back.status, note: "Stop restored after the sell was refused.",
              });
            }
            throw err;
          }
          result.placed++;
          if (a.kind === "close") {
            await must(lines().update({ status: "closed", closed_at: new Date().toISOString() }).eq("position_id", a.positionId).eq("mode", mode), "line closed");
          } else {
            await must(lines().update({ target_qty: a.targetAfter, sim_qty: a.targetAfter }).eq("position_id", a.positionId).eq("mode", mode), "line target");
          }
          const settled = await settleOrder(creds, order.id);
          await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: a.kind, qty: a.qty, sim_price: a.kind === "reduce" ? a.simPrice : null, stop_price: null, broker_order_id: order.id, status: settled.status, note: null, ...fillFields(settled) });
          break;
        }
        case "set_stop": {
          const m = mirrorById.get(a.positionId);
          let stopOrder: AlpacaOrder | null = null;
          // A coin's stop is a stop-limit: its limit moves with it.
          const move = isCryptoPair(a.symbol)
            ? { stopPrice: roundTo(a.stop, priceStep(a.symbol, a.stop)), limitPrice: floorTo(a.stop * (1 - CRYPTO_STOP_LIMIT_GAP), priceStep(a.symbol, a.stop)), qty: a.qty }
            : { stopPrice: a.stop, qty: a.qty };
          if (m?.stopOrderId) {
            try {
              stopOrder = await replaceOrder(creds, m.stopOrderId, move);
            } catch (err) {
              // A stop that is no longer open (filled, cancelled outside the
              // app, or expired) can't be replaced: a filled one means the
              // broker stopped the line; anything else gets a fresh stop.
              const old = await getOrder(creds, m.stopOrderId).catch(() => null);
              if (old?.status === "filled") {
                await markBrokerStopped(a.positionId, a.symbol, old);
                break;
              }
              if (old?.status === "replaced" && old.replaced_by) {
                // An earlier replace went through but its id wasn't stored.
                stopOrder = await replaceOrder(creds, old.replaced_by, move);
              } else if (old && !["canceled", ...TERMINAL_UNFILLED].includes(old.status)) {
                throw err;
              }
            }
          }
          if (!stopOrder) stopOrder = await protect(a.symbol, a.side, a.qty, a.stop);
          await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: a.qty }).eq("position_id", a.positionId).eq("mode", mode), "line stop");
          await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty: a.qty, sim_price: null, stop_price: a.stop, broker_order_id: stopOrder.id, status: stopOrder.status, note: null });
          break;
        }
        case "broker_stopped": {
          const m = mirrorById.get(a.positionId);
          const stop = m?.stopOrderId ? await getOrder(creds, m.stopOrderId).catch(() => null) : null;
          await markBrokerStopped(a.positionId, a.symbol, stop);
          break;
        }
        case "check_open": {
          const m = mirrorById.get(a.positionId);
          // Claimed but its order id never stored (a cut-off run): the order
          // is found by the client order id it was sent with, and a claim
          // whose order never reached the broker is marked missed.
          const o = m?.openOrderId
            ? await getOrder(creds, m.openOrderId)
            : await getOrderByClientId(creds, `gsps-mirror-open-${a.positionId}`);
          if (!o) {
            await must(lines().update({ status: "missed", note: "The open never reached the broker." }).eq("position_id", a.positionId).eq("mode", mode), "line missed");
            break;
          }
          if (!m?.openOrderId) await must(lines().update({ open_order_id: o.id }).eq("position_id", a.positionId).eq("mode", mode), "line open order");
          if (TERMINAL_UNFILLED.includes(o.status) && !(num(o.filled_qty) > 0)) {
            await must(lines().update({ status: "missed", note: `Broker ${o.status} the open.` }).eq("position_id", a.positionId).eq("mode", mode), "line missed");
          } else if (o.status === "filled" || TERMINAL_UNFILLED.includes(o.status)) {
            // Filled, and the broker holds nothing on the line's side: the
            // shares left outside the mirror. Closed, never re-bought.
            await must(lines().update({ status: "closed", closed_at: new Date().toISOString(), note: "Open filled but no shares held; closed outside the mirror." }).eq("position_id", a.positionId).eq("mode", mode), "line closed");
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${a.kind} ${a.symbol}: ${msg}`);
      await logEvent(supabase, mode, { position_id: a.positionId, symbol: a.symbol, side: "side" in a ? a.side : null, action: a.kind, qty: "qty" in a ? a.qty : null, sim_price: null, stop_price: null, broker_order_id: null, status: "error", note: msg.slice(0, 500) }).catch(() => undefined);
    }
  }
}

/**
 * Fills not yet known when they were logged: read each from the broker and
 * write its price and time, so every row ends with the broker's own fill
 * beside the simulator's. Bounded by the run's deadline.
 */
async function settleFills(supabase: SupabaseClient, mode: MirrorMode, creds: AlpacaCreds, deadline: number): Promise<void> {
  const { data, error } = await supabase
    .from("paper_mirror_events")
    .select("id, broker_order_id")
    .eq("mode", mode)
    .in("action", ["open", "add", "reduce", "close", "broker_stopped"])
    .is("fill_price", null)
    .not("broker_order_id", "is", null)
    .not("status", "in", "(canceled,expired,rejected,done_for_day,error)")
    .order("id", { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (Date.now() > deadline) return;
    const o = await getOrder(creds, row.broker_order_id as string);
    const patch: Record<string, unknown> = { status: o.status };
    if (o.status === "filled") {
      patch.fill_price = num(o.filled_avg_price);
      patch.filled_qty = num(o.filled_qty);
      patch.filled_at = o.filled_at ?? null;
    }
    await must(supabase.from("paper_mirror_events").update(patch).eq("id", row.id), "settle");
  }
}
