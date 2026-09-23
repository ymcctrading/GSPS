/**
 * Sara Strat bar-pattern strategy mode.
 *
 * Reuses GSPS's existing STRAT bar-sequence taxonomy
 * (`lib/strat/patterns.ts#detectPatterns`, Rob Smith's "The Strat") — already
 * investigated and documented in AGENTS.md's "Gann-grounded platform" audit
 * as a genuine, non-Gann, publicly-known method with its own display/
 * confluence role (`lib/signals/confluence/sara.ts`). That audit deliberately
 * kept this taxonomy off the scored criteria and off the Gann trade plan's
 * entry pricing (`patternArmed` remains an open gate-1 item; entries moved to
 * `lib/gann/entryTrigger.ts`). This module is the other side of that same
 * finding: STRAT's own trigger/stop pair, which the audit removed from the
 * *Gann* pipeline, is exactly what a user who trades Sara Strat directly
 * wants surfaced — under this opt-in Strategy Modes system, not the Gann one.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, by AGENTS.md's own prior finding — "no
 *    inside/outside-bar sequence taxonomy appears anywhere in the Gann
 *    primary or secondary catalog." Not claimed here either.
 * 2. Cycle theory: `detectPatterns` classifies bar shapes and matches a short
 *    fixed sequence (2-3 bars); it counts no run length and claims no
 *    recurrence interval, so Dewey's checklist doesn't apply — not a
 *    periodicity claim.
 * 3. Hermetic principle: Polarity — every pattern here is defined as a
 *    bullish/bearish mirror pair (`detectPatterns` itself is direction-
 *    symmetric), the same shape `computeGannEntryTrigger` uses for its own
 *    Buying/Selling Point mirror.
 *
 * Entry/stop: taken directly from the pattern's own `triggerPrice`/
 * `stopPrice` (already the one-penny-past-the-bar convention this taxonomy
 * defines) — this mode does not invent a different trigger rule, it exposes
 * STRAT's actual one. When multiple patterns are armed on the same bar, the
 * most specific one wins (1-2-2/3-2-2/3-1-2 over the bare 2-2/2-1-2, PMG last
 * since it requires the longest run and is the rarest read), matching
 * `detectPatterns`'s own "most specific first" ordering.
 */

import type { Bar, StratPattern } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { detectPatterns } from "@/lib/strat/patterns";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";

// Internal pattern-name tag used only as a lookup key, never rendered — see
// lib/strat/patterns.ts and lib/education/patterns.ts for the same
// bare-tag-vs-rendered-copy distinction (scripts/check-banned-terms.mjs's
// PMG_IDENTIFIER_FILES exemption covers this file for the same reason).
const SPECIFICITY: Record<StratPattern["name"], number> = {
  "1-2-2": 0,
  "3-2-2": 0,
  "3-1-2": 1,
  "2-2": 2,
  "2-1-2": 2,
  PMG: 3,
};

export function evaluateSaraStrat(bars: Bar[]): StrategyLevels | null {
  const patterns = detectPatterns(bars);
  if (patterns.length === 0) return null;

  const best = [...patterns].sort((a, b) => SPECIFICITY[a.name] - SPECIFICITY[b.name])[0];
  // Approved customer-facing label, not the internal pattern-name tag.
  const label = PATTERN_GLOSSARY_TERM[best.name];

  return buildLevels(
    "saraStrat",
    best.direction,
    best.triggerPrice,
    best.stopPrice,
    `${best.description} (${label} reversal-pattern bar-sequence).`,
  );
}
