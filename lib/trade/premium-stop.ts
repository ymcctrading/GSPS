/**
 * How much of the premium paid the underlying's Gann stop would consume:
 * information for the trader, never a rule.
 *
 * Gann's rule for a bought put or call (Master Course Ch. 19A, PDF 444,
 * 449-450): the option is the stop. The premium paid is the most it can lose,
 * so the premium is the risk, and the position is sized on it by his capital
 * rules (a tenth of the unit at risk, F-04 in `lib/trade/place-order.ts`).
 * Until 2026-10-22 this module also judged the reading against a 12-18% of
 * premium "band" and told the trader to increase size below it or reduce
 * size above it (review finding R-006). The band had no Gann source and
 * contradicted his rule, so it is gone: no verdict, no sizing advice. The
 * figures stay, labelled on the ticket as a GSPS reading.
 *
 * Two callers share this so their answers cannot drift:
 *   - the strike order ticket, which knows the contract's delta and the
 *     premium actually being paid (exact);
 *   - none other today: the scan's levels no longer read it (R-006).
 */

/**
 * How long a trade is assumed to stay open, in calendar days, for the purpose
 * of charging time decay against the premium at risk.
 *
 * Gann's trades run on the swing for days to weeks, with no fixed target
 * (Q14). Measured on the 15-minute replay of 766 symbols (run 21,
 * `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 2): the median hold on
 * Gann's exits was about 7 sessions, and 60% of trades were still open at the
 * 10-session limit, so 7 sessions is a floor. Seven sessions span about ten
 * calendar days, the unit an option's theta is quoted in. An engineering
 * reading of a measurement, not a Gann figure.
 *
 * Until 2026-10-28 this was half a day, measured on the retired 15-minute
 * bar-pattern trigger whose trades resolved at a fixed TP1 within a session
 * (audit T-11); that understated decay on every contract the ticket read.
 */
export const TYPICAL_HOLDING_DAYS = 10;

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
  /** True when a delta was supplied, so the figure is not an approximation. */
  exact: boolean;
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
  // any comparison, so a bad input would read as a small figure.
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


  return {
    pctOfPremium,
    stopCost,
    decayCost,
    holdingDays,
    exact: delta !== null,
  };
}
