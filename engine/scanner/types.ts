/**
 * GSPS scanner types.
 *
 * These describe an asset AFTER it has been scored by the core scan engine
 * (`lib/scanTicker`). The waterfall filter in `waterfall.ts` consumes these and
 * produces the exact 15-slot bullish / bearish reversion payloads the dashboard
 * renders. The scoring itself is intentionally out of scope here so the gate
 * logic can be unit-tested in isolation.
 */

export type Direction = "bullish" | "bearish";

/** Tier assigned by the waterfall, used by the UI to badge each result. */
export type SetupTier =
  | "PRISTINE" // score 8-9  -> gold / diamond badge
  | "VELOCITY"; // score 7 + high velocity -> flame / lightning badge

export interface ScannedAsset {
  symbol: string;
  /** Comprehensive 0-9 rule count from the Strat + Gann checklist. */
  score: number;
  /**
   * Hard gate. True only when the asset passes the Strat sniper/snapper
   * structural trend agreement. An asset that fails this is discarded
   * regardless of score.
   */
  passesStratBarrier: boolean;
  /** bullish or bearish reversion candidate. */
  direction: Direction;
  /** Current volume vs. 10-day average (RVOL). */
  relativeVolume: number;
  /** True if True Range is expanding significantly (ATR expansion). */
  atrExpansion: boolean;
  /** Optional execution levels carried through for the dashboard cards. */
  entry?: number;
  stopLoss?: number;
  takeProfit1?: number;
  masterProfit?: number;
}

export interface RankedSetup extends ScannedAsset {
  rank: number; // 1-based rank within its direction list
  setupTier: SetupTier;
}

export interface ReversionPayload {
  bullishReversions: RankedSetup[];
  bearishReversions: RankedSetup[];
}
