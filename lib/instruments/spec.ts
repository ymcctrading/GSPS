/**
 * What a trade plan needs to know about the market it is in: its unit, its
 * session, its contract size and what the risk is. One definition for every
 * instrument GSPS trades or will trade (owner, 2026-10-21: "futures, crypto
 * and options trading works a lot differently than regular equities", and
 * "don't forget to include forex, and commodities").
 *
 * **Gann's rule is the same in every market; only the unit changes.** He
 * wrote stops "1, 2 or 3 points away" in stocks (W006 Rule 2, p.46) and "1-3
 * cents from the trading price" in grain (*Commodities* pp.43-45, rule 2),
 * and divided capital into ten parts in both (*Commodities* rule 1; W006).
 * Jensen fixes the same scale: one price unit is $1 in a stock and 1 cent in
 * grain (W049, "Charting the Price Range Data"). So a plan is priced by one
 * rule, read in each instrument's own unit (`gannUnitPrice`).
 *
 * Options, from Gann's own course (Master Course Ch. 19A, May 26, 1937; Ch.
 * 19B, Feb 1941): puts and calls are "insurance"; the premium is the most
 * that can be lost and the option takes the place of the stop; buy them
 * "several points away", good for 30 days ("you will make more money buying
 * PUTS and CALLS good 30 days"); the same chart rules time the entry. See
 * `lib/options/gannOptionPlan.ts`.
 *
 * Engineering data, labelled: contract multipliers and tick sizes are the
 * exchanges' published specifications, not Gann's. Gann wrote nothing on
 * currencies (none found in the collection), so a forex pair's unit, the pip,
 * is an engineering choice made by Correspondence with his "one price unit"
 * rule.
 *
 * Built ahead of the markets (owner, 2026-10-21: "if we can do so now, so be
 * it"): no surface reads this module yet. Futures and forex have quotes only,
 * no bars or broker, so nothing prices them; stocks and crypto still name
 * their market by `AssetClass`. Wire it in where those markets arrive.
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. No periodicity claim;
 * Dewey's checklist does not apply. 3. Correspondence: "as above, so below",
 * one law read in every market's own unit. Law of Creation: rule ⊗ market,
 * the same rule meeting a market's unit, session and contract creates a plan
 * that fits that market, which neither held alone.
 */

import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { gannThreePointsPct } from "@/lib/gann/pointScale";

export type InstrumentKind = "us_equity" | "crypto" | "future" | "forex" | "option";

/**
 * When the market trades, which decides what one "day" (one bar of Gann's
 * daily chart) is.
 * - `regular_hours`: the exchange's regular session (US stocks, 9:30-16:00 ET).
 * - `calendar_day`: 24/7; the day is the calendar day. Gann counted calendar
 *   days and kept hourly charts on 24 hours as well as exchange hours (Master
 *   Course PDF 378); Jensen charts every calendar day (W049).
 * - `exchange_23h`: futures, Sunday evening to Friday afternoon, with a short
 *   daily break; the day is the exchange's trading day.
 * - `fx_24x5`: forex, Sunday 17:00 to Friday 17:00 New York time.
 */
export type SessionKind = "regular_hours" | "calendar_day" | "exchange_23h" | "fx_24x5";

/** Whether GSPS can price and place this instrument today. */
export type InstrumentAvailability = "live" | "paper_only" | "quotes_only";

export interface InstrumentSpec {
  kind: InstrumentKind;
  session: SessionKind;
  /** Money a one-unit move is worth for one contract (1 for a share or a coin). */
  multiplier: number;
  /** Smallest price increment. */
  tickSize: number;
  /** What the quoted price is in, for copy ("dollars", "cents a bushel"). */
  quoteUnit: string;
  /** What is lost if the stop is hit: entry-to-stop, or the premium paid. */
  risk: "stop_distance" | "premium";
  availability: InstrumentAvailability;
  /** For a future: the contract it names. */
  contract?: FuturesContract;
}

export interface FuturesContract {
  root: string;
  name: string;
  /** Money per one unit of the quoted price (exchange specification). */
  multiplier: number;
  tickSize: number;
  quoteUnit: string;
  /** Gann's own market group, where he wrote rules for it. */
  group: "index" | "energy" | "metal" | "grain" | "soft" | "currency" | "rate";
}

