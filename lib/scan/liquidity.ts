/**
 * The liquidity floor every scan applies before a symbol is allowed to become a
 * setup.
 *
 * The scanners rank on structure and score, neither of which knows anything
 * about whether a fill is achievable. That put sub-$1 names with a few hundred
 * thousand shares of daily turnover on the same list as megacaps, with nothing
 * on the row to distinguish them — and the thinner the tape, the wider the
 * spread the "entry" is actually crossed at, so the plan the user reads is not
 * the plan they get. Guided Decision Mode makes that worse, because there the
 * user never sees the price at all before tapping.
 *
 * One floor, in one place, applied by every scan:
 *
 *   Equities  price >= $5 and 20-session average volume >= 500,000 shares.
 *   Crypto    volume in shares is meaningless across instruments priced from
 *             cents to six figures, so the same idea is expressed in dollars:
 *             average daily turnover >= $5,000,000. No price floor — a $0.60
 *             coin with real turnover is not the same instrument as a $0.60
 *             stock, whose float and spread are what the price floor is proxying
 *             for.
 *
 * The numbers are deliberately conservative and deliberately blunt. They are the
 * line under which a novice one-tapping a symbol is a materially worse outcome
 * than the same tap on a liquid name; they are not a claim about which side of
 * the line trades better.
 */

import type { AssetClass, Bar } from "@/lib/types";

/** Minimum share price for an equity to be scannable. */
export const MIN_EQUITY_PRICE_USD = 5;

/** Minimum average daily share volume for an equity to be scannable. */
export const MIN_EQUITY_AVG_VOLUME = 500_000;

/** Minimum average daily turnover, in dollars, for a crypto pair. */
export const MIN_CRYPTO_AVG_DOLLAR_VOLUME = 5_000_000;

/** Sessions the average is taken over. */
export const LIQUIDITY_LOOKBACK_SESSIONS = 20;

export interface LiquidityRead {
  price: number;
  /** Mean session volume over the lookback window, in shares/units. */
  avgVolume: number;
  /** `avgVolume` priced at `price` — the dollar turnover a crypto pair is judged on. */
  avgDollarVolume: number;
}

export interface LiquidityVerdict {
  ok: boolean;
  /** Why it failed, in the voice the audit trail and the scanner both use. Null when it passed. */
  reason: string | null;
}

/**
 * Read price and average volume off daily bars. Null when there are not enough
 * bars to average — an unreadable symbol is not a liquid one, and the caller
 * decides whether that is a skip or a "not enough history" note.
 */
export function readLiquidity(dailyBars: Bar[]): LiquidityRead | null {
  const window = dailyBars.slice(-LIQUIDITY_LOOKBACK_SESSIONS).filter((b) => Number.isFinite(b.c) && Number.isFinite(b.v));
  if (window.length === 0) return null;

  const price = window[window.length - 1].c;
  const avgVolume = window.reduce((sum, b) => sum + b.v, 0) / window.length;
  if (!(price > 0)) return null;

  return { price, avgVolume, avgDollarVolume: price * avgVolume };
}

/** Whether a read clears the floor for its asset class, and why not when it doesn't. */
export function meetsLiquidityFloor(
  read: LiquidityRead | null,
  assetClass: AssetClass,
): LiquidityVerdict {
  if (read === null) {
    return { ok: false, reason: "Not enough recent price and volume history to judge whether this is tradeable." };
  }

  if (assetClass === "crypto") {
    if (read.avgDollarVolume < MIN_CRYPTO_AVG_DOLLAR_VOLUME) {
      return {
        ok: false,
        reason: `Average daily turnover is ${formatDollarVolume(read.avgDollarVolume)}, below the ${formatDollarVolume(MIN_CRYPTO_AVG_DOLLAR_VOLUME)} floor — too thin to fill a plan against.`,
      };
    }
    return { ok: true, reason: null };
  }

  if (read.price < MIN_EQUITY_PRICE_USD) {
    return {
      ok: false,
      reason: `Trades at $${read.price.toFixed(2)}, below the $${MIN_EQUITY_PRICE_USD} floor — spreads at this price are a large share of the trade's own risk.`,
    };
  }
  if (read.avgVolume < MIN_EQUITY_AVG_VOLUME) {
    return {
      ok: false,
      reason: `Averages ${formatShareVolume(read.avgVolume)} shares a day, below the ${formatShareVolume(MIN_EQUITY_AVG_VOLUME)} floor — too thin to fill a plan against.`,
    };
  }
  return { ok: true, reason: null };
}

/** The floor, in one sentence, for audit rows and settings copy. */
export function liquidityFloorLabel(assetClass: AssetClass): string {
  return assetClass === "crypto"
    ? `${formatDollarVolume(MIN_CRYPTO_AVG_DOLLAR_VOLUME)} average daily turnover`
    : `$${MIN_EQUITY_PRICE_USD} price and ${formatShareVolume(MIN_EQUITY_AVG_VOLUME)} average daily shares`;
}

function formatShareVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function formatDollarVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${Math.round(v / 1_000_000)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
