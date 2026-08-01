/**
 * Options chain structure — moneyness classification and expiration horizons.
 * -----------------------------------------------------------------------------
 * Shared by the chain grid, the strike purchase modal, `/api/options` and
 * `/api/options/chain`, so the tranche a contract falls into and the set of
 * expirations a user can pick are decided in exactly one place.
 */

export type Moneyness = "ITM" | "ATM" | "OTM";
export type OptionType = "call" | "put";

/**
 * Underlyings that list daily expirations. Their chains are dense enough that a
 * 24-month horizon would be thousands of contracts, so they're capped at 12
 * months — see `expirationHorizonMonths`.
 */
export const DAILY_EXPIRY_SYMBOLS = new Set(["SPY", "QQQ", "IWM"]);

/** 12 months for daily-expiry underlyings, 24 for everything else. */
export function expirationHorizonMonths(symbol: string): 12 | 24 {
  return DAILY_EXPIRY_SYMBOLS.has(symbol.toUpperCase()) ? 12 : 24;
}

/** Last date an expiration may fall on for this underlying. */
export function expirationHorizonEnd(symbol: string, from: Date = new Date()): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + expirationHorizonMonths(symbol));
  return end;
}

/** `YYYY-MM-DD` in UTC — the format the chain APIs and `<input type="date">` use. */
export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Classify a contract against spot. ATM is the band within half a strike step of
 * the underlying, so exactly the strike (or two) sitting on the money reads as
 * ATM rather than being forced to one side.
 */
export function classifyMoneyness(
  type: OptionType,
  strike: number,
  spot: number,
  strikeStep: number,
): Moneyness {
  if (strikeStep > 0 && Math.abs(strike - spot) <= strikeStep / 2) return "ATM";
  if (type === "call") return strike < spot ? "ITM" : "OTM";
  return strike > spot ? "ITM" : "OTM";
}

/** Median gap between adjacent strikes — the chain's own spacing, not a guess. */
export function strikeStep(strikes: number[]): number {
  if (strikes.length < 2) return 0;
  const sorted = [...strikes].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** The nth Friday of a month (UTC), the day US monthly options expire. */
function nthFriday(year: number, month: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (5 - first.getUTCDay() + 7) % 7; // 5 = Friday
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/**
 * Expiration dates available for an underlying, ascending, bounded by its
 * horizon. Daily-expiry names get every Friday (a weekly-style ladder); everyone
 * else gets the standard third-Friday monthlies.
 *
 * Used to populate the picker when the provider has no real contract list —
 * a live chain always wins, this is the fallback and the horizon bound.
 */
export function generateExpirations(symbol: string, from: Date = new Date()): string[] {
  const end = expirationHorizonEnd(symbol, from);
  const daily = DAILY_EXPIRY_SYMBOLS.has(symbol.toUpperCase());
  const out: string[] = [];

  if (daily) {
    // Next Friday, then weekly until the horizon.
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
    while (d <= end) {
      out.push(toDateInput(d));
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }

  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  while (true) {
    const third = nthFriday(year, month, 3);
    if (third > end) break;
    if (third >= from) out.push(toDateInput(third));
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

/** Clamp a user-picked expiration into the underlying's allowed horizon. */
export function withinHorizon(symbol: string, date: string, from: Date = new Date()): boolean {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const floor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  return d >= floor && d <= expirationHorizonEnd(symbol, from);
}