/**
 * The futures contracts GSPS defines. Exchange specifications (CME, ICE),
 * engineering data. Grains and cotton are the markets Gann's *Commodities*
 * was written for.
 */
export const FUTURES_CONTRACTS: readonly FuturesContract[] = [
  { root: "ES", name: "E-mini S&P 500", multiplier: 50, tickSize: 0.25, quoteUnit: "index points", group: "index" },
  { root: "MES", name: "Micro E-mini S&P 500", multiplier: 5, tickSize: 0.25, quoteUnit: "index points", group: "index" },
  { root: "NQ", name: "E-mini Nasdaq-100", multiplier: 20, tickSize: 0.25, quoteUnit: "index points", group: "index" },
  { root: "MNQ", name: "Micro E-mini Nasdaq-100", multiplier: 2, tickSize: 0.25, quoteUnit: "index points", group: "index" },
  { root: "YM", name: "E-mini Dow", multiplier: 5, tickSize: 1, quoteUnit: "index points", group: "index" },
  { root: "RTY", name: "E-mini Russell 2000", multiplier: 50, tickSize: 0.1, quoteUnit: "index points", group: "index" },
  { root: "CL", name: "Crude oil", multiplier: 1000, tickSize: 0.01, quoteUnit: "dollars a barrel", group: "energy" },
  { root: "NG", name: "Natural gas", multiplier: 10000, tickSize: 0.001, quoteUnit: "dollars per MMBtu", group: "energy" },
  { root: "GC", name: "Gold", multiplier: 100, tickSize: 0.1, quoteUnit: "dollars an ounce", group: "metal" },
  { root: "SI", name: "Silver", multiplier: 5000, tickSize: 0.005, quoteUnit: "dollars an ounce", group: "metal" },
  { root: "HG", name: "Copper", multiplier: 25000, tickSize: 0.0005, quoteUnit: "dollars a pound", group: "metal" },
  { root: "ZC", name: "Corn", multiplier: 50, tickSize: 0.25, quoteUnit: "cents a bushel", group: "grain" },
  { root: "ZW", name: "Wheat", multiplier: 50, tickSize: 0.25, quoteUnit: "cents a bushel", group: "grain" },
  { root: "ZS", name: "Soybeans", multiplier: 50, tickSize: 0.25, quoteUnit: "cents a bushel", group: "grain" },
  { root: "CT", name: "Cotton", multiplier: 500, tickSize: 0.01, quoteUnit: "cents a pound", group: "soft" },
  { root: "KC", name: "Coffee", multiplier: 375, tickSize: 0.05, quoteUnit: "cents a pound", group: "soft" },
  { root: "6E", name: "Euro FX", multiplier: 125000, tickSize: 0.00005, quoteUnit: "dollars per euro", group: "currency" },
  { root: "ZB", name: "30-year Treasury bond", multiplier: 1000, tickSize: 1 / 32, quoteUnit: "points", group: "rate" },
];

const FIAT = ["USD", "EUR", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "MXN"];

/** "/ES", "/ESZ6", "ESZ26" → the contract; null if the symbol names none. */
export function futuresContractOf(symbol: string): FuturesContract | null {
  const s = symbol.toUpperCase().trim();
  const bare = s.startsWith("/") ? s.slice(1) : s;
  // Root, then an optional month code and one- or two-digit year.
  const m = /^([A-Z0-9]{1,3}?)([FGHJKMNQUVXZ]\d{1,2})?$/.exec(bare);
  if (!m) return null;
  const root = m[1];
  const contract = FUTURES_CONTRACTS.find((c) => c.root === root) ?? null;
  // A bare root without the leading slash is also a stock ticker (ES, CL, GC
  // are listed shares), so only "/ES" or a dated contract names a future.
  if (contract && (s.startsWith("/") || m[2])) return contract;
  return null;
}

