/**
 * The price resistance levels from Gann's Master Calculator and planetary
 * averages that join the scan's support and resistance list. One function,
 * called by the live scan (`lib/scanTicker.ts`) and the replay
 * (`lib/backtest/replay.ts`) alike, so the two cannot drift (AGENTS.md
 * "Cross-platform consistency"). Added 2026-09-30.
 *
 * Gann says where these act: the Square of 144's squares are where "a change
 * in trend usually takes place" and its strongest points are "the strongest
 * for resistance in PRICE and TIME" (1953); the planetary averages are "the
 * most powerful points for time and price resistance" (March 20, 1954). The
 * support and resistance list is where GSPS keeps price resistance: it feeds
 * the historical S/R criterion and the plan's stops and targets, the same
 * place Gann's percentage-of-price levels went on 2026-09-27.
 *
 * Kept deliberately sparse, so the list isn't flooded:
 * - the calculator contributes only the ends and centres of squares (every
 *   72 points from 0, up from the extreme low and down from the extreme
 *   high), within half the price either way (`masterCalculator.ts`);
 * - each Tier A planetary average contributes only its nearest resistance
 *   point above and below price (`planetaryAverages.ts`).
 *
 * The Gann point is fixed from the daily bars' extremes, and the extremes
 * are the longest history supplied (monthly plus daily), which Gann ranks
 * first ("never overlook the extreme high and low price").
 *
 * Three-question basis: see the two source modules; this only routes their
 * levels. Hermetic: Correspondence, the same levels on the live scan and the
 * replay.
 */

import type { Bar } from "@/lib/types";
import { gannPointForBars } from "@/lib/gann/pointScale";
import { squareBoundaryLevels } from "@/lib/gann/masterCalculator";
import { planetaryLevels } from "@/lib/gann/planetaryAverages";

export interface MasterLevel {
  price: number;
  label: string;
  source: "squareOf144" | "planetary";
}

export function gannMasterLevels(longHistory: Bar[], daily: Bar[], price: number, asOf: Date): MasterLevel[] {
  if (!(price > 0) || daily.length === 0) return [];
  const unit = gannPointForBars(daily);
  if (!(unit > 0)) return [];
  const bars = longHistory.length > 0 ? longHistory : daily;
  let low = Infinity;
  let high = -Infinity;
  for (const b of bars) {
    if (b.l < low) low = b.l;
    if (b.h > high) high = b.h;
  }
  const out: MasterLevel[] = [];
  if (low > 0 && high > low) {
    for (const l of squareBoundaryLevels(price, low, high, unit)) out.push({ ...l, source: "squareOf144" });
  }
  for (const l of planetaryLevels(asOf, price, unit)) out.push({ ...l, source: "planetary" });
  return out;
}
