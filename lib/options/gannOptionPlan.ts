/**
 * Gann's rules for buying puts and calls (Master Course Ch. 19A, "How to Make
 * Profits Trading in Puts and Calls", May 26, 1937; Ch. 19B, "How to Sell
 * Puts and Calls", February 1941). Tier A, his own course.
 *
 * - **The option is the stop.** Puts and calls are "insurance": the premium
 *   paid is the most that can be lost, and he used them in place of stop-loss
 *   orders, against overnight gaps too (PDF 444, 449-450). So an option
 *   plan's risk is the premium, and its exit is the underlying's Gann stop or
 *   exit signal, not a percentage of the premium.
 * - **30 days.** He lists 7, 14, 30 and 60-90 day options and says "you will
 *   make more money buying PUTS and CALLS good 30 days" (PDF 447).
 * - **Several points away.** He prefers options several points from the
 *   market (PDF 447), read here as out of the money by his price-scaled 3
 *   points (`pointScale.ts`), the smallest "several".
 * - **The same chart rules time the entry** (Rules 1-7, PDF 450-452): the
 *   underlying's Gann plan gives the direction and the moment; a call for a
 *   long, a put for a short.
 * - They pay best on $75-150 stocks (PDF 453): a note on the card, not a gate.
 *
 * Three-question basis: 1. Gann, as cited. 2. The 30 days is a holding term
 * he chose, not a cycle claim; Dewey's checklist does not apply. 3. Polarity:
 * the call and the put are the two poles of one rule; Cause and Effect: the
 * premium paid is the whole cause of the loss, so it is the risk.
 */

import { gannThreePoints } from "@/lib/gann/pointScale";

/** Gann's option term: "buying PUTS and CALLS good 30 days" (Ch. 19A, PDF 447). */
export const GANN_OPTION_DAYS = 30;

/** The price band where he says options pay best (Ch. 19A, PDF 453). */
export const GANN_OPTION_BEST_PRICE = { min: 75, max: 150 } as const;

const DAY_MS = 86_400_000;

/**
 * The expiration to offer first: the nearest one at least 30 days out, or the
 * farthest available when none is that far. `expirations` are `YYYY-MM-DD`.
 */
export function gannOptionExpiration(expirations: readonly string[], from: Date = new Date()): string | null {
  if (expirations.length === 0) return null;
  const sorted = [...expirations].sort();
  const floor = from.getTime() + GANN_OPTION_DAYS * DAY_MS;
  return sorted.find((e) => new Date(`${e}T21:00:00Z`).getTime() >= floor) ?? sorted[sorted.length - 1];
}

/**
 * The strike "several points away": the underlying's price moved Gann's 3
 * points out of the money (up for a call, down for a put). The caller snaps it
 * to the chain's listed strikes.
 */
export function gannOptionStrike(underlying: number, type: "call" | "put"): number | null {
  if (!(underlying > 0)) return null;
  const away = gannThreePoints(underlying);
  return type === "call" ? underlying + away : underlying - away;
}

/** The listed strike nearest Gann's strike. */
export function nearestListedStrike(target: number, strikes: readonly number[]): number | null {
  let best: number | null = null;
  for (const s of strikes) if (best === null || Math.abs(s - target) < Math.abs(best - target)) best = s;
  return best;
}

/** Calls for a long plan, puts for a short (Ch. 19A Rules 1-7). */
export function gannOptionType(direction: "bullish" | "bearish"): "call" | "put" {
  return direction === "bullish" ? "call" : "put";
}

/** Whether the underlying sits in the band he says options pay best on. */
export function inGannOptionBand(underlying: number): boolean {
  return underlying >= GANN_OPTION_BEST_PRICE.min && underlying <= GANN_OPTION_BEST_PRICE.max;
}

/** The card's one line on an option's risk, in Gann's terms. */
export const GANN_OPTION_RISK_NOTE =
  "The premium is the most this can lose. The method buys puts and calls as insurance, in place of a stop, good for 30 days and a few points out of the money.";
