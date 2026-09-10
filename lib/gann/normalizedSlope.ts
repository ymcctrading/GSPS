/**
 * Normalized Gann-angle slope — "GSPS Implementation Blueprint" §8.5.
 *
 * `lib/gann/fans.ts` projects candidate price *levels* forward from an
 * anchor along fixed ratios (1x1, 2x1, …). This is the complementary,
 * diagnostic direction: given where price actually is, how many ATR-units
 * per bar has it realized since the anchor, and which of those same fixed
 * ratios is that realized slope closest to. Never computed from chart-pixel
 * geometry — the blueprint is explicit that a "1x1" needs a declared unit,
 * and ATR-per-bar is that unit here (matching `fans.ts`'s own `unit`).
 */

import type { Bar } from "@/lib/types";
import { atr, findPivots } from "@/lib/analysis/pivots";
import { ANGLES } from "./fans";

/**
 * `normalized_slope = (price_t - anchor_price) / (atr_at_anchor * bars_since_anchor)`.
 * Null when the inputs can't support a meaningful slope — no ATR, or the
 * anchor bar is the current bar — rather than dividing by zero.
 */
export function normalizedSlope(
  currentPrice: number,
  anchorPrice: number,
  atrAtAnchor: number,
  barsSinceAnchor: number,
): number | null {
  if (!(atrAtAnchor > 0) || !(barsSinceAnchor > 0) || !Number.isFinite(currentPrice) || !Number.isFinite(anchorPrice)) {
    return null;
  }
  return (currentPrice - anchorPrice) / (atrAtAnchor * barsSinceAnchor);
}

export interface NearestGannAngle {
  label: string;
  ratio: number;
  direction: "up" | "down";
}

/** Which fixed angle ratio (1x4 … 4x1) the realized `slope` sits closest to, and which way it's moving. */
export function nearestGannAngle(slope: number): NearestGannAngle | null {
  if (!Number.isFinite(slope)) return null;
  const direction: "up" | "down" = slope >= 0 ? "up" : "down";
  const magnitude = Math.abs(slope);

  let best: (typeof ANGLES)[number] | null = null;
  let bestDistance = Infinity;
  for (const angle of ANGLES) {
    const distance = Math.abs(magnitude - angle.ratio);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = angle;
    }
  }
  return best ? { label: best.label, ratio: best.ratio, direction } : null;
}

export interface GannAngleReading {
  slope: number;
  nearestAngle: NearestGannAngle;
  anchor: { price: number; kind: "high" | "low" };
}

/**
 * The realized Gann-angle slope since the most recent significant pivot of
 * `anchorKind`, anchored the same way `lib/gann/fans.ts` and
 * `lib/gann/squareOf9.ts`'s `recentSquareOf9Levels` already are (most recent
 * significant high/low) — so all three structural coordinate techniques
 * describe the same move. Falls back to the other pivot kind if the
 * preferred one hasn't printed yet, same as `evaluateGannConfluence`'s own
 * anchor selection.
 *
 * Candidate criterion support only (see
 * `docs/PROPOSAL_NEW_GANN_CRITERIA.md`) — not wired into any scored
 * criterion yet.
 */
export function angleSlopeFromBars(
  bars: Bar[],
  currentPrice: number,
  anchorKind: "high" | "low",
): GannAngleReading | null {
  if (bars.length < 20) return null;
  const pivots = findPivots(bars, 4);
  const reversed = [...pivots].reverse();
  const anchor =
    reversed.find((p) => p.kind === anchorKind) ??
    reversed.find((p) => p.kind !== anchorKind);
  if (!anchor) return null;

  const unit = atr(bars, 14);
  const barsSinceAnchor = bars.length - 1 - anchor.index;
  const slope = normalizedSlope(currentPrice, anchor.price, unit, barsSinceAnchor);
  if (slope === null) return null;

  const nearestAngle = nearestGannAngle(slope);
  if (!nearestAngle) return null;

  return { slope, nearestAngle, anchor: { price: anchor.price, kind: anchor.kind } };
}
