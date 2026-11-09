/**
 * Placing a simulated order — the whole path, in one callable function.
 *
 * This used to be the body of `POST /api/orders`. Guided Decision Mode needs to
 * submit through *exactly* the same path the manual ticket does — same price
 * validation, same bracket checks, same staged protocol exit, same ledger rows,
 * same learning telemetry — and the only ways to reuse a route handler are to
 * call it over HTTP from inside the same process, or to copy it. The first is
 * fragile and the second guarantees the two paths drift, which for an order
 * path means the guided flow quietly stops attaching stops.
 *
 * So the logic moved here and both callers are thin. The route keeps the HTTP
 * shape (parse, status codes); this owns what actually happens to the money.
 */

import { readEntryConfirmationNow } from "@/lib/lifecycle/confirmNow";
import { getTradePlan } from "@/lib/lifecycle/store";
import { isPivotSignal } from "@/lib/lifecycle/fromPivot";
import { isRebuySignal, rebuyExtremeOf } from "@/lib/lifecycle/fromRebuy";
import { threePoints } from "@/lib/gann/pointScale";
import { syntheticDataRefusal } from "@/lib/data/feed-mode";
import { readUserLossSeries } from "@/lib/risk/lossSeries";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assetClassOf,
  executeFill,
  getOpenPosition,
  getOrCreateAccount,
  isTriggered,
  listOpenPositions,
  hasWorkingPlan,
  listWorkingPaperEntries,
  logPlainClose,
  quoteOptionPrice,
  quotePrice,
} from "@/lib/brokers/simulator";
import { checkBracket } from "@/lib/trade/bracket";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { validateLimitPrice, type RoundingMode } from "@/lib/trade/tick-size";
import { isProtectiveOrder, killSwitchRefusal } from "@/lib/trade/kill-switch";
import { recordOrderExecution, brokerStatusFrom, type RecordExecutionOptions } from "@/lib/learning/record";
import { CircuitStateUnreadableError, evaluateLiveCircuitBreaker } from "@/lib/risk/service";
import { canEnterNewIntradayPosition } from "@/lib/promotion/pro-intraday";
import { loadProIntradayUsage, PRO_INTRADAY_DAILY_LOSS_LOCK_PCT } from "@/lib/promotion/intraday-gate-usage";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";
import {
  envCreds,
  getAccount,
  getAsset,
  getOpenOrdersNested,
  getPositions,
  placeOrder,
  type AlpacaAsset,
  type AlpacaCreds,
} from "@/lib/brokers/alpaca";
import { hardToBorrowWarning, liveShortAccountRefusal, opensShort, shortAssetRefusal } from "@/lib/trade/short-eligibility";
import { closePaperPosition } from "@/lib/trade/close-position";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { workingLiveEntries, type WorkingLiveEntry } from "@/lib/trade/live-working-entries";
import { isLiveTradingRestricted } from "@/lib/risk/live-trade-loss";
import { checkPositionLimits } from "@/lib/risk/position-limits";
import { capitalRuleRefusal, optionPremiumRefusal, riskTenthRefusal } from "@/lib/risk/gannCapital";
import { averagingLossRefusal } from "@/lib/gann/pyramid";
import { withOrderLock } from "@/lib/trade/order-lock";
import { readLiveStartingCapital, readProfitCeiling } from "@/lib/risk/profitPeak";
import { paperTradingUnit } from "@/lib/trade/resting-entry-guard";
import { readAwayNotice, withAwayNotice } from "@/lib/trade/away-notice";
import { gannRiskCapital, readWinningRun } from "@/lib/risk/dynamic-risk";
import { gateResolvedAction } from "@/lib/risk/cooldown";
import { ledgerWriter } from "@/lib/supabase/ledger";
import { paperEquity } from "@/lib/portfolio/paper-equity";
import { STORED_STRATEGY_VERSION } from "@/lib/backtest/publicVersion";
import { resolveLevelSource, type LevelSource } from "@/lib/trade/level-source";

type RecordedOrderType = RecordExecutionOptions["orderType"];

export const OrderSchema = z.object({
  // Equity tickers are short; OCC option symbols run ~15–21 chars (e.g. TSM250815C00120000).
  symbol: z.string().min(1).max(24),
  assetClass: z.enum(["equity", "option"]).default("equity"),
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().max(100000),
  entryMode: z.enum(["advised", "now"]).optional(),
  limitPrice: z.number().positive().optional(),
  attachLevels: z
    .object({
      stopLoss: z.number().positive(),
      takeProfit: z.number().positive(),
      masterProfit: z.number().positive().optional(),
    })
    .optional(),
  /**
   * The protocol stop behind an advised entry, sent by the ticket whenever it
   * offers the protocol's entry, even when no levels are attached or the
   * person typed their own stop (Manual Override). Gann's crossing line is
   * read from the protocol's entry and this stop (`gannBreakLine`), so the
   * reaction buy never rests before the crossing (PLAN.md item 4).
   */
  entryStop: z.number().positive().optional(),
  /**
   * Which of Gann's buying points the protocol's entry is (PLAN.md item 5,
   * steps 2 and 4). `oldLevel` rests at the old bottom (top) and `hold` at the
   * last close over a bottom that held, neither with a crossing to wait for;
   * absent is the crossing. Sent with `entryStop`.
   */
  entryKind: z.enum(["crossing", "oldLevel", "hold"]).optional(),
  /**
   * The protocol's first target behind an advised entry, sent with
   * `entryStop`, so a target typed in Manual Override can't move it past a
   * failed double top (A-LEVELS-04, review 12 M1). Absent, placement treats
   * the target as unknown and holds the entry under any failed test beyond it.
   */
  entryTarget: z.number().positive().optional(),
  /**
   * The technique whose own levels the person chose to trade (owner,
   * 2026-10-22, `lib/strategies/compare.ts`): a mode id or `custom:<id>`.
   * Its entry is the person's own limit, not a Gann crossing, so no crossing
   * line is read from its stop. The risk rules still apply.
   */
  techniqueSource: z.string().min(1).max(80).optional(),
  mode: z.enum(["paper", "live"]).default("paper"),
  /**
   * True when the ticket's trade is an intraday one: the intraday plan chosen
   * (from the alerts panel's "Trade this" action, components/scan/intraday-alerts.tsx,
   * or the ticket's "Intraday plan" choice), or the person's own levels they
   * asked to manage within the session (owner, 2026-10-28). Subjects the
   * order to the intraday-promotion entry gates (lib/promotion/pro-intraday.ts)
   * and is persisted on the order row so those gates can evaluate future
   * entries against today's intraday-sourced history.
   */
  intradaySourced: z.boolean().optional().default(false),
  /**
   * An intraday-sourced trade only: keep it open past the session's end. The
   * Intraday style closes what is left at the session's end by default (the
   * owner's choice, "not mandatory"; `lib/gann/intradayExit.ts`), and this is
   * the trader's way out of that close. Ignored on any other order.
   */
  holdOvernight: z.boolean().optional(),
  /**
   * Which levels the person chose on the ticket: the swing plan, the intraday
   * plan or their own (owner, 2026-10-28). Stored on the order as
   * `level_source` (`lib/trade/level-source.ts`) so the position cards and the
   * notices about the trade say the same thing; a choice that disagrees with
   * how the order is managed falls back to what the order itself says.
   */
  levelSource: z.enum(["swing", "intraday", "own"]).optional(),
  /**
   * The `trade_plans` row this order was authorized against, when there is
   * one — set only by lib/automation/service.ts's `deriveOrderInputFromPlan`
   * (both the plan-scoped GSPS Automation and the fully-autonomous Portfolio
   * Manager go through it), never by a manual ticket. Persisted on the
   * `orders` row so the exit managers (lib/trade/exit-manager-sim.ts,
   * lib/trade/exit-manager.ts) can trace an actual stop-loss fill back to
   * the plan that needs invalidating — see lib/automation/stop-out.ts.
   */
  sourcePlanId: z.string().uuid().optional(),
  /**
   * How a limit price that falls between two valid increments should be
   * snapped. Omitted means conservative-by-side: a buy rounds down so the user
   * never pays more than they asked, a sell rounds up so they never receive
   * less. See lib/trade/tick-size.ts.
   */
  rounding: z.enum(["down", "nearest", "up"]).optional(),
  /**
   * Last price the ticket showed. Used only to validate a bracket on a market
   * entry, where there is no limit price to check the legs against.
   */
  referencePrice: z.number().positive().optional(),
  /**
   * Contract economics + greeks captured at ticket time. Stored as a snapshot so
   * the history grid shows what the trade was opened against, not what today's
   * IV would imply.
   */
  optionDetail: z
    .object({
      strike: z.number().positive(),
      type: z.enum(["call", "put"]),
      expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      premium: z.number().nullable().optional(),
      contractCost: z.number().nullable().optional(),
      delta: z.number().nullable().optional(),
      gamma: z.number().nullable().optional(),
      theta: z.number().nullable().optional(),
      vega: z.number().nullable().optional(),
    })
    .optional(),
});

export type OrderInput = z.infer<typeof OrderSchema>;

/** What the caller returns to the client: an HTTP status and a JSON body. */
export interface PlacedOrder {
  status: number;
  body: Record<string, unknown>;
  /** The ledger row id, when one was written and the order was accepted. */
  orderId?: string | null;
}

/**
 * Gann's series-of-losses rule (parity E1, `lib/risk/lossSeries.ts`): after
 * three losing trades in a row, new entries pause for the rest of that day
 * and the next. Both paths call it; protective orders never reach it. A read
 * failure is logged and lets the order through: this is a behavioural pause,
 * and the capital ceilings that fail closed are checked separately.
 */
