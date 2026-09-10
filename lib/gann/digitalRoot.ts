/**
 * Digital Root / Vortex 1–9 engine — canonical implementation of section 2
 * and 7 of the "GSPS Implementation Blueprint" (v1.0, 2026-09-08, project
 * owner). This is the authorized written specification; every function name,
 * formula, and classification below is a direct port of the blueprint's
 * Python reference implementation, not an inference.
 *
 * Zero/null/invalid input is absence — never a guessed root, never root 9.
 * A digital root must never be computed from a raw/formatted price quote
 * (blueprint section 2.2): callers pass a normalized positive integer —
 * ticks, bars, ATR-in-ticks, relative-volume index, or distance-to-level.
 *
 * Confluence/context only (blueprint section 7.4 "safety rule" and section
 * 21's decision law): these functions may tag, rank, or score a candidate.
 * They may never by themselves create a live entry, override a stop, or
 * override a trend/risk gate.
 */

/** DR(n) = 1 + ((n − 1) mod 9). Throws for non-positive input — callers must validate first (blueprint 2.1). */
export function digitalRoot1to9(n: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new RangeError("GSPS signal calculations require a positive integer");
  }
  return 1 + ((n - 1) % 9);
}

/**
 * Legacy decimal-strip compatibility path (blueprint 2.1's
 * `calculate_gann_dr`): strips non-digit characters from a formatted value
 * and reduces what's left. Context-only display feature — never the sole
 * basis for a trade (blueprint 2.2). Returns null (absence) rather than
 * throwing, since the input here is untrusted display data, not an
 * already-validated normalized integer.
 */
export function calculateGannDr(value: string | number): number | null {
  const clean = String(value)
    .split("")
    .filter((ch) => ch >= "0" && ch <= "9")
    .join("");
  if (!clean) return null;
  const integerValue = Number(clean);
  if (integerValue === 0) return null;
  return digitalRoot1to9(integerValue);
}

/** Sums to 9 (or 18 for 9:9) — the blueprint's fixed polarity-pair table. */
const POLARITY_PAIRS: Record<number, number> = {
  1: 8,
  8: 1,
  2: 7,
  7: 2,
  3: 6,
  6: 3,
  4: 5,
  5: 4,
  9: 9,
};

function assertRoot(root: number): void {
  if (!Number.isInteger(root) || root < 1 || root > 9) {
    throw new RangeError("root must be 1 through 9");
  }
}

/** The root that resolves with `root` to a 9-completion pair. */
export function gannComplement(root: number): number {
  assertRoot(root);
  return POLARITY_PAIRS[root];
}

/** Whether two roots' sum reduces to the completion root, 9. */
export function resolvesToCompletion(rootA: number, rootB: number): boolean {
  assertRoot(rootA);
  assertRoot(rootB);
  return digitalRoot1to9(rootA + rootB) === 9;
}

export type VortexClass = "VORTEX_FLOW" | "POLARITY_AXIS" | "COMPLETION_NODE";

const VORTEX_FLOW = new Set([1, 2, 4, 8, 7, 5]);

/**
 * Blueprint 7.1's three-way classification. Root 1 is in `VORTEX_FLOW`
 * here — its "Renewal / Initiation Node" label (blueprint 2.3) is display
 * text, not a fourth classification bucket.
 */
export function vortexClass(root: number): VortexClass {
  assertRoot(root);
  if (VORTEX_FLOW.has(root)) return "VORTEX_FLOW";
  if (root === 3 || root === 6) return "POLARITY_AXIS";
  return "COMPLETION_NODE"; // root === 9, the only remaining case
}

/**
 * Blueprint 7.3's confluence types. `VORTEX_FLOW_TRANSITION` and
 * `ONE_RENEWAL_TRANSITION` describe a root *changing* between successive
 * readings (e.g. advancing along the 1-2-4-8-7-5 loop, or transitioning
 * into the root-1 renewal node) — that needs a stored prior reading, which
 * nothing in this codebase persists yet (blueprint's `digital_root_feature`
 * table, Milestone 3). Left unproduced here rather than guessed from a
 * single snapshot; `classifyConfluence` never returns either.
 */
export type ConfluenceType =
  | "NO_CONFLUENCE"
  | "COMPLEMENTARY_PAIR"
  | "COMPLETION_PAIR"
  | "THREE_SIX_POLARITY"
  | "NINE_COMPLETION"
  | "VORTEX_FLOW_TRANSITION"
  | "ONE_RENEWAL_TRANSITION"
  | "MULTI_FACTOR_CONFLUENCE";

/**
 * Classifies the relationship between two simultaneous root readings (e.g.
 * `price_dr` vs `time_dr` in the blueprint's section 18 API example).
 *
 * `COMPLETION_PAIR` and `COMPLEMENTARY_PAIR` are the same condition for a
 * two-root comparison — `resolvesToCompletion(a, b)` is true exactly when
 * `gannComplement(a) === b`, per the fixed table above. The blueprint
 * distinguishes them without a two-vs-many-root example; this reports
 * `COMPLEMENTARY_PAIR` (the named-pair table) for that shared case and
 * reserves `COMPLETION_PAIR` for a future multi-root sum, rather than
 * emitting two labels for one formula.
 */
export function classifyConfluence(rootA: number, rootB: number): ConfluenceType {
  assertRoot(rootA);
  assertRoot(rootB);

  const matched: ConfluenceType[] = [];
  if (rootA === 9 || rootB === 9) matched.push("NINE_COMPLETION");
  if (gannComplement(rootA) === rootB) matched.push("COMPLEMENTARY_PAIR");
  if ((rootA === 3 || rootA === 6) && (rootB === 3 || rootB === 6)) matched.push("THREE_SIX_POLARITY");

  if (matched.length > 1) return "MULTI_FACTOR_CONFLUENCE";
  if (matched.length === 1) return matched[0];
  return "NO_CONFLUENCE";
}

