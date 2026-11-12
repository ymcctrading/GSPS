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
 * Paper only, by construction: the credentials are `envCreds("paper")` (the
 * app's one Alpaca key, which reaches `paper-api.alpaca.markets` only), and
 * nothing here reads `broker_connections` or `envCreds("live")`. No order
 * this module places can reach money.
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
  getOrder,
  getOrderByClientId,
  getPositions,
  placeExitOrder,
  placeOrder,
  replaceOrder,
  type AlpacaCreds,
  type AlpacaOrder,
} from "@/lib/brokers/alpaca";
import { tradingDisabled } from "@/lib/trade/kill-switch";
import { OWNER_EMAILS } from "@/lib/auth/owner";

/** Positions opened before this are never mirrored (they'd be bought at today's price). */
export const MIRROR_START = "2026-11-13T00:00:00Z";
/** Most mirrored lines open at once (ref: SRC-004 p.46, five stocks). */
export const MAX_OPEN_LINES = 5;
/** Engineering choice: no new opens once the paper account is down this much on the day. */
export const DAILY_LOSS_HOLD_PCT = 0.03;
/** Engineering choice: an open later than this after the simulator's fill is not chased. */
export const MAX_OPEN_LAG_MS = 60 * 60 * 1000;

export type Side = "long" | "short";

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
}

export type MirrorStatus = "open" | "closed" | "broker_stopped" | "missed";

export interface MirrorLine {
  positionId: string;
  symbol: string;
  side: Side;
  status: MirrorStatus;
  /** Shares the simulator held when the mirror last opened, added or reduced. */
  targetQty: number;
  /** The broker order that opened the line. */
  openOrderId: string | null;
  stopOrderId: string | null;
  stopPrice: number | null;
  stopQty: number | null;
}

export interface MirrorGate {
  disabled: boolean;
  tradingHalted: boolean;
  marketOpen: boolean;
  dayLossHold: boolean;
  now: number;
}