async function lossSeriesRefusal(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const series = await readUserLossSeries(supabase, userId).catch((err) => {
    console.error(`place-order: loss series unreadable for ${userId} — ${String(err)}`);
    return null;
  });
  if (!series?.paused) return null;
  return {
    status: 409,
    body: {
      error: series.note,
      code: "loss_series_pause",
      consecutiveLosses: series.consecutiveLosses,
      resumesOn: series.resumesOn,
      losses: series.losses,
    },
  };
}

/**
 * Owner decision 4 (2026-09-27), and the owner's follow-up that automation
 * adheres to the same rules as everything else: every entry that carries the
 * protocol's levels is placed only once it has confirmed on closed
 * execution-timeframe bars. That is the manual ticket's advised entry, Guided
 * Mode, the demo account, and plan-scoped automation, which the autonomous
 * portfolio manager runs through. A plan-sourced order is judged on its
 * plan's own entry, stop and direction, over the bars since the plan was
 * generated.
 *
 * The confirmation is Gann's own since PLAN.md item 4 (2026-10-15, owner:
 * "GSPS should be a 1 for 1 implementation of Gann's methodology"): a close 3
 * points past the old level crosses it, and the buy is on the reaction into
 * the zone from the level plus 1 point down to 1 point short of the stop, 3
 * points the other side (W006 pp.20, 46-47). It replaces the retest-and-hold
 * sequence measured on 2026-09-26 (+0.190R vs −0.155R for the resting
 * stop-entry). See `lib/lifecycle/confirmNow.ts`.
 *
 * Never-failing rule 9 (2026-10-16): "Never limit your orders or fix a buying
 * or selling price. Trade at the market" (*Commodities* rule 9, pp.43-45, and
 * p.19; W021 PDF p.124). The confirmation is ready only once a closed bar has
 * traded into that zone, and the order then goes at the market (`atMarket`),
 * not as a limit at a fixed figure. This holds for the protocol's entry: a
 * plan (other than a stop-and-reverse plan, which keeps the retest-and-hold
 * sequence) or an advised order sent with the protocol's `entryStop`. A limit
 * the person priced themselves, with no protocol stop sent, stays a limit:
 * it is their order, not the platform's entry.
 */
/**
 * Gann's risk cap: never risk more than 5 points on a trade (W006 pp.20,
 * 46-47; points price-scaled by `lib/gann/pointScale.ts`). Checked on every
 * entry that carries a stop and a known entry price, the person's own
 * Manual Override stop included. A protocol crossing risks 4 points (entry 1
 * point past the level, stop 3 points the other side), and a buy over a low
 * that held is offered only within the cap (`computeGannHoldEntry`), so a
 * protocol plan always passes. Gann's re-buy and reversal plans, whose stops
 * he states beyond it, pass on their own stop (`confirmEntry`).
 */
export function riskCapRefusal(
  input: Pick<OrderInput, "entryMode" | "limitPrice" | "attachLevels" | "referencePrice">,
): { status: number; body: Record<string, unknown> } | null {
  const stop = input.attachLevels?.stopLoss;
  const entry = input.entryMode === "now" ? input.referencePrice : (input.limitPrice ?? input.referencePrice);
  if (stop == null || entry == null || !(entry > 0)) return null;
  const cap = (5 / 3) * threePoints(entry);
  // A cent of slack for rounding to the tick.
  if (Math.abs(entry - stop) <= cap + 0.01) return null;
  return {
    status: 422,
    body: {
      error: `The stop is too far from the entry (${Math.abs(entry - stop).toFixed(2)} against a limit of ${cap.toFixed(2)}). Move it closer. Nothing was placed.`,
      code: "risk_over_five_points",
    },
  };
}

/** The `level_source` an order row records (`lib/trade/level-source.ts`). */
export function orderLevelSource(
  input: Pick<OrderInput, "levelSource" | "intradaySourced" | "sourcePlanId" | "techniqueSource">,
  hasLevels: boolean,
): LevelSource | null {
  return resolveLevelSource({ ...input, hasLevels });
}

/**
 * The MTP checked against TP1 on an order a person priced (the ticket's
 * swing, intraday or own levels, Guided Mode): it must lie beyond TP1 on the
 * trade's side. An automated plan's order is left as its plan priced it.
 */
export function ownMasterToCheck(input: Pick<OrderInput, "attachLevels" | "sourcePlanId">): number | null {
  if (input.sourcePlanId) return null;
  return input.attachLevels?.masterProfit ?? null;
}

type ConfirmationInput = Pick<
  OrderInput,
  "symbol" | "assetClass" | "side" | "entryMode" | "limitPrice" | "attachLevels" | "sourcePlanId" | "entryStop" | "entryKind" | "entryTarget" | "referencePrice"
> & { techniqueSource?: string };

/** Returns a refusal, or null to proceed. */
export async function entryConfirmationRefusal(
  supabase: SupabaseClient,
  userId: string,
  input: ConfirmationInput,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  return (await confirmEntry(supabase, userId, input)).refusal;
}

/**
 * The confirmation, and whether the confirmed entry goes at the market
 * (never-failing rule 9). `atMarket` is false whenever `refusal` is set.
 */
export async function confirmEntry(
  supabase: SupabaseClient,
  userId: string,
  input: ConfirmationInput,
): Promise<{ refusal: { status: number; body: Record<string, unknown> } | null; atMarket: boolean }> {
  const pass = { refusal: null, atMarket: false };
  if (input.assetClass === "option") return pass;
  const overCap = riskCapRefusal(input);
  // A plan's order is checked once its plan is read (below), since Gann's
  // re-buy and reversal carry stops of their own beyond the 5 points.
  if (overCap && !input.sourcePlanId) return { refusal: overCap, atMarket: false };
  if (!input.attachLevels && input.entryStop == null) return pass;

  let target: {
    direction: "bullish" | "bearish";
    entryTrigger: number;
    stopPrice?: number;
    entryKind?: "crossing" | "oldLevel" | "hold";
    takeProfit1?: number;
    since?: string;
    cancelBeyond?: number;
  } | null = null;
  if (input.sourcePlanId) {
    const plan = await getTradePlan(supabase, userId, input.sourcePlanId).catch(() => null);
    if (!plan) {
      return { refusal: { status: 409, body: { error: "The plan behind this order couldn't be read, so its entry can't be confirmed. Nothing was placed.", code: "confirmation_unavailable" } }, atMarket: false };
    }
    // The 5-point cap is Gann's limit on the entry he buys on the definite
    // indication (W006 pp.20, 46-47). His re-buy after a stop sets its stop
    // half the reaction back, 6 points from a 12-point reaction (*Tunnel*
    // p.198, the 218/212 case), and his reversal 3 points beyond the old
    // extreme (`reverse.ts`): each is the stop he states for that trade, and
    // the replay walks both. So the cap yields to that stop, and only to it: a
    // re-buy or reversal order whose stop is not its plan's own is still
    // capped (recheck 2026-10-22, A-PYRAMID-07, A-EXIT-02; until then every
    // automated re-buy and reversal was refused with risk_over_five_points).
    if (overCap) {
      const ownStop =
        (isRebuySignal(plan.signalId) || isPivotSignal(plan.signalId)) &&
        input.attachLevels?.stopLoss != null &&
        Math.abs(input.attachLevels.stopLoss - plan.coordinates.invalidation) <= 0.01;
      if (!ownStop) return { refusal: overCap, atMarket: false };
    }
    target = {
      direction: plan.direction,
      entryTrigger: plan.coordinates.entryTrigger,
      // A stop-and-reverse plan's entry and stop are not Gann's reaction pair,
      // so it keeps the retest-and-hold confirmation.
      stopPrice: isPivotSignal(plan.signalId) ? undefined : plan.coordinates.invalidation,
      entryKind: plan.coordinates.entryKind,
      takeProfit1: plan.coordinates.takeProfit1,
      since: plan.generatedAt,
      ...(rebuyExtremeOf(plan) != null ? { cancelBeyond: rebuyExtremeOf(plan)! } : {}),
    };
    // The re-buy after a stop (A-PYRAMID-07) and the reversal at that stop
    // never both hold the book: each waits while a working exit on the other
    // side is open on the symbol. The reversal is covered at the re-buy's
    // entry (lib/automation/rebuy-cover.ts), as the replay covers it, and an
    // order placed first would net against the other position instead.
    if (isRebuySignal(plan.signalId) || isPivotSignal(plan.signalId)) {
      const opposite = await openOppositeExit(supabase, userId, input.symbol, plan.direction === "bullish" ? "short" : "long");
      if (opposite !== false) {
        return {
          refusal: {
            status: opposite === null ? 503 : 409,
            body: {
              error:
                opposite === null
                  ? "Couldn't read the open positions to check for the reversal. Nothing was placed; try again shortly."
                  : isRebuySignal(plan.signalId)
                    ? "The re-entry waits until the opposite trade opened at the stop is covered at its level. Nothing was placed."
                    : "The reversal waits while a trade on the other side is open in this stock. Nothing was placed.",
              code: opposite === null ? "confirmation_unavailable" : "awaiting_confirmation",
            },
          },
          atMarket: false,
        };
      }
    }
  } else if (input.entryMode === "advised" && input.limitPrice != null) {
    // No plan row: the crossing line is read from the protocol's entry and
    // stop (`gannBreakLine`). The ticket sends that stop as `entryStop`, so a
    // stop the person typed in Manual Override doesn't move the line; an
    // order without it falls back to the stop it attaches.
    // A technique's own levels (2026-10-22) carry no protocol stop and fall
    // back to nothing: the person chose that technique, and "we can NEVER
    // force them to drink" (owner), so no Gann crossing is waited for.
    const stopPrice =
      input.entryStop ?? (input.techniqueSource ? undefined : input.attachLevels?.stopLoss);
    if (stopPrice != null) {
      target = {
        direction: input.side === "sell" ? "bearish" : "bullish",
        entryTrigger: input.limitPrice,
        stopPrice,
        entryKind: input.entryKind,
        takeProfit1: input.entryTarget,
      };
    }
  }
  if (!target) return pass;

  const confirmation = await readEntryConfirmationNow({ symbol: input.symbol, assetClass: assetClassOf(input.symbol), ...target }).catch(
    () => null,
  );
  if (!confirmation) {
    return {
      refusal: {
        status: 503,
        body: { error: "Couldn't read the latest bars to confirm the entry. Nothing was placed; try again shortly.", code: "confirmation_unavailable" },
      },
      atMarket: false,
    };
  }
  if (confirmation.ready) {
    // The protocol's entry under the reaction rule: a plan's own stop, or the
    // protocol stop the ticket sends. A stop only the person typed is theirs.
    const protocolEntry = input.sourcePlanId ? target.stopPrice != null : input.entryStop != null;
    return { refusal: null, atMarket: protocolEntry };
  }
  return {
    refusal: {
      status: 409,
      body: {
        error: `Waiting for the entry to confirm. ${confirmation.note} Nothing was placed.`,
        code: "awaiting_confirmation",
        stage: confirmation.stage,
      },
    },
    atMarket: false,
  };
}

