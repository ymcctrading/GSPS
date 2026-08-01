/**
 * Mega-cap earnings universe — the Fortune 500 / major-index names the earnings
 * calendar is filtered to.
 *
 * Reporting cadence is what makes a calendar predictable: US large-caps report
 * quarterly, a few weeks after their fiscal quarter ends, and a given company
 * reports in the same weeks each year. `fiscalOffsetWeeks` encodes how far after
 * a calendar quarter-end that company typically reports, which is what the
 * schedule generator uses when no live earnings feed is configured.
 */

export interface MegaCap {
  symbol: string;
  name: string;
  sector: string;
  /** Weeks after calendar quarter-end this company usually reports. */
  fiscalOffsetWeeks: number;
  /** Fiscal year-end month (0-indexed). Most are December. */
  fiscalYearEndMonth?: number;
}

export const MEGA_CAPS: MegaCap[] = [
  { symbol: "AAPL", name: "Apple", sector: "Technology", fiscalOffsetWeeks: 4, fiscalYearEndMonth: 8 },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology", fiscalOffsetWeeks: 3, fiscalYearEndMonth: 5 },
  { symbol: "NVDA", name: "NVIDIA", sector: "Semiconductors", fiscalOffsetWeeks: 8, fiscalYearEndMonth: 0 },
  { symbol: "AMZN", name: "Amazon", sector: "Consumer Discretionary", fiscalOffsetWeeks: 4 },
  { symbol: "GOOGL", name: "Alphabet", sector: "Communication Services", fiscalOffsetWeeks: 4 },
  { symbol: "META", name: "Meta Platforms", sector: "Communication Services", fiscalOffsetWeeks: 4 },
  { symbol: "TSLA", name: "Tesla", sector: "Consumer Discretionary", fiscalOffsetWeeks: 3 },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", fiscalOffsetWeeks: 6 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", fiscalOffsetWeeks: 2 },
  { symbol: "V", name: "Visa", sector: "Financials", fiscalOffsetWeeks: 4, fiscalYearEndMonth: 8 },
  { symbol: "MA", name: "Mastercard", sector: "Financials", fiscalOffsetWeeks: 4 },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare", fiscalOffsetWeeks: 2 },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy", fiscalOffsetWeeks: 4 },
  { symbol: "CVX", name: "Chevron", sector: "Energy", fiscalOffsetWeeks: 4 },
  { symbol: "WMT", name: "Walmart", sector: "Consumer Staples", fiscalOffsetWeeks: 7, fiscalYearEndMonth: 0 },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Staples", fiscalOffsetWeeks: 3, fiscalYearEndMonth: 5 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", fiscalOffsetWeeks: 2 },
  { symbol: "HD", name: "Home Depot", sector: "Consumer Discretionary", fiscalOffsetWeeks: 7, fiscalYearEndMonth: 0 },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer Staples", fiscalOffsetWeeks: 3 },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer Staples", fiscalOffsetWeeks: 2 },
  { symbol: "COST", name: "Costco", sector: "Consumer Staples", fiscalOffsetWeeks: 5, fiscalYearEndMonth: 7 },
  { symbol: "AVGO", name: "Broadcom", sector: "Semiconductors", fiscalOffsetWeeks: 9, fiscalYearEndMonth: 9 },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", fiscalOffsetWeeks: 4 },
  { symbol: "NFLX", name: "Netflix", sector: "Communication Services", fiscalOffsetWeeks: 2 },
  { symbol: "CRM", name: "Salesforce", sector: "Technology", fiscalOffsetWeeks: 8, fiscalYearEndMonth: 0 },
  { symbol: "ORCL", name: "Oracle", sector: "Technology", fiscalOffsetWeeks: 3, fiscalYearEndMonth: 4 },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", fiscalOffsetWeeks: 2 },
  { symbol: "WFC", name: "Wells Fargo", sector: "Financials", fiscalOffsetWeeks: 2 },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials", fiscalOffsetWeeks: 2 },
  { symbol: "DIS", name: "Walt Disney", sector: "Communication Services", fiscalOffsetWeeks: 5, fiscalYearEndMonth: 8 },
  { symbol: "INTC", name: "Intel", sector: "Semiconductors", fiscalOffsetWeeks: 4 },
  { symbol: "CSCO", name: "Cisco", sector: "Technology", fiscalOffsetWeeks: 6, fiscalYearEndMonth: 6 },
  { symbol: "MRK", name: "Merck", sector: "Healthcare", fiscalOffsetWeeks: 4 },
  { symbol: "PFE", name: "Pfizer", sector: "Healthcare", fiscalOffsetWeeks: 4 },
  { symbol: "T", name: "AT&T", sector: "Communication Services", fiscalOffsetWeeks: 3 },
  { symbol: "BA", name: "Boeing", sector: "Industrials", fiscalOffsetWeeks: 4 },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials", fiscalOffsetWeeks: 4 },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials", fiscalOffsetWeeks: 3 },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer Discretionary", fiscalOffsetWeeks: 4 },
  { symbol: "NKE", name: "Nike", sector: "Consumer Discretionary", fiscalOffsetWeeks: 4, fiscalYearEndMonth: 4 },
];

export const MEGA_CAP_SYMBOLS = new Set(MEGA_CAPS.map((c) => c.symbol));

export function findMegaCap(symbol: string): MegaCap | undefined {
  return MEGA_CAPS.find((c) => c.symbol === symbol.toUpperCase());
}
