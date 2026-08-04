/**
 * How much of the premium paid a structural stop would consume.
 *
 * The band is a sizing discipline for long contracts: pay too little premium
 * and an ordinary stop eats most of it, pay too much and the trade is
 * inefficient. It is deliberately tighter than the 25–50%-of-premium max-loss
 * heuristic common for long options, because it is written for high-delta
 * contracts held as leveraged stock rather than for cheap out-of-the-money
 * premium.
 *
 * Two callers share this so their answers cannot drift:
 *   - lib/strat/levels.ts, from a premium passed to the scan, with no delta
 *     available — approximate (see `exact`).
 *   - the strike order ticket, which knows the contract's delta and the
 *     premium actually being paid — exact.
 */

export const STOP_BAND_MIN_PCT_OF_PREMIUM = 12;
export const STOP_BAND_MAX_PCT_OF_PREMIUM = 18;

export interface PremiumStopInput {
  /** Stop distance on the underlying, per share. */
  risk: number;
  /** Premium per share, as quoted — not multiplied by the contract size. */
  premium: number;
  /**
   * Contract delta. Omit when unknown: the reading then assumes the contract
   * moves point-for-point with the underlying, which overstates the premium
   * at risk everywhere except deep in the money.
   */
  delta?: number | null;
}

export interface PremiumStopReading {
  /** Share of the premium the stop would consume, as a percentage. */
  pctOfPremium: number;
  verdict: "tight" | "in-band" | "wide";
  /** True when a delta was supplied, so the figure is not an approximation. */
  exact: boolean;
  /** Null while the reading sits inside the band. */
  warning: string | null;
}

/**
 * Null when the inputs cannot support a reading — no risk, no premium, or a
 * contract with no directional exposure to lose it through.
 */
export function readPremiumStop(input: PremiumStopInput): PremiumStopReading | null {
  const { risk, premium } = input;
  if (!(risk > 0) || !(premium > 0)) return null;

  const delta = input.delta == null ? null : Math.abs(input.delta);
  if (delta !== null && !(delta > 0)) return null;

  // Premium and delta are both per-share, so the 100x contract multiplier
  // cancels and never enters the ratio.
  const pctOfPremium = ((risk * (delta ?? 1)) / premium) * 100;

  const verdict =
    pctOfPremium < STOP_BAND_MIN_PCT_OF_PREMIUM
      ? "tight"
      : pctOfPremium > STOP_BAND_MAX_PCT_OF_PREMIUM
        ? "wide"
        : "in-band";

  const band = `${STOP_BAND_MIN_PCT_OF_PREMIUM}–${STOP_BAND_MAX_PCT_OF_PREMIUM}% band`;
  const measured = `Structural stop risks ${pctOfPremium.toFixed(1)}% of the premium`;

  const warning =
    verdict === "tight"
      ? `${measured} — tighter than the ${band}. Size can be increased, or a cheaper contract holds the same stop.`
      : verdict === "wide"
        ? `${measured} — wider than the ${band}. Reduce size or skip.`
        : null;

  return { pctOfPremium, verdict, exact: delta !== null, warning };
}
