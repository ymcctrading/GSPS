/**
 * GSPS — the frozen example used by the first-run tour.
 *
 * The tour has to show a reader what a real setup looks like, and the obvious
 * way to do that would be to render live data. That is the wrong call here for
 * three reasons, all of which bite the exact user the tour exists for:
 *
 *   1. Live data is whatever the market is doing while someone reads. A tour
 *      that says "notice the entry sits above the current price" is wrong the
 *      moment it isn't, and a beginner cannot tell the copy is stale rather
 *      than the app being broken.
 *   2. A new account may have no scan history and no market-data provider
 *      configured, so the live version of this walkthrough is frequently empty.
 *   3. An example that changes on every visit cannot be taught from, referred
 *      back to, or screenshotted into a support reply.
 *
 * So the example is a fixed snapshot: F (Ford Motor Company) as of one specific
 * after-hours timestamp, stored here in full and never refetched. Everything
 * downstream renders through the app's real components, so it looks and
 * behaves like the live screens, but the numbers never move.
 *
 * This is illustrative data, not engine output. It was authored to be
 * internally consistent with the rules the engine actually applies — the
 * position size below is what the five Guided ceilings in
 * `lib/guided/config.ts` produce for this account size, this stop distance and
 * this price — but no claim is made that the scanner would have scored this
 * exact bar series this exact way. Nothing here is ever priced, traded, or
 * compared against a live quote. It exists to be looked at.
 *
 * The symbol is deliberately not SPY. Guided Mode's per-trade budget cap ships
 * on by default at $250 (`DEFAULT_GUIDED_BUDGET_USD`), and a symbol priced in
 * the hundreds of dollars a share cannot clear the protocol's two-share
 * minimum on that budget — the exact "$54,000 to make $400" experience a
 * novice reported that this cap exists to prevent. A single lower-priced stock
 * is a worse pattern-recognition example than an index (its price can move on
 * company news, not only the market), a trade-off accepted so the worked
 * example is one Guided would actually produce for the account it describes.
 *
 * Every surface that renders it must label it. `SNAPSHOT_NOTICE` is that label,
 * and `lib/__tests__` holds a test asserting no figure component ships without
 * one.
 */

/** One daily candle: date, open, high, low, close. */
export interface SnapshotBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * When this snapshot is framed as having been taken: deliberately undated.
 * An actual calendar date ages the moment a reader notices it doesn't match
 * today, which teaches the wrong lesson ("this app shows old data") instead of
 * the right one ("this is a worked example"). Phrasing it as an ordinary
 * after-hours moment, with no year attached, avoids that without pretending
 * the numbers are current.
 */
export const SNAPSHOT_TAKEN_LABEL = "one afternoon after the market closed";

export const SNAPSHOT_SYMBOL = "F";
export const SNAPSHOT_SYMBOL_PLAIN =
  "Ford is a single company rather than a fund, so its price can move on news about Ford itself and not only the wider market.";

/**
 * The disclosure, in the words a beginner needs rather than the words a
 * compliance page would use. It says all three things that matter: it is an
 * example, it is old, and the real screen will not match it.
 */
export const SNAPSHOT_NOTICE =
  `Example only — not live data. This is a saved snapshot of ${SNAPSHOT_SYMBOL} from ${SNAPSHOT_TAKEN_LABEL}. ` +
  `The real screens in GSPS will show today's numbers, which will look different.`;

/** The short form, for a corner badge where the full sentence will not fit. */
export const SNAPSHOT_BADGE = "Saved example · not live";

/**
 * Thirty daily candles ending on the snapshot date. The shape is deliberate:
 * a rise into early August, a pullback that stalls in the same price area that
 * stopped an earlier decline, and one up day off it. That is the setup the rest
 * of this file describes, so the picture and the words agree.
 */
