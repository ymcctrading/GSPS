/**
 * Plain-language education content for the reversal/continuation patterns
 * `lib/strat/patterns.ts` detects — what the shape means, why it matters for
 * entries and exits, and roughly how much confidence to put in it.
 *
 * This is deliberately separate from `lib/learning/` (the pattern-scoring /
 * backtest-learning engine): that module estimates numeric win probabilities
 * from history, this module explains the shapes to a person in words. Naming
 * them the same thing would be confusing — hence "education", not "learning".
 */

import type { StratPattern } from "@/lib/types";

export interface PatternEducation {
  /** Short label for the expandable header. */
  headline: string;
  /** What the shape is, in plain language. */
  whatItMeans: string;
  /** Why it matters for how you enter and exit. */
  whyItMatters: string;
  /** Roughly how much confidence to put in it, and what would raise or lower that. */
  confidence: string;
}

export const PATTERN_EDUCATION: Record<StratPattern["name"], PatternEducation> = {
  "2-2": {
    headline: "2-2 reversal",
    whatItMeans:
      "The last closed bar pushed clearly in one direction. The setup is betting the next bar breaks back through that bar's opposite extreme by a penny — a sign the push failed and the crowd behind it is trapped.",
    whyItMatters:
      "It only exists on a break of that trigger line, so there's nothing to manage until it fires — no chasing a move that hasn't happened. The stop sits one penny beyond the same bar's other extreme, which is what keeps the risk small and mechanical.",
    confidence:
      "Moderate on its own. It's the base case of the family — 1-2-2 and 3-2-2 are the same idea with a stronger setup bar in front of it, and score higher for it.",
  },
  "1-2-2": {
    headline: "1-2-2 reversal",
    whatItMeans:
      "A 2-2 reversal that was preceded by an inside bar — the market compressed and paused right before the failed push this pattern reverses.",
    whyItMatters:
      "The prior compression is read as fewer participants caught offside in the wrong direction before the reversal, which tends to make the break cleaner. Entry and stop mechanics are identical to a plain 2-2.",
    confidence:
      "Somewhat higher than a bare 2-2. Still wants confirmation from the structural levels and score — a clean shape on a weak setup is still a weak setup.",
  },
  "3-2-2": {
    headline: "3-2-2 reversal",
    whatItMeans:
      "A 2-2 reversal preceded by an outside bar — both sides of the market were tested hard immediately before the failed push.",
    whyItMatters:
      "That two-sided test right before the reversal is the strongest version of this family's trapped-crowd read. Same entry/stop mechanics as a plain 2-2, but the context behind it is more convincing.",
    confidence:
      "Highest confidence in the 2-2 family. Still not a guarantee — pair it with the score and where it sits relative to structural levels before treating it as a strong setup on its own.",
  },
  "2-1-2": {
    headline: "2-1-2 continuation",
    whatItMeans:
      "A directional bar followed by an inside bar (a pause). The trigger is a break of the inside bar in the direction the trend was already moving.",
    whyItMatters:
      "This is the opposite job from the 2-2 family: it continues a move rather than reversing one, so it belongs in a trend-following read, not a turn call. Getting the two families mixed up is the most common misread of a STRAT setup.",
    confidence:
      "Treat as trend confirmation — its usefulness depends on the trend already being established on the higher timeframes shown in the trend panel, not on the shape alone.",
  },
  "3-1-2": {
    headline: "3-1-2 setup",
    whatItMeans:
      "An outside bar (both sides tested, no clear winner) followed by an inside bar (a pause). Because the outside bar didn't resolve a direction, GSPS arms triggers on both the inside bar's high and its low — whichever breaks first is the trade.",
    whyItMatters:
      "Once one side triggers, the other side is void — the market has picked its direction and the untriggered line no longer describes anything real. Don't treat both lines as live at once.",
    confidence:
      "Direction-neutral until it fires; confidence comes from the side that actually breaks and how it aligns with the score and structural levels, not from the pattern shape itself.",
  },
  PMG: {
    headline: "Momentum reversal (PMG)",
    whatItMeans:
      "Five or more bars in a row making lower highs (or higher lows) — a slow, grinding move in one direction. The setup arms a trade on a break of the last bar's high or low, betting the string of trapped opposite-side positions gets stopped out and accelerates the move.",
    whyItMatters:
      "The longer the streak, the more trapped positions are believed to be behind it — this is a momentum-exhaustion read, not a shape read, so the streak length itself is part of the signal.",
    confidence:
      "Confidence scales with the streak length shown in the pattern description (\"N consecutive lower highs\"). A five-bar streak is the bare minimum for the pattern to arm at all; longer streaks are read as more convincing.",
  },
};

export function patternEducation(name: StratPattern["name"]): PatternEducation {
  return PATTERN_EDUCATION[name];
}

/** The exact glossary term string (`components/glossary.tsx`) for a pattern name. */
export const PATTERN_GLOSSARY_TERM: Record<StratPattern["name"], string> = {
  "2-2": "2-2 reversal",
  "1-2-2": "1-2-2 reversal",
  "3-2-2": "3-2-2 reversal",
  "2-1-2": "2-1-2 continuation",
  "3-1-2": "3-1-2 setup",
  PMG: "Momentum reversal (PMG)",
};
