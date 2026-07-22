/**
 * GSPS core scan engine — single-ticker scoring.
 * -----------------------------------------------------------------------------
 * `types.ts` describes assets *after* they have been scored "by the core scan
 * engine (`lib/scanTicker`)". This is that engine. It turns raw market data for
 * one symbol into:
 *
 *   1. A `ScannedAsset` (the 0-9 Strat + Gann rule count, Strat hard-gate,
 *      relative volume, ATR expansion, direction, execution levels) — the exact
 *      shape the mean-reversion waterfall in `engine/scanner/waterfall.ts`
 *      consumes.
 *   2. A per-ticker `decision` (`Execute` / `Watch` / `Reject`) the `/api/scan`
 *      and `/api/batch-scan` routes surface directly.
 *
 * The Execute/Watch/Reject verdict is derived from the SAME tier thresholds the
 * waterfall uses (`TIER1_MIN_SCORE`, `TIER2_SCORE`, `hasMassiveVelocity`), so a
 * single ticker's verdict can never drift from where it would land on the board.
 *
 * Market data is supplied through an injectable `MarketDataProvider`. The
 * default is a deterministic simulated provider — same philosophy as
 * `engine/market-data/marketDataIngestor.ts`: the whole pipeline runs, is
 * demoable, and is unit-testable today, then flips to a live feed by passing a
 * real provider once API credentials exist. The pure scoring/decision helpers
 * are exported so they can be tested in isolation from any data source.
 */

import type { Direction, ScannedAsset, SetupTier } from "../engine/scanner/types";
import {
  hasMassiveVelocity,
  TIER1_MIN_SCORE,
  TIER2_SCORE,
} from "../engine/scanner/waterfall";

/** Terminal verdict the dashboard/API renders for a single ticker. */
export type OutputState = "Execute" | "Watch" | "Reject";

/** Fraction by which current ATR must exceed the prior period to count as a
 *  *significant* True Range expansion (the "ATR expansion" velocity signal). */
export const ATR_EXPANSION_FACTOR = 1.1;

/** Reversion execution-level multiples, expressed in ATR units. */
export const STOP_ATR_MULTIPLE = 1.5;
export const TARGET1_ATR_MULTIPLE = 1.0;
export const MASTER_TARGET_ATR_MULTIPLE = 2.0;

/**
 * Raw, pre-scored market data for one symbol. A `MarketDataProvider` produces
 * this; the scoring below is pure over it.
 */
export interface MarketSnapshot {
  symbol: string;
  price: number;
  previousClose: number;
  /** Current volume vs. its 10-day average (RVOL). */
  relativeVolume: number;
  /** Current-period Average True Range. */
  atr: number;
  /** Prior-period ATR, for the expansion comparison. */
  previousAtr: number;
  /** bullish (oversold → revert up) or bearish (overbought → revert down). */
  direction: Direction;
  /**
   * The Strat sniper/snapper structural agreement. This is the hard gate — an
   * asset that fails it is rejected regardless of how many rules it confirms.
   */
  structuralAgreement: boolean;
  /**
   * The Strat + Gann checklist, one boolean per rule (up to 9). The score is
   * the count of confirmed rules; anything past 9 is clamped.
   */
  checklist: boolean[];
}

export type MarketDataProvider = (
  ticker: string,
) => Promise<MarketSnapshot> | MarketSnapshot;

export interface OptionPlay {
  /** Bullish reversion → CALL chain, bearish → PUT chain. */
  side: "CALL" | "PUT";
  premium: number;
  /** Naive per-share breakeven for the quoted premium. */
  breakevenPrice: number;
  /** Dollar risk of a single contract (premium × 100). */
  maxRiskPerContract: number;
}

export interface ScanDecision {
  outputState: OutputState;
  /** The waterfall tier that produced an actionable verdict, else null. */
  setupTier: SetupTier | null;
  /** Human-readable justification for the verdict. */
  reason: string;
}

export interface ScanResult extends ScannedAsset {
  scannedAt: string;
  price: number;
  decision: ScanDecision;
  /** Present only when an `optionPremium` was supplied to the scan. */
  option?: OptionPlay;
}

/** Count confirmed rules, clamped to the documented 0-9 range. */
export function scoreChecklist(checklist: boolean[]): number {
  const confirmed = checklist.filter(Boolean).length;
  return Math.min(confirmed, 9);
}

/** True when the current ATR meaningfully exceeds the prior period. */
export function isAtrExpanding(atr: number, previousAtr: number): boolean {
  if (previousAtr <= 0) return false;
  return atr >= previousAtr * ATR_EXPANSION_FACTOR;
}

/**
 * Reversion execution levels in ATR units. For a bullish reversion we buy the
 * oversold dip (stop below, targets above); bearish mirrors it.
 */
export function computeLevels(
  price: number,
  atr: number,
  direction: Direction,
): Pick<ScannedAsset, "entry" | "stopLoss" | "takeProfit1" | "masterProfit"> {
  const dir = direction === "bullish" ? 1 : -1;
  return {
    entry: price,
    stopLoss: price - dir * STOP_ATR_MULTIPLE * atr,
    takeProfit1: price + dir * TARGET1_ATR_MULTIPLE * atr,
    masterProfit: price + dir * MASTER_TARGET_ATR_MULTIPLE * atr,
  };
}

