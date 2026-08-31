/**
 * GSPS — which symbols Guided Decision Mode is willing to look at.
 *
 * Guided used to look at eight, and only ever the eight the daily market scan
 * had already published. That is a defensible budget when a published list
 * exists and is fresh, and it degrades badly in every other case: a deployment
 * whose first cron has not run yet has no list at all, so `candidateSymbols`
 * returned nothing and Guided showed "nothing worth trading right now" — a
 * sentence about the market that was really a sentence about our own pipeline.
 * A novice reading it has no way to tell those apart.
 *
 * So the published list stays the *preferred* source and stops being the only
 * one. Anything it does not supply is topped up from the sector watchlists, and
 * the scan works through that order until it has enough recommendations or runs
 * out of budget.
 *
 * ## What widening does and does not change
 *
 * It changes how many symbols get *looked at*. It does not touch what qualifies:
 * `assessEligibility` still demands an Execute verdict, a priced plan, the
 * liquidity floor, a confirmed borrow for shorts, and — since
 * docs/MARKET_UNIVERSE_DATA_QUALITY.md's Guided Mode wiring — a passing
 * `novice_eligible` read, and `sizeGuidedTrade` still applies both caps.
 * Looking harder for a setup that clears the bar is a different act from
 * lowering the bar, and only the first one is safe to do on a beginner's
 * behalf.
 */

import { SECTORS } from "@/lib/sectors";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";

/**
 * Sectors Guided will draw from.
 *
 * Forex and futures are excluded, and not for lack of data: Guided sizes a
 * position in *shares* against paper equity, states the risk in dollars, and
 * hands the result to the equity simulator. A currency pair or a futures
 * contract does not size that way, so a recommendation for one would be
 * arithmetic the rest of the mode cannot honour.
 *
 * Crypto is excluded too, and this one is a deferral rather than a principle.
 * It trades around the clock and would be genuinely useful here, but
 * `app/api/guided/execute/route.ts` hardcodes `assetClass: "equity"` on
 * submission — so a crypto recommendation would be priced against equity tick
 * rules and recorded in the learning tables as `us_equity`. Widening the search
 * must not quietly change what the execute path is being handed. Re-enable this
 * once that route derives the asset class from the recommendation.
 */
const GUIDED_SECTORS = [
  "mag7",
  "semiconductors",
  "technology",
  "financials",
  "industrials",
  "energy",
  "healthcare",
  "etfs",
] as const;

/**
 * Every symbol Guided may consider, deduplicated, in a stable order.
 *
 * Ordering matters more than it looks: the scan works through this list in
 * batches and stops early, so whatever sits at the front is what gets looked at
 * on a normal day. Crypto sits last among the sectors rather than first —
 * during market hours the equity names are the better candidates, and crypto's
 * value here is that it is still there at 3am on a Sunday, which costs nothing
 * by being late in the list.
 */
export function fallbackUniverse(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (symbol: string) => {
    const upper = symbol.toUpperCase();
    // Dropping the crypto *sector* is not enough: BTC/USD also lives inside the
    // mag7 watchlist. The pair separator is the reliable test, so it is applied
    // to every symbol rather than trusting the sector it arrived in.
    if (upper.includes("/")) return;
    if (seen.has(upper)) return;
    seen.add(upper);
    out.push(upper);
  };
  for (const key of GUIDED_SECTORS) {
    for (const symbol of SECTORS[key]?.symbols ?? []) add(symbol);
  }
  // The large caps sit behind the sector lists rather than replacing them.
  // Guided scans a few dozen symbols at most per request, so this tail is
  // reached only when the published list and the watchlists between them have
  // not produced a setup — which is exactly the day it exists for.
  for (const symbol of LARGE_CAP_UNIVERSE) add(symbol);
  return out;
}

/**
 * The published list first, then everything else.
 *
 * The published rows are not just an arbitrary head start — they came from a
 * full market scan that already ranked them, so a symbol there is likelier to
 * clear the bar than one pulled off a sector watchlist at random. Spending the
 * early batches on them means the common case costs the same handful of scans it
 * always did, and the widened universe is only paid for on the days it is
 * actually needed.
 */
export function orderedCandidates(published: string[], budget: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const symbol of [...published, ...fallbackUniverse()]) {
    const upper = symbol.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
    if (out.length >= budget) break;
  }
  return out;
}
