/**
 * Bucholtz's aspects and orbs (C-ASTRO-08; W013 pp.19, 94). Research only:
 * no criterion, gate, plan, entry or order reads this (CYC-41). Kept apart
 * from Gann's aspects (`lib/gann/astroRules.ts`) and Jensen's orbs
 * (`lib/gann/jensen.ts`): the three sets are never mixed.
 *
 * Gann: none; not sourced to Gann. Orbs: ±10° for the conjunction and
 * opposition, ±5° for the sextile, square and trine, ±3° for the semi-sextile
 * and semi-square. Bucholtz lists 150° without an orb; it gets the minor ±3°
 * here, an engineering choice.
 * Cycles: an aspect is a dated event; whether it times turns needs a
 * pre-registered base-rate test (`eventDateTest.ts`).
 * Hermetic: Correspondence, held as a hypothesis.
 */
export const BUCHOLTZ_ASPECTS = [
  { angle: 0, name: "conjunction", orb: 10 },
  { angle: 30, name: "semi-sextile", orb: 3 },
  { angle: 45, name: "semi-square", orb: 3 },
  { angle: 60, name: "sextile", orb: 5 },
  { angle: 90, name: "square", orb: 5 },
  { angle: 120, name: "trine", orb: 5 },
  { angle: 150, name: "quincunx", orb: 3 },
  { angle: 180, name: "opposition", orb: 10 },
] as const;

export type BucholtzAspect = (typeof BUCHOLTZ_ASPECTS)[number] & { off: number };

/** The aspect two longitudes (degrees) form within Bucholtz's orb, the closest if several, or null. */
export function bucholtzAspect(lonA: number, lonB: number): BucholtzAspect | null {
  const d = Math.abs((((lonA - lonB) % 360) + 360) % 360);
  const sep = d > 180 ? 360 - d : d;
  let best: BucholtzAspect | null = null;
  for (const a of BUCHOLTZ_ASPECTS) {
    const off = Math.abs(sep - a.angle);
    if (off <= a.orb && (!best || off < best.off)) best = { ...a, off };
  }
  return best;
}
