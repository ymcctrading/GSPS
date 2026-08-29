/**
 * Builds `NoviceEligibilityInputs` from what `lib/scanTicker.ts`'s
 * symbol-only scan already has in hand — no extra provider fetch, same
 * discipline `lib/signals/scanGates.ts` applies to `SignalGates`. Every
 * field here is either a real, already-computed value or an honestly
 * documented proxy for one that doesn't exist yet; nothing is fabricated to
 * make the gate pass. See `docs/MARKET_UNIVERSE_DATA_QUALITY.md` for the
 * full accounting of what is and isn't a real read.
 */

import type { AssetClass, Bar } from "@/lib/types";
import type { LiquidityRead } from "@/lib/scan/liquidity";
import { LARGE_CAP_SOURCE_CAPTURED, LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { nextKnownEarningsEvent } from "@/lib/macro/earnings";
import { marketSession } from "@/lib/market/session";
import { assessNoviceEligibility } from "./eligibility";
import { marketCapPassFromLargeCapCoverage } from "./marketCap";
import type { DataQualityInputs } from "./dataQuality";
import type { NoviceEligibility, TriState } from "./types";

const LARGE_CAP_SET: ReadonlySet<string> = new Set(LARGE_CAP_UNIVERSE.map((s) => s.toUpperCase()));

export interface ScanUniverseGateInputs {
  symbol: string;
  assetClass: AssetClass;
  currentPrice: number;
  liquidity: LiquidityRead | null;
  dailyBars: Bar[];
  /** Same tri-state read `buildScanMarketGates` already computes for `SignalGates.binaryEventInHoldPeriod`. */
  binaryEventInHoldPeriod: boolean | null;
  /** `dataLag.holdsExecute` — the same lag hold `buildScanMarketGates` uses. */
  dataLagged: boolean;
  scannedAt: string;
}

/**
 * `novice_eligible` for a plain symbol scan with no account in scope. Feeds
 * `ScanResult` as an informational read — see `lib/scanTicker.ts` — the same
 * "market-context, not an execution authorization" framing the Signal and
 * Regime Engine's `tradeable` field already carries.
 */
export function buildScanNoviceEligibility(inputs: ScanUniverseGateInputs): NoviceEligibility {
  const symbol = inputs.symbol.toUpperCase();
  const inLargeCapUniverse = inputs.assetClass === "us_equity" && LARGE_CAP_SET.has(symbol);
  const now = new Date(inputs.scannedAt);
  const earningsEvent = nextKnownEarningsEvent(symbol, now);

  const dataQuality: DataQualityInputs = {
    quote: {
      timestamp: inputs.scannedAt,
      exchangeSession: marketSession(inputs.assetClass),
      // Alpaca bars are requested split-adjusted (`adjustment: "split"` in
      // lib/data/alpaca.ts) and every provider's daily bars are used the
      // same way throughout this codebase — see e.g. `lib/analysis/trend.ts`.
      adjusted: true,
      latencyStatus: inputs.dataLagged ? "stale" : "live",
    },
    // No corporate-action feed exists — absence is not itself a failure
    // (see dataQuality.ts), so this stays null rather than fabricated.
    corporateActions: null,
    earningsEvent: earningsEvent
      ? {
          dateTimeZone: `${earningsEvent.date} (${earningsEvent.timing})`,
          // Generated from reporting cadence, not vendor-confirmed — see lib/macro/earnings.ts.
          confidence: "estimated",
          source: "lib/macro/earnings.ts generated calendar",
        }
      : null,
    fundamentals: inLargeCapUniverse
      ? { asOfDate: LARGE_CAP_SOURCE_CAPTURED, sourceConsistent: true }
      : null,
    now,
  };

  return assessNoviceEligibility({
    symbol,
    marketCapUsd: null,
    marketCapResult: marketCapPassFromLargeCapCoverage(inLargeCapUniverse),
    avgDailyDollarVolume: inputs.liquidity?.avgDollarVolume ?? null,
    price: inputs.currentPrice > 0 ? inputs.currentPrice : null,
    // No broker in scope for a plain symbol scan — unknown, not assumed false.
    fractionalConfirmed: null,
    // No bid/ask feed at scan time — `spreadPass` falls back to the liquidity
    // proxy, the same documented fallback `lib/signals/scanGates.ts` uses today.
    spreadQuote: null,
    binaryEventInHoldWindow: toTriState(inputs.binaryEventInHoldPeriod),
    dailyBars: inputs.dailyBars,
    dataQuality,
  });
}

function toTriState(v: boolean | null): TriState {
  return v === null ? "unknown" : v;
}
