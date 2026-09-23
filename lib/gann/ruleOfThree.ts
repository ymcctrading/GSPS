/**
 * Gann's "Rule of Three" — `Wall Street Stock Selector` (1930,
 * `docs/GANN_HISTORICAL_SOURCES.md` A4). His own words frame this as his
 * highest-conviction disclosed rule ("traders paid me $1,000 for it"): a
 * stock in a confirmed uptrend will never close three consecutive days lower
 * without signaling at least a temporary reversal; the downtrend mirror
 * needs only two consecutive higher closes — an explicit, stated asymmetry,
 * not a copy-paste error. Worked in full against U.S. Steel's actual 1929
 * daily closes in the source book.
 *
 * Added live 2026-09-16 as `ruleOfThree` (`lib/scoring/weights.ts`
 * `CRITERION_KEYS`), per `docs/GANN_PLATFORM_AUDIT.md` Part 4 item 1 and
 * AGENTS.md's "WD Gann precedence" principle — see
 * `lib/validation/criteria-registry.ts`'s `ruleOfThree` entry for why this
 * skips the codebase's normal unmeasured -> attribution -> in/out-of-sample
 * gate rather than starting as a quarantined hypothesis.
 *
 * **Generalization, stated plainly:** the book's rule is specifically about a
 * REVERSAL forming against a prevailing trend — it says nothing about a
 * trend that is simply continuing. GSPS's setups are either a reversion
 * (betting the current extended trend reverses) or a continuation (betting
 * it keeps going); the literal book rule maps cleanly onto reversion setups
 * only. Rather than leaving continuation setups unscored by this criterion,
 * this reads the same asymmetric close-count rule against the trade's own
 * direction generically: a bullish call (reversion or continuation) passes
 * when the downtrend-reversal mirror has fired (>= 2 consecutive higher
 * closes — the market is doing what Gann's rule says an upturn looks like,
 * whether that upturn is brand new or already running); a bearish call
 * passes on the mirror image (>= 3 consecutive lower closes). This is a
 * broader reading than Gann's literal text, named as such rather than
 * presented as a direct transcription.
 */

import type { Bar } from "@/lib/types";

/** An uptrend needs this many consecutive lower closes to signal reversal — Gann's stated figure. */
export const BEARISH_SIGNAL_CLOSES = 3;
/** A downtrend needs only this many consecutive higher closes — Gann's own stated asymmetry. */
export const BULLISH_SIGNAL_CLOSES = 2;

export interface RuleOfThreeReading {
  /** Consecutive lower closes ending at the most recent bar. */
  consecutiveLowerCloses: number;
  /** Consecutive higher closes ending at the most recent bar. */
  consecutiveHigherCloses: number;
  /** The downtrend-reversal mirror has fired: >= `BULLISH_SIGNAL_CLOSES` consecutive higher closes. */
  bullishSignal: boolean;
  /** The uptrend-reversal rule has fired: >= `BEARISH_SIGNAL_CLOSES` consecutive lower closes. */
  bearishSignal: boolean;
}

/**
 * Walks closes backward from the most recent bar, counting the current
 * same-direction streak. A flat close (equal to the prior close) ends the
 * streak, same treatment as `lib/gann/swingChart.ts`'s swing-chart reader.
 */
export function computeRuleOfThree(bars: Bar[]): RuleOfThreeReading {
  let lower = 0;
  let higher = 0;

  for (let i = bars.length - 1; i > 0; i--) {
    const change = bars[i].c - bars[i - 1].c;
    if (change < 0) {
      if (higher > 0) break;
      lower++;
    } else if (change > 0) {
      if (lower > 0) break;
      higher++;
    } else {
      break;
    }
  }

  return {
    consecutiveLowerCloses: lower,
    consecutiveHigherCloses: higher,
    bullishSignal: higher >= BULLISH_SIGNAL_CLOSES,
    bearishSignal: lower >= BEARISH_SIGNAL_CLOSES,
  };
}
