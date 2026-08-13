/**
 * The call sites that actually put data in the learning tables.
 *
 * Migration 0005 created five tables, `lib/learning/db.ts` wrote the inserts and
 * `/api/learning/record-event` exposed them — and then nothing called any of it.
 * `isModelTrained` wants 100 samples and `modelConfidenceScore` wants 50; at
 * zero events those floors were unreachable forever, and every real trade was
 * data the system threw away.
 *
 * This module is the seam between the app's own vocabulary (`ScanResult`, an
 * Alpaca order) and the learning schema's, plus the failure policy that makes it
 * safe to call from a request path:
 *
 *   - **Recording never fails the thing being recorded.** A scan that produced a
 *     verdict has done its job; a telemetry insert that fails must not turn that
 *     into a 500. Every entry point swallows its error after logging it.
 *   - **It is inert until configured.** Without a service-role key there is no
 *     client to build, so these are no-ops rather than throws.
 *   - **It records what is known and nothing else.** Where the scanner does not
 *     compute a value the learning schema has a column for (per-timeframe
 *     scores, most obviously), the field is left out rather than filled with a
 *     plausible number. A model trained on invented features is worse than one
 *     that never trained.
 */

import type { AssetClass, Bar, ScanResult, Timeframe } from "@/lib/types";
import {
  recordExecutionEvent,
  recordScanEvent,
  recordSignalLifecycleEvent,
} from "@/lib/learning/db";
import type {
  AssetClass as LearningAssetClass,
  Bias,
  Timeframe as LearningTimeframe,
} from "@/lib/learning/types";
import { normalizeOrderStatus } from "@/lib/portfolio/order-status";

/** Whether the learning tables are reachable at all in this environment. */
export function learningConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** App timeframe → learning timeframe. The two vocabularies were never joined. */
const TIMEFRAME_MAP: Record<Timeframe, LearningTimeframe> = {
  "1Year": "1y",
  "1Month": "1mo",
  "1Week": "1w",
  "1Day": "1d",
  "4Hour": "4h",
  "2Hour": "2h",
  "1Hour": "1h",
  "15Min": "15m",
  "5Min": "5m",
  "1Min": "1m",
};

export function toLearningTimeframe(tf: Timeframe): LearningTimeframe {
  return TIMEFRAME_MAP[tf];
}

export function toLearningAssetClass(assetClass: AssetClass): LearningAssetClass {
  return assetClass === "crypto" ? "crypto" : "us_equity";
}

export function toBias(direction: ScanResult["direction"]): Bias {
  return direction === "bullish" ? "bull" : direction === "bearish" ? "bear" : "neutral";
}

/**
 * Run a recording call for its side effect only.
 *
 * The name is the contract: whatever happens inside, the caller carries on. The
 * failure is logged with enough context to find it, because silently losing the
 * data is the exact problem this module exists to fix — it must at least be
 * visible in the logs when it happens.
 */
