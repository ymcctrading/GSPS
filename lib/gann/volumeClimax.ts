/**
 * Volume climax at the anchor pivot.
 *
 * Gann held that a genuine turning point prints on climax volume, not a
 * quiet one — a swing low made on unusually heavy volume argues for real
 * accumulation there, not just an ordinary lull. This reads
 * `lib/signals/indicators.ts`'s `relativeVolume()` off the bars *ending at*
 * each candidate pivot, so its "latest bar" is the pivot itself and the
 * trailing lookback it compares against is whatever came before that pivot —
 * not the scan's current bar. Reuses the same `>1.5x` threshold
 * `lib/signals/regime.ts` already validated for "unusual volume" there
 * (`acceptedBreakout`), rather than re-deriving a new ratio and cutoff, per
 * AGENTS.md's cross-platform consistency principle.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and the dual-anchor
 * convention `computeAngleSlopes`/`computeTimePriceSquare` already use (a
 * low anchor for the bullish reading, a high anchor for the bearish one) —
 * `anchorPrice`/`anchorKind` below is always the single most recent pivot of
 * each kind, same as those siblings, so a trade judged against this reading
 * is judged against the same swing point they'd use. Only the volume check
 * itself looks wider — see `RECENT_PIVOTS_CHECKED` below.
 */

import { findPivots } from "@/lib/analysis/pivots";
import { relativeVolume } from "@/lib/signals/indicators";
import type { Bar } from "@/lib/types";

/**
 * TEMPORARY OVERRIDE (since 2026-09-14) — see AGENTS.md's "Temporary
 * overrides" section, `VOLUME_CLIMAX_THRESHOLD` entry. Loosened from the
 * `lib/signals/regime.ts`-matched 1.5x: on the committed 2026-09-11
 * unconditioned run (docs/replay-runs/2026-09-11-15Min-2R-within-all.json)
 * this was the rarest of the new scored criteria at 60/1061 (5.7%) passing,
 * one of several contributors to the Execute bucket collapsing to 0 trades.
 * The underlying signal (Δ+0.111R, consistently positive across four
 * readings) stays worth scoring; 1.5x was just too strict a bar to ever
 * co-occur with the other eight criteria at once.
 *
 * Widening this alone (2026-09-14 stopgap) turned out to dilute the signal
 * rather than just admit more of it — see `lib/validation/criteria-registry.ts`'s
 * `volumeClimax` entry for the 2026-09-14 reading (pass rate rose 3-10x more
 * than the threshold math alone predicts, and the effect collapsed toward
 * zero/inverted). `RECENT_PIVOTS_CHECKED` below is the follow-up fix: the
 * starvation problem was "too few candidate anchors ever clear 1.5x," not
 * "1.5x itself is wrong," so this restores 1.5x and widens the *anchor pool*
 * instead of the bar.
 */
export const VOLUME_CLIMAX_THRESHOLD = 1.5;

/**
 * How many of the most recent pivots of each kind get checked for climax
 * volume, instead of only the single latest one. Widening the anchor *pool*
 * this way — rather than lowering `VOLUME_CLIMAX_THRESHOLD` — keeps every
 * sibling criterion's shared anchor convention intact: `anchorPrice`/
 * `anchorKind` below still always name the single most recent pivot (the
 * same swing point `gannAngleSlope`/`timePriceSquare` judge their own
 * readings against), so this criterion never reads off a different swing
 * point than they do. Only the question "did a real climax happen near
 * here recently" gets to look past the single latest swing.
 *
 * 3 chosen to roughly match the reach `findPivots(bars, 4)`'s own strength
 * window already gives a single pivot (a candidate has to be extreme across
 * 4 bars each side to register at all, so the last 3 pivots of a kind
 * already span a meaningfully wider stretch than 3 raw bars would). Not yet
 * measured against outcomes — needs its own fresh committed run, same as
 * every other number in this file.
 */
export const RECENT_PIVOTS_CHECKED = 3;

export interface VolumeClimaxReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  /** Relative volume at the anchor pivot itself — kept for display/debugging. */
  relativeVolume: number;
  /** Highest relative volume among the last `RECENT_PIVOTS_CHECKED` pivots of this kind. */
  bestRecentRelativeVolume: number;
  /** Whether the anchor pivot or one of the last few pivots of its kind printed on climax volume. */
  climax: boolean;
}

export function computeVolumeClimax(bars: Bar[], lookback = 20): VolumeClimaxReading[] {
  const pivots = findPivots(bars, 4);

  const readings: VolumeClimaxReading[] = [];
  for (const kind of ["low", "high"] as const) {
    const recent = [...pivots].reverse().filter((p) => p.kind === kind).slice(0, RECENT_PIVOTS_CHECKED);
    const anchor = recent[0];
    if (!anchor) continue;

    const anchorRvol = relativeVolume(bars.slice(0, anchor.index + 1), lookback);
    if (anchorRvol === null) continue;

    let best = anchorRvol;
    for (const pivot of recent.slice(1)) {
      const rvol = relativeVolume(bars.slice(0, pivot.index + 1), lookback);
      if (rvol !== null && rvol > best) best = rvol;
    }

    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      relativeVolume: anchorRvol,
      bestRecentRelativeVolume: best,
      climax: best > VOLUME_CLIMAX_THRESHOLD,
    });
  }
  return readings;
}
