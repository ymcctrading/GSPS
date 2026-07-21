/**
 * Gann Fan angles from major swing pivots.
 *
 * The 1x1 line rises one "unit of price" per unit of time. The price unit is
 * scaled from the ATR of the anchor timeframe so fans stay meaningful across
 * assets with wildly different prices (a $5 stock vs BTC).
 */

import type { Bar } from "@/lib/types";
import { findPivots, atr } from "@/lib/analysis/pivots";

export interface FanLine {
  angle: string;
  price: number;
  distancePct: number;
  anchor: { price: number; index: number; kind: "high" | "low" };
}

const ANGLES: { label: string; ratio: number }[] = [
  { label: "1x4", ratio: 0.25 },
  { label: "1x2", ratio: 0.5 },
  { label: "1x1", ratio: 1 },
  { label: "2x1", ratio: 2 },
  { label: "4x1", ratio: 4 },
];

export function computeFanLines(bars: Bar[], currentPrice: number): FanLine[] {
  if (bars.length < 20) return [];

  const unit = atr(bars, 14); // price per bar for the 1x1
  if (unit <= 0) return [];

  const pivots = findPivots(bars, 4);
  // Anchor from the two most significant recent pivots (one high, one low)
  const lastHigh = [...pivots].reverse().find((p) => p.kind === "high");
  const lastLow = [...pivots].reverse().find((p) => p.kind === "low");

  const lines: FanLine[] = [];
  const lastIndex = bars.length - 1;

  for (const anchor of [lastHigh, lastLow]) {
    if (!anchor) continue;
    const elapsed = lastIndex - anchor.index;
    if (elapsed <= 0) continue;
    for (const { label, ratio } of ANGLES) {
      // Fans from a low rise; fans from a high descend.
      const sign = anchor.kind === "low" ? 1 : -1;
      const price = anchor.price + sign * ratio * unit * elapsed;
      if (price <= 0) continue;
      lines.push({
        angle: `${label} (${anchor.kind})`,
        price,
        distancePct: Math.abs(currentPrice - price) / currentPrice * 100,
        anchor: { price: anchor.price, index: anchor.index, kind: anchor.kind },
      });
    }
  }

  return lines.sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest fan line within `proximityPct` of the current price, if any. */
export function nearestFanLine(lines: FanLine[], proximityPct = 1.5): FanLine | null {
  const nearest = lines[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}
