/**
 * GSPS — the frozen SPY snapshot used by the first-run tour.
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
 * So the example is a fixed snapshot: SPY as of one specific after-hours
 * timestamp, stored here in full and never refetched. Everything downstream
 * renders through the app's real components, so it looks and behaves like the
 * live screens, but the numbers never move.
 *
 * This is illustrative data, not engine output. It was authored to be
 * internally consistent with the rules the engine actually applies — the
 * position size below is what the Guided caps in `lib/guided/config.ts` produce
 * for this account size and this stop distance — but no claim is made that the
 * scanner would have scored this exact bar series this exact way. Nothing here
 * is ever priced, traded, or compared against a live quote. It exists to be
 * looked at.
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
 * When this snapshot was taken: after the US close on the day before it was
 * authored. Stored as an ISO instant plus the human phrasing the UI shows,
 * because "8:00 PM UTC" is not a useful thing to tell a first-time user and
 * `toLocaleString` on the client would render it differently per reader — which
 * is precisely the drift this fixture exists to avoid.
 */
export const SNAPSHOT_TAKEN_AT = "2026-08-18T20:00:00Z";
export const SNAPSHOT_TAKEN_LABEL = "Tuesday, August 18, 2026, after the market closed";

/**
 * The disclosure, in the words a beginner needs rather than the words a
 * compliance page would use. It says all three things that matter: it is an
 * example, it is old, and the real screen will not match it.
 */
export const SNAPSHOT_NOTICE =
  `Example only — not live data. This is a saved snapshot of SPY from ${SNAPSHOT_TAKEN_LABEL}. ` +
  `The real screens in GSPS will show today's numbers, which will look different.`;

/** The short form, for a corner badge where the full sentence will not fit. */
export const SNAPSHOT_BADGE = "Saved example · not live";

export const SNAPSHOT_SYMBOL = "SPY";
export const SNAPSHOT_SYMBOL_PLAIN =
  "SPY is a single fund holding the 500 largest US companies, so the price moves roughly with the market as a whole.";

/**
 * Thirty daily candles ending on the snapshot date. The shape is deliberate:
 * a rise into early August, a pullback that stalls in the same price area that
 * stopped an earlier decline, and one up day off it. That is the setup the rest
 * of this file describes, so the picture and the words agree.
 */
export const SNAPSHOT_BARS: SnapshotBar[] = [
  { date: "2026-07-08", open: 664.10, high: 667.42, low: 662.88, close: 666.91 },
  { date: "2026-07-09", open: 667.20, high: 670.05, low: 665.74, close: 669.38 },
  { date: "2026-07-10", open: 669.55, high: 672.60, low: 668.11, close: 671.84 },
  { date: "2026-07-13", open: 672.30, high: 673.15, low: 668.02, close: 668.77 },
  { date: "2026-07-14", open: 668.40, high: 671.96, low: 667.35, close: 671.20 },
  { date: "2026-07-15", open: 671.65, high: 675.88, low: 671.02, close: 675.31 },
  { date: "2026-07-16", open: 675.70, high: 678.44, low: 674.19, close: 677.95 },
  { date: "2026-07-17", open: 678.10, high: 679.02, low: 674.60, close: 675.12 },
  { date: "2026-07-20", open: 675.40, high: 678.83, low: 674.88, close: 678.29 },
  { date: "2026-07-21", open: 678.60, high: 682.17, low: 677.94, close: 681.55 },
  { date: "2026-07-22", open: 681.90, high: 685.30, low: 681.04, close: 684.72 },
  { date: "2026-07-23", open: 685.05, high: 686.11, low: 681.36, close: 682.08 },
  { date: "2026-07-24", open: 682.30, high: 685.94, low: 681.77, close: 685.40 },
  { date: "2026-07-27", open: 685.75, high: 689.26, low: 685.02, close: 688.61 },
  { date: "2026-07-28", open: 688.90, high: 691.48, low: 687.15, close: 690.77 },
  { date: "2026-07-29", open: 691.02, high: 691.85, low: 686.40, close: 687.13 },
  { date: "2026-07-30", open: 687.35, high: 690.92, low: 686.71, close: 690.44 },
  { date: "2026-07-31", open: 690.70, high: 694.28, low: 690.09, close: 693.86 },
  { date: "2026-08-03", open: 694.15, high: 696.70, low: 692.83, close: 696.02 },
  { date: "2026-08-04", open: 696.30, high: 697.41, low: 693.12, close: 693.55 },
  { date: "2026-08-05", open: 693.70, high: 695.88, low: 691.06, close: 691.49 },
  { date: "2026-08-06", open: 691.20, high: 692.34, low: 686.55, close: 687.02 },
  { date: "2026-08-07", open: 686.80, high: 688.19, low: 683.27, close: 683.94 },
  { date: "2026-08-10", open: 683.60, high: 685.72, low: 680.11, close: 680.85 },
  { date: "2026-08-11", open: 680.55, high: 682.03, low: 677.42, close: 678.16 },
  { date: "2026-08-12", open: 678.40, high: 680.95, low: 677.08, close: 680.32 },
  { date: "2026-08-13", open: 680.10, high: 681.44, low: 676.93, close: 677.51 },
  { date: "2026-08-14", open: 677.25, high: 679.60, low: 676.42, close: 679.08 },
  { date: "2026-08-17", open: 678.85, high: 680.17, low: 676.28, close: 677.90 },
  { date: "2026-08-18", open: 678.20, high: 683.05, low: 677.66, close: 682.14 },
];

