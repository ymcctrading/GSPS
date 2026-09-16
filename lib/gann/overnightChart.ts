/**
 * Gann's "Overnight Chart" — Chapter 3 of *The W.D. Gann Master Stock Market
 * Course* ("Method for Trading with the Overnight Chart — Mechanical Stock
 * Trading Method", dated January 17, 1931; see
 * docs/GANN_HISTORICAL_SOURCES.md A2.1). Read in full 2026-09-16 from the
 * project owner's own extraction of the course — the prior session had
 * flagged this chapter as unread; it no longer is.
 *
 * Despite the name, this has nothing to do with a pre/post-market trading
 * session — that reading (an actual understanding of extended-hours session
 * data) does not exist in Gann's text and was never claimed by this module.
 * "Overnight" here is Gann's own name for a *mechanical trailing reversal
 * chart* built purely from the daily high/low chart, kept by his own stated
 * construction rule (quoted, condensed):
 *
 *   "As long as a stock makes higher bottoms each day, you move the
 *   Overnight Chart up, but the first day it makes 1/4 point or more under a
 *   previous day's bottom you move the Overnight Chart down to this level,
 *   but always recording the highest top reached before the Overnight Chart
 *   turns. Then as long as the Overnight Chart makes lower bottoms, you
 *   continue to move it down." (mirrored on the way back up)
 *
 * Two of his own stated refinements are implemented as written:
 *   - Same-day higher-bottom-and-lower-top: "you would move it up to the top
 *     of that day because the Overnight Chart is based on bottoms" (while
 *     trailing up; mirrored while trailing down).
 *   - A wide/outside day (new high AND new low the same day): "you first
 *     move your chart up to the top... and then bring it down to the lowest
 *     level" — net effect, the day's opposite extreme becomes the new level,
 *     with the touched extreme still recorded as the flip target.
 *
 * What this module deliberately does NOT implement: Gann's stop-loss sizing
 * (1 point beyond a top/bottom, 3-point risk ceiling per initial trade),
 * pyramiding (double up on every reversal, half-sized every 3-5 points), and
 * the $3,000-per-100-shares capital rule. Those are position-sizing/order
 * rules that depend on account state and open positions — a different
 * subsystem (lib/portfolio, lib/lifecycle) from a per-symbol scan reading,
 * not a smaller version of this module. Left as an explicit, documented
 * exception rather than a silent gap; a future session wiring Gann-style
 * pyramiding into the Automated Portfolio Manager should start here.
 *
 * Also not implemented here: the "use Resistance Levels... halfway point"
 * tie-in and Rules 1-3's double/triple-top stop placement — those are about
 * *which* resistance levels back a specific stop, already the job of
 * lib/strat/levels.ts's structural-level anchoring (which this reading's
 * output can feed as one more directional confirmation, not a level source
 * itself). Rule 9 ("first 3 full point advance/reaction") is the same
 * point-magnitude reversal idea already live as the "3-point rule" in
 * lib/lifecycle/entryConfirmation.ts — not duplicated here.
 */

import type { Bar } from "@/lib/types";

/** Gann's own stated flip threshold: a break of 1/4 point or more. */
export const OVERNIGHT_CHART_FLIP_POINTS = 0.25;

export type OvernightChartMode = "up" | "down";

export interface OvernightChartReading {
  /** Current trailing direction: "up" tracks rising bottoms, "down" tracks falling tops. */
  mode: OvernightChartMode | null;
  /** The current Overnight Chart level (a trailing bottom in "up" mode, a trailing top in "down" mode). */
  level: number | null;
  /** True when the most recent bar flipped the mode (Gann's "stop loss order caught" reversal signal). */
  justFlipped: boolean;
}

const EMPTY: OvernightChartReading = { mode: null, level: null, justFlipped: false };

/**
 * Walks daily bars in order, keeping Gann's trailing chart. Returns the
 * reading as of the most recent bar. `null` mode/level when there isn't
 * enough history to establish an initial direction (fewer than 2 bars).
 */
export function computeOvernightChart(bars: Bar[]): OvernightChartReading {
  if (bars.length < 2) return EMPTY;

  // Seed direction and level from the first higher-bottom or lower-top pair,
  // same "wait for the first real signal" approach lib/gann/swingChart.ts
  // uses rather than guessing a direction from a single bar.
  let mode: OvernightChartMode | null = null;
  let level = 0;
  // The extreme recorded since the last flip — the highest top while trailing
  // up (the value a down-flip jumps to), or the lowest bottom while trailing
  // down (the value an up-flip jumps to). Gann's own instruction: "always
  // recording the highest top reached before the Overnight Chart turns."
  let extremeSinceFlip = 0;
  let justFlipped = false;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    justFlipped = false;

    if (mode === null) {
      if (bar.l > prev.l) {
        mode = "up";
        level = bar.l;
        extremeSinceFlip = Math.max(bar.h, prev.h);
      } else if (bar.h < prev.h) {
        mode = "down";
        level = bar.h;
        extremeSinceFlip = Math.min(bar.l, prev.l);
      }
      continue;
    }

    const outsideDay = bar.h > prev.h && bar.l < prev.l;

    if (mode === "up") {
      extremeSinceFlip = Math.max(extremeSinceFlip, bar.h);

      if (outsideDay) {
        // "First move your chart up to the top... and then bring it down to
        // the lowest level" — the day's high is touched (already folded into
        // extremeSinceFlip above) and the resting level becomes the low.
        level = bar.l;
      } else if (bar.l > level && bar.h < prev.h) {
        // Higher bottom AND lower top the same day: "based on bottoms," so
        // move to the top of that day instead of the bottom.
        level = bar.h;
      } else if (bar.l > level) {
        level = bar.l; // higher bottom — keep trailing up
      } else if (bar.l <= level - OVERNIGHT_CHART_FLIP_POINTS) {
        // Broke the trailing bottom by 1/4 point or more — flip down to the
        // highest top recorded since the chart started trailing up.
        mode = "down";
        level = extremeSinceFlip;
        extremeSinceFlip = bar.l;
        justFlipped = true;
      }
      // A bottom within 1/4 point of `level` but not higher: hold position,
      // per Gann's text (only a higher bottom moves it up; only a 1/4-point-
      // or-more break moves it down).
    } else {
      extremeSinceFlip = Math.min(extremeSinceFlip, bar.l);

      if (outsideDay) {
        level = bar.h;
      } else if (bar.h < level && bar.l > prev.l) {
        level = bar.l;
      } else if (bar.h < level) {
        level = bar.h; // lower top — keep trailing down
      } else if (bar.h >= level + OVERNIGHT_CHART_FLIP_POINTS) {
        mode = "up";
        level = extremeSinceFlip;
        extremeSinceFlip = bar.h;
        justFlipped = true;
      }
    }
  }

  return { mode, level: mode === null ? null : level, justFlipped };
}
