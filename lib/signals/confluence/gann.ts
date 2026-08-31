/**
 * Gann Confluence Layer — the addendum's "North Star" numerical/coordinate
 * context module. Wraps GSPS's existing, already-implemented public-domain
 * Gann techniques (`lib/gann/squareOf9.ts`, `lib/gann/fans.ts`,
 * `lib/gann/timeCycles.ts`) rather than inventing new numerology: the
 * addendum requires "independently designed public concepts" with
 * provenance metadata, and forbids inferring any personally sourced
 * numerical logic that hasn't been supplied in an authorized written
 * specification. The one addendum-specific field that has no such
 * specification yet — Material Number versus Harmonic Node classification —
 * stays `notImplemented` rather than guessed at.
 *
 * Role: confluence, ranking, and coordinate refinement only. Never a sole
 * signal, never able to override a safety/account/eligibility gate — see
 * `docs/GANN_SARA_CONFLUENCE.md`.
 */

import type { AssetClass, Bar, Direction } from "@/lib/types";
import { computeFanLines, nearestFanLine } from "@/lib/gann/fans";
import { nearestS9Level, squareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";
import { routeMarketAdapter } from "./marketAdapters";
import type { ConfluenceAlignment, ConfluenceModuleMeta, GannConfluenceResult } from "./types";

export const GANN_CONFLUENCE_MODULE: ConfluenceModuleMeta = {
  moduleId: "gann_confluence_layer",
  moduleType: "gann",
  displayName: "Structural Coordinate Confluence",
  authorizedSource:
    "lib/gann/squareOf9.ts, lib/gann/fans.ts, lib/gann/timeCycles.ts — independently implemented public-domain structural coordinate techniques already in production use in the legacy scan scorer (lib/scanTicker.ts).",
  version: "0.1.0",
};

export interface GannConfluenceInputs {
  assetClass: AssetClass;
  symbol: string;
  dailyBars: Bar[];
  currentPrice: number;
  /** The direction to score alignment/conflict against — the scan's currently confirmed bias, not this module's own opinion. */
  direction: Exclude<Direction, "none"> | null;
}

const MIN_DAILY_BARS = 30;

export function evaluateGannConfluence(inputs: GannConfluenceInputs): GannConfluenceResult {
  const adapter = routeMarketAdapter(inputs.assetClass);
  const sourceTimestamp = new Date().toISOString();

  if (adapter.status === "unsupported" || inputs.dailyBars.length < MIN_DAILY_BARS) {
    const reason =
      adapter.status === "unsupported"
        ? adapter.note
        : `Insufficient daily bar history (${inputs.dailyBars.length} < ${MIN_DAILY_BARS}) for structural confluence.`;
    return {
      module: GANN_CONFLUENCE_MODULE,
      market: adapter.market,
      marketAdapterStatus: adapter.status,
      alignment: "notImplemented",
      root: null,
      nearestSquareOf9: null,
      nearestFanLine: null,
      timeCycleActive: false,
      timeCycleDates: [],
      materialNumberClassification: "notImplemented",
      evidence: {
        calculationVersion: GANN_CONFLUENCE_MODULE.version,
        inputs: { symbol: inputs.symbol, assetClass: inputs.assetClass },
        sourceTimestamp,
        explanationTrace: [reason],
      },
      note: reason,
    };
  }

  const majorLow = Math.min(...inputs.dailyBars.map((b) => b.l));
  const root = Math.sqrt(majorLow);
  const s9Levels = squareOf9Levels(majorLow, inputs.currentPrice);
  const fanLines = computeFanLines(inputs.dailyBars, inputs.currentPrice);
  const cycles = timeCycles(inputs.dailyBars);
  const nearestS9 = nearestS9Level(s9Levels);
  const nearestFan = nearestFanLine(fanLines);

  const explanationTrace: string[] = [
    `Root: sqrt(major low ${majorLow.toFixed(2)}) = ${root.toFixed(4)}.`,
  ];
  if (nearestS9) {
    explanationTrace.push(
      `Nearest key price level: ${nearestS9.price.toFixed(2)} (${nearestS9.role}, ${nearestS9.distancePct.toFixed(2)}% away, degree ${nearestS9.degree}, rotation ${nearestS9.rotation}).`,
    );
  }
  if (nearestFan) {
    explanationTrace.push(
      `Nearest structural angle line: ${nearestFan.angle} at ${nearestFan.price.toFixed(2)} (${nearestFan.role}, ${nearestFan.distancePct.toFixed(2)}% away).`,
    );
  }
  explanationTrace.push(
    cycles.active
      ? `Active structural time-cycle window (nearby dates: ${cycles.dates.slice(0, 3).join(", ") || "n/a"}).`
      : "No active structural time-cycle window.",
  );

  // Alignment/conflict reads off whichever coordinate is nearer current price
  // (fan lines are checked first — the key-price-level read is the fallback
  // when no fan anchor is available). Neither can override the caller's
  // direction; this only says whether the nearest structural coordinate's
  // role agrees with it.
  let alignment: ConfluenceAlignment = "neutral";
  if (inputs.direction) {
    const coordRole = nearestFan?.role ?? nearestS9?.role ?? null;
    if (coordRole) {
      const supportsDirection =
        (inputs.direction === "bullish" && coordRole === "support") ||
        (inputs.direction === "bearish" && coordRole === "resistance");
      alignment = supportsDirection ? "aligned" : "conflict";
    }
  }

  return {
    module: GANN_CONFLUENCE_MODULE,
    market: adapter.market,
    marketAdapterStatus: adapter.status,
    alignment,
    root: Math.round(root * 10000) / 10000,
    nearestSquareOf9: nearestS9,
    nearestFanLine: nearestFan,
    timeCycleActive: cycles.active,
    timeCycleDates: cycles.dates,
    materialNumberClassification: "notImplemented",
    evidence: {
      calculationVersion: GANN_CONFLUENCE_MODULE.version,
      inputs: {
        symbol: inputs.symbol,
        assetClass: inputs.assetClass,
        majorLow,
        currentPrice: inputs.currentPrice,
        direction: inputs.direction,
        roundingConvention: "root to 4 decimals; price levels to 2 decimals",
      },
      sourceTimestamp,
      explanationTrace,
    },
    note:
      "Confluence, ranking and coordinate refinement only — not a sole signal. The Material Number versus structural node classification is pending an authorized written specification and is not implemented.",
  };
}
