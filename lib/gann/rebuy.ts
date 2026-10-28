/**
 * Re-buy after a stop (A-PYRAMID-07; owner's pick on the card, 2026-10-16:
 * "Re-buy after stop").
 *
 * 1. Source. *Tunnel Thru the Air*, W022 p.198, Tier A: Robert's long is
 *    stopped out near the top at 225 after a run to about 230. He expects a
 *    reaction of "about 12 to 15 points", buys again at 218 (down a little
 *    over 12) and puts his stop at 212. The trend is still up, so the stop
 *    ends the lot, not the campaign.
 * 2. Cycle theory. No periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic principle. Rhythm: the reaction is the out-breath of the same
 *    move, and the re-entry rides the in-breath that follows. Polarity (the
 *    reversal) answers a trend that turned; this answers one that only paused,
 *    so the two never both act on one stop: a reversal short opened at the
 *    stop is covered at the re-buy. The others add nothing to the geometry.
 *
 * The geometry, price-scaled by the Gann point: the re-entry rests
 * `REBUY_REACTION_POINTS` below the trade's best price (12, the low end of his
 * 12 to 15, where he bought), and its stop sits half the reaction under it (218
 * and 212). Mirrored for a short: 12 points of rally above its low, stop 6 over.
 *
 * Engineering choices, labelled: only a trailing stop re-buys (the initial
 * stop says the entry was wrong, not that the trend paused), and only once the
 * trade ran far enough that the re-entry sits past its own entry (a stop that
 * the exit manager knows only as "stop" is read that way), the trend is read
 * on Gann's swing chart (`readGannTrend`) from the completed sessions before
 * the stop, and the re-entry is cancelled if price makes a new extreme before
 * the reaction comes (the move resumed without it).
 */

import { pricePoint } from "./pointScale";

export const REBUY_REACTION_POINTS = 12;

// Every trailing stop of `readGannExit` (`GannStopReason` but "initial"), so
// the replay, which reads the finer reason, re-buys as the exit managers do
// (they know a trailing stop only as "stop"). Pinned in rebuy.test.ts.
export const TRAILING_STOPS: ReadonlySet<string> = new Set([
  "stop",
  "break_even",
  "last_reaction",
  "prior_week",
  "prior_month",
  "final_stage",
  "day_low",
  "reverse_signal",
  "boiling_point",
]);

/** Whether a trade that left for this reason is re-bought on the reaction. */
export function rebuysOn(cause: string | null | undefined): boolean {
  return !!cause && TRAILING_STOPS.has(cause);
}

export interface GannRebuy {
  /** The same side as the trade that was stopped. */
  side: "long" | "short";
  /** Where the re-entry rests: the reaction below the best price (above it for a short). */
  entry: number;
  /** Half the reaction beyond the entry. */
  stop: number;
  /** The best price the stopped trade saw; a new extreme past it cancels the re-entry. */
  extreme: number;
}

/**
 * The re-entry for a trade stopped while the trend still runs its way. Null
 * when the trend no longer agrees or the geometry is degenerate.
 */
export function gannRebuy(input: {
  side: "long" | "short";
  extreme: number;
  trend: "bullish" | "bearish" | null;
  /** The stopped trade's own entry: the re-entry has to sit past it. */
  entryPrice?: number;
}): GannRebuy | null {
  const { side, extreme, trend, entryPrice } = input;
  if (!(extreme > 0) || trend !== (side === "long" ? "bullish" : "bearish")) return null;
  const reaction = REBUY_REACTION_POINTS * pricePoint(extreme);
  const dir = side === "long" ? 1 : -1;
  const entry = extreme - dir * reaction;
  const stop = entry - dir * (reaction / 2);
  if (!(entry > 0) || !(stop > 0)) return null;
  if (entryPrice != null && dir * (entry - entryPrice) <= 0) return null;
  return { side, entry, stop, extreme };
}

export function rebuyOffer(symbol: string, r: GannRebuy): string {
  const verb = r.side === "long" ? "buy again" : "sell short again";
  return `${symbol}: the trend still runs this way, so the rules ${verb} on the reaction, at ${r.entry.toFixed(2)} with a stop at ${r.stop.toFixed(2)}. Any opposite trade opened at the stop is closed there. Nothing was placed.`;
}
