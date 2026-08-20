/**
 * GSPS — the closest thing to a setup, on a day when nothing qualifies.
 *
 * Guided refuses to recommend anything below an Execute verdict, and that
 * refusal is load-bearing: the app's own Backtest puts Watch-tier expectancy
 * slightly negative, so a Watch behind a friendly Buy button is a losing trade
 * wearing a winning interface. Widening the search (`universe.ts`) makes empty
 * days rarer; it cannot make them impossible, and the bar must not move to
 * close the gap.
 *
 * What can change is what fills the screen. "Nothing worth trading right now"
 * is true, and it teaches a beginner nothing — worse, it looks identical to a
 * broken app. A near miss is the same truth with the reasoning attached: here
 * is the closest candidate, here is its score, here is precisely what it lacks.
 *
 * ## The one rule this module exists to enforce
 *
 * A near miss is **not a recommendation and must never become tappable.** It
 * carries no size, no risk figure and no dollar reward, because those are the
 * things that turn a card into an order — and it is a separate type from
 * `Recommendation` rather than a flag on it precisely so no component can
 * render one through the buy path by accident. The only route forward from a
 * near miss is a link to the full scan, where the score is visible and the user
 * is making the call themselves with everything in front of them.
 */

import type { ScanResult } from "@/lib/types";
import { tickerHref } from "@/lib/routes";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";

export interface NearMiss {
  symbol: string;
  currentPrice: number;
  score: number;
  max: number;
  /** Execute / Watch / Reject, as the scanner published it. */
  verdict: string;
  /** What stops this being offered, in a beginner's words. One line each. */
  missing: string[];
  /** The full scan, where the score and levels are all visible. */
  tickerHref: string;
}

/**
 * Translate the eligibility gates into something a first-week user can act on.
 *
 * Derived from the scan itself rather than by parsing the strings
 * `assessEligibility` produces. Those strings are written for whoever is
 * debugging why a symbol did not appear, they change when that audience needs
 * them to, and a user-facing card that breaks when a log line is reworded is a
 * card that will silently start saying nothing.
 */
export function missingFor(result: ScanResult, score: number): string[] {
  const missing: string[] = [];

  // Two different reasons a verdict lands below Execute, and saying the wrong
  // one is worse than saying nothing: a setup can score 7-9 and still be held
  // at Watch because its plan has not armed or its data is stale. Telling that
  // reader "scores 8 out of 9, and we only offer 7 or better" is a sentence
  // that contradicts itself.
  if (result.decision.outputState !== "Execute") {
    missing.push(
      score < 7
        ? `Scores ${score} out of 9. Guided only offers setups scoring 7 or better, so this one is worth watching rather than buying.`
        : `Scores ${score} out of 9, which is strong — but the verdict is still ${result.decision.outputState}, so something else has not lined up yet.`,
    );
  }
  if (result.direction === "none") {
    missing.push("No clear direction yet — the price is not committing either way.");
  }
  if (!result.levels) {
    missing.push("The trade plan has no entry, stop or target priced yet, so there is nothing to place.");
  }
  if (result.direction === "bearish") {
    missing.push("Betting against a price also needs shares available to borrow, which is not guaranteed.");
  }

  // Never return an empty list. A card headed "what it's missing" that lists
  // nothing reads as a bug, and the honest fallback covers the gates this
  // function does not model individually (liquidity, stale data, sizing).
  if (missing.length === 0) {
    missing.push("Close, but one of the safety checks did not pass. The full scan shows the detail.");
  }
  return missing;
}

/**
 * The best of a bad lot: highest score wins, and a priced plan breaks a tie.
 *
 * A tie broken toward the one with levels is not arbitrary — of two symbols
 * scoring the same, the one that has already priced an entry and a stop is the
 * one a reader can learn something concrete from.
 */
export function pickNearestMiss(scans: (ScanResult | null)[]): NearMiss | null {
  let best: { result: ScanResult; score: number; max: number } | null = null;

  for (const result of scans) {
    if (!result || result.error) continue;
    const summary = result.decision.summary ?? toPublicScoreSummary(result.decision);
    if (best === null) {
      best = { result, score: summary.score, max: summary.max };
      continue;
    }
    const better =
      summary.score > best.score ||
      (summary.score === best.score && result.levels !== null && best.result.levels === null);
    if (better) best = { result, score: summary.score, max: summary.max };
  }

  if (best === null) return null;
  return {
    symbol: best.result.symbol,
    currentPrice: best.result.currentPrice,
    score: best.score,
    max: best.max,
    verdict: best.result.decision.outputState,
    missing: missingFor(best.result, best.score),
    tickerHref: tickerHref(best.result.symbol),
  };
}
