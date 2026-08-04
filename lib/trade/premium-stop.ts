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

/**
 * How long a triggered setup is assumed to stay open, in days, for the purpose
 * of charging time decay against the premium at risk.
 *
 * Measured by walking a year of AAPL 15-minute bars: of 1,071 setups that
 * cleared the gap rule and the risk floor, 418 triggered on the very next
 * candle as the protocol requires, and every one resolved at TP1 or the stop.
 * Time to resolution was 3 bars at the median (~45 minutes), 13 at p90 and 19
 * at p95 — comfortably inside one session.
 *
 * The p90 figure is used rather than the median because this feeds a risk
 * measure, and a trade that runs long is exactly when decay has had time to
 * matter. Half a session on a 26-bar day.
 */
export const TYPICAL_HOLDING_DAYS = 0.5;

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
  /**
   * Premium lost per day to time decay, as quoted (negative for a long). Omit
   * when unknown and the reading charges no decay at all, which understates
   * what a near-dated contract really puts at risk.
   */
  theta?: number | null;
  /** Days the position is assumed to stay open. Defaults to the measured p90. */
  holdingDays?: number;
}

export interface PremiumStopReading {
  /** Share of the premium at risk over the assumed hold, as a percentage. */
  pctOfPremium: number;
  /** Premium per share the stop would consume on its own. */
  stopCost: number;
  /** Premium per share time decay would consume over the assumed hold. */
  decayCost: number;
  /** The hold the decay figure was charged over. */
  holdingDays: number;
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

  // What the position actually stands to give up before it resolves: the move
  // to the stop, plus the decay charged for holding it that long. Charging the
  // stop alone flatters a near-dated contract, where decay can be the larger
  // of the two.
  // Both of these are clamped rather than trusted. A negative or non-finite
  // hold would subtract decay from the risk, and NaN compares false against
  // both band edges — so a bad input would read as "in-band, no warning".
  // Every way this can fail understates risk, which is the direction that
  // matters on a measure a trader sizes against.
  const requested = input.holdingDays ?? TYPICAL_HOLDING_DAYS;
  const holdingDays = Number.isFinite(requested) ? Math.max(0, requested) : TYPICAL_HOLDING_DAYS;
  const theta = input.theta != null && Number.isFinite(input.theta) ? Math.abs(input.theta) : null;

  const stopCost = risk * (delta ?? 1);
  const decayCost = theta === null ? 0 : theta * holdingDays;

  // Premium, delta and theta are all per-share, so the 100x contract
  // multiplier cancels and never enters the ratio.
  const pctOfPremium = ((stopCost + decayCost) / premium) * 100;

  const verdict =
    pctOfPremium < STOP_BAND_MIN_PCT_OF_PREMIUM
      ? "tight"
      : pctOfPremium > STOP_BAND_MAX_PCT_OF_PREMIUM
        ? "wide"
        : "in-band";

  const band = `${STOP_BAND_MIN_PCT_OF_PREMIUM}–${STOP_BAND_MAX_PCT_OF_PREMIUM}% band`;
  const measured = `Stop and decay put ${pctOfPremium.toFixed(1)}% of the premium at risk`;

  const warning =
    verdict === "tight"
      ? `${measured} — tighter than the ${band}. Size can be increased, or a cheaper contract carries the same stop for less.`
      : verdict === "wide"
        ? `${measured} — wider than the ${band}. Reduce size or skip.`
        : null;

  return {
    pctOfPremium,
    stopCost,
    decayCost,
    holdingDays,
    verdict,
    exact: delta !== null,
    warning,
  };
}
