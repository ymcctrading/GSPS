/**
 * Gann Fan angles from major swing pivots.
 *
 * The 1x1 line rises one "unit of price" per unit of time. The price unit is
 * scaled from the ATR of the anchor timeframe so fans stay meaningful across
 * assets with wildly different prices (a $5 stock vs BTC).
 */

import type { Bar } from "@/lib/types";
import { findPivots, atr } from "@/lib/analysis/pivots";
import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

export interface FanLine {
  angle: string;
  price: number;
  distancePct: number;
  anchor: { price: number; index: number; kind: "high" | "low" };
  /** Support while price sits above the line, resistance while below it. */
  role: LevelRole;
}

/**
 * Exported for `lib/gann/normalizedSlope.ts`, which classifies an already-realized
 * slope against this same ratio set.
 *
 * **3x2, 3x1, 8x1, 16x1 added 2026-09-16** (Master Stock Market Course,
 * Chapter 4, "The Basis Of My Forecasting Method — Geometric Angles" —
 * docs/GANN_HISTORICAL_SOURCES.md A2.1): four of Gann's own named angle
 * ratios were missing from this list — 8x1 (82.5°) and 16x1 (86.25°, his own
 * example: "fast advancing markets like 1929"), 3x1 (71.25°), and 3x2 (used
 * "when other important angles... have spread far apart"). Adding them is a
 * data-completeness fix to an already-scored mechanism (`gannAngleSlope`),
 * not a new criterion — the exact "an existing array missing part of its own
 * disclosed set" gap AGENTS.md's cross-platform-consistency section warns
 * against leaving half-done.
 */
export const ANGLES: { label: string; ratio: number }[] = [
  { label: "1x4", ratio: 0.25 },
  { label: "1x2", ratio: 0.5 },
  { label: "3x2", ratio: 1.5 },
  { label: "1x1", ratio: 1 },
  { label: "3x1", ratio: 3 },
  { label: "2x1", ratio: 2 },
  { label: "4x1", ratio: 4 },
  { label: "8x1", ratio: 8 },
  { label: "16x1", ratio: 16 },
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
        role: levelRole(currentPrice, price),
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