/** "EUR/USD", "EUR_USD", "EURUSD" between two fiat currencies. */
export function isForexPair(symbol: string): boolean {
  const s = symbol.toUpperCase().replace(/[-_/]/, "");
  if (s.length !== 6) return false;
  return FIAT.includes(s.slice(0, 3)) && FIAT.includes(s.slice(3)) && s.slice(0, 3) !== s.slice(3);
}

/** An OCC option symbol: root, YYMMDD, C or P, strike × 1000 in 8 digits. */
export function isOccOptionSymbol(symbol: string): boolean {
  return /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(symbol.toUpperCase().replace(/\s+/g, ""));
}

/** The pip: 0.01 on a yen pair, 0.0001 otherwise (market convention). */
export function pipSize(symbol: string): number {
  return symbol.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

/** Which instrument a symbol names. Futures and forex are read before crypto,
 * whose check accepts any symbol with a slash. */
export function instrumentKindOf(symbol: string): InstrumentKind {
  if (isOccOptionSymbol(symbol)) return "option";
  if (futuresContractOf(symbol)) return "future";
  if (isForexPair(symbol)) return "forex";
  if (isCryptoSymbol(symbol)) return "crypto";
  return "us_equity";
}

/** The full specification for a symbol. */
export function instrumentSpec(symbol: string): InstrumentSpec {
  const kind = instrumentKindOf(symbol);
  switch (kind) {
    case "option":
      return { kind, session: "regular_hours", multiplier: 100, tickSize: 0.01, quoteUnit: "dollars a share", risk: "premium", availability: "paper_only" };
    case "future": {
      const contract = futuresContractOf(symbol)!;
      return { kind, session: "exchange_23h", multiplier: contract.multiplier, tickSize: contract.tickSize, quoteUnit: contract.quoteUnit, risk: "stop_distance", availability: "quotes_only", contract };
    }
    case "forex":
      // A standard lot (100,000 of the base currency); market convention.
      return { kind, session: "fx_24x5", multiplier: 100_000, tickSize: pipSize(symbol) / 10, quoteUnit: "quote currency", risk: "stop_distance", availability: "quotes_only" };
    case "crypto":
      return { kind, session: "calendar_day", multiplier: 1, tickSize: 0.0001, quoteUnit: "dollars", risk: "stop_distance", availability: "live" };
    default:
      return { kind: "us_equity", session: "regular_hours", multiplier: 1, tickSize: 0.01, quoteUnit: "dollars", risk: "stop_distance", availability: "live" };
  }
}

/**
 * The price in Gann's points for this instrument: the number his price-scaled
 * allowance (`pointScale.ts`) is read at. Stocks, coins and an option's
 * underlying: the price in dollars ($1 a point). A future: its quoted price,
 * as Gann read 1 cent of grain as 1 point (*Commodities* pp.43-45). A forex
 * pair: the price in pips (engineering choice, labelled; Gann wrote nothing on
 * currencies).
 */
export function gannUnitPrice(spec: InstrumentSpec, price: number, symbol?: string): number {
  if (spec.kind === "forex") return price / pipSize(symbol ?? "");
  return price;
}

/** Gann's 3-point allowance for this instrument, as a share of its price (%). */
export function instrumentAllowancePct(spec: InstrumentSpec, price: number, symbol?: string): number {
  return gannThreePointsPct(gannUnitPrice(spec, price, symbol));
}

/**
 * Money at risk for one contract between entry and stop, or the premium for
 * an option (Master Course Ch. 19A: the option is the stop).
 */
export function riskPerContract(spec: InstrumentSpec, entry: number, stop: number, premium?: number): number {
  if (spec.risk === "premium") return (premium ?? 0) * spec.multiplier;
  return Math.abs(entry - stop) * spec.multiplier;
}

/** Copy for the plan card: when this market's day starts and ends. */
export function sessionLabel(session: SessionKind): string {
  switch (session) {
    case "regular_hours":
      return "Regular session, 9:30 to 4:00 New York time";
    case "calendar_day":
      return "Trades around the clock; each calendar day is one bar";
    case "exchange_23h":
      return "Exchange session, Sunday evening to Friday afternoon";
    case "fx_24x5":
      return "Around the clock, Sunday 5 PM to Friday 5 PM New York time";
  }
}