/** The last close in the series, quoted throughout the tour as "the price". */
export const SNAPSHOT_LAST_CLOSE = 682.14;

/**
 * The four prices that make up a trade plan, which is the single most important
 * thing the tour teaches: a trade is not "buy and hope", it is four numbers
 * decided before any money moves.
 */
export const SNAPSHOT_PLAN = {
  entry: 683.90,
  stopLoss: 676.50,
  takeProfit1: 694.00,
  masterProfit: 701.20,
} as const;

/** Entry to stop, per share. Every dollar figure below is derived from this. */
export const SNAPSHOT_RISK_PER_SHARE =
  SNAPSHOT_PLAN.entry - SNAPSHOT_PLAN.stopLoss; // 7.40

/**
 * The example account. A fresh paper account opens with this balance
 * (`STARTING_CASH` in `lib/brokers/simulator.ts`), so a reader following along
 * on their own account sees the same starting number the tour does.
 */
export const SNAPSHOT_EQUITY = 100_000;

/**
 * The size, and the reason it is what it is.
 *
 * Two separate caps apply, and which one binds is the interesting part. The
 * per-trade risk cap (1% of equity, so $1,000) would allow 135 shares. The
 * deployed-capital ceiling (25% of equity, so $25,000 of stock at once) allows
 * 36. The smaller number wins, which means this trade risks $266 rather than
 * the $1,000 the risk cap alone would have permitted.
 *
 * The tour states that out loud instead of just showing "36 shares", because
 * "the app said no before I had to" is the single most reassuring thing a
 * nervous first-time user can learn about it.
 */
export const SNAPSHOT_GUIDED = {
  action: "buy" as const,
  qty: 36,
  notionalUsd: 24_620.40,
  riskUsd: 266.40,
  rewardUsd: 471.60,
  /** Which cap produced the size. */
  bindingCap: "deployed" as const,
  qtyAllowedByRiskCap: 135,
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
    "SPY has sold off into a price area that has stopped declines before, and is turning back up through $683.90. The daily range is ordinary, so this is a structural entry rather than a momentum one.",
  riskRewardSentence:
    "You could lose about $266 if this doesn't work, or make about $472 if it reaches the target.",
  sizeSentence:
    "36 shares — not a number you typed, but the most GSPS will commit to one position while holding total exposure under a quarter of the practice account.",
  exitSentence:
    "If it works, 21 of the 36 shares are sold at the first target and the other 15 run on to the second, with the stop moved up behind them. If it doesn't, the whole position is sold at the stop.",
  scoreOutOf9: 8,
  verdict: "Execute" as const,
  trend: "Weekly and daily both pointing up.",
} as const;

/**
 * The staged exit, as share counts rather than percentages — a beginner can
 * check "21 + 7 + 8 = 36" and cannot check "60% of the remainder".
 */
export const SNAPSHOT_EXIT_LADDER = [
  {
    stage: "First target",
    price: SNAPSHOT_PLAN.takeProfit1,
    shares: 21,
    plain: "Most of the position is sold here, which locks in a profit early.",
  },
  {
    stage: "Second target",
    price: SNAPSHOT_PLAN.masterProfit,
    shares: 7,
    plain: "Half of what's left comes off here.",
  },
  {
    stage: "Runner",
    price: null,
    shares: 8,
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
  qty: 36,
  side: "long" as const,
  avgEntry: 683.90,
  lastPrice: 686.42,
  marketValue: 24_711.12,
  unrealizedUsd: 90.72,
  unrealizedPct: 0.37,
  openedAtLabel: "Opened Aug 18, 2026",
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
 * equity and the $100,000 the account opened with. `spy-snapshot` tests assert
 * all three.
 */
export const SNAPSHOT_ACCOUNT = {
  startingCash: SNAPSHOT_EQUITY,
  /** Uninvested money. Starting balance less the cost of the open position. */
  cash: 75_379.60,
  /** What the open position would fetch at the current price. */
  holdingsValue: 24_711.12,
  /** Cash plus holdings — the number a beginner means by "how much do I have". */
  equity: 100_090.72,
  /** Change since the account opened. */
  dayPnlUsd: 90.72,
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
  { label: "Trades per day", value: "3", plain: "Stops a bad afternoon from becoming a bad week." },
  { label: "Trades per week", value: "10", plain: "The same idea over a longer stretch." },
  {
    label: "Money in the market at once",
    value: "25% of the account",
    plain: "Three-quarters of the account stays in cash no matter how good things look.",
  },
] as const;
