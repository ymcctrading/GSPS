/**
 * Resting orders: a plan whose entry sits more than a day's range from price.
 * -----------------------------------------------------------------------------
 * Owner decision, 2026-10-21 (card "Show buy plans whose entry is far below
 * price as resting orders?", chose "Resting list"): "Plans more than a day's
 * range from their entry move to a separate 'Resting orders' list, out of
 * Execute, with the distance shown." The case behind it: AMD at $547.91 read
 * Execute with a buy entry of $480.46 (the reaction buy at a crossed old top),
 * its stop, TP1 and MTP all below price. Nothing about that plan is wrong; it
 * is simply not a trade to take today. It is an order resting at its level.
 *
 * "A day's range" is read as the daily average true range the scan already
 * computes: 14 periods over the completed daily sessions
 * (`ScanResult.dayRange`, `lib/scanTicker.ts`). That is an engineering reading
 * of the owner's words, labelled as such: he named a day's range, not a
 * period or a formula, and the ATR is the average day's range the scan has in
 * hand. A plan is resting when |price - entry| exceeds it. With no price, no
 * entry, or no range read (short history), nothing is known and the plan is
 * not called resting: the list keeps it where the verdict put it.
 *
 * Presentation and selection only. It moves no score, verdict, gate, plan
 * arming or order: the scored verdict stays Execute, the replay is unchanged,
 * and automation's resting orders are already held until price trades into
 * the buy zone (`gannBuyZone`). What changes is which list a person sees the
 * plan in, that Guided Mode and the demo account do not offer it as today's
 * trade (`lib/guided/eligibility.ts`), and that the card says plainly the
 * targets are measured from an entry price has not come back to.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann: the resting order at the old level is his. A buy is placed at or
 *    just over the old top once crossed, to be filled on the reaction back to
 *    it (W006 pp. 20, 46-47; `lib/gann/entryTrigger.ts`), and a sell at the
 *    old bottom on the rally. He never says to buy at the market because the
 *    plan is good; the order waits at its level. This module only names that
 *    state on screen. The day's-range threshold is not his.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect. The entry is the cause the targets follow
 *    from; a target already passed by price is no effect of this trade until
 *    the entry fills, so the card names the cause first. Polarity fits less:
 *    there are not two poles here, one plan in two states of readiness.
 *    Rhythm (the reaction back to the level) describes why it may fill, not
 *    what this module decides. Correspondence holds in the plain sense: one
 *    predicate on every list that reads the Execute verdict.
 * Law of Creation: level ⊗ price. A plan with its price beside it is a mixture
 * until the distance between them is read; that distance is the created third
 * (now / resting), and it re-enters as the list a plan is shown in.
 */

import { priceUsd } from "@/lib/strat/priceText";

export type RestingSide = "buy" | "sell";

export interface RestingInput {
  side: RestingSide;
  /** Price the plan is read at: a live quote, or the scan-time price. */
  price: number | null | undefined;
  entry: number | null | undefined;
  /** The daily average true range (see the header). */
  dayRange: number | null | undefined;
  tp1?: number | null;
  mtp?: number | null;
}