/**
 * `VORTEX_FLOW_TRANSITION`/`ONE_RENEWAL_TRANSITION` describe a root
 * *changing* between successive readings rather than a snapshot
 * relationship. The blueprint names both but gives no formula for either,
 * unlike `classifyConfluence`'s other six types — this is a documented
 * interpretation, not a literal spec port:
 *
 *   - `ONE_RENEWAL_TRANSITION`: the completion node (9) resolving into the
 *     renewal node (1) — blueprint 2.3's "Root 9: Completion" followed by
 *     "Root 1: Renewal" read as a sequence.
 *   - `VORTEX_FLOW_TRANSITION`: moving to the next root along the fixed
 *     1-2-4-8-7-5 loop (including the loop closing 5 back to 1).
 *
 * Takes the previous reading explicitly rather than reading any stored
 * state — nothing in this codebase persists a prior digital-root reading
 * yet, so callers that have one (e.g. from an in-memory prior-scan cache)
 * can supply it; callers that don't simply omit it and get `null`.
 */
const VORTEX_FLOW_SEQUENCE = [1, 2, 4, 8, 7, 5] as const;

export function classifyRootTransition(
  previousRoot: number | null,
  currentRoot: number,
): ConfluenceType | null {
  assertRoot(currentRoot);
  if (previousRoot === null) return null;
  assertRoot(previousRoot);
  if (previousRoot === currentRoot) return null; // no change, nothing to classify

  const matched: ConfluenceType[] = [];
  if (previousRoot === 9 && currentRoot === 1) matched.push("ONE_RENEWAL_TRANSITION");

  const flowIndex = VORTEX_FLOW_SEQUENCE.indexOf(previousRoot as (typeof VORTEX_FLOW_SEQUENCE)[number]);
  if (flowIndex !== -1) {
    const nextInFlow = VORTEX_FLOW_SEQUENCE[(flowIndex + 1) % VORTEX_FLOW_SEQUENCE.length];
    if (nextInFlow === currentRoot) matched.push("VORTEX_FLOW_TRANSITION");
  }

  if (matched.length > 1) return "MULTI_FACTOR_CONFLUENCE";
  if (matched.length === 1) return matched[0];
  return null; // a real change occurred, but it doesn't match either named transition
}

/** One of the blueprint 5.2 `digital_root_feature` records — every DR must carry this provenance (blueprint 2.2). */
export interface DigitalRootFeature {
  rawValue: number;
  normalizationMethod: string;
  integerValue: number;
  mod9Residue: number;
  activeDigitalRoot: number;
  inputTimestamp: string;
  sourceTimeframe: string;
  featureVersion: string;
}

/**
 * Builds a fully-provenanced digital-root feature from an already-normalized
 * positive integer. Returns null (absence) for anything that isn't one,
 * rather than a guessed root — per blueprint 2.1's "never convert
 * missing/null/invalid data to root 9."
 */
/**
 * Same fixed cents-normalization convention `lib/signals/confluence/gann.ts`
 * uses for price displacement — not per-instrument tick metadata (that lives
 * in `lib/trade/tick-size.ts`), a documented simplification shared by both
 * callers.
 */
const NORMALIZATION_TICK_SIZE_CENTS = 0.01;

export interface PriceTimeConfluence {
  priceRoot: number;
  timeRoot: number;
  type: ConfluenceType;
}

/**
 * Price-displacement root vs time-displacement root confluence off a single
 * anchor — the lightweight form of what `lib/signals/confluence/gann.ts`'s
 * `vortexContext` computes, for a caller that only needs the classification.
 *
 * **Confluence/context only** (blueprint 7.4's safety rule, same as every
 * other function in this module): the type this returns must never by
 * itself gate a scored criterion. A caller may only fold it into a scored
 * check ANDed with an independent, non-DR Gann structural condition (e.g. a
 * retracement-zone or Square-of-9 match) — never as the sole basis for a
 * pass/fail. `lib/scoring/score.ts`'s `gannRetracementConfluence` criterion
 * is the one place this is wired into scoring, and it is wired that way.
 */
export function priceTimeConfluence(
  currentPrice: number,
  anchorPrice: number,
  barsSinceAnchor: number,
): PriceTimeConfluence | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(anchorPrice)) return null;
  if (!Number.isFinite(barsSinceAnchor) || barsSinceAnchor <= 0) return null;
  const priceTicks = Math.round(Math.abs(currentPrice - anchorPrice) / NORMALIZATION_TICK_SIZE_CENTS);
  if (priceTicks <= 0) return null;

  const priceRoot = digitalRoot1to9(priceTicks);
  const timeRoot = digitalRoot1to9(Math.round(barsSinceAnchor));
  return { priceRoot, timeRoot, type: classifyConfluence(priceRoot, timeRoot) };
}

export function buildDigitalRootFeature(
  integerValue: number,
  context: { normalizationMethod: string; sourceTimeframe: string; featureVersion: string; asOf?: string },
): DigitalRootFeature | null {
  if (!Number.isFinite(integerValue) || !Number.isInteger(integerValue) || integerValue <= 0) return null;
  return {
    rawValue: integerValue,
    normalizationMethod: context.normalizationMethod,
    integerValue,
    mod9Residue: integerValue % 9,
    activeDigitalRoot: digitalRoot1to9(integerValue),
    inputTimestamp: context.asOf ?? new Date().toISOString(),
    sourceTimeframe: context.sourceTimeframe,
    featureVersion: context.featureVersion,
  };
}