/**
 * Whether a working exit holds `symbol` on `side` (paper or live). Null when
 * it can't be read, which callers treat as held (fails closed).
 */
async function openOppositeExit(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
  side: "long" | "short",
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("protocol_exits")
      .select("id")
      .eq("user_id", userId)
      .eq("symbol", symbol.toUpperCase())
      .eq("side", side)
      .eq("status", "working")
      .limit(1);
    if (error) return null;
    return (data ?? []).length > 0;
  } catch {
    return null;
  }
}

/**
 * Never-failing rule 1 on a new equity entry (`riskTenthRefusal`): the risk is
 * the quantity times the planned entry-to-stop distance. Skipped when the
 * order carries no stop or no known entry price.
 */
function tenthRefusal(
  capital: number,
  symbol: string,
  entry: number | null,
  input: Pick<OrderInput, "qty" | "attachLevels">,
  profitCeiling: number | null = null,
): { status: number; body: Record<string, unknown> } | null {
  const stop = input.attachLevels?.stopLoss;
  if (stop == null || entry == null || !(entry > 0)) return null;
  const refusal = riskTenthRefusal({ capital, symbol, entry, stop, qty: input.qty, profitCeiling });
  return refusal ? { status: 409, body: { error: refusal.error, code: refusal.code } } : null;
}

export async function placeSimulatedOrder(
  supabase: SupabaseClient,
  userId: string,
  input: OrderInput,
): Promise<PlacedOrder> {
  // Refuse before anything is written or priced.
  // The simulator fills synchronously, so there is no "accepted but not yet
  // executed" state to unwind — a halt has to happen ahead of the fill, not
  // around it.
  //
  // The kill switch only ever stands between a user and a *new* position. A
  // sell that reduces or closes an existing long, or a buy that covers an
  // existing short, is a protective action, so the halt is skipped precisely
  // when this order moves the position toward flat, not away from it. Every
  // order here is paper, so nothing requires this yet — it's ahead of live
  // trading, on the reasoning that will apply once real capital is at risk.
  // A live order is judged against the live account's own position, read from
  // the broker, never the paper book (review 25, ST-4): a paper long must not
  // let a stopless live sell through as "protective", which would open a naked
  // live short. Fails closed: an unreadable broker means not protective.
  const existingPosition =
    input.mode === "live" && input.assetClass !== "option"
      ? await readLivePosition(supabase, userId, input.symbol)
      : await getOpenPosition(supabase, userId, input.symbol);
  // An order from an automated plan is a new position by intent (an entry, a
  // re-buy, a reversal), never a close: it goes through entry confirmation,
  // whose opposite-exit hold keeps a re-buy from netting the reversal it waits
  // on. Closes are the exit managers' and Close position's, not placement's.
  const isProtective =
    !input.sourcePlanId &&
    isProtectiveOrder(existingPosition?.side ?? null, input.side, input.qty, existingPosition?.qty ?? 0);
  // An order for more than the position on the other side holds would close
  // it and open the opposite side in one fill: the old side's exit plan would
  // be left on shares no longer held, and the new side would start without an
  // exit of its own size. Gann closes a trade before he reverses it (the
  // reversal is its own trade, with its own stop: lib/gann/reverse.ts), so the
  // close comes first and the new trade follows. Paper and live alike.
  if (existingPosition && input.assetClass !== "option") {
    const against =
      (existingPosition.side === "long" && input.side === "sell") || (existingPosition.side === "short" && input.side === "buy");
    if (against && input.qty > existingPosition.qty + 1e-9) {
      return {
        status: 409,
        body: {
          error: `This order is for more shares than your ${input.symbol.toUpperCase()} position holds (${existingPosition.qty}), so it would close the position and open the other side in one go. Close the position first, then place the new trade with its own stop. Nothing was placed.`,
          code: "flips_position",
        },
      };
    }
  }

  const halted = isProtective ? null : killSwitchRefusal();
  if (halted) return { status: 503, body: { ...halted } };

  // Never on synthetic prices in production (senior code review, lib/data):
  // a paper order fills at the provider's quote, so none is placed, protective
  // or not. A live order fills at the broker's price, so a protective live
  // order still goes through; a new live entry would read its ceilings from
  // the synthetic quote, so it is refused.
  if (input.mode !== "live" || !isProtective) {
    const refused = syntheticDataRefusal(`place a ${input.mode === "live" ? "live" : "paper"} order for ${input.symbol.toUpperCase()}`);
    // The refusal's text names the server's configuration: it is logged, and
    // the member gets a fixed message (S-14).
    if (refused) {
      return {
        status: 503,
        body: { error: "Market data is unavailable right now, so nothing was placed.", code: "synthetic_market_data" },
      };
    }
  }

  // A stop on every trade (A-STOP-01; owner, 2026-10-16, Q1): a new equity
  // position is refused without one, the manual ticket's own orders included.
  // An order that reduces or closes a position needs none. Options carry no
  // staged exit here, which is the recorded broker exception (Q31).
  if (!isProtective && input.assetClass !== "option" && input.attachLevels?.stopLoss == null) {
    return {
      status: 400,
      body: {
        error: "Every new position needs a stop. Add the protocol's levels or your own stop, then place the order again. Nothing was placed.",
        code: "stop_required",
      },
    };
  }

  // A sell on a paper position with a managed exit plan: a part can't be sold
  // on its own, since the plan exits the whole position (Q14), and a sale of
  // all of it retires the plan with it, as "Close position" does
  // (lib/trade/close-position.ts). Otherwise the plan would be left working on
  // shares no longer held, and its stop would trade them again.
  // A plan read that fails counts as managed, so nothing is left working on
  // shares no longer held. A limit is refused rather than sold at market: the
  // managed exit, or Close position, is the way out of a managed position.
  if (isProtective && input.mode !== "live" && input.assetClass !== "option" && existingPosition) {
    if ((await hasWorkingPlan(supabase, userId, input.symbol)) !== false) {
      if (input.qty < existingPosition.qty - 1e-9) return managedPartialRefusal(input.symbol);
      if (input.entryMode === "advised" || input.limitPrice != null) return managedLimitRefusal(input.symbol);
      return closeManagedPaperPosition(supabase, userId, input.symbol);
    }
  }

  // One new entry at a time per account (F-05, lib/trade/order-lock.ts): the
  // capital checks below read the book and the write follows, so a second
  // entry waits until the first is written. A protective order never waits.
  const notes: PlacementNotes = { shortWarning: null };
  if (isProtective) return placeChecked(supabase, userId, input, isProtective, existingPosition, notes);
  return withWarning(
    await withOrderLock(supabase, userId, () => placeChecked(supabase, userId, input, isProtective, existingPosition, notes)),
    notes.shortWarning,
  );
}

/** What placement learns on the way that the response carries back. */
interface PlacementNotes {
  shortWarning: string | null;
}

/** How long the broker's lending record is waited on before deferring to the broker. */
const ASSET_READ_TIMEOUT_MS = 3_000;

