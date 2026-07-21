/**
 * Default scan universe.
 *
 * Reconciles Suggestion S-6 in the review log: the old batch-route defaulted to
 * a 10-name list that didn't match the spec. Doc 3 defines the default discovery
 * universe as SPY, BTC + the Magnificent 7. That is the canonical default here;
 * users can still pass a custom list to the batch endpoint.
 */
export const DEFAULT_WATCHLIST: string[] = [
  "SPY", // broad-market anchor
  "BTC", // crypto macro indicator
  // Magnificent 7
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
];
