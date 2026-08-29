/**
 * Prohibited/conditional instruments — "No penny, thin, promotional,
 * leveraged/inverse ETF, low-float, or binary biotech defaults. Advanced
 * products require separate policies."
 *
 * Penny/thin are already covered structurally by `price_or_fractional_pass`,
 * `liquidity_pass`, and `market_cap_pass` — nothing sub-$10B and sub-$250M
 * ADDV survives those. Promotional, low-float, and binary-biotech status
 * have no data source in this codebase (no float, no press-release feed, no
 * clinical-catalyst calendar), so they cannot be filtered generally; a
 * biotech's binary-catalyst dates are instead caught the same way any other
 * name's earnings are, through `event_risk_pass`, which is a real but
 * partial substitute — it blocks the announced date, not the underlying
 * binary-outcome nature of the stock.
 *
 * Leveraged/inverse ETFs are the one category with a checkable identity: a
 * fund either explicitly states 2x/3x or inverse exposure or it does not.
 * This is a starter, curated list of the products most likely to reach a
 * Novice scan by ticker overlap with a major index or sector — not an
 * exhaustive registry, the same honesty `lib/scan/large-cap-universe.ts`
 * gives its own coverage gaps. A leveraged/inverse product not on this list
 * still has to clear every other filter, but this is the only one built to
 * catch it by name rather than by proxy.
 */

/** 2x/3x leveraged or inverse ETFs/ETNs, uppercase, source symbols only (no pair separator). */
export const LEVERAGED_INVERSE_ETF_SYMBOLS: ReadonlySet<string> = new Set([
  // Broad index
  "TQQQ", "SQQQ", "UPRO", "SPXU", "SPXL", "SDOW", "UDOW", "TNA", "TZA",
  "URTY", "SRTY", "QID", "QLD", "SSO", "SDS", "SPXS",
  // Sector / thematic
  "SOXL", "SOXS", "TECL", "TECS", "FAS", "FAZ", "LABU", "LABD", "CURE",
  "DRN", "DRV", "NUGT", "DUST", "JNUG", "JDST", "ERX", "ERY",
  // Single-name leveraged
  "TSLL", "TSLQ", "NVDL", "NVDQ", "AAPU", "AAPD",
  // Volatility
  "UVXY", "SVXY", "VXX", "TVIX",
]);

export interface ProhibitedCheck {
  prohibited: boolean;
  reason: string | null;
}

export function checkProhibited(symbol: string): ProhibitedCheck {
  const upper = symbol.toUpperCase().split("/")[0];
  if (LEVERAGED_INVERSE_ETF_SYMBOLS.has(upper)) {
    return {
      prohibited: true,
      reason: `${upper} is a leveraged/inverse product — Novice-prohibited by default per the Market Universe spec.`,
    };
  }
  return { prohibited: false, reason: null };
}