/** The broker's lending record for a stock, or null when it can't be read. */
async function readAsset(creds: AlpacaCreds | null, symbol: string): Promise<AlpacaAsset | null> {
  if (!creds) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getAsset(creds, symbol),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ASSET_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** An accepted order's response with a warning added beside any it carries. */
function withWarning(placed: PlacedOrder, warning: string | null): PlacedOrder {
  if (!warning || placed.status !== 200) return placed;
  const prior = typeof placed.body.warning === "string" && placed.body.warning ? `${placed.body.warning} ` : "";
  return { ...placed, body: { ...placed.body, warning: `${prior}${warning}` } };
}

function managedLimitRefusal(symbol: string): PlacedOrder {
  return {
    status: 409,
    body: {
      error: `Your ${symbol.toUpperCase()} position runs on a managed exit, so it isn't sold on a limit of its own. Close it at market with Close position, or edit its exit levels. Nothing was placed.`,
      code: "managed_limit_close",
    },
  };
}

function managedPartialRefusal(symbol: string): PlacedOrder {
  return {
    status: 409,
    body: {
      error: `Your ${symbol.toUpperCase()} position runs on a managed exit, which exits the whole position, so part of it can't be sold on its own. Close all of it, or edit its exit levels. Nothing was placed.`,
      code: "managed_partial_close",
    },
  };
}

/** A sale of a whole managed paper position: closed at market, its plan retired. */
async function closeManagedPaperPosition(supabase: SupabaseClient, userId: string, symbol: string): Promise<PlacedOrder> {
  const closed = await closePaperPosition(supabase, userId, symbol);
  if (!closed.ok) return { status: 409, body: { error: closed.error, code: closed.code } };
  if (closed.alreadyFlat) {
    return { status: 409, body: { error: `No ${symbol.toUpperCase()} position is open any more, so nothing was sold.`, code: "already_flat" } };
  }
  return {
    status: 200,
    body: {
      order: closed.order ?? null,
      closedPosition: true,
      warning: "This sold the whole position at market and retired its managed exit, as Close position does.",
    },
  };
}

/** The rest of `placeSimulatedOrder`, once the halt and the stop are settled. */
async function placeChecked(
  supabase: SupabaseClient,
  userId: string,
  input: OrderInput,
  isProtective: boolean,
  existing: { side: "long" | "short"; qty: number } | null,
  notes: PlacementNotes,
): Promise<PlacedOrder> {
  // A-EXIT-05: inside the trader's away window a new entry comes back with
  // the close-out reminder (lib/trade/away-notice.ts). Never on a protective order.
  const awayNotice = isProtective ? null : await readAwayNotice(supabase, userId);

  if (input.mode === "live") {
    return withAwayNotice(await placeLiveOrder(supabase, userId, input, isProtective, existing), awayNotice);
  }

  // Pro intraday module entry gates (lib/promotion/pro-intraday.ts's
  // `canEnterNewIntradayPosition`): concurrent-position (no count a day, Q8),
  // consecutive-loss, and daily-loss-lock. That function has existed since
  // the Novice-to-Pro tier promotion work with no caller — nothing tagged an
  // order as intraday-sourced. `intradaySourced` (the ticket's intraday plan,
  // or own levels managed within the session) is that missing signal.
  //
  // Scoped to `STANDARD` (Pro) only, via `proIntradayModuleEnabled` — Expert/
  // Wall Street's intraday access is unrestricted by design
  // (`intradayScansEnabled`, not this module), so applying Pro's bounded
  // caps to their orders would silently narrow a tier that was explicitly
  // decided to stay unbounded. Only gates the entry, the same way the
  // account-wide circuit breaker never blocks a close (lib/risk/cooldown.ts).
  // Evaluated before pricing or any DB write, same as the kill switch and
  // the live circuit breaker above.
  if (input.intradaySourced) {
    const policy = await getUserEntitlementPolicy(supabase, userId);
    if (policy.proIntradayModuleEnabled) {
      const usage = await loadProIntradayUsage(supabase, userId);
      const decision = canEnterNewIntradayPosition(
        { ...usage, setupsDisplayedToday: 0 },
        PRO_INTRADAY_DAILY_LOSS_LOCK_PCT,
      );
      if (!decision.allowed) {
        return {
          status: 409,
          body: { error: decision.reason, code: "pro_intraday_gate" },
        };
      }
    }
  }

  // Novice Risk, Account & Cooldown Engine's allocation/correlation ceilings
  // (lib/risk/config.ts, Gann's disclosed 10%-of-capital risk ceiling and
  // diversification caution — docs/GANN_HISTORICAL_SOURCES.md tier A2/A4/
  // A5/A6/A8, restructured as % of account rather than Gann's dollar/point
  // tiers, same carve-out lib/strat/levels.ts's combineNearbyLevels
  // documents). `checkPositionLimits` (lib/risk/position-limits.ts) existed
  // with no caller anywhere in the codebase — a Novice account had no
  // enforced ceiling on single-position size, aggregate deployment, total
  // open risk, or correlated concentration before an order actually placed
  // (2026-09-17 orphan-module audit). Wired here, in the same
  // before-any-write position as the kill switch and the Pro intraday gate
  // above, and skipped for the same reason: a protective order only ever
  // reduces exposure, so it can't violate a ceiling that exists to bound how
  // much new exposure is opened.
  //
  // Correlated-group membership: no sector/instrument-correlation mapping
  // exists anywhere in this codebase yet, so this uses the same symbol as a
  // conservative proxy for "the same correlated group" — a new order in a
  // symbol with no open position always counts as a new group, one in a
  // symbol already held joins the existing one. That undercounts real
  // cross-symbol correlation (e.g. two different oil producers), which is a
  // known, documented limitation of this wiring, not a silent gap: the
  // notional/aggregate/open-risk ceilings below do not depend on this proxy
  // and are enforced fully.
  //
  // The group cap is the tier's (`maxCorrelatedRiskGroups`): one for Novice,
  // none above it. Applied to every tier until 2026-10-16, it held a Wall
  // Street account to one open symbol at a time.
  if (!isProtective) {
    const paused = await lossSeriesRefusal(supabase, userId);
    if (paused) return paused;
  }

  if (!isProtective) {
    const [account, openPositions, entitlements, run] = await Promise.all([
      getOrCreateAccount(supabase, userId),
      listOpenPositions(supabase, userId),
      getUserEntitlementPolicy(supabase, userId),
      readWinningRun(supabase, userId),
    ]);
    // Resting entries the market has not reached are part of the book they
    // will join (review 2026-10-21, #376): without them two resting limits
    // each passed alone and together could open a sixth stock. They add to
    // the deployed and at-risk figures, not to the equity, since their cash
    // is still in the account. Fails closed when they can't be read.
    const working = await listWorkingPaperEntries(supabase, userId, openPositions);
    if (working == null) {
      return {
        status: 503,
        body: { error: "This account's resting orders couldn't be read, so the order wasn't checked. Nothing was placed.", code: "book_unreadable" },
      };
    }
    const positionsUsd = openPositions.reduce((sum, p) => sum + p.qty * p.avg_entry_price, 0);
    const deployedUsd = positionsUsd + working.reduce((sum, w) => sum + w.qty * w.price, 0);
    const openRiskUsd =
      openPositions.reduce(
        (sum, p) => sum + (p.stop_loss == null ? 0 : Math.abs(p.avg_entry_price - p.stop_loss) * p.qty),
        0,
      ) + working.reduce((sum, w) => sum + (w.stop == null ? 0 : Math.abs(w.price - w.stop) * w.qty), 0);
    // A short is owed back, so it counts against the account (paperEquity);
    // positions at cost, as the deployed figure reads them.
    const equity = paperEquity(
      account.cash,
      openPositions.map((p) => ({ side: p.side, qty: p.qty, price: p.avg_entry_price })),
    );
    const candidateSymbol = input.symbol.toUpperCase();
    const bookSymbols = new Set([...openPositions.map((p) => p.symbol.toUpperCase()), ...working.map((w) => w.symbol)]);
    const candidateJoinsExistingGroup = bookSymbols.has(candidateSymbol);
    const correlatedGroups = bookSymbols.size;
    // The ceilings read a price the server knows (review finding F-01,
    // 2026-10-21). A limit is the most the order pays; a market order is
    // read at the live quote it will fill at, never the price the browser
    // sent, and is refused when no quote can be read, so no ceiling is ever
    // skipped for want of a price.
    const referencePrice =
      input.limitPrice ??
      (input.assetClass === "option"
        ? input.optionDetail?.premium ?? (await quoteOptionPrice(input.symbol)) ?? null
        : await quotePrice(input.symbol, assetClassOf(input.symbol)));
    if (referencePrice == null || !(referencePrice > 0)) {
      return {
        status: 503,
        body: {
          error: `No live price for ${input.symbol.toUpperCase()} right now, so the risk limits can't be checked. Nothing was placed.`,
          code: "no_reference_price",
        },
      };
    }
    if (equity > 0) {
      const newPositionNotionalUsd = referencePrice * input.qty;
      const newPositionRiskUsd = input.attachLevels
        ? Math.abs(referencePrice - input.attachLevels.stopLoss) * input.qty
        : 0;
      const verdict = checkPositionLimits({
        equity,
        newPositionNotionalUsd,
        currentlyDeployedUsd: deployedUsd,
        currentOpenRiskUsd: openRiskUsd,
        newPositionRiskUsd,
        openCorrelatedGroupsExcludingThis: candidateJoinsExistingGroup
          ? correlatedGroups - 1
          : correlatedGroups,
        candidateJoinsExistingGroup,
        maxCorrelatedRiskGroups: entitlements.maxCorrelatedRiskGroups,
        percentRiskCeilings: entitlements.percentRiskCeilings,
      });
      if (!verdict.ok) {
        return {
          status: 409,
          body: { error: verdict.violations.join(" "), code: "position_limit", violations: verdict.violations },
        };
      }
    }
    // Gann's capital rules (Q4, Q6): at most five stocks or three other markets (crypto, funds), and 30 points of
    // capital behind every share held (lib/risk/gannCapital.ts). Shares only:
    // an option contract is not a share.
    if (input.assetClass === "equity") {
      const refusal = capitalRuleRefusal({
        capital: equity > 0 ? equity : 0,
        symbol: candidateSymbol,
        price: referencePrice,
        qty: input.qty,
        open: [
          ...openPositions
            .filter((p) => p.asset_class !== "option")
            .map((p) => ({ symbol: p.symbol, qty: p.qty, price: p.avg_entry_price })),
          ...working.map((w) => ({ symbol: w.symbol, qty: w.qty, price: w.price })),
        ],
      });
      if (refusal) return { status: 409, body: { error: refusal.error, code: refusal.code } };
      // Never-failing rule 13: never average a loss (`averagingLossRefusal`).
      const averaging = averagingLossRefusal({
        symbol: candidateSymbol,
        side: input.side,
        price: referencePrice,
        open: openPositions
          .filter((p) => p.asset_class !== "option")
          .map((p) => ({ symbol: p.symbol, side: p.side, avgPrice: p.avg_entry_price, qty: p.qty })),
      });
      if (averaging) return { status: 409, body: { error: averaging.error, code: averaging.code } };
      // Never-failing rule 1: at most a tenth of the trading unit at risk on
      // this trade (lib/risk/gannCapital.ts). The unit is the capital the risk
      // rate reads (A-RISK-04); with no win history readable, the starting
      // capital or the equity, whichever is less, as Guided reads it.
      const unit = paperTradingUnit(equity, run);
      // A-RISK-07: after large profits, a tenth of the profits at most too,
      // still after a loss (lib/risk/profitPeak.ts).
      const ceiling = await readProfitCeiling(supabase, userId, "paper", Math.max(equity, 0));
      const tenth = tenthRefusal(unit, candidateSymbol, referencePrice, input, ceiling);
      if (tenth) return tenth;
    } else if (input.side === "buy") {
      // A bought option risks its premium (`optionPremiumRefusal`).
      const unit = paperTradingUnit(equity, run);
      const ceiling = await readProfitCeiling(supabase, userId, "paper", Math.max(equity, 0));
      const refusal = optionPremiumRefusal({
        capital: unit,
        symbol: candidateSymbol,
        premium: referencePrice,
        contracts: input.qty,
        profitCeiling: ceiling,
      });
      if (refusal) return { status: 409, body: { error: refusal.error, code: refusal.code } };
    }
  }

  const isOption = input.assetClass === "option";
  // Equity advised entries carry the protocol price. Once confirmed, the
  // protocol's own entry goes at the market (never-failing rule 9,
  // `confirmEntry`); a limit the person priced themselves stays a limit.
  // Options carry no advised limit (the ticket doesn't price the premium), so
  // they go market unless the user supplied an explicit limit.
  if (!isOption && input.entryMode === "advised" && !input.limitPrice) {
    return { status: 400, body: { error: "Advised-price orders need a limitPrice" } };
  }
  const confirmed = isProtective ? { refusal: null, atMarket: false } : await confirmEntry(supabase, userId, input);
  if (confirmed.refusal) return confirmed.refusal;

  // A short needs a stock the broker lends (lib/trade/short-eligibility.ts),
  // read once the entry has confirmed so a resting short waiting on its
  // reaction asks nothing on each pass. The broker's paper account answers for
  // paper; a live order is checked in placeLiveOrder with the member's own
  // connection, beside the account's permission to short. A read that fails or
  // stalls defers to the broker, as the ticket's pre-flight does
  // (app/api/assets/route.ts). Crypto has no lending record to read.
  if (
    !isProtective &&
    input.assetClass === "equity" &&
    !isCryptoSymbol(input.symbol) &&
    opensShort(existing?.side ?? null, existing?.qty ?? 0, input.side, input.qty)
  ) {
    const asset = await readAsset(envCreds("paper"), input.symbol);
    if (asset) {
      const refused = shortAssetRefusal(input.symbol, asset);
      if (refused) return refused;
      notes.shortWarning = hardToBorrowWarning(input.symbol, asset);
    }
  }
  const atMarket = confirmed.atMarket;

  // ---- Price-increment validation -----------------------------------------
  // A price between two valid increments is refused by the broker with
  // `sub-penny increment does not fulfill minimum pricing criteria`, and until
  // now that rejection happened after the user had already committed. Snap the
  // price to the instrument's increment here, and refuse to submit at all when
  // it can't be made valid. `priceCheck` rides back on the response so the
  // ticket can show what was corrected and why.
  let submittedLimitPrice = atMarket ? undefined : input.limitPrice;
  let priceCheck: ReturnType<typeof validateLimitPrice> | null = null;
  if (submittedLimitPrice != null) {
    priceCheck = validateLimitPrice({
      price: submittedLimitPrice,
      side: input.side,
      instrument: { assetType: isOption ? "OPTION" : "EQUITY" },
      mode: input.rounding as RoundingMode | undefined,
    });
    if (!priceCheck.ok || priceCheck.price == null) {
      return { status: 422, body: {
          error: priceCheck.blockedReason ?? "This limit price can't be used for this instrument.",
          code: "invalid_price_increment",
          priceCheck,
        } };
    }
    submittedLimitPrice = priceCheck.price;
  }

  // Equity entries only — options carry no staged-exit plan. Unlike a real
  // broker, this is our own simulator: nothing here calls out to Alpaca, so
  // the "no bracket on a short leg" limitation a live Alpaca account would
  // hit doesn't apply — a short's exit is staged and managed the same way a
  // long's is, via lib/trade/exit-manager-sim.ts, on both sides.
  // An order that only reduces or closes a position stages no exit of its own:
  // the levels belong to a new position, and a reduction opens none.
  const useBracket = !isOption && !!input.attachLevels && !isProtective;
  const orderType = submittedLimitPrice ? "limit" : "market";

  // The bracket legs are prices too, and they reach the broker the same way the
  // entry does — `String(stopLoss)`. They are computed by arithmetic on bar
  // prices, so they carry the same float dirt (`483.51 - 0.01`), and validating
  // only the entry left two thirds of the order able to draw the rejection this
  // is meant to prevent. Each leg is snapped on the side that keeps it where the
  // protocol intended: never tighter than asked for. On a long the stop sits
  // below entry (round down) and the target above (round up); a short is the
  // mirror image.
  let bracketLevels: { stopLoss: number; takeProfit: number } | undefined;
  if (useBracket) {
    const equity = { assetType: "EQUITY" as const };
    const closingSide = input.side === "buy" ? "sell" : "buy";
    const stopMode: RoundingMode = input.side === "buy" ? "down" : "up";
    const targetMode: RoundingMode = input.side === "buy" ? "up" : "down";
    const stop = validateLimitPrice({
      price: input.attachLevels!.stopLoss,
      side: closingSide,
      instrument: equity,
      mode: stopMode,
    });
    const target = validateLimitPrice({
      price: input.attachLevels!.takeProfit,
      side: closingSide,
      instrument: equity,
      mode: targetMode,
    });
    if (!stop.ok || stop.price == null || !target.ok || target.price == null) {
      return { status: 422, body: {
          error:
            "The stop or target can't be expressed at a price this instrument accepts. Uncheck protocol levels (or clear the custom stop/target) and manage them yourself.",
          code: "invalid_price_increment",
        } };
    }
    bracketLevels = { stopLoss: stop.price, takeProfit: target.price };
  }

  // A stop/target has to sit on the correct side of the entry (by at least a
  // cent) or the staged exit can never trigger sanely. Protocol levels are
  // computed against the advised entry, so a market entry on the other side of
  // that price can produce legs on the wrong side — catch it here with wording
  // that says what to do about it.
  if (useBracket) {
    // A market entry is checked against the plan's price here, and against
    // the real fill below.
    const basePrice = submittedLimitPrice ?? (atMarket ? input.limitPrice : undefined) ?? input.referencePrice ?? 0;
    const check = checkBracket({
      side: input.side,
      basePrice,
      stopLoss: bracketLevels!.stopLoss,
      takeProfit: bracketLevels!.takeProfit,
      masterProfit: ownMasterToCheck(input),
    });
    if (!check.ok) {
      return { status: 422, body: {
          error:
            check.problem === "master_wrong_side"
              ? `${check.reason} Move the MTP beyond TP1 or leave it out. Nothing was placed.`
              : `${check.reason} Place the order at the advised price instead, or uncheck the protocol levels and manage the stop yourself.`,
          code: "invalid_bracket",
        } };
    }
  }

  // Everything about the row that doesn't depend on whether the broker took
  // the order. Built once so the rejection path records exactly the same order
  // the acceptance path would have.
  const ledgerRow = {
    user_id: userId,
    mode: "paper" as const,
    // The rules this order was placed under (review finding P-02, migration 0094).
    strategy_version: STORED_STRATEGY_VERSION,
    symbol: input.symbol.toUpperCase(),
    asset_class: isOption ? "option" : assetClassOf(input.symbol),
    side: input.side,
    order_type: useBracket ? "bracket" : !isOption && input.entryMode === "advised" && !atMarket ? "limit" : orderType,
    qty: input.qty,
    intraday_sourced: input.intradaySourced,
    hold_overnight: input.intradaySourced && input.holdOvernight === true,
    source_plan_id: input.sourcePlanId ?? null,
    level_source: orderLevelSource(input, useBracket),
    limit_price: submittedLimitPrice ?? null,
    // For a market entry, the plan's price, kept to measure the fill against.
    requested_limit_price: input.limitPrice ?? null,
    tick_size: priceCheck?.tick?.size ?? null,
    tick_source: priceCheck?.tick?.source ?? null,
    stop_price: bracketLevels?.stopLoss ?? null,
    take_profit: bracketLevels?.takeProfit ?? null,
    master_profit: useBracket ? input.attachLevels!.masterProfit ?? null : null,
    // Option economics + greeks snapshot (null on equity orders).
    purchase_price: input.optionDetail?.premium ?? submittedLimitPrice ?? null,
    contract_cost: input.optionDetail?.contractCost ?? null,
    option_type: input.optionDetail?.type ?? null,
    strike: input.optionDetail?.strike ?? null,
    expiration: input.optionDetail?.expiration ?? null,
    delta: input.optionDetail?.delta ?? null,
    gamma: input.optionDetail?.gamma ?? null,
    theta: input.optionDetail?.theta ?? null,
    vega: input.optionDetail?.vega ?? null,
  };

  // What the protocol will do on the way out, for the ticket's confirmation.
  // The split is recomputed from the quantity actually filled when the exits are
  // attached, so this is the plan for the order as asked for.
  const exitPlan = useBracket
    ? planProtocolExit(input.qty, {
        stopLoss: bracketLevels!.stopLoss,
        takeProfit1: bracketLevels!.takeProfit,
        masterProfit: input.attachLevels!.masterProfit ?? null,
      })
    : null;

  const submittedAt = Date.now();
  try {
    // Simulated fill (see lib/brokers/simulator.ts): a market order, or a
    // limit that's already marketable, fills right here, synchronously. An
    // option limit order fills at the price the user asked for, same as
    // equities; an option market order tries a live per-contract quote first
    // and falls back to the premium the ticket already knew only when no live
    // quote is available (no options market-data subscription, or the
    // contract hasn't traded recently). Anything that doesn't fill rests as a
    // `new` order, picked up by `evaluateRestingOrders` on the next poll once
    // the market reaches it.
    const fillAssetClass = assetClassOf(input.symbol);
    let fillPrice: number | null = null;
    let filled = false;

    if (isOption) {
      fillPrice = submittedLimitPrice ?? (await quoteOptionPrice(input.symbol)) ?? input.optionDetail?.premium ?? null;
      if (fillPrice == null) {
        throw new Error("No price available to fill this option order — refresh the chain and try again.");
      }
      filled = true;
    } else if (orderType === "market") {
      fillPrice = await quotePrice(input.symbol, fillAssetClass);
      if (fillPrice == null) {
        throw new Error(`No live price available for ${input.symbol} right now — the order wasn't placed.`);
      }
      filled = true;
    } else {
      const market = await quotePrice(input.symbol, fillAssetClass);
      if (market != null && isTriggered(input.side, submittedLimitPrice!, market)) {
        // A limit the person priced themselves (the protocol's own entry
        // goes at the market since never-failing rule 9), or one resting from
        // before it: filled once the market reaches it (a buy at or below the
        // price, a sell at or above), at `market`, at or better than the
        // limit. A market already through the stop fills here and is then
        // refused by the bracket check below (`fill_outran_bracket`).
        fillPrice = market;
        filled = true;
      }
      // Not triggered yet (or no quote this instant) — rests as `new` and is
      // picked up by evaluateRestingOrders once the market reaches it.
    }

    // `checkBracket` above only ever validated against the price known *before*
    // the fill — the submitted limit, or the plan's stale `referencePrice` for
    // an automation-sourced "now" entry. Between that check and this line the
    // market can have moved a long way: an advised order fills at whatever
    // price the market crossed the trigger at (by design — see the comment
    // above), and a "now" market order fills at whatever the live quote is,
    // with no proximity check to the plan's entry at all.
    //
    // Observed in production 2026-09-01 through 2026-09-08: four bracket
    // orders (AMD, TSLA, DRAM, BAC) filled far enough from their planned entry
    // that the take-profit target ended up on the wrong side of the real fill
    // — AMD's plan priced a 459.48 entry and 464.15 target, but the order
    // didn't actually fill until the market had already reached 476.08, past
    // both. The resulting bracket was nonsensical (a long whose target sits
    // below its own entry), and all four filled with `exit_plan_id` left null
    // — unprotected, indistinguishable in the UI from a normal open position.
    //
    // Re-running the same check against the real fill price closes this
    // before a single row is written, for both the manual ticket and the
    // (not yet live) automated path — deriveOrderInputFromPlan calls this
    // same function, so this guard is already in place for it.
    if (filled && useBracket && fillPrice != null) {
      const postFillCheck = checkBracket({
        side: input.side,
        basePrice: fillPrice,
        stopLoss: bracketLevels!.stopLoss,
        takeProfit: bracketLevels!.takeProfit,
      });
      if (!postFillCheck.ok) {
        return {
          status: 409,
          body: {
            error:
              `The market moved before this order could fill — it filled at ${fillPrice}, past ` +
              `the plan's own stop or target. ${postFillCheck.reason ?? ""} Refresh the setup and ` +
              `resubmit at current prices rather than the stale ones.`,
            code: "fill_outran_bracket",
          },
        };
      }
    }

    const { data: inserted, error: dbError } = await ledgerWriter(supabase)
      .from("orders")
      .insert({
        ...ledgerRow,
        status: filled ? "filled" : "new",
        filled_qty: filled ? input.qty : null,
        filled_avg_price: filled ? fillPrice : null,
        broker_submitted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (dbError) throw new Error(`Order couldn't be recorded — ${dbError.message}`);
    const orderId = (inserted as { id?: string } | null)?.id ?? null;

    let planError: string | null = null;
    if (filled) {
      const executed = await executeFill(supabase, userId, {
        symbol: input.symbol,
        assetClass: fillAssetClass,
        side: input.side,
        qty: input.qty,
        price: fillPrice!,
        stopLoss: bracketLevels?.stopLoss ?? null,
        takeProfit: bracketLevels?.takeProfit ?? null,
        masterProfit: bracketLevels ? input.attachLevels!.masterProfit ?? null : null,
      });

      // A plain sell placed through the ticket (not the dedicated "Close
      // position" action) can still close or reduce an existing position —
      // nothing else will log that trade, so it's logged right here.
      if (executed.closed) {
        await logPlainClose(supabase, userId, input.symbol, fillAssetClass, input.side, executed.closed);
      }

      // The plan carries the exit rules from here on. The entry already
      // filled (synchronously, above), so the split is against the real
      // quantity bought — no "wait for the entry to stop filling" step is
      // needed, unlike the real broker's asynchronous fills.
      if (exitPlan && bracketLevels) {
        const { data: plan, error } = await ledgerWriter(supabase)
          .from("protocol_exits")
          .insert({
            user_id: userId,
            symbol: input.symbol.toUpperCase(),
            side: input.side === "buy" ? "long" : "short",
            mode: "paper",
            qty: input.qty,
            entry_price: fillPrice,
            entry_order_id: orderId,
            stop_loss: bracketLevels.stopLoss,
            take_profit_1: bracketLevels.takeProfit,
            master_profit: input.attachLevels!.masterProfit ?? null,
            scale_out_qty: exitPlan.scaleOutQty,
            master_qty: exitPlan.masterQty,
            runner_qty: exitPlan.runnerQty,
            exits_attached_at: new Date().toISOString(),
            applied_stop: bracketLevels.stopLoss,
            applied_stop_reason: "protocol",
          })
          .select("id")
          .maybeSingle();
        if (error) {
          console.error(`orders: exit plan for ${ledgerRow.symbol} not recorded — ${error.message}`);
          planError =
            "The order filled, but the staged exit couldn't be saved — TP1 and the final target won't be taken automatically. Close the position by hand if it moves against you.";
        } else if (plan?.id && orderId) {
          await ledgerWriter(supabase).from("orders").update({ exit_plan_id: plan.id }).eq("id", orderId).eq("user_id", userId);
        }
      }
    }

    // What happened to the order is the other half of the data the learning
    // tables need: a verdict with no fill beside it can never be scored
    // against an outcome.
    await recordOrderExecution(userId, {
      orderId: orderId ?? undefined,
      symbol: input.symbol,
      assetClass: isOption ? "option" : assetClassOf(input.symbol),
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      filledPrice: filled ? (fillPrice ?? undefined) : undefined,
      filledQty: filled ? input.qty : undefined,
      brokerStatus: filled ? "filled" : "pending",
      latencyMs: Date.now() - submittedAt,
    });

    return withAwayNotice({ status: 200, orderId, body: {
      order: { id: orderId, symbol: input.symbol.toUpperCase(), side: input.side, qty: input.qty, status: filled ? "filled" : "new", filled_avg_price: fillPrice, filled_qty: filled ? input.qty : null },
      mirrored: true,
      priceCheck,
      // How this position will be exited, in the ticket's own words.
      exitPlan: exitPlan
        ? { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches }
        : null,
      warning: planError,
    } }, awayNotice);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // Record the rejection. A rejected order still needs a row to be shown,
    // explained and resubmitted from.
    const { data: inserted, error: dbError } = await ledgerWriter(supabase)
      .from("orders")
      .insert({
        ...ledgerRow,
        status: "rejected",
        reject_reason: raw,
        broker_submitted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (dbError) {
      console.error(`orders: rejection for ${ledgerRow.symbol} not recorded — ${dbError.message}`);
    }

    await recordOrderExecution(userId, {
      orderId: (inserted as { id?: string } | null)?.id,
      symbol: input.symbol,
      assetClass: isOption ? "option" : assetClassOf(input.symbol),
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      brokerStatus: "rejected",
      brokerErrorMsg: raw,
      latencyMs: Date.now() - submittedAt,
    });

    return { status: 502, body: { error: raw, code: "simulated_order_error", recorded: !dbError } };
  }
}

/**
 * Placing a *live* order — real money, at a real connected Alpaca account.
 *
 * Deliberately narrower than the paper path above: equity only (no options —
 * this app has no live options infrastructure), and the entry carries a
 * single full-size stop rather than a full bracket. That mirrors
 * `lib/trade/exit-manager.ts`'s own design (see its header, "Why the exits
 * aren't a bracket on the entry"): Alpaca refuses a second bracket buy while
 * the first's stop is still resting on the same symbol, so the profit
 * tranches are placed separately, by `manageProtocolExits`, once the entry
 * has actually filled — which is not synchronous the way the simulator's is.
 *
 * `orders`/`protocol_exits` rows are written with the broker's own order id
 * and whatever status it returned (never assumed `filled`); `lib/trade/
 * live-sync.ts` is what keeps them current afterward, and it needs to be
 * called from somewhere that polls (see its header) for a live order to ever
 * show as filled, exit, or close in this app's own ledger.
 */
/** The live account's position in `symbol`, or null when flat or unreadable. */
async function readLivePosition(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<{ side: "long" | "short"; qty: number } | null> {
  try {
    const connection = await readLiveAlpacaConnection(supabase, userId);
    if (!connection) return null;
    const positions = await getPositions(connection.creds);
    if (!Array.isArray(positions)) return null;
    const key = symbol.toUpperCase().replace("/", "");
    const p = positions.find((x) => x.symbol.toUpperCase().replace("/", "") === key);
    const qty = p ? Number(p.qty) : 0;
    if (!p || !Number.isFinite(qty) || qty === 0) return null;
    const side = p.side === "long" || p.side === "short" ? p.side : qty < 0 ? "short" : "long";
    return { side, qty: Math.abs(qty) };
  } catch {
    return null;
  }
}

async function placeLiveOrder(
  supabase: SupabaseClient,
  userId: string,
  input: OrderInput,
  isProtective: boolean,
  existing: { side: "long" | "short"; qty: number } | null,
): Promise<PlacedOrder> {
  let shortWarning: string | null = null;
  const placed = await placeLiveChecked(supabase, userId, input, isProtective, existing, (w) => {
    shortWarning = w;
  });
  return withWarning(placed, shortWarning);
}

async function placeLiveChecked(
  supabase: SupabaseClient,
  userId: string,
  input: OrderInput,
  isProtective: boolean,
  existing: { side: "long" | "short"; qty: number } | null,
  warn: (warning: string | null) => void,
): Promise<PlacedOrder> {
  if (input.assetClass === "option") {
    return { status: 400, body: { error: "Live options trading isn't supported yet — options are paper-only.", code: "live_options_unsupported" } };
  }

  // Live-only trade-loss cascade restriction (lib/risk/live-trade-loss.ts):
  // a 50% allocated-funds loss on any live position restricts new live
  // entries until GSPS School re-completion, same "exits always available"
  // exception the kill switch already follows above.
  if (!isProtective && (await isLiveTradingRestricted(supabase, userId))) {
    return {
      status: 403,
      body: {
        error: "Live trading is restricted after a 50% loss event. Complete GSPS School re-verification to resume.",
        code: "live_trading_restricted",
      },
    };
  }

  const connection = await readLiveAlpacaConnection(supabase, userId);
  if (!connection) {
    return { status: 400, body: { error: "Live trading requires a connected live brokerage in Settings.", code: "no_live_connection" } };
  }

  // Risk gate first — the Novice Risk & Cooldown Engine's rules apply only
  // to real money (see lib/risk/service.ts header), and this is the account
  // they were built to gate. Read once, real, from the broker itself. A stop,
  // close or reduction is never blocked by the breaker (lib/risk/cooldown.ts),
  // so a read that fails holds new entries only (review finding R-003).
  let equity = 0;
  let account: Awaited<ReturnType<typeof getAccount>> | null = null;
  try {
    account = await getAccount(connection.creds);
    equity = Number(account.equity);
    if (!Number.isFinite(equity)) throw new Error("Alpaca returned a non-numeric equity figure.");
  } catch (err) {
    if (!isProtective) {
      return {
        status: 502,
        body: {
          error: `Couldn't read the live account's equity from Alpaca — ${err instanceof Error ? err.message : String(err)}. Nothing was placed.`,
          code: "live_equity_unreadable",
        },
      };
    }
    equity = Number.NaN;
  }

  // A live short needs an account that may borrow (a margin account; a cash
  // account or an IRA can't) and a stock the broker lends
  // (lib/trade/short-eligibility.ts). A failed asset read defers to the broker.
  if (
    !isProtective &&
    !isCryptoSymbol(input.symbol) &&
    opensShort(existing?.side ?? null, existing?.qty ?? 0, input.side, input.qty)
  ) {
    const noShorting = account ? liveShortAccountRefusal(account) : null;
    if (noShorting) return noShorting;
    const asset = await readAsset(connection.creds, input.symbol);
    if (asset) {
      const refused = shortAssetRefusal(input.symbol, asset);
      if (refused) return refused;
      warn(hardToBorrowWarning(input.symbol, asset));
    }
  }

  if (Number.isFinite(equity)) {
    let gate: Awaited<ReturnType<typeof evaluateLiveCircuitBreaker>> | null = null;
    try {
      gate = await evaluateLiveCircuitBreaker(supabase, userId, equity, true);
    } catch (err) {
      // A stop, close or reduction goes through whatever failed; an entry
      // is held on an unread risk state and fails on anything else.
      if (!isProtective && !(err instanceof CircuitStateUnreadableError)) throw err;
      console.error(`risk: live circuit breaker not evaluated — ${err instanceof Error ? err.message : String(err)}`);
      if (!isProtective) {
        return {
          status: 503,
          body: {
            error: "The account's risk state couldn't be read, so no new entry was placed. Stops and closes still go through.",
            code: "risk_state_unreadable",
          },
        };
      }
    }
    if (gate) {
      // `gateResolvedAction` (lib/risk/cooldown.ts) applies the disclosed
      // "cooldown never blocks a stop loss/take profit/reduce/close" rule to the
      // already-resolved decision above, without a second, potentially
      // inconsistent state resolution. Before this fix (2026-09-17
      // orphan-module audit), a live protective order hitting during an active
      // cooldown or lock would have been refused here — this file already
      // claimed elsewhere that "the account-wide circuit breaker never blocks a
      // close," but `lib/risk/cooldown.ts` had no caller anywhere in the
      // codebase, so nothing actually enforced that at this, the one live call
      // site it applies to.
      const cooldownGate = gateResolvedAction(isProtective ? "position_reduce" : "new_entry", gate.decision);
      if (!cooldownGate.allowed) {
        return {
          status: 409,
          body: { error: cooldownGate.reason, code: "risk_cooldown", riskState: gate.decision.state },
        };
      }
    }
  }
  if (!isProtective) {
    const paused = await lossSeriesRefusal(supabase, userId);
    if (paused) return paused;
  }

  // Allocation/correlation ceilings (lib/risk/position-limits.ts) — the same
  // Gann-disclosed capital ceilings the paper path enforces above, on the
  // account they matter most on. Until 2026-09-25 this ran on paper only
  // (alignment audit finding F3.5), so a live entry faced a looser rule set
  // than a paper one. Skipped for a protective order for the same reason as
  // on paper. Exposure is read from the broker itself (the account of
  // record); planned open risk from this app's own working live exit plans,
  // since Alpaca holds no planned stop distance for a position — a position
  // with no working plan contributes no planned risk, the same as a paper
  // position with no stop. Same-symbol correlated-group proxy as the paper
  // path. Fails closed: if exposure can't be read, nothing is placed.
  if (!isProtective) {
    let brokerPositions: Awaited<ReturnType<typeof getPositions>>;
    // The resting orders are read beside the positions, one broker round trip.
    const openOrders = getOpenOrdersNested(connection.creds).catch(() => null);
    try {
      brokerPositions = await getPositions(connection.creds);
      if (!Array.isArray(brokerPositions)) throw new Error("Alpaca returned no position list.");
    } catch (err) {
      return {
        status: 502,
        body: {
          error: `Couldn't read the live account's open positions from Alpaca — ${err instanceof Error ? err.message : String(err)}. Nothing was placed.`,
          code: "live_positions_unreadable",
        },
      };
    }
    // Resting live entries are part of the book they will join, as on paper
    // (`listWorkingPaperEntries`): without them two resting live limits could
    // each pass alone and together open a sixth stock. Fails closed.
    let working: WorkingLiveEntry[] | null;
    try {
      const orders = await openOrders;
      working = orders == null ? null : await workingLiveEntries(orders, brokerPositions, (s) => quotePrice(s, assetClassOf(s)));
    } catch {
      working = null;
    }
    if (working == null) {
      return {
        status: 502,
        body: {
          error: "Couldn't read the live account's resting orders from Alpaca, so the order wasn't checked. Nothing was placed.",
          code: "book_unreadable",
        },
      };
    }
    const { data: workingPlans, error: plansError } = await supabase
      .from("protocol_exits")
      .select("qty, entry_price, stop_loss")
      .eq("user_id", userId)
      .eq("mode", "live")
      .eq("status", "working");
    if (plansError) {
      return {
        status: 502,
        body: {
          error: `Couldn't read this account's open live exit plans — ${plansError.message}. Nothing was placed.`,
          code: "live_open_risk_unreadable",
        },
      };
    }
    const openRiskUsd =
      ((workingPlans ?? []) as { qty: number; entry_price: number; stop_loss: number | null }[]).reduce(
        (sum, p) =>
          sum + (p.stop_loss == null ? 0 : Math.abs(Number(p.entry_price) - Number(p.stop_loss)) * Number(p.qty)),
        0,
      );
    // A live exit row is written when its order is placed, so the working rows
    // above already carry a resting entry's planned risk; only its notional and
    // its symbol are added from the broker.
    const deployedUsd =
      brokerPositions.reduce((sum, p) => sum + Math.abs(Number(p.market_value) || 0), 0) +
      working.reduce((sum, w) => sum + w.qty * w.price, 0);
    const heldSymbols = new Set([...brokerPositions.map((p) => p.symbol.toUpperCase()), ...working.map((w) => w.symbol)]);
    const candidateJoinsExistingGroup = heldSymbols.has(input.symbol.toUpperCase());
    // A price the server knows, as on paper (review finding F-01).
    const referencePrice = input.limitPrice ?? (await quotePrice(input.symbol, assetClassOf(input.symbol)));
    if (referencePrice == null || !(referencePrice > 0)) {
      return {
        status: 503,
        body: {
          error: `No live price for ${input.symbol.toUpperCase()} right now, so the risk limits can't be checked. Nothing was placed.`,
          code: "no_reference_price",
        },
      };
    }
    {
      const entitlements = await getUserEntitlementPolicy(supabase, userId);
      const verdict = checkPositionLimits({
        equity,
        newPositionNotionalUsd: referencePrice * input.qty,
        currentlyDeployedUsd: deployedUsd,
        currentOpenRiskUsd: openRiskUsd,
        newPositionRiskUsd: input.attachLevels
          ? Math.abs(referencePrice - input.attachLevels.stopLoss) * input.qty
          : 0,
        openCorrelatedGroupsExcludingThis: candidateJoinsExistingGroup ? heldSymbols.size - 1 : heldSymbols.size,
        candidateJoinsExistingGroup,
        maxCorrelatedRiskGroups: entitlements.maxCorrelatedRiskGroups,
        percentRiskCeilings: entitlements.percentRiskCeilings,
      });
      if (!verdict.ok) {
        return {
          status: 409,
          body: { error: verdict.violations.join(" "), code: "position_limit", violations: verdict.violations },
        };
      }
    }
    // Gann's capital rules (Q4, Q6), the same check as the paper path.
    const refusal = capitalRuleRefusal({
      capital: equity > 0 ? equity : 0,
      symbol: input.symbol,
      price: referencePrice,
      qty: input.qty,
      open: [
        ...brokerPositions.map((p) => ({ symbol: p.symbol, qty: Number(p.qty) || 0, price: Number(p.avg_entry_price) || 0 })),
        ...working.map((w) => ({ symbol: w.symbol, qty: w.qty, price: w.price })),
      ],
    });
    if (refusal) return { status: 409, body: { error: refusal.error, code: refusal.code } };
    // Never-failing rule 13, as on paper.
    const averaging = averagingLossRefusal({
      symbol: input.symbol,
      side: input.side,
      price: referencePrice,
      open: brokerPositions.map((p) => ({
        symbol: p.symbol,
        side: String(p.side).toLowerCase() === "short" ? ("short" as const) : ("long" as const),
        avgPrice: Number(p.avg_entry_price) || 0,
        qty: Math.abs(Number(p.qty) || 0),
      })),
    });
    if (averaging) return { status: 409, body: { error: averaging.error, code: averaging.code } };
    // Never-failing rule 1, as on paper. The unit is Gann's trading unit
    // (A-RISK-04): the starting capital until profits equal it, then doubled,
    // and held during a long run of wins (rule 24). The live account's
    // starting capital is its first verified equity (lib/risk/profitPeak.ts),
    // as A-RISK-07 reads it; until 2026-10-22 it was taken as none, so the
    // live unit was the whole equity and grew with every profit.
    const [run, startingCapital] = await Promise.all([readWinningRun(supabase, userId), readLiveStartingCapital(supabase, userId)]);
    // With the win history unread, no step-up is taken (readWinningRun's
    // contract, as paperTradingUnit reads it): the unit is the equity, never
    // above the starting capital.
    const unit = run
      ? gannRiskCapital({ equity: Math.max(equity, 0), startingCapital: startingCapital ?? 0, ...run }).capital
      : Math.min(Math.max(equity, 0), startingCapital ?? Infinity);
    const ceiling = await readProfitCeiling(supabase, userId, "live", Math.max(equity, 0));
    const tenth = tenthRefusal(unit, input.symbol, referencePrice, input, ceiling);
    if (tenth) return tenth;
  }

  if (input.entryMode === "advised" && !input.limitPrice) {
    return { status: 400, body: { error: "Advised-price orders need a limitPrice" } };
  }
  // Never-failing rule 9, as on paper: the protocol's confirmed entry goes to
  // the broker at the market.
  const confirmed = isProtective ? { refusal: null, atMarket: false } : await confirmEntry(supabase, userId, input);
  if (confirmed.refusal) return confirmed.refusal;
  const atMarket = confirmed.atMarket;

  let submittedLimitPrice = atMarket ? undefined : input.limitPrice;
  let priceCheck: ReturnType<typeof validateLimitPrice> | null = null;
  if (submittedLimitPrice != null) {
    priceCheck = validateLimitPrice({
      price: submittedLimitPrice,
      side: input.side,
      instrument: { assetType: "EQUITY" },
      mode: input.rounding as RoundingMode | undefined,
    });
    if (!priceCheck.ok || priceCheck.price == null) {
      return {
        status: 422,
        body: {
          error: priceCheck.blockedReason ?? "This limit price can't be used for this instrument.",
          code: "invalid_price_increment",
          priceCheck,
        },
      };
    }
    submittedLimitPrice = priceCheck.price;
  }

  // As on paper: a reduction or close stages no exit of its own.
  const useBracket = !!input.attachLevels && !isProtective;
  let stopLoss: number | undefined;
  if (useBracket) {
    const closingSide = input.side === "buy" ? "sell" : "buy";
    const stopMode: RoundingMode = input.side === "buy" ? "down" : "up";
    const stop = validateLimitPrice({
      price: input.attachLevels!.stopLoss,
      side: closingSide,
      instrument: { assetType: "EQUITY" },
      mode: stopMode,
    });
    if (!stop.ok || stop.price == null) {
      return {
        status: 422,
        body: {
          error: "The stop can't be expressed at a price this instrument accepts. Uncheck protocol levels and manage it yourself.",
          code: "invalid_price_increment",
        },
      };
    }
    stopLoss = stop.price;

    const basePrice = submittedLimitPrice ?? (atMarket ? input.limitPrice : undefined) ?? input.referencePrice ?? 0;
    const check = checkBracket({
      side: input.side,
      basePrice,
      stopLoss,
      // checkBracket needs a target on the correct side to validate against;
      // the take-profit level itself is never sent to the broker as part of
      // this order (see the header) — only its geometry is checked here.
      takeProfit: input.attachLevels!.takeProfit,
      masterProfit: ownMasterToCheck(input),
    });
    if (!check.ok) {
      return {
        status: 422,
        body: {
          error:
            check.problem === "master_wrong_side"
              ? `${check.reason} Move the MTP beyond TP1 or leave it out. Nothing was placed.`
              : `${check.reason} Place the order at the advised price instead, or uncheck the protocol levels and manage the stop yourself.`,
          code: "invalid_bracket",
        },
      };
    }
  }

  const orderType = submittedLimitPrice ? "limit" : "market";
  const submittedAt = Date.now();

  let order: Awaited<ReturnType<typeof placeOrder>>;
  try {
    order = await placeOrder(connection.creds, {
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      qty: input.qty,
      type: orderType,
      limitPrice: submittedLimitPrice,
      bracket: stopLoss != null ? { stopLoss } : undefined,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    await recordOrderExecution(userId, {
      symbol: input.symbol,
      assetClass: assetClassOf(input.symbol),
      orderType: (useBracket ? "bracket" : orderType) as RecordedOrderType,
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      brokerStatus: "rejected",
      brokerErrorMsg: raw,
      latencyMs: Date.now() - submittedAt,
    });
    return { status: 502, body: { error: `The broker refused this order — ${raw}`, code: "live_order_rejected" } };
  }

  const { data: inserted, error: dbError } = await ledgerWriter(supabase)
    .from("orders")
    .insert({
      user_id: userId,
      connection_id: connection.connectionId,
      mode: "live",
      strategy_version: STORED_STRATEGY_VERSION,
      broker_order_id: String(order.id),
      symbol: input.symbol.toUpperCase(),
      asset_class: assetClassOf(input.symbol),
      side: input.side,
      order_type: useBracket ? "bracket" : orderType,
      qty: input.qty,
      // The live exit manager reads these to manage an intraday alert's trade
      // in the Intraday style (lib/trade/exit-style.ts), as on paper.
      intraday_sourced: input.intradaySourced,
      hold_overnight: input.intradaySourced && input.holdOvernight === true,
      source_plan_id: input.sourcePlanId ?? null,
      level_source: orderLevelSource(input, useBracket),
      limit_price: submittedLimitPrice ?? null,
      stop_price: stopLoss ?? null,
      take_profit: useBracket ? input.attachLevels!.takeProfit : null,
      master_profit: useBracket ? input.attachLevels!.masterProfit ?? null : null,
      status: String(order.status ?? "new"),
    })
    .select("id")
    .single();
  if (dbError) {
    // The broker has already accepted the order at this point — a ledger
    // write failure must not be reported as the order having failed, or a
    // retry would place it twice. It surfaces instead as a caveat.
    console.error(`orders: live order ${order.id} placed but not recorded — ${dbError.message}`);
  }
  const orderId = (inserted as { id?: string } | null)?.id ?? null;

  let planError: string | null = null;
  if (useBracket && orderId) {
    const exitPlan = planProtocolExit(input.qty, {
      stopLoss: stopLoss!,
      takeProfit1: input.attachLevels!.takeProfit,
      masterProfit: input.attachLevels!.masterProfit ?? null,
    });
    const { data: plan, error: planErr } = await ledgerWriter(supabase)
      .from("protocol_exits")
      .insert({
        user_id: userId,
        symbol: input.symbol.toUpperCase(),
        side: input.side === "buy" ? "long" : "short",
        mode: "live",
        qty: input.qty,
        // Placeholder until the entry fills — lib/trade/exit-manager.ts's
        // `advance()` overwrites this from the broker's real
        // avg_entry_price the first time it sees a position for this symbol.
        entry_price: submittedLimitPrice ?? input.referencePrice ?? 0,
        entry_order_id: String(order.id),
        stop_loss: stopLoss!,
        take_profit_1: input.attachLevels!.takeProfit,
        master_profit: input.attachLevels!.masterProfit ?? null,
        scale_out_qty: exitPlan.scaleOutQty,
        master_qty: exitPlan.masterQty,
        runner_qty: exitPlan.runnerQty,
        status: "working",
      })
      .select("id")
      .maybeSingle();
    if (planErr) {
      console.error(`orders: live exit plan for ${input.symbol} not recorded — ${planErr.message}`);
      planError =
        "The order was placed, but its staged exit couldn't be saved — attach TP1 and the final target by hand once it fills.";
    } else if (plan?.id) {
      await ledgerWriter(supabase).from("orders").update({ exit_plan_id: plan.id }).eq("id", orderId).eq("user_id", userId);
    }
  }

  await recordOrderExecution(userId, {
    orderId: orderId ?? undefined,
    symbol: input.symbol,
    assetClass: assetClassOf(input.symbol),
    orderType: (useBracket ? "bracket" : orderType) as RecordedOrderType,
    side: input.side,
    quantity: input.qty,
    requestedPrice: submittedLimitPrice,
    brokerStatus: brokerStatusFrom(order.status),
    latencyMs: Date.now() - submittedAt,
  });

  return {
    status: 200,
    body: {
      orderId,
      brokerOrderId: String(order.id),
      status: order.status,
      caveat: planError,
    },
    orderId,
  };
}