export const SNAPSHOT_BARS: SnapshotBar[] = [
  { date: "2026-07-08", open: 24.09, high: 24.21, low: 24.04, close: 24.19 },
  { date: "2026-07-09", open: 24.20, high: 24.30, low: 24.15, close: 24.28 },
  { date: "2026-07-10", open: 24.28, high: 24.39, low: 24.23, close: 24.37 },
  { date: "2026-07-13", open: 24.38, high: 24.41, low: 24.23, close: 24.26 },
  { date: "2026-07-14", open: 24.24, high: 24.37, low: 24.20, close: 24.34 },
  { date: "2026-07-15", open: 24.36, high: 24.51, low: 24.34, close: 24.49 },
  { date: "2026-07-16", open: 24.51, high: 24.61, low: 24.45, close: 24.59 },
  { date: "2026-07-17", open: 24.59, high: 24.63, low: 24.47, close: 24.49 },
  { date: "2026-07-20", open: 24.50, high: 24.62, low: 24.48, close: 24.60 },
  { date: "2026-07-21", open: 24.61, high: 24.74, low: 24.59, close: 24.72 },
  { date: "2026-07-22", open: 24.73, high: 24.85, low: 24.70, close: 24.83 },
  { date: "2026-07-23", open: 24.85, high: 24.88, low: 24.71, close: 24.74 },
  { date: "2026-07-24", open: 24.75, high: 24.88, low: 24.73, close: 24.86 },
  { date: "2026-07-27", open: 24.87, high: 25.00, low: 24.84, close: 24.97 },
  { date: "2026-07-28", open: 24.99, high: 25.08, low: 24.92, close: 25.05 },
  { date: "2026-07-29", open: 25.06, high: 25.09, low: 24.89, close: 24.92 },
  { date: "2026-07-30", open: 24.93, high: 25.06, low: 24.91, close: 25.04 },
  { date: "2026-07-31", open: 25.05, high: 25.18, low: 25.03, close: 25.17 },
  { date: "2026-08-03", open: 25.18, high: 25.27, low: 25.13, close: 25.24 },
  { date: "2026-08-04", open: 25.25, high: 25.29, low: 25.14, close: 25.15 },
  { date: "2026-08-05", open: 25.16, high: 25.24, low: 25.06, close: 25.08 },
  { date: "2026-08-06", open: 25.07, high: 25.11, low: 24.90, close: 24.92 },
  { date: "2026-08-07", open: 24.91, high: 24.96, low: 24.78, close: 24.81 },
  { date: "2026-08-10", open: 24.79, high: 24.87, low: 24.67, close: 24.69 },
  { date: "2026-08-11", open: 24.68, high: 24.74, low: 24.57, close: 24.60 },
  { date: "2026-08-12", open: 24.60, high: 24.70, low: 24.56, close: 24.67 },
  { date: "2026-08-13", open: 24.67, high: 24.71, low: 24.55, close: 24.57 },
  { date: "2026-08-14", open: 24.56, high: 24.65, low: 24.53, close: 24.63 },
  { date: "2026-08-17", open: 24.62, high: 24.67, low: 24.53, close: 24.59 },
  { date: "2026-08-18", open: 24.60, high: 24.77, low: 24.58, close: 24.74 },
];

/** The last close in the series, quoted throughout the tour as "the price". */
export const SNAPSHOT_LAST_CLOSE = 24.74;

/**
 * The four prices that make up a trade plan, which is the single most important
 * thing the tour teaches: a trade is not "buy and hope", it is four numbers
 * decided before any money moves.
 */
export const SNAPSHOT_PLAN = {
  entry: 24.80,
  stopLoss: 24.35,
  takeProfit1: 25.50,
  masterProfit: 25.95,
} as const;

/** Entry to stop, per share. Every dollar figure below is derived from this. */
export const SNAPSHOT_RISK_PER_SHARE =
  SNAPSHOT_PLAN.entry - SNAPSHOT_PLAN.stopLoss; // 0.45

/**
 * The example account. A fresh paper account opens with this balance
 * (`STARTING_CASH` in `lib/brokers/simulator.ts`), so a reader following along
 * on their own account sees the same starting number the tour does.
 */
export const SNAPSHOT_EQUITY = 100_000;

/**
 * The size, and the reason it is what it is.
 *
 * Three ceilings apply, and which one binds is the interesting part. The
 * per-trade risk cap (1% of equity, so $1,000) would allow 2,222 shares. The
 * deployed-capital ceiling (25% of equity, so $25,000 of stock at once) would
 * allow 1,008. The per-trade dollar budget — $250 by default, on for every new
 * account — allows only 10. The smallest number wins, which means this trade
 * risks about $5 rather than the $1,000 the risk cap alone would have
 * permitted, or the $25,000 of stock the deployed-capital cap alone would.
 *
 * The tour states that out loud instead of just showing "10 shares", because
 * "the app kept this small on purpose" is the single most reassuring thing a
 * nervous first-time user — trading with real money in the low hundreds — can
 * learn about it.
 */
