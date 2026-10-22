/**
 * Automated pyramid adds (SYNTHESIZED_ROADMAP Q2 item 3, 2026-10-22).
 * -----------------------------------------------------------------------------
 * Gann adds to a winning position as the trend proves itself: a smaller lot
 * on each crossing of a swing top made since the last lot (a bottom, for a
 * short), 100, 50, 30, 20 and 10 shares, once the last lot shows 5 points of
 * profit and the first has held three days with the trend, with the whole
 * line's stop raised so it can't lose (lib/gann/pyramid.ts: *Truth of the
 * Stock Tape* Ch. IX; W006 p.47 Rule 5; *Tunnel Thru the Air* p.198; rule 21;
 * A-TIME-12). The Portfolio has offered that add as a suggestion and the
 * replay has walked it (`pyramid: true`); this places it for the trades the
 * portfolio manager opened, as Gann would have placed it himself.
 *
 * Which lines: a working paper exit whose entry order came from an automated
 * plan (`orders.source_plan_id`), for a member whose Automated Portfolio
 * Manager is on, that runs whole on Gann's rules (no TP1 or master tranche,
 * Q14), was not opened from an intraday alert (those end on the session's
 * rules), and is the only working exit on its symbol (a line a person has
 * added to by hand is theirs to manage). Live adds are not placed: the
 * proving period runs every manager profile on paper
 * (`AUTONOMOUS_PROVING_PERIOD`), and no live broker is connected.
 *
 * How, matching the replay's `walkGannExit`:
 * - The reading is taken on completed sessions with the last close as the
 *   price, as the replay reads it at each session's open; the add fills once
 *   the market has crossed the trigger, at the market, as the replay fills at
 *   the trigger or the open beyond it.
 * - It goes through `placeSimulatedOrder` like any other entry, so every rule
 *   placement holds (the 5-point stop cap, Gann's capital rules, a tenth at
 *   risk, the series of losses, the halt) holds for it. A quote that has run
 *   more than 5 points past the add's stop is refused there and waits.
 * - The add's own exit row, which placement writes at the fill, is merged into
 *   the line's row (migration 0111): one row, one stop, the whole quantity,
 *   the lots listed, `entry_price` their blended cost, and the stop raised to
 *   the tighter of the add's stop and break-even, as the replay raises it
 *   (`stopReason` "break_even"). Gann's exit rules keep reading the first lot
 *   (`firstEntry` in lib/trade/exit-manager-sim.ts), as the replay does.
 * - Not inside the trader's away window (A-EXIT-05): the manager opens
 *   nothing new there, and an add is new risk.
 *
 * Engineering choices, labelled: the claim (`add_claimed_at`, released after
 * `CLAIM_MINUTES`) that keeps two overlapping passes from buying one lot
 * twice; the add's TP1, which no exit reads under Q14 but placement requires,
 * is the line's own TP1 when it is still ahead of the price, else one risk
 * past it.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A (lib/gann/pyramid.ts carries the sources).
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect: an add is placed only on the trend's own
 *    proof, a crossed top, and the stop follows it so the line can't lose.
 *    Correspondence: the live line and the replay's position are one shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { etDateKey } from "@/lib/market/session";
import { readPyramidAdd, readStoredLots, wholeLineStop, type PyramidLot } from "@/lib/gann/pyramid";
import { OrderSchema, placeSimulatedOrder } from "@/lib/trade/place-order";
import { readAwayNotice } from "@/lib/trade/away-notice";
import { ledgerWriter } from "@/lib/supabase/ledger";
import type { Bar } from "@/lib/types";

/** A claim older than this is a pass that died mid-add, and is taken over. */
export const CLAIM_MINUTES = 15;

export interface PyramidAddRun {
  /** Lines read for an add this pass. */
  lines: number;
  placed: number;
  notes: string[];
  errors: string[];
}

interface LineRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  applied_stop: number | null;
  scale_out_qty: number;
  master_qty: number;
  runner_qty: number;
  entry_order_id: string | null;
  created_at: string;
  lots: unknown;
}