/**
 * Map a scored asset to Execute / Watch / Reject using the waterfall's own
 * tier thresholds:
 *   - fail the Strat barrier            → Reject
 *   - PRISTINE (score ≥ 8)              → Execute
 *   - VELOCITY (score = 7 + velocity)   → Watch (needs confirmation)
 *   - otherwise                         → Reject
 */
export function decide(asset: ScannedAsset): ScanDecision {
  if (!asset.passesStratBarrier) {
    return {
      outputState: "Reject",
      setupTier: null,
      reason: "Failed Strat sniper/snapper structural barrier.",
    };
  }
  if (asset.score >= TIER1_MIN_SCORE) {
    return {
      outputState: "Execute",
      setupTier: "PRISTINE",
      reason: `Pristine setup — score ${asset.score} (≥ ${TIER1_MIN_SCORE}).`,
    };
  }
  if (asset.score === TIER2_SCORE && hasMassiveVelocity(asset)) {
    return {
      outputState: "Watch",
      setupTier: "VELOCITY",
      reason: `Velocity setup — score ${TIER2_SCORE} with massive RVOL/ATR; awaiting confirmation.`,
    };
  }
  return {
    outputState: "Reject",
    setupTier: null,
    reason: `Score ${asset.score} below actionable tiers.`,
  };
}

/** Build the option leg for an actionable reversion, if a premium was quoted. */
export function buildOptionPlay(
  price: number,
  direction: Direction,
  optionPremium: number,
): OptionPlay {
  const side = direction === "bullish" ? "CALL" : "PUT";
  const breakevenPrice =
    direction === "bullish" ? price + optionPremium : price - optionPremium;
  return {
    side,
    premium: optionPremium,
    breakevenPrice,
    maxRiskPerContract: optionPremium * 100,
  };
}

/** FNV-1a hash → 32-bit seed, so a symbol maps to a stable simulated snapshot. */
function seedFromSymbol(symbol: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, deterministic, good enough for a simulated feed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic simulated data provider. Same symbol → same snapshot every run,
 * so demos and tests are reproducible. Swap for a live provider in production.
 */
export function simulatedProvider(ticker: string): MarketSnapshot {
  const symbol = ticker.toUpperCase();
  const rand = mulberry32(seedFromSymbol(symbol));

  const previousClose = 5 + rand() * 295; // $5 – $300
  const drift = (rand() - 0.5) * 0.06; // ±3% move into the close
  const price = Number((previousClose * (1 + drift)).toFixed(2));
  const relativeVolume = Number((0.5 + rand() * 3).toFixed(2)); // 0.5x – 3.5x
  const previousAtr = Number((price * (0.01 + rand() * 0.03)).toFixed(4));
  const previousAtrExpansionFactor = 0.85 + rand() * 0.6; // 0.85x – 1.45x
  const atr = Number((previousAtr * previousAtrExpansionFactor).toFixed(4));

  // A dip into the close is a bullish (revert-up) candidate; a pop is bearish.
  const direction: Direction = drift <= 0 ? "bullish" : "bearish";

  // 9-rule Strat + Gann checklist; each rule independently likely to confirm.
  const checklist = Array.from({ length: 9 }, () => rand() > 0.35);
  const structuralAgreement = rand() > 0.3;

  return {
    symbol,
    price,
    previousClose: Number(previousClose.toFixed(2)),
    relativeVolume,
    atr,
    previousAtr,
    direction,
    structuralAgreement,
    checklist,
  };
}

/**
 * Score a single ticker and produce its Execute/Watch/Reject verdict.
 *
 * @param ticker         Symbol to scan (case-insensitive).
 * @param optionPremium  Optional quoted option premium; when present, an option
 *                       leg is attached to the result.
 * @param provider       Market-data source; defaults to the simulated feed.
 */
export async function scanTicker(
  ticker: string,
  optionPremium?: number,
  provider: MarketDataProvider = simulatedProvider,
): Promise<ScanResult> {
  const snapshot = await provider(ticker);

  const score = scoreChecklist(snapshot.checklist);
  const atrExpansion = isAtrExpanding(snapshot.atr, snapshot.previousAtr);
  const levels = computeLevels(snapshot.price, snapshot.atr, snapshot.direction);

  const asset: ScannedAsset = {
    symbol: snapshot.symbol,
    score,
    passesStratBarrier: snapshot.structuralAgreement,
    direction: snapshot.direction,
    relativeVolume: snapshot.relativeVolume,
    atrExpansion,
    ...levels,
  };

  const decision = decide(asset);

  const result: ScanResult = {
    ...asset,
    price: snapshot.price,
    scannedAt: new Date().toISOString(),
    decision,
  };

  if (optionPremium !== undefined && Number.isFinite(optionPremium)) {
    result.option = buildOptionPlay(
      snapshot.price,
      snapshot.direction,
      optionPremium,
    );
  }

  return result;
}
