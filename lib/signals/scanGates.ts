/**
 * Builds `SignalGates` from what a plain symbol scan (no specific account in
 * scope) can actually observe — `lib/scanTicker.ts` is the caller. The
 * account-only fields (position sizing, correlation/concentration, cooldown,
 * total open risk, and the Novice stop/target policy checks, which need a
 * specific account's risk config) are set to an optimistic placeholder and
 * the caller must pass `accountContextAssumed: true` to
 * `evaluateTrendPullback` alongside gates built here — see that flag's doc
 * comment in `lib/signals/types.ts`.
 */

import type { LiquidityRead } from "@/lib/scan/liquidity";
import type { SignalGates } from "./types";

export interface ScanGateInputs {
  liquidity: LiquidityRead | null;
  liquidityOk: boolean;
  /** True when the decision was already held for feed lag — see `lib/data/latency.ts`. */
  dataLagged: boolean;
}

export function buildScanMarketGates(inputs: ScanGateInputs): SignalGates {
  const { liquidityOk, dataLagged } = inputs;

  return {
    eligibleUniverse: liquidityOk,
    operatingCandleClosed: true, // the caller passes only closed bars (e.g. `closedM15`)
    staleData: dataLagged,
    // No bid/ask spread feed exists yet — the liquidity floor is used as the
    // best available proxy for "cost to enter is acceptable" until one does.
    liquiditySpreadPass: liquidityOk,
    // --- Account-only placeholders; see this module's doc comment. ---
    targetRoomAvailable: true,
    stopWithinNovicePolicy: true,
    positionSizeAvailable: true,
    correlationConcentrationPass: true,
    cooldownPass: true,
    totalOpenRiskPass: true,
    dataQualityOk: true,
  };
}
