/**
 * Digital Root / Vortex coordinate classification — the 1–9 active system
 * from the authorized "GSPS Gann-Centered Foundation" specification
 * (2026-09-08, uploaded by the project owner; see
 * `docs/GANN_SARA_CONFLUENCE.md` on why this stayed unimplemented until an
 * authorized written specification existed).
 *
 * DR(n) = 1 + ((n − 1) mod 9) for a positive integer n. The recurring
 * 1..9 structure is established modular arithmetic; the role assigned to
 * each root is a GSPS symbolic convention, not a proven causal law — see
 * the "operational use" column this module's classes are drawn from.
 *
 * Per the spec, a digital root must never be computed from a casually
 * formatted price quote (splits/decimals distort digits without an
 * economic change). Callers must pass a normalized positive integer —
 * ticks from a confirmed anchor, bars since a pivot, ATR in ticks,
 * relative-volume index, or distance to a mapped price level — never a
 * raw price. Zero, non-finite, non-integer, or non-positive input is
 * absence: no root, no node, no derived signal.
 */

export type DigitalRootClass = "initiation" | "vortexFlow" | "polarity" | "completion";

export interface DigitalRootReading {
  /** The normalized positive integer the root was computed from. */
  input: number;
  /** 1-9. */
  root: number;
  rootClass: DigitalRootClass;
}

const VORTEX_FLOW_ROOTS = new Set([2, 4, 8, 7, 5]);
const POLARITY_ROOTS = new Set([3, 6]);

/** Pure DR(n) = 1 + ((n − 1) mod 9). Returns null for anything that isn't a normalized positive integer. */
export function digitalRoot(n: number): number | null {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return 1 + ((n - 1) % 9);
}

/**
 * Classifies a normalized positive integer into the active 1–9 system's
 * root classes. Confluence/context only — never a sole signal, never able
 * to imply direction on its own (root 8/9 is not automatically bearish or
 * bullish; see the spec's continuation-vs-reversion distinction).
 */
export function classifyDigitalRoot(n: number): DigitalRootReading | null {
  const root = digitalRoot(n);
  if (root === null) return null;

  let rootClass: DigitalRootClass;
  if (root === 9) rootClass = "completion";
  else if (root === 1) rootClass = "initiation";
  else if (POLARITY_ROOTS.has(root)) rootClass = "polarity";
  else if (VORTEX_FLOW_ROOTS.has(root)) rootClass = "vortexFlow";
  else rootClass = "vortexFlow"; // unreachable for 1-9, kept for exhaustiveness

  return { input: n, root, rootClass };
}