export type MirrorAction =
  | { kind: "open"; positionId: string; symbol: string; side: Side; qty: number; simPrice: number; stop: number | null }
  | { kind: "add"; positionId: string; symbol: string; side: Side; qty: number; simPrice: number; targetAfter: number }
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
  const canOpen = !gate.tradingHalted && gate.marketOpen && !gate.dayLossHold;
  const openReason = gate.tradingHalted
    ? "Trading is halted (TRADING_DISABLED)."
    : !gate.marketOpen
      ? "Market closed."
      : gate.dayLossHold
        ? `Paper account down ${DAILY_LOSS_HOLD_PCT * 100}% or more today.`
        : "Not opened.";
  const mirroredSymbols = new Set(openMirror.map((m) => m.symbol));

  for (const m of openMirror) {
    if (bySim.has(m.positionId)) continue;
    const held = brokerQty.get(m.symbol) ?? 0;
    if (held <= 0) {
      actions.push(m.stopOrderId ? { kind: "broker_stopped", positionId: m.positionId, symbol: m.symbol } : { kind: "check_open", positionId: m.positionId, symbol: m.symbol });
      continue;
    }
    if (gate.marketOpen) actions.push({ kind: "close", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: held });
    else actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: "Close waits for the open market." });
  }

  for (const s of sim) {
    if (!s.automated || s.openedAt < MIRROR_START || !(s.qty > 0)) continue;
    const m = byMirror.get(s.positionId);
    if (!m) {
      const lag = gate.now - Date.parse(s.openedAt);
      if (!(lag <= MAX_OPEN_LAG_MS)) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: "The simulator's fill is more than an hour old; not chased." });
      } else if (!canOpen) {
        actions.push({ kind: "hold", positionId: s.positionId, symbol: s.symbol, reason: openReason });
      } else if (closing.has(s.symbol)) {
        actions.push({ kind: "hold", positionId: s.positionId, symbol: s.symbol, reason: "Waits for the earlier line in this symbol to close." });
      } else if (openLines >= MAX_OPEN_LINES) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: `Already ${MAX_OPEN_LINES} mirrored lines open.` });
      } else if (mirroredSymbols.has(s.symbol) || brokerHeld.has(s.symbol)) {
        actions.push({ kind: "missed", positionId: s.positionId, symbol: s.symbol, side: s.side, reason: "The paper account already holds this symbol." });
      } else {
        actions.push({ kind: "open", positionId: s.positionId, symbol: s.symbol, side: s.side, qty: s.qty, simPrice: s.price, stop: usableStop(s.stop) ? s.stop : null });
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
      continue;
    }
    if (s.qty > m.targetQty) {
      if (canOpen) {
        actions.push({ kind: "add", positionId: m.positionId, symbol: m.symbol, side: m.side, qty: s.qty - m.targetQty, simPrice: s.price, targetAfter: s.qty });
        // The stop is re-sized next run, once the add's shares are held.
        continue;
      }
      actions.push({ kind: "hold", positionId: m.positionId, symbol: m.symbol, reason: `Add not placed: ${openReason}` });
    }
    let after = held;
    if (s.qty < held) {
      if (gate.marketOpen) {
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
async function logEvent(supabase: SupabaseClient, row: EventRow): Promise<void> {
  await must(supabase.from("paper_mirror_events").insert(row), "paper_mirror_events");
}

async function isMarketOpen(creds: AlpacaCreds): Promise<boolean> {
  try {
    const res = await fetch("https://paper-api.alpaca.markets/v2/clock", {
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
  const rows = (positions ?? []).filter((p) => p.asset_class === "us_equity");
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
    return {
      positionId: p.id as string,
      symbol: p.symbol as string,
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
async function readMirrorLines(supabase: SupabaseClient, simIds: string[]): Promise<MirrorLine[]> {
  const cols = "position_id, symbol, side, status, target_qty, open_order_id, stop_order_id, stop_price, stop_qty";
  const query = supabase.from("paper_mirror_lines").select(cols);
  const { data, error } =
    simIds.length > 0 ? await query.or(`status.eq.open,position_id.in.(${simIds.join(",")})`) : await query.eq("status", "open");
  if (error) throw new Error(`paper_mirror_lines: ${error.message}`);
  return (data ?? []).map((r) => ({
    positionId: r.position_id as string,
    symbol: r.symbol as string,
    side: (r.side === "short" ? "short" : "long") as Side,
    status: r.status as MirrorStatus,
    targetQty: num(r.target_qty),
    openOrderId: (r.open_order_id as string | null) ?? null,
    stopOrderId: (r.stop_order_id as string | null) ?? null,
    stopPrice: r.stop_price == null ? null : num(r.stop_price),
    stopQty: r.stop_qty == null ? null : num(r.stop_qty),
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
async function cancelStop(creds: AlpacaCreds, stopId: string): Promise<AlpacaOrder | null> {
  await cancelOrder(creds, stopId).catch(() => undefined);
  const o = await settleOrder(creds, stopId);
  if (o.status === "filled") return o;
  if (o.status === "canceled" || TERMINAL_UNFILLED.includes(o.status)) return null;
  throw new Error(`Stop ${stopId} not confirmed cancelled (${o.status}); sell not sent.`);
}

/**
 * One mirror pass for the owner's account. Called last in the Automated
 * Portfolio Manager's scheduled run, so it sees the book that run left.
 */
export async function runPaperMirror(supabase: SupabaseClient): Promise<MirrorRunResult> {
  const started = Date.now();
  const deadline = started + MIRROR_BUDGET_MS;
  const result: MirrorRunResult = { ran: false, placed: 0, held: [], errors: [] };
  if ((process.env.PAPER_MIRROR_DISABLED ?? "").trim().toLowerCase() === "true") {
    return { ...result, reason: "PAPER_MIRROR_DISABLED" };
  }
  const creds = envCreds("paper");
  if (!creds || creds.mode !== "paper") return { ...result, reason: "No paper Alpaca key." };

  const userId = await ownerUserId(supabase);
  if (!userId) return { ...result, reason: "Owner account not found." };

  const sim = await readSimLines(supabase, userId);
  const [mirror, marketOpen, account, positions] = await Promise.all([
    readMirrorLines(supabase, sim.map((s) => s.positionId)),
    isMarketOpen(creds),
    getAccount(creds),
    getPositions(creds),
  ]);
  const brokerQty = new Map<string, number>();
  const brokerHeld = new Set<string>();
  const sideOf = new Map(mirror.filter((m) => m.status === "open").map((m) => [m.symbol, m.side]));
  for (const p of positions) {
    if (!(Math.abs(num(p.qty)) > 0)) continue;
    brokerHeld.add(p.symbol);
    const want = sideOf.get(p.symbol);
    if (want && p.side === want) brokerQty.set(p.symbol, Math.abs(num(p.qty)));
  }
  const gate: MirrorGate = {
    disabled: false,
    tradingHalted: tradingDisabled(),
    marketOpen,
    dayLossHold: dayLossHold(num(account.equity), num(account.last_equity)),
    now: Date.now(),
  };
  result.ran = true;
  const actions = planMirrorActions(sim, mirror, brokerQty, gate, brokerHeld);
  const mirrorById = new Map(mirror.map((m) => [m.positionId, m]));
  const lines = () => supabase.from("paper_mirror_lines");

  const markBrokerStopped = async (positionId: string, symbol: string, stop: AlpacaOrder | null) => {
    const m = mirrorById.get(positionId);
    await must(lines().update({ status: "broker_stopped", closed_at: new Date().toISOString() }).eq("position_id", positionId), "line stopped");
    await logEvent(supabase, {
      position_id: positionId, symbol, side: m?.side ?? null, action: "broker_stopped", qty: m?.stopQty ?? null, sim_price: null,
      stop_price: m?.stopPrice ?? null, broker_order_id: m?.stopOrderId ?? null, status: stop?.status ?? "unknown",
      note: stop?.status === "filled" ? "The broker's stop filled before the simulator's exit; not re-bought." : "The broker holds no shares for this line; not re-bought.",
      ...fillFields(stop),
    });
  };

  for (const a of actions) {
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
          await must(lines().insert({ position_id: a.positionId, symbol: a.symbol, side: a.side, status: "missed", target_qty: 0, note: a.reason }), "line missed");
          await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "missed", qty: null, sim_price: null, stop_price: null, broker_order_id: null, status: "skipped", note: a.reason });
          break;
        }
        case "open": {
          // The line is claimed before the order: its primary key stops a
          // second run from opening it again, and the client order id stops
          // the broker from taking the same open twice.
          await must(lines().insert({ position_id: a.positionId, symbol: a.symbol, side: a.side, status: "open", target_qty: a.qty }), "claim line");
          let order: AlpacaOrder;
          try {
            order = (await placeOrder(creds, { symbol: a.symbol, side: orderSide(a.side, true), qty: a.qty, type: "market", clientOrderId: `gsps-mirror-open-${a.positionId}` })) as AlpacaOrder;
          } catch (err) {
            await lines().update({ status: "missed", note: `Open refused: ${String(err).slice(0, 300)}` }).eq("position_id", a.positionId);
            throw err;
          }
          result.placed++;
          await must(lines().update({ open_order_id: order.id }).eq("position_id", a.positionId), "line open order");
          const settled = await settleOrder(creds, order.id);
          await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "open", qty: a.qty, sim_price: a.simPrice, stop_price: null, broker_order_id: order.id, status: settled.status, note: null, ...fillFields(settled) });
          if (TERMINAL_UNFILLED.includes(settled.status)) {
            await must(lines().update({ status: "missed", note: `Broker ${settled.status} the open.` }).eq("position_id", a.positionId), "line missed");
          } else if (settled.status === "filled" && a.stop != null) {
            const qty = num(settled.filled_qty);
            const stopOrder = await placeExitOrder(creds, { symbol: a.symbol, side: orderSide(a.side, false), qty, stopLoss: a.stop });
            await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: qty }).eq("position_id", a.positionId), "line stop");
            await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty, sim_price: null, stop_price: a.stop, broker_order_id: stopOrder.id, status: stopOrder.status, note: null });
          }
          break;
        }
        case "add": {
          const m = mirrorById.get(a.positionId);
          const before = m?.targetQty ?? 0;
          // Target first (the planner reads an unfilled add as "still
          // filling"), then the order; the client order id is per target, so
          // a retried add is refused by the broker.
          await must(lines().update({ target_qty: a.targetAfter }).eq("position_id", a.positionId), "line target");
          let order: AlpacaOrder;
          try {
            order = (await placeOrder(creds, { symbol: a.symbol, side: orderSide(a.side, true), qty: a.qty, type: "market", clientOrderId: `gsps-mirror-add-${a.positionId}-${a.targetAfter}` })) as AlpacaOrder;
          } catch (err) {
            await lines().update({ target_qty: before }).eq("position_id", a.positionId);
            throw err;
          }
          result.placed++;
          const settled = await settleOrder(creds, order.id);
          if (TERMINAL_UNFILLED.includes(settled.status)) {
            await must(lines().update({ target_qty: before }).eq("position_id", a.positionId), "line target");
          }
          await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "add", qty: a.qty, sim_price: a.simPrice, stop_price: null, broker_order_id: order.id, status: settled.status, note: null, ...fillFields(settled) });
          break;
        }
        case "reduce":
        case "close": {
          // The resting stop reserves the shares: it is cancelled and the
          // cancel confirmed first. If it had already filled, the line was
          // stopped at the broker and no sell goes out.
          const m = mirrorById.get(a.positionId);
          if (m?.stopOrderId) {
            const filledStop = await cancelStop(creds, m.stopOrderId);
            if (filledStop) {
              await markBrokerStopped(a.positionId, a.symbol, filledStop);
              break;
            }
            await must(lines().update({ stop_order_id: null, stop_qty: null }).eq("position_id", a.positionId), "line stop cleared");
            m.stopOrderId = null;
          }
          // closePosition never sells more than the account holds, so it can
          // never open a short.
          const order = (await closePosition(creds, a.symbol, a.qty)) as AlpacaOrder;
          result.placed++;
          if (a.kind === "close") {
            await must(lines().update({ status: "closed", closed_at: new Date().toISOString() }).eq("position_id", a.positionId), "line closed");
          } else {
            await must(lines().update({ target_qty: a.targetAfter }).eq("position_id", a.positionId), "line target");
          }
          const settled = await settleOrder(creds, order.id);
          await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: a.kind, qty: a.qty, sim_price: a.kind === "reduce" ? a.simPrice : null, stop_price: null, broker_order_id: order.id, status: settled.status, note: null, ...fillFields(settled) });
          break;
        }
        case "set_stop": {
          const m = mirrorById.get(a.positionId);
          let stopOrder: AlpacaOrder | null = null;
          if (m?.stopOrderId) {
            try {
              stopOrder = await replaceOrder(creds, m.stopOrderId, { stopPrice: a.stop, qty: a.qty });
            } catch (err) {
              // A stop that is no longer open (filled, cancelled outside the
              // app, or expired) can't be replaced: a filled one means the
              // broker stopped the line; anything else gets a fresh stop.
              const old = await getOrder(creds, m.stopOrderId).catch(() => null);
              if (old?.status === "filled") {
                await markBrokerStopped(a.positionId, a.symbol, old);
                break;
              }
              if (old && !["canceled", ...TERMINAL_UNFILLED].includes(old.status)) throw err;
            }
          }
          if (!stopOrder) stopOrder = await placeExitOrder(creds, { symbol: a.symbol, side: orderSide(a.side, false), qty: a.qty, stopLoss: a.stop });
          await must(lines().update({ stop_order_id: stopOrder.id, stop_price: a.stop, stop_qty: a.qty }).eq("position_id", a.positionId), "line stop");
          await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: a.side, action: "set_stop", qty: a.qty, sim_price: null, stop_price: a.stop, broker_order_id: stopOrder.id, status: stopOrder.status, note: null });
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
            await must(lines().update({ status: "missed", note: "The open never reached the broker." }).eq("position_id", a.positionId), "line missed");
            break;
          }
          if (!m?.openOrderId) await must(lines().update({ open_order_id: o.id }).eq("position_id", a.positionId), "line open order");
          if (TERMINAL_UNFILLED.includes(o.status)) {
            await must(lines().update({ status: "missed", note: `Broker ${o.status} the open.` }).eq("position_id", a.positionId), "line missed");
          } else if (o.status === "filled") {
            // Filled, and the broker holds nothing on the line's side: the
            // shares left outside the mirror. Closed, never re-bought.
            await must(lines().update({ status: "closed", closed_at: new Date().toISOString(), note: "Open filled but no shares held; closed outside the mirror." }).eq("position_id", a.positionId), "line closed");
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${a.kind} ${a.symbol}: ${msg}`);
      await logEvent(supabase, { position_id: a.positionId, symbol: a.symbol, side: "side" in a ? a.side : null, action: a.kind, qty: "qty" in a ? a.qty : null, sim_price: null, stop_price: null, broker_order_id: null, status: "error", note: msg.slice(0, 500) }).catch(() => undefined);
    }
  }
  await settleFills(supabase, creds, deadline).catch((err) => result.errors.push(`settle: ${String(err)}`));
  result.elapsedMs = Date.now() - started;
  return result;
}

/**
 * Fills not yet known when they were logged: read each from the broker and
 * write its price and time, so every row ends with the broker's own fill
 * beside the simulator's. Bounded by the run's deadline.
 */
async function settleFills(supabase: SupabaseClient, creds: AlpacaCreds, deadline: number): Promise<void> {
  const { data, error } = await supabase
    .from("paper_mirror_events")
    .select("id, broker_order_id")
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
