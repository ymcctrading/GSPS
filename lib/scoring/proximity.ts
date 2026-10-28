import { gannThreePointsPct } from "@/lib/gann/pointScale";
import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

/**
 * How close is "near a level". (Superseded for levels by `levelBandPct`, 2026-10-16; the history below explains the ATR band it replaced.)
 *
 * Three of the nine criteria ask whether price is sitting on a structural level
 * — a support line, a harmonic level, a clustered historical S/R. All three used
 * to answer with a fixed percentage of price: 1.5%, 1.0%, 1.5%. A fixed band
 * does not mean the same thing twice across a mixed universe:
 *
 *   - on a 5%-ATR name, 1.5% is a third of a day's range, so the point is
 *     nearly free;
 *   - on a 1%-ATR name, 1.5% is more than a full day's range, so the point is
 *     genuinely selective.
 *
 * A 7/9 therefore did not mean the same thing on NVDA as on a utility, and the
 * bias ran towards volatile names — which the momentum criterion also rewards,
 * so the two errors compounded rather than cancelled.
 *
 * The stop placement in `lib/strat/levels.ts` already made this move: it went
 * from a fixed percentage band to ATR multiples once it became clear the fixed
 * band was unreachable intraday. This is the same fix for the proximity gates.
 * A band is now a multiple of the instrument's own daily ATR, so "near" means
 * the same fraction of a day's range everywhere and scores are comparable
 * across the universe.
 *
 * The multiples preserve the ratio the fixed bands expressed — the harmonic
 * gate was two thirds of the fan gate, and still is — so the change is a
 * re-basing of the unit, not a covert re-tuning of which criterion is strictest.
 */

/**
 * "At a level" is within Gann's 3-point allowance of it (N#27, 2026-10-16):
 * his double and triple bottoms are levels "within 1-3 points" (Master
 * Course Ch.8), and a level holds until it is broken by 3 points (W006
 * pp.20, 46). The allowance is price-scaled (`lib/gann/pointScale.ts`).
 * Until 2026-10-16 the S/R and retracement bands were half a day's average
 * true range (Wilder's), a non-Gann unit; the coarse pass's travel band
 * below still is.
 */
export function levelBandPct(price: number): number {
  return gannThreePointsPct(price);
}

/** The basis a note names for `levelBandPct`. */
export const LEVEL_BAND_BASIS = "the usual allowance at the level";

/**
 * Daily ATR as a percentage of the reference price — a day's range in the same
 * unit `distancePct` is already reported in. Undefined when it cannot be
 * computed (no history, zero price), which is the signal to fall back.
 */
export function atrPercentOfPrice(atr: number, price: number): number | undefined {
  if (!(atr > 0) || !(price > 0)) return undefined;
  const pct = (atr / price) * 100;
  return Number.isFinite(pct) && pct > 0 ? pct : undefined;
}

/**
 * The proximity band, in percent of price.
 *
 * `atrPct` absent means "this caller has no volatility read", not "volatility is
 * zero" — the difference matters, because treating it as zero would close every
 * band to nothing and fail all three criteria on every setup.
 */
export function proximityBandPct(
  multiple: number,
  fallbackPct: number,
  atrPct?: number,
): number {
  return atrPct === undefined ? fallbackPct : multiple * atrPct;
}

/** Human-readable band suffix, so a note says what it was measured against. */
export function bandBasis(multiple: number, atrPct?: number): string {
  return atrPct === undefined
    ? "no volatility read available, so the fixed fallback band applies"
    : `${multiple.toFixed(2).replace(/\.?0+$/, "")}× the daily average range`;
}

/**
 * Whether any of `levels` sits inside the band around `price`.
 *
 * Lives here rather than at each call site because the live scan and the replay
 * both compute it, and a threshold that exists in two files drifts.
 */
export function nearAnyLevel(price: number, levels: number[], bandPct: number): boolean {
  if (!(price > 0)) return false;
  return levels.some((l) => (Math.abs(price - l) / price) * 100 <= bandPct);
}

/**
 * The closest of `levels` that sits inside the band around `price`, or null.
 * Unlike `nearAnyLevel` this keeps whatever the caller attached to each level
 * (its origin timeframe, most often) so a match can say more than "yes" — see
 * lib/analysis/levelRole.ts for why the timeframe a level came from matters.
 */
export function nearestLevelMatch<T extends { price: number }>(
  price: number,
  levels: T[],
  bandPct: number,
): T | null {
  if (!(price > 0)) return null;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const level of levels) {
    const dist = (Math.abs(price - level.price) / price) * 100;
    if (dist <= bandPct && dist < bestDist) {
      best = level;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * The closest in-band level on each side of `price`: below it (support) and
 * above it (resistance). Gann's rule is that a level acts as support while
 * price is above it and as resistance while price is below it (old tops
 * become bottoms, W006 pp.19-24; `levelRole`), so a long asks for the nearest
 * support and a short for the nearest resistance. Before 2026-10-21 the S/R
 * check took the nearest level of either role and then failed when it sat on
 * the wrong side, even with a level of the wanted role inside the band.
 */
export function nearestLevelMatchByRole<T extends { price: number }>(
  price: number,
  levels: T[],
  bandPct: number,
): Record<LevelRole, T | null> {
  return {
    support: nearestLevelMatch(price, levels.filter((l) => levelRole(price, l.price) === "support"), bandPct),
    resistance: nearestLevelMatch(price, levels.filter((l) => levelRole(price, l.price) === "resistance"), bandPct),
  };
}
