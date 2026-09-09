/**
 * Gann Confluence Layer — the addendum's "North Star" numerical/coordinate
 * context module. Wraps GSPS's existing, already-implemented public-domain
 * Gann techniques (`lib/gann/squareOf9.ts`, `lib/gann/fans.ts`,
 * `lib/gann/timeCycles.ts`) rather than inventing new numerology: the
 * addendum requires "independently designed public concepts" with
 * provenance metadata, and forbids inferring any personally sourced
 * numerical logic that hasn't been supplied in an authorized written
 * specification. Material Number versus Harmonic Node classification still
 * has no such specification and stays `notImplemented`. The Digital
 * Root / Vortex 1-9 engine (`lib/gann/digitalRoot.ts`) now has one — the
 * "GSPS Implementation Blueprint" (v1.0, 2026-09-08, project owner) — and
 * is wired in below as `vortexContext`: `price_dr`/`time_dr` computed from
 * normalized positive integers (ticks/bars), never a raw price, per that
 * spec's section 2.2.
 *
 * Role: confluence, ranking, and coordinate refinement only. Never a sole
 * signal, never able to override a safety/account/eligibility gate — see
 * `docs/GANN_SARA_CONFLUENCE.md`.
 */

import type { AssetClass, Bar, Direction } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines, nearestFanLine } from "@/lib/gann/fans";
import { nearestS9Level, squareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";
import {
  buildDigitalRootFeature,
  classifyConfluence,
  classifyRootTransition,
  vortexClass,
} from "@/lib/gann/digitalRoot";
import { nearestGannAngle, normalizedSlope } from "@/lib/gann/normalizedSlope";
import { buildCoordinateLedger } from "@/lib/gann/coordinateLedger";
import { routeMarketAdapter } from "./marketAdapters";
import type { ConfluenceAlignment, ConfluenceModuleMeta, GannConfluenceResult, GannVortexContext } from "./types";

/**
 * The blueprint's `price_displacement_ticks`/`atr_ticks`/etc. all divide by
 * an instrument's real tick size. This module has no per-instrument tick
 * metadata (that lives in `lib/trade/tick-size.ts`, keyed to order pricing,
 * not confluence context), so it normalizes in cents — a fixed, documented
 * convention, not a guess — consistent with equities/crypto quoting.
 */
const NORMALIZATION_TICK_SIZE_CENTS = 0.01;

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
  /**
   * A prior scan's `vortexContext.priceDisplacement`/`.timeDisplacement`
   * active roots for this same symbol, when the caller has one in memory.
   * Nothing in this codebase persists a prior reading yet, so this is
   * optional and additive — omit it and `vortexContext.transition` is
   * simply `null`, same as always.
   */
  previousVortexRoots?: { price: number | null; time: number | null } | null;
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
      vortexContext: {
        priceDisplacement: null,
        timeDisplacement: null,
        priceVortexClass: null,
        timeVortexClass: null,
        relationship: null,
        transition: null,
      },
      angleSlope: null,
      coordinateLedger: [],
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

  // Digital Root/Vortex context (blueprint sections 2, 7, 18): price_dr from
  // the normalized tick displacement off the anchor low, time_dr from bars
  // since that anchor. Never computed from the raw price/date themselves.
  const majorLowIndex = inputs.dailyBars.findIndex((b) => b.l === majorLow);
  const priceDisplacementTicks = Math.round(
    Math.abs(inputs.currentPrice - majorLow) / NORMALIZATION_TICK_SIZE_CENTS,
  );
  const timeDisplacementBars = Math.max(1, inputs.dailyBars.length - 1 - Math.max(majorLowIndex, 0));

  const priceDisplacement = buildDigitalRootFeature(priceDisplacementTicks, {
    normalizationMethod: "price_displacement_ticks: round(|current - anchor low| / tick)",
    sourceTimeframe: "1d",
    featureVersion: GANN_CONFLUENCE_MODULE.version,
    asOf: sourceTimestamp,
  });
  const timeDisplacement = buildDigitalRootFeature(timeDisplacementBars, {
    normalizationMethod: "time_displacement_bars: bars since confirmed anchor low",
    sourceTimeframe: "1d",
    featureVersion: GANN_CONFLUENCE_MODULE.version,
    asOf: sourceTimestamp,
  });

  const previousRoots = inputs.previousVortexRoots ?? null;
  const vortexContext: GannVortexContext = {
    priceDisplacement,
    timeDisplacement,
    priceVortexClass: priceDisplacement ? vortexClass(priceDisplacement.activeDigitalRoot) : null,
    timeVortexClass: timeDisplacement ? vortexClass(timeDisplacement.activeDigitalRoot) : null,
    relationship:
      priceDisplacement && timeDisplacement
        ? classifyConfluence(priceDisplacement.activeDigitalRoot, timeDisplacement.activeDigitalRoot)
        : null,
    transition: previousRoots
      ? {
          price: priceDisplacement
            ? classifyRootTransition(previousRoots.price, priceDisplacement.activeDigitalRoot)
            : null,
          time: timeDisplacement
            ? classifyRootTransition(previousRoots.time, timeDisplacement.activeDigitalRoot)
            : null,
        }
      : null,
  };

  // Blueprint §8.5's normalized Gann-angle slope: realized ATR-units-per-bar
  // since the anchor low, and which fixed angle ratio that's nearest to.
  // `atr()` needs at least 2 bars; when the anchor sits at (or near) the
  // start of the window, widen the slice forward rather than reporting no
  // slope at all — MIN_DAILY_BARS guarantees enough bars exist to do so.
  const atrAtAnchor = atr(inputs.dailyBars.slice(0, Math.max(majorLowIndex + 1, 2)), 14);
  const slope = normalizedSlope(inputs.currentPrice, majorLow, atrAtAnchor, timeDisplacementBars);
  const angleSlope = slope !== null ? { slope, nearestAngle: nearestGannAngle(slope) } : null;
  const coordinateLedger = buildCoordinateLedger(inputs.dailyBars, inputs.currentPrice);

  const explanationTrace: string[] = [
    `Root: sqrt(major low ${majorLow.toFixed(2)}) = ${root.toFixed(4)}.`,
  ];
  if (priceDisplacement && timeDisplacement) {
    explanationTrace.push(
      `GSPS signal calculation: price root ${priceDisplacement.activeDigitalRoot} (${vortexContext.priceVortexClass}) vs time root ${timeDisplacement.activeDigitalRoot} (${vortexContext.timeVortexClass}) — relationship ${vortexContext.relationship}. Context only, not a directional signal.`,
    );
  }
  if (vortexContext.transition) {
    explanationTrace.push(
      `Root transition vs prior reading: price ${vortexContext.transition.price ?? "none"}, time ${vortexContext.transition.time ?? "none"}.`,
    );
  }
  if (angleSlope) {
    explanationTrace.push(
      `Normalized angle slope ${angleSlope.slope.toFixed(3)} ATR/bar${angleSlope.nearestAngle ? ` — nearest to ${angleSlope.nearestAngle.label} (${angleSlope.nearestAngle.direction})` : ""}.`,
    );
  }
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
  if (coordinateLedger.length > 0) {
    explanationTrace.push(
      `Coordinate ledger: ${coordinateLedger.length} prior D/W/M high-low and range-fraction candidates computed.`,
    );
  }

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
    vortexContext,
    angleSlope,
    coordinateLedger,
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
