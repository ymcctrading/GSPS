/**
 * Options chain derivative parser.
 *
 * When a stock triggers a mean-reversion entry under System Mastery, the engine
 * routes execution through an option-selection matrix instead of just buying
 * shares:
 *
 *   Bullish reversion -> Call chain,  Bearish reversion -> Put chain
 *   Filter Days-to-Expiration to a 7-14 day window (avoid theta decay / illiquidity)
 *   Pick the strike whose |delta| is closest to the target (ITM ~0.60)
 */

export interface OptionContract {
  contractSymbol: string; // OCC identifier, e.g. "NOK   260821C00005000"
  type: "CALL" | "PUT";
  strike: number;
  delta: number; // signed: calls positive, puts negative
  expirationDate: Date;
}

export interface OptionsChainFilter {
  underlyingTicker: string;
  bias: "BULLISH" | "BEARISH";
  minDte?: number;
  maxDte?: number;
  targetDelta?: number; // absolute value; ITM ~0.60
}

export const DEFAULT_MIN_DTE = 7;
export const DEFAULT_MAX_DTE = 14;
export const DEFAULT_TARGET_DELTA = 0.6;

export function calculateDaysToExpiration(
  expiry: Date,
  now: Date = new Date(),
): number {
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Pure selection logic, decoupled from the network. `fetchChain` supplies the
 * live chain so this is fully unit-testable.
 */
export async function findOptimalContract(
  filter: OptionsChainFilter,
  fetchChain: (ticker: string) => Promise<OptionContract[]>,
  now: Date = new Date(),
): Promise<OptionContract | null> {
  const minDte = filter.minDte ?? DEFAULT_MIN_DTE;
  const maxDte = filter.maxDte ?? DEFAULT_MAX_DTE;
  const targetDelta = filter.targetDelta ?? DEFAULT_TARGET_DELTA;
  const wantType = filter.bias === "BULLISH" ? "CALL" : "PUT";

  const chain = await fetchChain(filter.underlyingTicker);

  const candidates = chain.filter((c) => {
    if (c.type !== wantType) return false;
    const dte = calculateDaysToExpiration(c.expirationDate, now);
    return dte >= minDte && dte <= maxDte;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, c) => {
    const d = Math.abs(Math.abs(c.delta) - targetDelta);
    const bestD = Math.abs(Math.abs(best.delta) - targetDelta);
    return d < bestD ? c : best;
  });
}
