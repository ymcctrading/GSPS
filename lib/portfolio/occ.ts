/**
 * OCC option symbol parsing — e.g. `AAPL250117C00220000`.
 * -----------------------------------------------------------------------------
 * Format: `<root><YYMMDD><C|P><strike, 8 digits, implied 3 decimal places>`.
 * The root is padded/truncated to 6 characters in the strict OCC spec, but
 * brokers (Alpaca included) commonly emit it unpadded — this parser accepts
 * both by matching the fixed-width date+type+strike suffix and taking
 * everything before it as the root, rather than assuming a fixed root width.
 */

import type { OptionType } from "@/lib/options/contracts";

export interface ParsedOccSymbol {
  underlying: string;
  expiration: string; // YYYY-MM-DD
  type: OptionType;
  strike: number;
}

const OCC_SUFFIX = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;

/** Parse an OCC option symbol. Returns null if it doesn't match the format. */
export function parseOccSymbol(symbol: string): ParsedOccSymbol | null {
  const m = OCC_SUFFIX.exec(symbol.toUpperCase().trim());
  if (!m) return null;
  const [, root, yymmdd, cp, strikeDigits] = m;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = 2000 + yy; // OCC symbols only cover 2000+ expirations
  const strike = Number(strikeDigits) / 1000;
  if (!Number.isFinite(strike) || strike <= 0) return null;

  return {
    underlying: root,
    expiration: `${year}-${mm}-${dd}`,
    type: cp === "C" ? "call" : "put",
    strike,
  };
}

/** True when `symbol` parses as an OCC option contract. */
export function isOccOptionSymbol(symbol: string): boolean {
  return OCC_SUFFIX.test(symbol.toUpperCase().trim());
}
