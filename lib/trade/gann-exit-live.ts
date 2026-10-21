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
 *   crossed: Gann's buying point computed on the sessions before the entry
 *   day, which is exactly how the replay arms (`selectGannEntry`). A double or
 *   triple bottom crosses nothing, so it has no hold test, only its stop.
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
import { monthlyWithCurrent } from "@/lib/gann/leadership";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { readGannExit, type GannExitReading } from "@/lib/gann/exitRules";
import { etDateKey } from "@/lib/market/session";
import { entryChart, gannEntryOf, monthlyChartFrom, trendsFromBars } from "@/lib/scan/entrySelection";
import { gannRebuy, rebuysOn, type GannRebuy } from "@/lib/gann/rebuy";
import { readGannTrend } from "@/lib/gann/trendStrength";
import type { ReversalCause } from "@/lib/gann/reverse";

/** About two years of sessions: enough for the weekly swing chart and the campaign ledger. */
const DAILY_LOOKBACK_DAYS = 730;

const cache = new Map<string, { day: string; bars: Bar[]; monthly: Bar[] }>();

export function resetGannExitCache(): void {
  cache.clear();
}

/** Completed daily sessions, and the monthly chart the entry's older levels come from (PLAN.md item 5, step 3). */
export async function completedDailyBars(symbol: string, now: Date): Promise<{ bars: Bar[]; monthly: Bar[] }> {
  const today = etDateKey(now);
  const hit = cache.get(symbol);
  if (hit && hit.day === today) return hit;
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(now.getTime() - DAILY_LOOKBACK_DAYS * 86_400_000);
  const provider = getMarketDataProvider();
  const [bars, monthly] = await Promise.all([
    provider.fetchBars(symbol, "1Day", start, null, assetClass),
    provider.fetchBars(symbol, "1Month", monthlyChartFrom(start), null, assetClass),
  ]);
  const entry = { day: today, bars: bars.filter((b) => b.t.slice(0, 10) < today), monthly };
  cache.set(symbol, entry);
  return entry;
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

/**
 * The level a position's entry crossed, read from the same 52 weeks of daily
 * sessions, the same older levels and the same buying point the scan priced
 * the entry from (`entryChart`, `gannEntryOf`). Null when that buying
 * point is a double or triple bottom, which crosses nothing (its exit is the stop 3
 * points under it, as in the replay), or when the entry is not beyond the
 * level.
 */
export function entryCrossedLevel(
  side: "long" | "short",
  entryPrice: number,
  openedAt: string,
  daily: Bar[],
  monthly: Bar[] = [],
): number | null {
  const day = etDateKey(new Date(openedAt));
  const chart = entryChart(daily, monthly, day);
  // The trend as of the entry, so a short the scan armed as a crossing is not
  // rebuilt as a bear-market rally sale (A-ENTRY-18; item 6 second review F3).
  // Months before the entry's month, plus that month so far rolled from the
  // sessions before the entry: a monthly bar dated the 1st holds the whole
  // month, later sessions included (item 7 review M2).
  const priorDaily = daily.filter((b) => b.t.slice(0, 10) < day);
  const trends = trendsFromBars(priorDaily, monthly.length > 0 ? monthlyWithCurrent(monthly, priorDaily) : []);
  const trigger = gannEntryOf(chart.bars, chart.older, trends)(side === "long" ? "bullish" : "bearish");
  // A double or triple bottom, or a bottom that held, crossed nothing.
  if (!trigger || restsWithoutCrossing(trigger.kind)) return null;
  // The level only counts as crossed when the entry is actually beyond it.
  return (side === "long" ? entryPrice >= trigger.pivot.price : entryPrice <= trigger.pivot.price) ? trigger.pivot.price : null;
}

/** Pure part, testable without a data provider. */
export function readGannExitFromBars(
  input: LiveGannExitInput,
  daily: Bar[],
  sharesOutstanding: number | null,
  monthly: Bar[] = [],
): GannExitReading {
  const entryDate = etDateKey(new Date(input.openedAt));
  const crossed = entryCrossedLevel(input.side, input.entryPrice, input.openedAt, daily, monthly);
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
    const [{ bars: daily, monthly }, ref] = await Promise.all([
      completedDailyBars(input.symbol, now),
      isCryptoSymbol(input.symbol) ? Promise.resolve(null) : getInstrumentReference(input.symbol),
    ]);
    if (daily.length < 10) return null;
    return readGannExitFromBars(input, daily, ref?.sharesOutstanding ?? null, monthly);
  } catch (err) {
    console.error(`gann-exit-live: ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Re-buy after a stop (A-PYRAMID-07, `lib/gann/rebuy.ts`), read on the
 * completed sessions when a live or paper trade leaves on a stop: the re-entry
 * the rules rest on the reaction, or null when the trend no longer runs the
 * trade's way, the stop doesn't re-buy, or the bars can't be read.
 */
export async function readLiveRebuy(input: {
  symbol: string;
  side: "long" | "short";
  cause: ReversalCause | null;
  extreme: number;
  entryPrice: number;
  now?: Date;
}): Promise<GannRebuy | null> {
  if (!rebuysOn(input.cause)) return null;
  try {
    const { bars: daily } = await completedDailyBars(input.symbol, input.now ?? new Date());
    if (daily.length < 10) return null;
    return gannRebuy({ side: input.side, extreme: input.extreme, trend: readGannTrend(daily).direction, entryPrice: input.entryPrice });
  } catch (err) {
    console.error(`gann-exit-live: re-buy ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
