/**
 * GSPS — the crypto pairs the daily market scan scores (SYNTHESIZED_ROADMAP
 * Q2 item 2, "Markets beyond US equities": crypto first, since its data and
 * broker exist; ROADMAP.md's Q2 "Crypto scanner", a separate scan queue for
 * BTC, ETH and major alts).
 *
 * Before this, the daily Buy/Sell lists were US stocks only: the market scan's
 * universe, its coarse filter and its batch fetch were all equities, so a
 * crypto setup reached a person only if they scanned the pair by hand or it
 * was one of the intraday scanner's two pairs. Alpaca's crypto bars are free
 * on every plan and its paper broker trades the pairs, so nothing paid stands
 * in the way.
 *
 * Every pair here is scored in full, every run, with no coarse filter: the
 * list is short enough that the whole of it fits beside the equity scan, and
 * Gann chose from every chart, not a pre-filtered few (*Truth of the Stock
 * Tape* Ch. XVI-XVII; the overnight sweep's reasoning, `universeSweep.ts`).
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann: he traded stocks and commodities by one method, read in each
 *    market's own unit (`lib/instruments/spec.ts`; *Commodities* pp.43-45,
 *    W006 p.46). Crypto postdates him, so no source names it; the score is
 *    `scanTicker`'s nine pillars, unchanged, read on the calendar day as he
 *    and Jensen read a market that never closes (spec.ts, `calendar_day`).
 *    Gann's capital rules already hold crypto to three markets
 *    (`lib/risk/gannCapital.ts`, owner 2026-10-16).
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Correspondence, one law read in every market. Law of Creation:
 *    the method ⊗ a 24-hour market makes a list that is never stale over a
 *    weekend for the pairs it holds, which neither the stock lists nor a hand
 *    scan gave.
 *
 * Engineering choices, labelled: the pairs (USD pairs Alpaca lists that trade
 * in size, stablecoins left out), and the buy side only. Alpaca's crypto is
 * spot, so it cannot be sold short, and a sell setup no account can place is
 * left off the list rather than shown as a trade. Gann would sell short;
 * a broker that shorts crypto is listed with the paid items. A pair the feed
 * does not serve scores as an error and is left off, as an equity's would be.
 */

export const CRYPTO_UNIVERSE: readonly string[] = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "DOGE/USD",
  "LTC/USD",
  "BCH/USD",
  "LINK/USD",
  "AVAX/USD",
  "DOT/USD",
  "UNI/USD",
  "AAVE/USD",
];
