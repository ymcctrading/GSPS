/**
 * Rounds a price to the places its own size needs: cents at $1 and above,
 * and below $1 enough places to keep three significant figures (0.1612, not
 * 0.16). A fixed two places collapsed a sub-dollar coin's entry and stop onto
 * the same cent and left a plan with no risk (review finding F-02,
 * 2026-10-21).
 */
export function roundPrice(n: number): number {
  const scale = 10 ** placesFor(n);
  return Math.round(n * scale) / scale;
}

/** The decimal places `roundPrice` keeps for a price of this size. */
function placesFor(n: number): number {
  const size = Math.abs(n);
  return size >= 1 || size === 0 ? 2 : Math.min(10, Math.ceil(-Math.log10(size)) + 3);
}

/**
 * Cents at $1 and above; below it, the places `roundPrice` kept, never fewer
 * than two (0.50, not 0.5) and never in scientific notation. A missing or
 * non-finite price reads "—" rather than "0" or "NaN" (review of #399).
 */
export function priceText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = roundPrice(n);
  // A sub-dollar price can round up to a dollar (0.99999 -> 1): show cents then.
  const places = placesFor(rounded);
  const text = rounded.toFixed(places);
  return places > 2 ? text.replace(/(\.\d{2}\d*?)0+$/, "$1") : text;
}

/** `priceText` with a dollar sign: "$0.1612", "$12.50", "-$0.50", or "—". */
export function priceUsd(n: number | null | undefined): string {
  const text = priceText(n);
  if (text === "—") return text;
  return text.startsWith("-") ? `-$${text.slice(1)}` : `$${text}`;
}
