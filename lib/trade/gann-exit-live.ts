/**
 * Gann's exit rules for a position the platform is managing now, paper or live
 * (2026-09-28, project owner: "switch on Gann's exits").
 *
 * `lib/gann/exitRules.ts#readGannExit` holds the rules; the replay walks them
 * over history. This module supplies the same inputs for a position held today,
 * so the live and paper exit managers apply the rule the replay measured:
 *
 * - **Completed daily sessions only.** Today's session is still forming, and
 *   Gann's rules read closes. Bars dated today (ET) are dropped.
 * - **The crossed level** for the hold test is the old top (bottom) the entry
 *   crossed: Gann's entry trigger computed on the sessions before the entry
 *   day, which is exactly how the replay arms (`computeGannEntryTrigger`).
 * - **Shares outstanding** (D2) is the stored count, when there is one.
 *
 * Daily bars are cached per symbol per ET day, because the exit managers run
 * on every order poll and daily sessions only change once a day. A failed read
 * returns null: the caller keeps the stop already resting, which never loosens.
 *
 * Three-question basis: see `lib/gann/exitRules.ts` (Gann Tier A; no
 * periodicity claim; Cause and Effect and Rhythm). This module adds no rule.
 */

import type { Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
import { readGannExit, type GannExitReading } from "@/lib/gann/exitRules";
import { etDateKey } from "@/lib/market/session";

/** About two years of sessions: enough for the weekly swing chart and the campaign ledger. */
const DAILY_LOOKBACK_DAYS = 730;

const cache = new Map<string, { day: string; bars: Bar[] }>();

export function resetGannExitCache(): void {
  cache.clear();
}

async function completedDailyBars(symbol: string, now: Date): Promise<Bar[]> {
  const today = etDateKey(now);
  const hit = cache.get(symbol);
  if (hit && hit.day === today) return hit.bars;
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(now.getTime() - DAILY_LOOKBACK_DAYS * 86_400_000);
  const bars = await getMarketDataProvider().fetchBars(symbol, "1Day", start, null, assetClass);
  const completed = bars.filter((b) => b.t.slice(0, 10) < today);
  cache.set(symbol, { day: today, bars: completed });
  return completed;
}

export interface LiveGannExitInput {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  /** The protocol stop the trade was opened with (its distance is the risk unit). */
  initialStop: number;
  /** When the plan was opened (ISO). */
  openedAt: string;
  /** Best price seen since the fill. */
  best: number | null;
  now?: Date;
}

/** Pure part, testable without a data provider. */
export function readGannExitFromBars(input: LiveGannExitInput, daily: Bar[], sharesOutstanding: number | null): GannExitReading {
  const entryDate = etDateKey(new Date(input.openedAt));
  const before = daily.filter((b) => b.t.slice(0, 10) < entryDate);
  const trigger = computeGannEntryTrigger(before, input.side === "long" ? "bullish" : "bearish");
  // The level only counts as crossed when the entry is actually beyond it.
  const crossed =
    trigger && (input.side === "long" ? input.entryPrice >= trigger.pivot.price : input.entryPrice <= trigger.pivot.price)
      ? trigger.pivot.price
      : null;
  return readGannExit(
    { side: input.side, entry: input.entryPrice, initialStop: input.initialStop, entryDate, crossedLevel: crossed },
    daily,
    input.best,
    sharesOutstanding,
  );
}

export async function readLiveGannExit(input: LiveGannExitInput): Promise<GannExitReading | null> {
  try {
    const now = input.now ?? new Date();
    const [daily, ref] = await Promise.all([
      completedDailyBars(input.symbol, now),
      isCryptoSymbol(input.symbol) ? Promise.resolve(null) : getInstrumentReference(input.symbol),
    ]);
    if (daily.length < 10) return null;
    return readGannExitFromBars(input, daily, ref?.sharesOutstanding ?? null);
  } catch (err) {
    console.error(`gann-exit-live: ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