export interface RestingRead {
  /** |price - entry|, in dollars. */
  distance: number;
  /** The distance as a percent of price. */
  pct: number;
  /** Where the entry sits relative to price. */
  entryIs: "below" | "above";
  /**
   * True when the entry waits on a reaction (a buy below price, a sell above
   * it): the method's reaction entry at the crossed level. False when price
   * has not yet reached a level on the trade's own side.
   */
  reaction: boolean;
  dayRange: number;
  /** Targets on the wrong side of today's price: passed already, reachable only once the entry fills. */
  targetsBehindPrice: ("TP1" | "MTP")[];
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/** The resting read, or null when the plan is within a day's range of price (or nothing can be known). */
export function readResting(input: RestingInput): RestingRead | null {
  const { side, price, entry, dayRange } = input;
  if (!finite(price) || !(price > 0) || !finite(entry) || !finite(dayRange) || !(dayRange > 0)) return null;
  const distance = Math.abs(price - entry);
  if (!(distance > dayRange)) return null;
  const entryIs = entry < price ? "below" : "above";
  const behind = (t: number | null | undefined) =>
    finite(t) && (side === "buy" ? t < price : t > price);
  const targetsBehindPrice: ("TP1" | "MTP")[] = [];
  if (behind(input.tp1)) targetsBehindPrice.push("TP1");
  if (behind(input.mtp)) targetsBehindPrice.push("MTP");
  return {
    distance,
    pct: (distance / price) * 100,
    entryIs,
    reaction: side === "buy" ? entryIs === "below" : entryIs === "above",
    dayRange,
    targetsBehindPrice,
  };
}

export function isResting(input: RestingInput): boolean {
  return readResting(input) != null;
}

/** "$67.45 (12.3%) below price", for a list row. */
export function restingDistanceLabel(read: RestingRead): string {
  return `${priceUsd(read.distance)} (${read.pct.toFixed(1)}%) ${read.entryIs} price`;
}

/**
 * The card's plain sentence: "Resting order: waits for a reaction back to
 * $480.46, 12.3% below price." plus, when a target is already behind price,
 * that it counts only once the entry fills.
 */
export function restingNote(read: RestingRead, entry: number): string {
  const wait = read.reaction
    ? `waits for a reaction back to ${priceUsd(entry)}`
    : `waits for price to reach ${priceUsd(entry)}`;
  let note = `Resting order: it ${wait}, ${read.pct.toFixed(1)}% ${read.entryIs} price, more than a day's range away, so it is not a trade to take today.`;
  const t = read.targetsBehindPrice;
  if (t.length > 0) {
    const names = t.join(" and ");
    note += ` Its ${names} ${t.length === 1 ? "sits" : "sit"} ${read.entryIs} today's price too: ${t.length === 1 ? "it is" : "they are"} measured from the entry and count only once the entry fills, not from here.`;
  }
  return note;
}

/**
 * Split a list into the Execute rows to act on now and the Execute rows
 * resting at their level. Only Execute rows move ("out of Execute"); every
 * other row stays in `now` unchanged, in its order.
 */
export function splitResting<T>(
  rows: T[],
  read: (row: T) => { outputState: string } & RestingInput,
): { now: T[]; resting: T[] } {
  const now: T[] = [];
  const resting: T[] = [];
  for (const row of rows) {
    const input = read(row);
    if (input.outputState === "Execute" && isResting(input)) resting.push(row);
    else now.push(row);
  }
  return { now, resting };
}

/** The fields of a scan row the resting read takes; structural, so `ScanRow` satisfies it. */
export interface RestingRowFields {
  outputState: string;
  direction: string;
  entry: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  currentPrice?: number | null;
  dayRange?: number | null;
}

/**
 * A scan row read at its scan-time price. The lists split on this, so the
 * server and every client agree on which list a row is in; the card's own
 * sentence reads the live quote when it has one.
 */
export function restingInputOfRow(row: RestingRowFields, price?: number | null): { outputState: string } & RestingInput {
  return {
    outputState: row.outputState,
    side: row.direction === "bearish" ? "sell" : "buy",
    price: price ?? row.currentPrice ?? null,
    entry: row.entry,
    dayRange: row.dayRange,
    tp1: row.takeProfit1,
    mtp: row.masterProfit,
  };
}

/** An Execute row resting at its level, read at its scan-time price. */
export function isRestingExecuteRow(row: RestingRowFields): boolean {
  return row.outputState === "Execute" && isResting(restingInputOfRow(row));
}

/**
 * Whether a scan result's Execute plan is resting, read at the scan's own
 * price. The monitor reads such a plan as Watch (`evaluateMonitorsAndNotify`),
 * so its Execute alert comes once price is within a day's range of the entry.
 */
export function isRestingScanResult(
  r: {
    currentPrice?: number | null;
    dayRange?: number | null;
    levels?: { entry?: number | null; takeProfit1?: number | null; masterProfit?: number | null } | null;
  },
  side: RestingSide,
): boolean {
  return isResting({
    side,
    price: r.currentPrice,
    entry: r.levels?.entry,
    dayRange: r.dayRange,
    tp1: r.levels?.takeProfit1,
    mtp: r.levels?.masterProfit,
  });
}