async function safeRecord<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  if (!learningConfigured()) return null;
  try {
    return await run();
  } catch (err) {
    console.error(`learning: ${what} not recorded — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export interface RecordScanOptions {
  /** Execution timeframe the verdict was produced on. */
  timeframe: Timeframe;
  /** The last closed execution candle, when the caller has it. */
  bar?: Bar;
  extendedHours?: boolean;
  /** Stable id for this scan; generated when absent. */
  scanId?: string;
}

/**
 * One verdict, as it was shown to the user.
 *
 * Also emits the signal's first lifecycle row when a pattern is armed, so the
 * lifecycle table starts from the same moment the scan table does and the two
 * can be joined on `signal_id` later.
 */
export async function recordScanVerdict(
  userId: string,
  result: ScanResult,
  options: RecordScanOptions,
): Promise<{ scanId: string } | null> {
  if (result.error) return null;

  const scanId = options.scanId ?? crypto.randomUUID();
  const timestamp = new Date(result.scannedAt);
  const bar = options.bar;

  const scanEvent = await safeRecord(`scan verdict for ${result.symbol}`, () =>
    recordScanEvent(userId, {
      scan_id: scanId,
      timestamp,
      timeframe: toLearningTimeframe(options.timeframe),
      extended_hours_flag: options.extendedHours ?? false,
      symbol: result.symbol,
      asset_class: toLearningAssetClass(result.assetClass),
      price: result.currentPrice,
      // The column is an integer 0–9. Weighted scores are fractional by design,
      // so the stored value is the rounded one and the exact figure rides in
      // `detail` rather than being lost to the cast.
      score: Math.max(0, Math.min(9, Math.round(result.decision.score))),
      signal_type: result.direction,
      entry_level: result.levels?.entry,
      stop_loss_level: result.levels?.stopLoss,
      take_profit_1_level: result.levels?.takeProfit1,
      master_profit_level: result.levels?.masterProfit,
      bias: toBias(result.direction),
      ohlcv: bar
        ? { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }
        : { open: 0, high: 0, low: 0, close: 0, volume: 0 },
      // The scanner reads a direction per timeframe but does not score each one,
      // so only the direction is recorded. Inventing a per-timeframe score to
      // fill the column would feed `detectHigherTfConflict` a number nobody
      // computed.
      higher_tf_context: result.trends.map((t) => ({
        timeframe: toLearningTimeframe(t.timeframe),
        bias: t.direction === "sideways" ? ("neutral" as const) : toBias(t.direction),
      })),
      detail: {
        output_state: result.decision.outputState,
        exact_score: result.decision.score,
        setup_kind: result.setupKind,
        pattern: result.pattern?.name ?? null,
        momentum_elevated: result.momentumElevated,
        criteria: Object.fromEntries(
          result.decision.breakdown
            .filter((b) => b.key)
            .map((b) => [b.key as string, b.passed]),
        ),
        data_lag_ratio: result.dataLag?.ratio ?? null,
        data_lag_held_execute: result.dataLag?.holdsExecute ?? false,
        has_ohlcv: Boolean(bar),
      },
    }),
  );

  if (!scanEvent) return null;

  const armed = result.pattern;
  if (armed) {
    await safeRecord(`signal lifecycle for ${result.symbol}`, () =>
      recordSignalLifecycleEvent(userId, {
        signal_id: scanId,
        scan_event_id: (scanEvent as { id?: string }).id,
        state: "armed",
        state_transition_reason: `${armed.name} armed — verdict ${result.decision.outputState}`,
        timestamp,
        metadata: {
          trigger_price: armed.triggerPrice,
          stop_price: armed.stopPrice,
          direction: armed.direction,
        },
      }),
    );
  }

  return { scanId };
}

/**
 * A broker status string in the learning schema's vocabulary.
 *
 * Routes the raw value through `normalizeOrderStatus`, which is already the one
 * place broker wording is interpreted, so the two never drift into disagreeing
 * about what "done_for_day" means.
 */
export function brokerStatusFrom(raw: unknown): RecordExecutionOptions["brokerStatus"] {
  switch (normalizeOrderStatus(raw == null ? null : String(raw))) {
    case "filled":
      return "filled";
    case "partially_filled":
      return "partial";
    case "rejected":
      return "rejected";
    case "canceled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      return "error";
  }
}

/** Broker payloads carry numbers as nullable strings. Absent stays absent. */
export function numericOrUndefined(v: unknown): number | undefined {
  const n = Number(v);
  return v == null || v === "" || Number.isNaN(n) ? undefined : n;
}

export interface RecordExecutionOptions {
  orderId?: string;
  signalId?: string;
  symbol: string;
  assetClass: AssetClass | "option";
  orderType: "market" | "limit" | "stop" | "bracket";
  side: "buy" | "sell";
  quantity: number;
  requestedPrice?: number;
  filledPrice?: number;
  filledQty?: number;
  brokerStatus: "pending" | "filled" | "partial" | "cancelled" | "rejected" | "error";
  brokerErrorCode?: string;
  brokerErrorMsg?: string;
  latencyMs?: number;
  live?: boolean;
}

/**
 * One order's outcome at the broker — accepted, filled, or refused.
 *
 * Rejections are recorded too. A refused order is evidence about the setup that
 * produced it (a stop the broker would not take, a symbol that cannot be
 * shorted), and dropping those rows would leave the table describing only the
 * trades that were easy to place.
 */
export async function recordOrderExecution(
  userId: string,
  options: RecordExecutionOptions,
): Promise<void> {
  const {
    orderId, signalId, symbol, assetClass, orderType, side, quantity,
    requestedPrice, filledPrice, filledQty, brokerStatus,
    brokerErrorCode, brokerErrorMsg, latencyMs, live = false,
  } = options;

  await safeRecord(`execution for ${symbol}`, () =>
    recordExecutionEvent(userId, {
      order_id: orderId,
      signal_id: signalId,
      broker: live ? "alpaca_live" : "alpaca_paper",
      symbol: symbol.toUpperCase(),
      asset_class: assetClass === "option" ? "option" : toLearningAssetClass(assetClass),
      order_type: orderType,
      side,
      quantity,
      requested_price: requestedPrice,
      filled_price: filledPrice,
      filled_qty: filledQty,
      partial_fill: filledQty !== undefined && filledQty > 0 && filledQty < quantity,
      // Slippage is only meaningful against a price we actually asked for. A
      // market order has none to compare with, so the column stays empty rather
      // than recording the fill price as though it were a miss.
      slippage:
        requestedPrice !== undefined && filledPrice !== undefined
          ? Math.abs(filledPrice - requestedPrice)
          : undefined,
      broker_status: brokerStatus,
      broker_error_code: brokerErrorCode,
      broker_error_msg: brokerErrorMsg,
      retry_count: 0,
      timestamp: new Date(),
      latency_ms: latencyMs,
    }),
  );
}