/** What a pass needs from the market for one symbol. Injected in tests. */
export interface PyramidMarket {
  /** Daily bars, oldest first, history before the first lot included. */
  daily(symbol: string): Promise<Bar[]>;
  quote(symbol: string): Promise<number | null>;
  /** Shares outstanding for a stock, null when unknown. Not called for crypto. */
  sharesOutstanding(symbol: string): Promise<number | null>;
}

export const liveMarket: PyramidMarket = {
  async daily(symbol) {
    const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    const now = new Date();
    return getMarketDataProvider().fetchBars(symbol, "1Day", new Date(now.getTime() - 400 * 86_400_000), null, assetClass);
  },
  async quote(symbol) {
    const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    const price = await getMarketDataProvider().fetchLatestPrice(symbol, assetClass);
    return Number.isFinite(price) && price > 0 ? price : null;
  },
  async sharesOutstanding(symbol) {
    return (await getInstrumentReference(symbol))?.sharesOutstanding ?? null;
  },
};

/** The line's lots, oldest first: its stored lots, or the row as one lot. */
export function lineLots(row: Pick<LineRow, "qty" | "entry_price" | "created_at" | "lots">): PyramidLot[] {
  return (
    readStoredLots(row.lots) ?? [{ qty: Number(row.qty), price: Number(row.entry_price), date: etDateKey(new Date(row.created_at)) }]
  );
}

/**
 * The line after an add fills: the whole quantity, the lots, the blended cost,
 * and the stop raised to the tighter of the add's stop and break-even (never
 * loosened), as the replay's `walkGannExit` raises it.
 */
export function mergedLine(
  line: Pick<LineRow, "side" | "qty" | "entry_price" | "applied_stop" | "stop_loss" | "created_at" | "lots">,
  add: { qty: number; price: number; date: string; stop: number },
): { qty: number; entryPrice: number; lots: PyramidLot[]; stop: number; raised: boolean } {
  const long = line.side === "long";
  const lots = [...lineLots(line), { qty: add.qty, price: add.price, date: add.date }];
  const qty = lots.reduce((n, l) => n + l.qty, 0);
  const avg = lots.reduce((n, l) => n + l.qty * l.price, 0) / qty;
  // Break-even to the cent on the safe side: up for a long, down for a short.
  const even = long ? Math.ceil(avg * 100 - 1e-6) / 100 : Math.floor(avg * 100 + 1e-6) / 100;
  const floor = long ? Math.max(add.stop, even) : Math.min(add.stop, even);
  const current = Number(line.applied_stop ?? line.stop_loss);
  const raised = long ? floor > current : floor < current;
  return { qty, entryPrice: Math.round(avg * 1e6) / 1e6, lots, stop: raised ? floor : current, raised };
}

/**
 * One pass: read every eligible line for an add and place the ones the market
 * has reached. Never throws; each line's failure is recorded and the pass goes on.
 */
