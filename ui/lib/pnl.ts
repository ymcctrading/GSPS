/**
 * NinjaTrader-style live exposure math, framework-free so it can be unit-tested
 * and reused by web + native.
 *
 *   P/L = (Last Traded Price - Average Entry Price) * Size * Multiplier
 */

export type PnlDisplayMode = "DOLLAR" | "PERCENT" | "POINTS";

export interface PositionExposure {
  symbol: string;
  qty: number;
  entryPrice: number;
  currentPrice: number;
  /** Contract multiplier (futures); 1 for equities/crypto. */
  multiplier?: number;
  side?: "LONG" | "SHORT";
}

export interface PnlSnapshot {
  points: number;
  dollars: number;
  percent: number;
  isProfit: boolean;
}

export function computePnl(p: PositionExposure): PnlSnapshot {
  const multiplier = p.multiplier ?? 1;
  const dir = p.side === "SHORT" ? -1 : 1;
  const points = (p.currentPrice - p.entryPrice) * dir;
  const dollars = points * p.qty * multiplier;
  const percent = p.entryPrice === 0 ? 0 : (points / p.entryPrice) * 100;
  return { points, dollars, percent, isProfit: dollars >= 0 };
}

/** Format the P/L for a given cycle mode; used by the tap-to-cycle HUD. */
export function formatPnl(snap: PnlSnapshot, mode: PnlDisplayMode): string {
  const sign = snap.isProfit ? "+" : "";
  switch (mode) {
    case "DOLLAR":
      return `${sign}$${snap.dollars.toFixed(2)}`;
    case "PERCENT":
      return `${sign}${snap.percent.toFixed(2)}%`;
    case "POINTS":
      return `${sign}${snap.points.toFixed(2)} pts`;
  }
}

export const NEXT_MODE: Record<PnlDisplayMode, PnlDisplayMode> = {
  DOLLAR: "PERCENT",
  PERCENT: "POINTS",
  POINTS: "DOLLAR",
};
