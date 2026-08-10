/**
 * How old the data a decision is made on actually is.
 *
 * Stocks run ~15 minutes behind on the free IEX feed. That caveat lived in the
 * chart legend, as though it were a display detail — but pattern arming and the
 * 1-hour trend read run on those same delayed bars. On a 15-minute execution
 * timeframe that means an "armed" trigger can be a full bar stale by the time it
 * renders: the price that would have filled it has already printed and gone.
 *
 * So the delay is an input to the verdict, not a footnote under it. This module
 * turns the feed's delay and the execution timeframe into one number — the lag
 * as a fraction of a bar — which is the form the question actually takes:
 *
 *   - 15 minutes on a 15-minute bar is a full bar. The trigger is unactionable.
 *   - 15 minutes on a 4-hour bar is 6% of a bar. It is noise.
 *
 * The same 15 minutes is fatal in one case and irrelevant in the other, which is
 * why a flat "delayed data" badge could never carry the information.
 *
 * Crypto is not delayed, and neither is the synthetic generator (whose bars are
 * not real anyway). A paid real-time entitlement is declared with
 * `MARKET_DATA_REALTIME=true` — the third option, once someone pays for it.
 */

import type { AssetClass, Timeframe } from "@/lib/types";
import { TF_INTERVAL_MS } from "@/lib/timeframe";

/** Alpaca's free IEX feed is delayed ~15 minutes by contract. */
export const FREE_EQUITY_FEED_DELAY_MS = 15 * 60_000;

/**
 * Where the hold bites: a lag of one whole bar or more.
 *
 * Set at 1.0 rather than something tighter because the claim has to be one the
 * data supports without argument. Below a full bar the trigger price may still
 * be live; at or beyond it, the bar the setup armed on had already closed and
 * been superseded before the verdict could be read, so "Execute" would be an
 * instruction to trade a price that no longer exists.
 */
export const MAX_EXECUTE_LAG_RATIO = 1;

export interface DecisionLag {
  /** Feed delay in milliseconds. */
  delayMs: number;
  /** One execution candle, in milliseconds. */
  barMs: number;
  /** delayMs / barMs. 1 means an armed trigger can be a full bar stale. */
  ratio: number;
  /** Whether prices were moving under the scan — see `decisionLag`. */
  marketOpen: boolean;
  /** True when the lag is a whole bar or more — see MAX_EXECUTE_LAG_RATIO. */
  holdsExecute: boolean;
  /** One sentence for the signal card. */
  note: string;
}

/** Whether the environment declares a paid real-time entitlement. */
export function realtimeEntitlement(): boolean {
  return (process.env.MARKET_DATA_REALTIME ?? "").trim().toLowerCase() === "true";
}

/**
 * The feed's delay for one instrument.
 *
 * `isLive` false means the synthetic generator, which has no delay because it
 * has no market behind it. Presenting simulated bars as stale would be a second
 * fiction on top of the first.
 */
export function feedDelayMs(
  assetClass: AssetClass,
  isLive: boolean,
  realtime = realtimeEntitlement(),
): number {
  if (!isLive) return 0;
  if (assetClass === "crypto") return 0;
  return realtime ? 0 : FREE_EQUITY_FEED_DELAY_MS;
}

/**
 * `marketOpen` is what turns a lag into a problem.
 *
 * The delay is the same at 4:30pm as at noon, but its consequence is not. With
 * the market shut, the last bar is the last bar there is: the verdict is a
 * preparation for the next session and nothing can have come and gone behind
 * it. Intraday, the same 15 minutes means the trigger price may already have
 * been reached and left. So the lag is always reported and only *held* when
 * prices were actually moving underneath the scan — which also keeps the daily
 * post-close scan from marking its whole list Watch for a staleness that could
 * not have cost anyone a fill.
 */
export function decisionLag(
  timeframe: Timeframe,
  delayMs: number,
  marketOpen = true,
): DecisionLag {
  const barMs = TF_INTERVAL_MS[timeframe];
  const ratio = barMs > 0 ? delayMs / barMs : 0;
  const holdsExecute = marketOpen && ratio >= MAX_EXECUTE_LAG_RATIO;

  return {
    delayMs,
    barMs,
    ratio,
    marketOpen,
    holdsExecute,
    note: describe(delayMs, barMs, ratio, marketOpen),
  };
}

function describe(delayMs: number, barMs: number, ratio: number, marketOpen: boolean): string {
  if (delayMs <= 0) return "Real-time data — a trigger is read at the price it is trading at.";

  const minutes = Math.round(delayMs / 60_000);
  const bar = formatSpan(barMs);
  const bars = ratio >= 1 ? `${trim(ratio)} bars` : `${Math.round(ratio * 100)}% of a bar`;
  const head = `Decision lag ~${minutes} min on a ${bar} execution bar — ${bars} behind`;

  if (ratio < MAX_EXECUTE_LAG_RATIO) return `${head}.`;
  return marketOpen
    ? `${head}, so an armed trigger can already have come and gone before it renders.`
    : `${head}. The market is closed, so this is a plan for the next session rather than a live trigger.`;
}

function formatSpan(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${trim(minutes)}-minute`;
  return `${trim(minutes / 60)}-hour`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}
