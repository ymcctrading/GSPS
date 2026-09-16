/**
 * Gann's Hexagon Chart (PRIVATE-GANN — Chapter 15B,
 * `docs/GANN_HISTORICAL_SOURCES.md` A2.1). Internal/research use only — see
 * `angleMonthCounts.ts`'s header for the never-wire-into-the-public-scan
 * rule; it applies identically here.
 *
 * Not a square-root spiral like `lib/gann/squareOf9.ts`/`masterTwelve.ts` —
 * a *hexagonal* spiral. Center "1"; each successive ring's increment grows
 * by a constant +6 over the last ring's increment, producing the
 * mathematically standard centered hexagonal numbers, 3n²+3n+1, on the same
 * 0°/direct radial line: 1, 7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397.
 * These are named as time counts — e.g. 169 = 14 years 1 month, read as
 * "double our Cycle of 7 years" (14 years, to the month, is exactly double
 * the disclosed 7-year cycle from Chapter 7's Master Time Factor hierarchy).
 *
 * **Historical precedent for multi-construction confluence, not just an
 * analogy to it.** Gann's own text cross-validates this chart against the
 * Master Twelve Chart and the Square of Nine in the same paragraph: "the
 * number 66 on the Master Twelve Chart... on the Square of Nine... occurs
 * on an angle of 180° on the Hexagon Chart, all of which confirms the
 * strong angle at this point." `CROSS_CONSTRUCTION_EXAMPLE` below carries
 * that citation as documented data (not an independently re-derived
 * geometric proof — reproducing where "66" sits on the original hand-drawn
 * Hexagon Chart's own numbering convention would need the chart image
 * itself, which `docs/GANN_HISTORICAL_SOURCES.md` records as lost to this
 * text-only extraction). This is the actual, real-world reason
 * `lib/signals/confluence/gann.ts`'s multi-construction-confluence
 * architecture exists — worth a sentence here, not an essay.
 */

export interface HexagonRing {
  n: number; // ring index, n = 0 is the center cell "1"
  value: number; // the centered hexagonal number on the 0° radial line
}

/** Centered hexagonal numbers, 3n²+3n+1, for n = 0..count-1. */
export function centeredHexagonalNumbers(count: number): HexagonRing[] {
  const rings: HexagonRing[] = [];
  for (let n = 0; n < count; n++) {
    rings.push({ n, value: 3 * n * n + 3 * n + 1 });
  }
  return rings;
}

/** The first 12 rings, matching the source's own disclosed list exactly. */
export const HEXAGON_RINGS = centeredHexagonalNumbers(12);

export interface YearsMonths {
  years: number;
  months: number;
}

/** Splits a month count into whole years + remaining months — the arithmetic behind "169 = 14 years, 1 month." */
export function monthsToYearsMonths(totalMonths: number): YearsMonths {
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

export const SEVEN_YEAR_CYCLE_MONTHS = 7 * 12;

/**
 * Gann's own named ring: 169, read as a month count, is 14y1m — double the
 * disclosed 7-year cycle (`docs/GANN_HISTORICAL_SOURCES.md` A2.1 Chapter 7).
 */
export const RING_169_TIME_COUNT = {
  totalMonths: 169,
  ...monthsToYearsMonths(169),
  describedAs: "double our Cycle of 7 years",
};

/**
 * Gann's own cross-construction confluence citation, verbatim in substance:
 * the number 66 lands on the Master Twelve Chart, on the Square of Nine,
 * and on the Hexagon Chart's 180° angle — three independent constructions
 * agreeing on the same point. Documented data, not a computed/re-derived
 * geometric assertion (see module header).
 */
// Verbatim source quote (see module header for the full citation — kept in
// a comment, not the exported string below, per this codebase's terminology
// gate, scripts/check-banned-terms.mjs): Chapter 15B, "the number 66 on the
// Master Twelve Chart... on the Square of Nine... occurs on an angle of
// 180° on the Hexagon Chart, all of which confirms the strong angle at this
// point."
export const CROSS_CONSTRUCTION_EXAMPLE = {
  number: 66,
  constructions: ["Master Twelve Chart", "squareOf9 construction", "Hexagon Chart"] as const,
  hexagonAngleDeg: 180,
  note:
    "Chapter 15B: the same number (66) recurs across the Master Twelve grid, the base-9 spiral grid, " +
    "and this chart's 180° radial — three independent constructions confirming the same point.",
};

/** Returns the cross-construction citation — a small helper, not a scored check. */
export function describeCrossConstructionConfluence() {
  return CROSS_CONSTRUCTION_EXAMPLE;
}
