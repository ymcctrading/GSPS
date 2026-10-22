/**
 * GSPS — the markets that are not stocks: crypto pairs and the listed funds
 * that hold commodity and currency futures (SYNTHESIZED_ROADMAP Q2 item 2,
 * "Markets beyond US equities", on free data only).
 *
 * Gann traded commodities as much as stocks: grain, cotton, metals, coffee,
 * sugar (*Commodities*, W001). Futures bars and a futures broker cost money
 * (SYNTHESIZED_ROADMAP Part 6), so the funds that hold the futures stand in
 * for them. Alpaca serves their bars free and its paper broker trades them as
 * shares. This is a labelled stand-in. A fund's price is read as a price and
 * the method is applied to it unchanged. The fund is not the futures contract:
 * it loses a little each time its futures roll, and its chart is not the
 * contract's.
 *
 * Gann wrote nothing on currencies (`lib/instruments/spec.ts`). The currency
 * funds are here by the same Correspondence, his one law read in each market's
 * own unit, and are labelled the same way.
 *
 * They count with crypto as Gann's "two or three markets" (*Tunnel* W022
 * pp.203-204; *Commodities*), not among the five stocks
 * (`lib/risk/gannCapital.ts`). His stock books hold stocks to "4 or 5"; his
 * commodity books hold commodities to two or three. A fund holds no company,
 * so it is the commodity it tracks.
 *
 * Engineering choices, labelled: the funds named (the largest US-listed fund
 * for each market Gann charted, where one trades, plus the dollar and three
 * major currencies) and pooling them with crypto under one count. Pure, so
 * client code and the risk rules can read it without the data client.
 */

import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

/** Commodity funds, each standing in for the futures it holds. */
export const COMMODITY_FUNDS: readonly string[] = [
  "GLD", // gold
  "SLV", // silver
  "CPER", // copper
  "USO", // crude oil
  "UNG", // natural gas
  "CORN", // corn
  "WEAT", // wheat
  "SOYB", // soybeans
  "CANE", // sugar
  "DBA", // agriculture basket
  "DBC", // commodity basket
];

/** Currency funds: the dollar and three major currencies against it. */
export const CURRENCY_FUNDS: readonly string[] = ["UUP", "FXE", "FXY", "FXB"];

export const FUND_MARKETS: readonly string[] = [...COMMODITY_FUNDS, ...CURRENCY_FUNDS];

const FUND_SET = new Set(FUND_MARKETS);

/** A commodity or currency fund (`FUND_MARKETS`). */
export function isFundMarket(symbol: string): boolean {
  return FUND_SET.has(symbol.toUpperCase());
}

/** Not a stock: a crypto pair or a commodity or currency fund. */
export function isOtherMarket(symbol: string): boolean {
  return isCryptoSymbol(symbol) || isFundMarket(symbol);
}
