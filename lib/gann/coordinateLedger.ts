/**
 * Coordinate ledger — "GSPS Implementation Blueprint" §8.3's prior
 * daily/weekly/monthly high-low and range-fraction candidate coordinates,
 * unified into one schema-complete list. Confirmed swing high/low
 * (`lib/analysis/pivots.ts`), measured move (`lib/signals/states/*`), and
 * anchored VWAP (`lib/signals/indicators.ts`) already exist as separate
 * candidate-coordinate sources per §8.3's list — this module does not
 * duplicate them, only the two rows the traceability audit found genuinely
 * missing.
 *
 * Every entry follows §8.3's required storage fields exactly
 * (`coordinate_type`, `anchor_id`, `formula_description`, `parameter_values`,
 * `price_level`, `side`, `confidence_basis`, `research_status`), so a swing
 * or VWAP coordinate could be folded into the same list later without a
 * reshape.
 *
 * Trading-day windows, not calendar-aligned ones: "prior day" is the most
 * recent bar in `dailyBars`, "prior week" the trailing 5 sessions before it,
 * "prior month" the trailing 21 — the same kind of session-count convention
 * `docs/BACKTESTING.md` already uses for lookback windows, chosen over
 * calendar week/month boundaries to avoid a timezone-dependent trading
 * calendar this codebase doesn't otherwise carry. Documented here as an
 * interpretation, not implied by the blueprint text itself.
 */

import type { Bar } from "@/lib/types";
import { levelRole } from "@/lib/analysis/levelRole";

export type LedgerCoordinateSide = "SUPPORT" | "RESISTANCE" | "NEUTRAL";

export interface LedgerCoordinate {
  coordinateType: string;
  anchorId: string;
  formulaDescription: string;
  parameterValues: Record<string, number | string>;
  priceLevel: number;
  side: LedgerCoordinateSide;
  confidenceBasis: string;
  /** Every coordinate here is a plain OHLC read, not a fitted/promoted feature — always EXPERIMENTAL, same rule §7.4 applies to the DR/Vortex engine. */
  researchStatus: "EXPERIMENTAL";
}

function toSide(currentPrice: number, priceLevel: number): LedgerCoordinateSide {
  if (priceLevel === currentPrice) return "NEUTRAL";
  return levelRole(currentPrice, priceLevel) === "support" ? "SUPPORT" : "RESISTANCE";
}

function highLowCoordinates(
  window: Bar[],
  windowLabel: string,
  anchorId: string,
  currentPrice: number,
): LedgerCoordinate[] {
  if (window.length === 0) return [];
  const high = Math.max(...window.map((b) => b.h));
  const low = Math.min(...window.map((b) => b.l));
  const basis = `${window.length}-session ${windowLabel} range (${anchorId})`;
  return [
    {
      coordinateType: `PRIOR_${windowLabel.toUpperCase()}_HIGH`,
      anchorId,
      formulaDescription: `max(high) over the trailing ${window.length} session(s)`,
      parameterValues: { sessions: window.length },
      priceLevel: high,
      side: toSide(currentPrice, high),
      confidenceBasis: basis,
      researchStatus: "EXPERIMENTAL",
    },
    {
      coordinateType: `PRIOR_${windowLabel.toUpperCase()}_LOW`,
      anchorId,
      formulaDescription: `min(low) over the trailing ${window.length} session(s)`,
      parameterValues: { sessions: window.length },
      priceLevel: low,
      side: toSide(currentPrice, low),
      confidenceBasis: basis,
      researchStatus: "EXPERIMENTAL",
    },
  ];
}

/** Standard Gann range divisions: 1/4, 1/2 (midpoint), 3/4. */
const RANGE_FRACTIONS = [0.25, 0.5, 0.75];

function rangeFractionCoordinates(
  window: Bar[],
  windowLabel: string,
  anchorId: string,
  currentPrice: number,
): LedgerCoordinate[] {
  if (window.length === 0) return [];
  const high = Math.max(...window.map((b) => b.h));
  const low = Math.min(...window.map((b) => b.l));
  const range = high - low;
  if (range <= 0) return [];
  return RANGE_FRACTIONS.map((fraction) => {
    const price = low + range * fraction;
    return {
      coordinateType:
        fraction === 0.5 ? `${windowLabel.toUpperCase()}_RANGE_MIDPOINT` : `${windowLabel.toUpperCase()}_RANGE_FRACTION_${fraction * 100}`,
      anchorId,
      formulaDescription: `low + (high − low) × ${fraction} over the trailing ${window.length}-session ${windowLabel} range`,
      parameterValues: { fraction, sessions: window.length, high, low },
      priceLevel: price,
      side: toSide(currentPrice, price),
      confidenceBasis: `${windowLabel} range fraction (${anchorId})`,
      researchStatus: "EXPERIMENTAL" as const,
    };
  });
}

/**
 * Builds the prior D/W/M high-low and range-fraction coordinates for a
 * symbol. `dailyBars` must be sorted oldest-to-newest and end at the most
 * recently completed session (the same convention `evaluateGannConfluence`
 * already assumes) — `currentPrice` is the live price, kept separate so a
 * coordinate's `side` always reflects where price is right now, not where it
 * was at the prior close.
 */
export function buildCoordinateLedger(dailyBars: Bar[], currentPrice: number): LedgerCoordinate[] {
  if (dailyBars.length === 0) return [];

  const priorDay = dailyBars.slice(-1);
  const priorWeek = dailyBars.slice(-5);
  const priorMonth = dailyBars.slice(-21);

  const lastBar = dailyBars[dailyBars.length - 1];
  const dayAnchor = lastBar.t.slice(0, 10);
  const weekAnchor = `week ending ${dayAnchor}`;
  const monthAnchor = `month ending ${dayAnchor}`;

  return [
    ...highLowCoordinates(priorDay, "day", dayAnchor, currentPrice),
    ...highLowCoordinates(priorWeek, "week", weekAnchor, currentPrice),
    ...highLowCoordinates(priorMonth, "month", monthAnchor, currentPrice),
    ...rangeFractionCoordinates(priorWeek, "week", weekAnchor, currentPrice),
  ];
}
