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
 *   point above and below price (`planetaryAverages.ts`);
 * - each of Jupiter, Saturn and Uranus contributes only its nearest active
 *   angle above and below price (`astroRules.ts#activeAngleLevels`; added
 *   2026-10-16 under the owner's "every Gann method acts");
 * - the Sun's travel since the major low, added to the low at 1 point a
 *   degree, contributes its one level, which Gann calls a resistance angle
 *   (the 1954 coffee letter; `astroRules.ts#sunTravelLevel`, A-ASTRO-03,
 *   2026-10-22). The low is the daily bars' lowest, as `readAstroRules` reads
 *   it, so the level and the factor are one rule;
 * - Jensen's square of 90 contributes its nearest point above and below price,
 *   counted up from the daily bars' low and down from their high, across
 *   successive squares (`jensen.ts#jensenLevels`, 2026-10-16);
 * - Gann's full angle set, drawn from the major pivots and copied to the
 *   preceding opposite pivots, contributes its nearest line above and below
 *   price (`patternAngles.ts#patternAngleLevels`, gap G27, 2026-10-16);
 * - the Square of Nine's cardinal and fixed crosses contribute their nearest
 *   number above and below price, read in Gann points (Master Course Ch. 2,
 *   "great resistance points"; `squareOfNinePrice.ts`, C-LEVELS-15,
 *   2026-10-21);
 * - the company name's square contributes its nearest key number above and
 *   below price, read in Gann points (Master Course Ch. 15A, the United
 *   States Steel Name Chart; `nameNumerology.ts`, A-OTHER-08, 2026-10-21).
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
import { pointForBars } from "@/lib/gann/pointScale";
import { squareBoundaryLevels } from "@/lib/gann/masterCalculator";
import { planetaryLevels } from "@/lib/gann/planetaryAverages";
import { activeAngleLevels, sunTravelLevel } from "@/lib/gann/astroRules";
import { jensenLevels } from "@/lib/gann/jensen";
import { patternAngleLevels } from "@/lib/gann/patternAngles";
import { squareOfNinePriceLevels } from "@/lib/gann/squareOfNinePrice";
import { nameNumberLevels, nameSquare } from "@/lib/gann/nameNumerology";

export interface MasterLevel {
  price: number;
  label: string;
  source: "squareOf144" | "planetary" | "activeAngle" | "sunTravel" | "jensen" | "patternAngle" | "squareOfNine" | "name";
}

export function gannMasterLevels(
  longHistory: Bar[],
  daily: Bar[],
  price: number,
  asOf: Date,
  /** The stored company name, for its name chart; null leaves it out. */
  companyName: string | null = null,
): MasterLevel[] {
  if (!(price > 0) || daily.length === 0) return [];
  const unit = pointForBars(daily);
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
  for (const l of activeAngleLevels(asOf, price, unit)) out.push({ ...l, source: "activeAngle" });
  const sun = sunTravelLevel(daily, asOf, unit);
  if (sun) out.push({ ...sun, source: "sunTravel" });
  for (const l of jensenLevels(daily, price, unit)) out.push({ ...l, source: "jensen" });
  for (const l of patternAngleLevels(daily, price, unit)) out.push({ ...l, source: "patternAngle" });
  for (const l of squareOfNinePriceLevels(price, unit)) out.push({ price: l.price, label: l.label, source: "squareOfNine" });
  for (const l of nameNumberLevels(nameSquare(companyName), price, unit)) out.push({ ...l, source: "name" });
  return out;
}
