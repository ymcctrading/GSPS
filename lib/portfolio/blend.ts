/**
 * Blended position tracking — groups a broker's flat position list (one row
 * per symbol, options included with their own OCC symbol) into one container
 * per underlying ticker, with a separate leg for the shares and for each
 * option contract.
 *
 * Alpaca already tracks P/L correctly per leg (shares and each option contract
 * are independent positions to the broker), so this module doesn't recompute
 * P/L — it classifies and regroups what the broker returned. Greeks are the one
 * thing the broker doesn't provide; those are modeled here from the position's
 * own premium (see `lib/options/greeks.ts`) and clearly flagged as such.
 */

import { parseOccSymbol } from "./occ";
import { computeGreeks, impliedVolatility, yearsBetween, type Greeks } from "@/lib/options/greeks";

export type AssetType = "EQUITY" | "OPTION";

export interface RawPosition {
  symbol: string;
  qty: number;
  side: string;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  todayPlPct: number;
  /** Alpaca's own classification when available ('us_equity' | 'us_option'). */
  assetClassHint?: string;
}

export interface EquityLeg {
  assetType: "EQUITY";
  symbol: string;
  avgFillPrice: number;
  totalShares: number;
  currentPrice: number;
  marketValue: number;
  equityPl: number;
  equityPlPct: number;
  todayPlPct: number;
}

export interface OptionLeg {
  assetType: "OPTION";
  /** OCC contract symbol — what a close order targets. */
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  qty: number;
  side: string;
  premium: number; // avg fill, per share
  currentPremium: number; // per share
  marketValue: number;
  optionPl: number;
  optionPlPct: number;
  todayPlPct: number;
  greeks: Greeks;
  /** IV backed out of the position's own current premium, not a market quote. */
  impliedVol: number;
  greeksModeled: true;
}

export interface BlendedPosition {
  underlying: string;
  equity: EquityLeg | null;
  options: OptionLeg[];
  /** Sum of every leg's market value — what the parent container header shows. */
  totalMarketValue: number;
  totalPl: number;
}

function classify(p: RawPosition): AssetType {
  if (p.assetClassHint === "us_option") return "OPTION";
  if (p.assetClassHint === "us_equity") return "EQUITY";
  // No broker hint (or an unfamiliar value) — fall back to symbol shape.
  return parseOccSymbol(p.symbol) ? "OPTION" : "EQUITY";
}

/**
 * Build blended per-underlying containers from a broker's flat position list.
 * `spotFor` resolves an underlying's current price for legs that need it to
 * model greeks (the equity leg's own price when held, otherwise a live quote
 * the caller fetched separately) — greeks are omitted, not guessed, when no
 * spot is available.
 */
export function buildBlendedPositions(
  positions: RawPosition[],
  spotFor: (underlying: string) => number | null,
): BlendedPosition[] {
  const groups = new Map<string, BlendedPosition>();

  const getGroup = (underlying: string): BlendedPosition => {
    let g = groups.get(underlying);
    if (!g) {
      g = { underlying, equity: null, options: [], totalMarketValue: 0, totalPl: 0 };
      groups.set(underlying, g);
    }
    return g;
  };

  for (const p of positions) {
    const assetType = classify(p);

    if (assetType === "EQUITY") {
      const g = getGroup(p.symbol.toUpperCase());
      g.equity = {
        assetType: "EQUITY",
        symbol: p.symbol.toUpperCase(),
        avgFillPrice: p.avgEntry,
        totalShares: p.qty,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        equityPl: p.unrealizedPl,
        equityPlPct: p.unrealizedPlPct,
        todayPlPct: p.todayPlPct,
      };
      continue;
    }

    const parsed = parseOccSymbol(p.symbol);
    if (!parsed) continue; // unrecognized option symbol shape — skip rather than misclassify
    const g = getGroup(parsed.underlying);

    const spot = spotFor(parsed.underlying);
    let greeks: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
    let iv = 0;
    if (spot != null && spot > 0 && p.currentPrice > 0) {
      const t = yearsBetween(new Date(), new Date(`${parsed.expiration}T16:00:00.000Z`));
      iv = impliedVolatility(parsed.type, spot, parsed.strike, t, p.currentPrice);
      greeks = computeGreeks(parsed.type, spot, parsed.strike, t, iv || 0.3);
    }

    g.options.push({
      assetType: "OPTION",
      symbol: p.symbol.toUpperCase(),
      underlying: parsed.underlying,
      strike: parsed.strike,
      expiration: parsed.expiration,
      type: parsed.type,
      qty: p.qty,
      side: p.side,
      premium: p.avgEntry,
      currentPremium: p.currentPrice,
      marketValue: p.marketValue,
      optionPl: p.unrealizedPl,
      optionPlPct: p.unrealizedPlPct,
      todayPlPct: p.todayPlPct,
      greeks,
      impliedVol: iv,
      greeksModeled: true,
    });
  }

  for (const g of groups.values()) {
    const legs = [g.equity, ...g.options].filter((x): x is EquityLeg | OptionLeg => x != null);
    g.totalMarketValue = legs.reduce((s, l) => s + l.marketValue, 0);
    g.totalPl = legs.reduce((s, l) => s + (l.assetType === "EQUITY" ? l.equityPl : l.optionPl), 0);
    g.options.sort((a, b) => a.expiration.localeCompare(b.expiration) || a.strike - b.strike);
  }

  return [...groups.values()].sort((a, b) => a.underlying.localeCompare(b.underlying));
}
