/**
 * Rounds a price to the places its own size needs: cents at $1 and above,
 * and below $1 enough places to keep three significant figures (0.1612, not
 * 0.16). A fixed two places collapsed a sub-dollar coin's entry and stop onto
 * the same cent and left a plan with no risk (review finding F-02,
 * 2026-10-21).
 */
export function roundPrice(n: number): number {
  const size = Math.abs(n);
  const places = size >= 1 || size === 0 ? 2 : Math.min(10, Math.ceil(-Math.log10(size)) + 3);
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
}

/** Cents at $1 and above; below it, the places `roundPrice` kept. */
export function priceText(n: number): string {
  return Math.abs(n) >= 1 ? n.toFixed(2) : String(roundPrice(n));
}
