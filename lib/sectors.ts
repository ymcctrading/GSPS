/** Curated sector/industry watchlists for the scanner, per the Premise doc. */

export const MAG7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

/** Default watchlist scanned out of the box: Magnificent Seven + SPY + BTC. */
export const DEFAULTS = [...MAG7, "SPY", "BTC/USD"];

export const SECTORS: Record<string, { label: string; symbols: string[] }> = {
  mag7: {
    label: "Magnificent 7",
    symbols: [...MAG7, "SPY", "BTC/USD"],
  },
  semiconductors: {
    label: "Semiconductors",
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "ASML"],
  },
  technology: {
    label: "Technology",
    symbols: ["AAPL", "MSFT", "GOOGL", "META", "CRM", "ORCL", "ADBE", "NOW"],
  },
  financials: {
    label: "Financials",
    symbols: ["JPM", "BAC", "GS", "MS", "WFC", "SCHW", "V", "MA"],
  },
  industrials: {
    label: "Industrials",
    symbols: ["CAT", "DE", "BA", "HON", "GE", "UNP", "LMT", "RTX"],
  },
  energy: {
    label: "Energy",
    symbols: ["XOM", "CVX", "COP", "SLB", "OXY", "EOG"],
  },
  healthcare: {
    label: "Healthcare",
    symbols: ["UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO"],
  },
  etfs: {
    label: "Index ETFs",
    symbols: ["SPY", "QQQ", "IWM", "DIA"],
  },
  crypto: {
    label: "Crypto",
    symbols: ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD"],
  },
  forex: {
    label: "Forex",
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF", "AUDUSD", "NZDUSD", "EURJPY"],
  },
  futures: {
    label: "Futures",
    symbols: ["ES", "NQ", "YM", "CL", "GC", "NG", "ZB", "ZC"],
  },
};

export const COMING_SOON = ["Commodities"];

/** Reverse lookup for the Company tab's simulated sector fallback — first curated list a symbol appears in. */
export function sectorForSymbol(symbol: string): string | undefined {
  const up = symbol.toUpperCase();
  for (const key of ["semiconductors", "technology", "financials", "industrials", "energy", "healthcare"]) {
    if (SECTORS[key].symbols.includes(up)) return SECTORS[key].label;
  }
  return undefined;
}

/**
 * Index ETFs have no SEC-style company profile and no sell-side analyst
 * coverage, so Finnhub's free-tier `/stock/profile2` and
 * `/stock/recommendation` endpoints come back empty for them regardless of
 * whether `FINNHUB_API_KEY` is configured (see lib/data/finnhub.ts). The
 * Company tab uses this to give an accurate reason for staying on simulated
 * data instead of implying a missing/broken key.
 */
export function isEtfSymbol(symbol: string): boolean {
  return SECTORS.etfs.symbols.includes(symbol.toUpperCase());
}