export const SNAPSHOT_GUIDED = {
  action: "buy" as const,
  qty: 10,
  notionalUsd: 248.00,
  riskUsd: 4.50,
  rewardUsd: 8.80,
  /** Which cap produced the size. */
  bindingCap: "budget" as const,
  qtyAllowedByRiskCap: 2222,
  qtyAllowedByDeployedCap: 1008,
  /** The per-trade dollar ceiling that actually bound this example. */
  budgetUsd: 250,
  /**
   * The three sentences the real card would carry, phrased as `lib/guided/copy.ts`
   * phrases them rather than paraphrased. The figure's whole purpose is to look
   * like the live card, so inventing friendlier wording here would teach a
   * reader to expect a card they will never actually meet. The two that are
   * cheap to generate exactly are asserted against their real generators in
   * `onboarding-tour.test.ts`; `reason` is shaped like `reasonLine` output but
   * written out, since producing the real thing needs a whole `ScanResult`.
   */
  reason:
    "F has sold off into a price area that has stopped declines before, and is turning back up through $24.80. The daily range is ordinary, so this is happening at a level rather than during a burst of activity.",
  riskRewardSentence:
    "You could lose about $5 if this doesn't work, or make about $9 if it reaches the target.",
  sizeSentence:
    "10 shares — not a number you typed, but the most a $250 per-trade budget will stretch to at this price.",
  exitSentence:
    "If it works, 6 of the 10 shares are sold at the first target and the other 4 run on to the second, with the stop moved up behind them. If it doesn't, the whole position is sold at the stop.",
  scoreOutOf9: 8,
  verdict: "Execute" as const,
  trend: "Weekly and daily both pointing up.",
} as const;

/**
 * The staged exit, as share counts rather than percentages — a beginner can
 * check "6 + 2 + 2 = 10" and cannot check "60% of the remainder".
 */
export const SNAPSHOT_EXIT_LADDER = [
  {
    stage: "First target",
    price: SNAPSHOT_PLAN.takeProfit1,
    shares: 6,
    plain: "Most of the position is sold here, which locks in a profit early.",
  },
  {
    stage: "Second target",
    price: SNAPSHOT_PLAN.masterProfit,
    shares: 2,
    plain: "Half of what's left comes off here.",
  },
  {
    stage: "Runner",
    price: null,
    shares: 2,
    plain:
      "The last shares keep going, protected by a stop that rises as the price rises but never falls back down.",
  },
] as const;

/**
 * What the same trade looks like once it exists — the Portfolio view. Shown as
 * a small open gain so the tour can explain unrealized profit without the
 * reader's first encounter with a red number being an unexplained one.
 */
export const SNAPSHOT_POSITION = {
  symbol: SNAPSHOT_SYMBOL,
  qty: 10,
  side: "long" as const,
  avgEntry: 24.80,
  lastPrice: 24.89,
  marketValue: 248.90,
  unrealizedUsd: 0.90,
  unrealizedPct: 0.36,
  openedAtLabel: "Opened earlier in this example",
} as const;

/**
 * The account, as the Portfolio screen reports it.
 *
 * Derived from the position above rather than invented alongside it, which
 * matters because the tour uses this screen to make one specific point — the
 * $100,000 is practice money — and a reader who adds up the parts and gets a
 * different total learns the opposite lesson about how much to trust the
 * numbers. Cash is the starting balance minus what the position cost; equity is
 * cash plus what the position is worth now; the day's profit is the gap between
 * equity and the $100,000 the account opened with. `tour-snapshot` tests assert
 * all three.
 */
export const SNAPSHOT_ACCOUNT = {
  startingCash: SNAPSHOT_EQUITY,
  /** Uninvested money. Starting balance less the cost of the open position. */
  cash: 99_752.00,
  /** What the open position would fetch at the current price. */
  holdingsValue: 248.90,
  /** Cash plus holdings — the number a beginner means by "how much do I have". */
  equity: 100_000.90,
  /** Change since the account opened. */
  dayPnlUsd: 0.90,
} as const;

/**
 * The Backtest summary. Modest, mixed numbers on purpose: an example win rate
 * of 90% would teach a first-time user exactly the wrong lesson about what this
 * tool is for.
 */
export const SNAPSHOT_BACKTEST = {
  symbolsLabel: "SPY, AAPL, MSFT, NVDA",
  window: "the last 12 months",
  trades: 148,
  winRatePct: 58,
  avgRMultiple: 0.21,
  plain:
    "Out of 148 past setups, 58 out of every 100 made money, and the average trade earned about a fifth of what it risked. That is what a working edge looks like — small and steady, not spectacular.",
} as const;

/** The shipped Guided caps, restated for the Settings step of the tour. */
export const SNAPSHOT_CAPS = [
  { label: "Risk per trade", value: "1% of the account", plain: "How much one trade is allowed to lose." },
  {
    label: "Money in any one trade",
    value: "$250",
    plain: "However the risk math works out, no single trade commits more practice dollars than this.",
  },
  { label: "Trades per day", value: "3", plain: "Stops a bad afternoon from becoming a bad week." },
  { label: "Trades per week", value: "10", plain: "The same idea over a longer stretch." },
  {
    label: "Money in the market at once",
    value: "25% of the account",
    plain: "Three-quarters of the account stays in cash no matter how good things look.",
  },
] as const;
