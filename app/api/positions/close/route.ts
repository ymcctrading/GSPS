/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid, and is rule 3's manual escape hatch out of a staged protocol exit.
 *
 * Two lifecycles meet here, and this route defers to whichever one owns the
 * position being closed:
 *
 *   - **Protocol-managed** (a working or ever-existed `protocol_exits` plan
 *     for the symbol): owned end-to-end by this file and
 *     `lib/trade/exit-manager.ts`. A full close writes the trade log itself,
 *     with the exit left pending — at this point the liquidation has been
 *     *accepted*, not filled, and the price it will fill at doesn't exist yet.
 *     `settlePendingTradeLogs` completes the row from the broker's own fills —
 *     see `lib/portfolio/trade-log-settle.ts`. A partial close against a
 *     working plan logs nothing and retires nothing: the trade isn't over, and
 *     the plan keeps managing the trailing stop on what's left.
 *   - **Plain** (no plan ever existed for the symbol): owned by
 *     `reconcilePositions` (`lib/portfolio/reconcile.ts`, via `GET
 *     /api/portfolio`'s poll). A full close is deliberately not recorded here
 *     — reconciliation notices the position gone from the broker's book and
 *     writes the row with a real fill price, which usually isn't available in
 *     this response yet. A partial close *is* recorded here, immediately,
 *     because reconciliation only ever sees a position disappear, never
 *     shrink — nothing else would ever log a partial exit on a plain position.
 *
 * Either way, the order-submission event itself is recorded for the learning
 * tables regardless of who ends up owning the `trade_logs` row.
 *
 * ## Ownership
 *
 * Every user of this deployment trades one shared Alpaca paper account, so the
 * broker's position for a symbol can contain shares belonging to several
 * people. This route used to take the client's `symbol`, pass it straight to
 * `closePosition`, and — with no `qty` — liquidate the broker's entire
 * position in it. Any signed-in user could flatten any other user's trade by
 * naming its ticker.
 *
 * So the quantity is now decided by `lib/portfolio/ownership.ts` from this
 * user's own ledger rows, before any broker call is made, and it is always
 * sent explicitly: "close everything" means everything *they* hold, never
 * everything the account holds.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  closePosition,
  envCreds,
  getPositions,
  type AlpacaCreds,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { authorizeClose, ownedQty, readOwnershipLedger } from "@/lib/portfolio/ownership";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { brokerStatusFrom, numericOrUndefined, recordOrderExecution } from "@/lib/learning/record";
import { buildTradeLogRow, type ClosablePosition } from "@/lib/portfolio/trade-log";
import { closePlanForSymbol, type PlanRow } from "@/lib/trade/exit-manager";
import { describeProtocolSignal, recordPendingExit } from "@/lib/portfolio/trade-log-record";

/**
 * Which way the closing order went. Alpaca reports it on the order it created;
 * absent that, a close is a sale far more often than not, and guessing wrong on
 * a field the model reads is worse than the small bias of the default.
 */
function closingSide(order: { side?: unknown } | null | undefined): "buy" | "sell" {
  return order?.side === "buy" ? "buy" : "sell";
}

/** Quantity actually sent to the broker, falling back to what was requested. */
function closedQty(
  order: { qty?: unknown } | null | undefined,
  requested: number | undefined,
): number {
  return numericOrUndefined(order?.qty) ?? requested ?? 0;
}

const CloseSchema = z.object({
  symbol: z.string().min(1).max(24),
  /** Omit to close the entire position. */
  qty: z.number().positive().max(100000).optional(),
});

/** Float slop for "the requested qty is effectively the whole position." */
const QTY_EPSILON = 1e-6;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { symbol, qty } = parsed.data;
  const ticker = symbol.toUpperCase();

  const halted = killSwitchRefusal();
  if (halted) return NextResponse.json(halted, { status: 503 });

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  // Read the position *before* liquidating it — from both sources, since
  // which one turns out to matter depends on which lifecycle owns the trade.
  // Afterwards the entry price and quantity are gone from the broker, and the
  // local `positions` row (for a plain trade) still exists but the trade log
  // has to be built from the position that existed, not from whatever a later
  // query returns.
  const held = await heldPosition(creds, ticker);
  const heldQty = held ? Math.abs(Number(held.qty)) : null;

  // ---- Ownership gate ------------------------------------------------------
  // Nothing above this point has touched the broker's book, and nothing below
  // may touch more of it than this user's own ledger accounts for. See
  // `lib/portfolio/ownership.ts` for why the broker cannot answer this itself.
  const ledger = await readOwnershipLedger(supabase, user.id);
  if (ledger.error) {
    console.error(`positions/close: ownership read failed — ${ledger.error}`);
    return NextResponse.json(
      {
        error:
          "Your position records couldn't be read, so the close wasn't sent. Try again in a moment.",
      },
      { status: 503 },
    );
  }

  const owned = ownedQty(ledger, ticker);
  const authorization = authorizeClose({ owned, brokerHeld: heldQty, requested: qty });
  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.reason, code: "not_owned" },
      // 409, not 403: the request is well-formed and the caller is who they say
      // they are — it conflicts with what the ledger says they hold.
      { status: 409 },
    );
  }

  // The quantity that actually goes to the broker. Always a number: passing
  // `undefined` to `closePosition` liquidates the account's whole position in
  // the symbol, which in a shared account is not this user's to liquidate.
  const closeQty = authorization.qty;

  // "Full" now means the user's whole holding, not the account's. Which trade
  // log gets written, and whether a protocol plan retires, follows from
  // whether *they* are flat afterward.
  const fullClose = closeQty >= owned - QTY_EPSILON;

  const { data: openPosition } = await supabase
    .from("positions")
    .select("id, symbol, asset_class, qty, avg_entry_price, opened_at")
    .eq("user_id", user.id)
    .eq("symbol", ticker)
    .eq("closed", false)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startedAt = Date.now();
  try {
    const order = await closePosition(creds, ticker, closeQty);

    // Which lifecycle owns this trade. `closePlanForSymbol` finds the most
    // recent protocol_exits plan for the symbol regardless of its status —
    // see that function's own doc comment for why a status filter here would
    // be a race — and retires it (a no-op if a concurrent poll already did).
    // A plan existing at all, even a closed one, means this symbol has never
    // had a `positions` row (reconcile.ts's `recordOpen` skips it), so the
    // reconciliation path below is never in play for it.
    const plan = await closePlanForSymbol(supabase, user.id, ticker);

    let tradeLogged = false;
    if (plan) {
      // Defensive only — a protocol-managed symbol normally has no
      // `positions` row to update. Harmless no-op when that's the case.
      await supabase
        .from("positions")
        .update({ closed: true, closed_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("symbol", ticker)
        .eq("closed", false);

      if (fullClose) {
        tradeLogged = await logClose(supabase, user.id, ticker, held, plan);
      }
      // A genuine partial close against a plan logs nothing: the trade isn't
      // over, and the plan keeps managing the trailing stop on what's left.
      // (Its tranche bookkeeping is now stale relative to what's actually
      // held, since these shares left outside its own tranche orders —
      // reconciling that, resizing or cancelling the affected resting order,
      // isn't done automatically. `manageProtocolExits` still moves the stop
      // for whatever the broker reports as held.)
    } else if (!fullClose && openPosition) {
      // Plain position, partial close — the one case reconcilePositions can
      // never see (a shrink, not a disappearance), so it's logged here.
      const row = buildTradeLogRow({
        userId: user.id,
        position: openPosition as unknown as ClosablePosition,
        closedQty: closedQty(order, closeQty),
        exitPrice: numericOrUndefined(order?.filled_avg_price),
      });
      const { error: logError } = await supabase.from("trade_logs").insert(row);
      if (logError) {
        console.error(`positions/close: trade log for ${row.symbol} not written — ${logError.message}`);
      } else {
        tradeLogged = true;
      }
    }
    // Plain position, full close: recorded by nothing here on purpose —
    // reconcilePositions picks it up with a real fill price on the next
    // portfolio poll.

    // The exit is the half of the trade that carries the outcome. Without it
    // the learning tables would hold entries with nothing to score them
    // against. Recorded for every close — this is the order-submission event,
    // independent of who ends up owning the trade_logs row.
    await recordOrderExecution(user.id, {
      symbol: ticker,
      assetClass: isCryptoSymbol(symbol) ? "crypto" : "us_equity",
      orderType: "market",
      side: closingSide(order),
      quantity: closedQty(order, closeQty),
      filledPrice: numericOrUndefined(order?.filled_avg_price),
      filledQty: numericOrUndefined(order?.filled_qty),
      brokerStatus: brokerStatusFrom(order?.status),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ ok: true, order, fullClose, tradeLogged, planRetired: plan != null });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Alpaca 404s when the position is already flat — that's the desired state,
    // not a failure the user needs to act on. Nothing is logged: no position
    // means no trade ended here.
    if (raw.includes("(404)")) {
      await closePlanForSymbol(supabase, user.id, ticker);
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }
    return NextResponse.json({ error: raw }, { status: 502 });
  }
}

async function heldPosition(creds: AlpacaCreds, ticker: string): Promise<AlpacaPosition | null> {
  try {
    const positions = await getPositions(creds);
    return positions.find((p) => p.symbol.toUpperCase() === ticker) ?? null;
  } catch {
    // The close still goes ahead — an unreadable position list is a reason to
    // log less, not a reason to leave the user in a trade they asked to exit.
    return null;
  }
}

/**
 * Write the trade log for a protocol-managed trade that has just fully closed.
 *
 * The logged quantity is the plan's *original* size, not what this particular
 * call closed. A staged exit can reach this point after TP1 already took part
 * of the position out at the broker, and settlement (`settleTradeLog`) matches
 * a row's fills chronologically from its entry timestamp, consuming the
 * *oldest* fills first up to the logged quantity. A row that under-declares
 * its quantity — the remainder this call closed, rather than the whole trade —
 * would be satisfied by the earlier TP1 fill alone and never reach the fill
 * this call actually produced, reporting TP1's price, timestamp and P/L sign
 * for what was really a different exit. Logging the full original quantity
 * means settlement has to walk every fill the trade produced, landing on the
 * correct blended price across all of them.
 *
 * Returns false when there was nothing to log: no position was readable, so
 * every field of the row would have been a guess. The close itself still
 * succeeded, and the caller reports that honestly rather than claiming an audit
 * trail it doesn't have.
 */
async function logClose(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ticker: string,
  held: AlpacaPosition | null,
  plan: PlanRow,
): Promise<boolean> {
  if (!held) return false;

  const quantity = plan.qty;
  if (!Number.isFinite(quantity) || quantity <= 0) return false;

  const entryPrice = Number(held.avg_entry_price);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return false;

  const result = await recordPendingExit(supabase, userId, {
    symbol: ticker,
    direction: held.side === "short" ? "sell" : "buy",
    quantity,
    entryPrice,
    // The plan's creation time is the closest thing to a real entry timestamp
    // we hold; settlement measures the closing fills from it.
    entryTimestamp: plan.created_at,
    exitPlanId: plan.id,
    signalCalled: describeProtocolSignal({
      stopLoss: plan.stop_loss,
      takeProfit1: plan.take_profit_1,
      masterProfit: plan.master_profit,
    }),
  });

  // `duplicate` means a concurrent pass (a poll's own `finish`, landing at
  // nearly the same moment) already logged this plan — the trade is recorded,
  // just not by this call. Only `failed` means nothing is on record anywhere.
  return result.status !== "failed";
}
