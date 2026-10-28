/**
 * Gann's "Rule of Three" — `Wall Street Stock Selector` (1930,
 * `docs/GANN_HISTORICAL_SOURCES.md` A4). His own words frame this as his
 * highest-conviction disclosed rule ("traders paid me $1,000 for it"): a
 * stock in a confirmed uptrend will never close three consecutive days lower
 * without signaling at least a temporary reversal, and a declining stock
 * "will never close more than 2 days with gains", so the third higher close
 * is the mirror's signal (WSSS pp.67-74; the book's own U.S. Steel 1929
 * example marks "3 up closes (trend up)" and lets a 2-day rally pass). Until
 * 2026-10-16 the bullish count was 2, read as a stated asymmetry; M-R3 found
 * the text says 3 both ways. Worked in full against U.S. Steel's actual 1929
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
 * when the downtrend-reversal mirror has fired (>= 3 consecutive higher
 * closes — the market is doing what Gann's rule says an upturn looks like,
 * whether that upturn is brand new or already running); a bearish call
 * passes on the mirror image (>= 3 consecutive lower closes). This is a
 * broader reading than Gann's literal text, named as such rather than
 * presented as a direct transcription.
 *
 * **The trend the rule leaves standing (2026-10-28).** The third close reverses
 * the trend "at least temporarily" (WSSS p.72), and the trend then stands until
 * the opposite third close: U.S. Steel's 1929 rush "at no time closed 3
 * consecutive days with losses" until the top (Ch. VI, p.125), and the book
 * marks "3 up closes (trend up)" and reads the trend up from there, through the
 * reactions of one or two days. The scored check read only the day the third
 * close printed (`bullishSignal`, the streak still running), so a long passed
 * only after three up days in a row, the move a reaction entry waits out, and
 * failed through every one- or two-day reaction of a trend the rule still
 * called up. On the six-year daily replay (ref 34a386d, 2,098 Execute trades)
 * trades passing it did 0.10R worse than trades failing it. `trend` is the
 * rule's own reading: the side of the latest run of three closes.
 */

import type { Bar } from "@/lib/types";

/** An uptrend needs this many consecutive lower closes to signal reversal — Gann's stated figure. */
export const BEARISH_SIGNAL_CLOSES = 3;
/** A downtrend signals reversal on the third consecutive higher close ("never more than 2 days with gains"). */
export const BULLISH_SIGNAL_CLOSES = 3;

export interface RuleOfThreeReading {
  /** Consecutive lower closes ending at the most recent bar. */
  consecutiveLowerCloses: number;
  /** Consecutive higher closes ending at the most recent bar. */
  consecutiveHigherCloses: number;
  /** The downtrend-reversal mirror has fired: >= `BULLISH_SIGNAL_CLOSES` consecutive higher closes. */
  bullishSignal: boolean;
  /** The uptrend-reversal rule has fired: >= `BEARISH_SIGNAL_CLOSES` consecutive lower closes. */
  bearishSignal: boolean;
  /**
   * The trend the rule leaves standing: the side of the latest run of
   * `BULLISH_SIGNAL_CLOSES` higher or `BEARISH_SIGNAL_CLOSES` lower closes in
   * the bars, held until the opposite run (WSSS p.72; Ch. VI p.125). Null when
   * no run of three has printed.
   */
  trend: "bullish" | "bearish" | null;
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

  // Forward walk for the standing trend: a flat close ends a run, as above.
  let trend: RuleOfThreeReading["trend"] = null;
  let up = 0;
  let down = 0;
  for (let i = 1; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    up = change > 0 ? up + 1 : 0;
    down = change < 0 ? down + 1 : 0;
    if (up >= BULLISH_SIGNAL_CLOSES) trend = "bullish";
    else if (down >= BEARISH_SIGNAL_CLOSES) trend = "bearish";
  }

  return {
    consecutiveLowerCloses: lower,
    consecutiveHigherCloses: higher,
    bullishSignal: higher >= BULLISH_SIGNAL_CLOSES,
    bearishSignal: lower >= BEARISH_SIGNAL_CLOSES,
    trend,
  };
}
