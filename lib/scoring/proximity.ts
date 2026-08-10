/**
 * How close is "near a level".
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
 * The bands used when no ATR is available. Identical to the thresholds that
 * were hard-coded before, so a caller that cannot supply volatility gets
 * exactly the old behaviour rather than a silently different one.
 */
export const FALLBACK_FAN_PCT = 1.5;
export const FALLBACK_HARMONIC_PCT = 1.0;
export const FALLBACK_SR_PCT = 1.5;

/** Fan-line proximity: half a day's range. */
export const FAN_PROXIMITY_ATR = 0.5;

/**
 * Harmonic proximity, derived rather than picked so the harmonic gate stays
 * exactly as much tighter than the fan gate as the old 1.0%/1.5% pair made it.
 * Re-basing the unit must not quietly re-tune which criterion is strictest.
 */
export const HARMONIC_PROXIMITY_ATR =
  FAN_PROXIMITY_ATR * (FALLBACK_HARMONIC_PCT / FALLBACK_FAN_PCT);

/** Historical support/resistance proximity: half a day's range. */
export const SR_PROXIMITY_ATR = 0.5;

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