export async function placeAutomatedPyramidAdds(
  supabase: SupabaseClient,
  market: PyramidMarket = liveMarket,
  now: Date = new Date(),
): Promise<PyramidAddRun> {
  const run: PyramidAddRun = { lines: 0, placed: 0, notes: [], errors: [] };

  const { data: profiles, error: profilesError } = await supabase
    .from("user_automation_profiles")
    .select("user_id")
    .eq("is_automation_enabled", true);
  if (profilesError) {
    run.errors.push(`Could not read automation profiles: ${profilesError.message}`);
    return run;
  }
  const users = new Set(((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id));
  if (users.size === 0) return run;

  const { data: rows, error } = await supabase
    .from("protocol_exits")
    .select(
      "id, user_id, symbol, side, qty, entry_price, stop_loss, take_profit_1, applied_stop, scale_out_qty, master_qty, runner_qty, entry_order_id, created_at, lots",
    )
    .eq("mode", "paper")
    .eq("status", "working")
    .is("merged_into", null)
    .in("user_id", [...users])
    .limit(500);
  if (error) {
    run.errors.push(`Could not read working paper exits: ${error.message}`);
    return run;
  }
  const working = (rows ?? []) as LineRow[];
  // A symbol with more than one working exit holds lots a person added: theirs.
  const perSymbol = new Map<string, number>();
  for (const r of working) {
    const key = `${r.user_id}:${r.symbol.toUpperCase()}`;
    perSymbol.set(key, (perSymbol.get(key) ?? 0) + 1);
  }
  const candidates = working.filter(
    (r) =>
      perSymbol.get(`${r.user_id}:${r.symbol.toUpperCase()}`) === 1 &&
      r.entry_order_id != null &&
      Number(r.scale_out_qty) === 0 &&
      Number(r.master_qty) === 0 &&
      Number(r.runner_qty) === Number(r.qty) &&
      Number(r.entry_price) > 0,
  );
  if (candidates.length === 0) return run;

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, source_plan_id, intraday_sourced")
    .in(
      "id",
      candidates.map((c) => c.entry_order_id as string),
    );
  if (ordersError) {
    run.errors.push(`Could not read the lines' entry orders: ${ordersError.message}`);
    return run;
  }
  const automated = new Set(
    ((orders ?? []) as { id: string; source_plan_id: string | null; intraday_sourced: boolean | null }[])
      .filter((o) => o.source_plan_id != null && o.intraday_sourced !== true)
      .map((o) => String(o.id)),
  );
  const lines = candidates.filter((c) => automated.has(String(c.entry_order_id)));

  const away = new Map<string, boolean>();
  for (const line of lines) {
    run.lines++;
    try {
      if (!away.has(line.user_id)) away.set(line.user_id, (await readAwayNotice(supabase, line.user_id, now)) != null);
      if (away.get(line.user_id)) continue;
      await addToLine(supabase, market, line, now, run);
    } catch (err) {
      run.errors.push(`${line.symbol} (${line.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

async function addToLine(
  supabase: SupabaseClient,
  market: PyramidMarket,
  line: LineRow,
  now: Date,
  run: PyramidAddRun,
): Promise<void> {
  const symbol = line.symbol.toUpperCase();
  const long = line.side === "long";
  const isStock = !isCryptoSymbol(symbol);
  const today = etDateKey(now);
  const [bars, quote, shares] = await Promise.all([
    market.daily(symbol),
    market.quote(symbol),
    isStock ? market.sharesOutstanding(symbol) : Promise.resolve(undefined),
  ]);
  const daily = bars.filter((b) => b.t.slice(0, 10) < today);
  if (quote == null || daily.length === 0) return;

  const reading = readPyramidAdd({
    side: line.side,
    lots: lineLots(line),
    stop: Number(line.applied_stop ?? line.stop_loss),
    initialStop: Number(line.stop_loss),
    daily,
    price: daily[daily.length - 1].c,
    ...(isStock ? { capitalStock: shares ?? null } : {}),
  });
  const add = reading.add;
  if (!add) return;
  // The add waits for the market to cross its trigger.
  if (long ? quote < add.trigger : quote > add.trigger) return;

  // Claim the line before anything is placed.
  const stale = new Date(now.getTime() - CLAIM_MINUTES * 60_000).toISOString();
  const { data: claimed } = await ledgerWriter(supabase)
    .from("protocol_exits")
    .update({ add_claimed_at: now.toISOString() })
    .eq("id", line.id)
    .eq("user_id", line.user_id)
    .eq("status", "working")
    .eq("qty", line.qty)
    .or(`add_claimed_at.is.null,add_claimed_at.lt.${stale}`)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const release = () =>
    ledgerWriter(supabase).from("protocol_exits").update({ add_claimed_at: null }).eq("id", line.id).eq("user_id", line.user_id);

  // The whole line's stop goes 5 points under the add's own price (A-STOP-06,
  // W022 p.198: added at 253, the stop to 243), measured from where it fills,
  // never looser than the reading's. Measured from the trigger, an add filled
  // past it would sit more than 5 points over its stop and be refused.
  const lots = lineLots(line);
  const heldQty = lots.reduce((n, l) => n + l.qty, 0);
  const avgAtQuote = (lots.reduce((n, l) => n + l.qty * l.price, 0) + add.qty * quote) / (heldQty + add.qty);
  const stop = wholeLineStop(line.side, avgAtQuote, quote, add.newStop);
  if (long ? stop >= quote : stop <= quote) {
    await release();
    return;
  }

  // TP1 is read by no exit under Q14, but placement needs one past the price.
  const tp = Number(line.take_profit_1);
  const ahead = long ? tp > quote * 1.001 : tp > 0 && tp < quote * 0.999;
  const takeProfit = ahead ? tp : Math.round((long ? quote + Math.abs(quote - stop) : quote - Math.abs(quote - stop)) * 100) / 100;

  const parsed = OrderSchema.safeParse({
    symbol,
    assetClass: "equity",
    side: long ? "buy" : "sell",
    qty: add.qty,
    entryMode: "now",
    referencePrice: quote,
    mode: "paper",
    attachLevels: { stopLoss: stop, takeProfit },
  });
  if (!parsed.success) {
    await release();
    run.errors.push(`${symbol}: the add couldn't be expressed as an order (${parsed.error.message}).`);
    return;
  }
  const placed = await placeSimulatedOrder(supabase, line.user_id, parsed.data);
  if (placed.status !== 200 || !placed.orderId) {
    await release();
    const reason = typeof placed.body.error === "string" ? placed.body.error : `status ${placed.status}`;
    run.notes.push(`${symbol}: pyramid add of ${add.qty} not placed. ${reason}`);
    return;
  }
  run.placed++;

  // The add's own exit row, written by placement at the fill.
  const { data: addRow } = await supabase
    .from("protocol_exits")
    .select("id, entry_price, stop_loss, qty")
    .eq("user_id", line.user_id)
    .eq("entry_order_id", placed.orderId)
    .eq("status", "working")
    .maybeSingle();
  if (!addRow) {
    await release();
    run.errors.push(`${symbol}: the add filled but its exit row wasn't found, so it runs on its own stop.`);
    return;
  }
  const fill = Number((addRow as { entry_price: number }).entry_price);
  const merged = mergedLine(line, {
    qty: Number((addRow as { qty: number }).qty),
    price: fill,
    date: today,
    stop: Number((addRow as { stop_loss: number }).stop_loss),
  });
  const stamp = new Date().toISOString();
  const addId = String((addRow as { id: string }).id);
  // Take the add's row first, so it is never managed as its own trade and as
  // part of the line at once; it is put back if the line can't take it.
  const { data: taken } = await ledgerWriter(supabase)
    .from("protocol_exits")
    .update({ status: "closed", closed_at: stamp, merged_into: line.id, updated_at: stamp })
    .eq("id", addId)
    .eq("user_id", line.user_id)
    .eq("status", "working")
    .select("id")
    .maybeSingle();
  if (!taken) {
    // An exit pass closed the add under this one: it was traded on its own stop.
    await release();
    run.errors.push(`${symbol}: the add's own exit closed before it could join the line.`);
    return;
  }
  const { data: joined } = await ledgerWriter(supabase)
    .from("protocol_exits")
    .update({
      qty: merged.qty,
      runner_qty: merged.qty,
      entry_price: merged.entryPrice,
      lots: merged.lots,
      ...(merged.raised ? { applied_stop: merged.stop, applied_stop_reason: "break_even" } : {}),
      add_claimed_at: null,
      updated_at: stamp,
    })
    .eq("id", line.id)
    .eq("user_id", line.user_id)
    .eq("status", "working")
    .eq("qty", line.qty)
    .select("id")
    .maybeSingle();
  if (!joined) {
    // The line closed or changed under this pass: the add keeps its own row and stop.
    await ledgerWriter(supabase)
      .from("protocol_exits")
      .update({ status: "working", closed_at: null, merged_into: null, updated_at: new Date().toISOString() })
      .eq("id", addId)
      .eq("user_id", line.user_id);
    await release();
    run.errors.push(`${symbol}: the add filled but the line changed before it could join, so it runs on its own stop.`);
    return;
  }
  await ledgerWriter(supabase).from("orders").update({ exit_plan_id: line.id }).eq("id", placed.orderId).eq("user_id", line.user_id);
  run.notes.push(
    `${symbol}: added ${merged.lots[merged.lots.length - 1].qty} at ${fill.toFixed(2)} (lot ${merged.lots.length}); the whole line's stop is ${merged.stop.toFixed(2)}.`,
  );
}
