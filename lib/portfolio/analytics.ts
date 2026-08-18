/**
 * Portfolio analytics over closed trades.
 *
 * Everything here is pure: it takes an array of closed-trade rows (already
 * fetched from `trade_logs`) and returns computed metrics. No Supabase calls
 * live in this file so every function is independently unit-testable — the
 * API route (`app/api/portfolio/analytics/route.ts`) is the thin wrapper that
 * does the fetch and hands rows to these functions.
 *
 * "Closed" means `exit_price` and `exit_timestamp` are both set and `outcome`
 * is `'profit'` or `'loss'` — `'pending'` rows (no settled exit yet) are the
 * caller's job to filter out before calling `isClosedTrade`, or simply pass
 * everything and let `isClosedTrade` do it.
 */

export interface ClosedTrade {
  symbol: string;
  direction: "buy" | "sell";
  quantity: number;
  entry_timestamp: string;
  entry_price: number;
  exit_timestamp: string | null;
  exit_price: number | null;
  outcome: "profit" | "loss" | "pending" | null;
  profit_loss_dollars: number | null;
  profit_loss_percent: number | null;
  signal_called: string | null;
}

/** True when a row is a settled win/loss with a real exit — safe to analyze. */
export function isClosedTrade(
  t: ClosedTrade,
): t is ClosedTrade & {
  exit_timestamp: string;
  exit_price: number;
  outcome: "profit" | "loss";
  profit_loss_dollars: number;
} {
  return (
    t.exit_price != null &&
    t.exit_timestamp != null &&
    (t.outcome === "profit" || t.outcome === "loss") &&
    t.profit_loss_dollars != null
  );
}

/** Keep only settled trades, sorted by exit time ascending (oldest first). */
export function closedTradesInOrder(trades: ClosedTrade[]): ClosedTrade[] {
  return trades
    .filter(isClosedTrade)
    .slice()
    .sort((a, b) => new Date(a.exit_timestamp!).getTime() - new Date(b.exit_timestamp!).getTime());
}

// ---------------------------------------------------------------------------
// Win/loss ratio + profit factor
// ---------------------------------------------------------------------------

export interface WinLossSummary {
  trades: number;
  wins: number;
  losses: number;
  /** 0–100. Null when there are no closed trades. */
  winRatePct: number | null;
  /** wins / losses. Null when there are no losses to divide by (undefined ratio, not Infinity). */
  winLossRatio: number | null;
}

export function winLossSummary(trades: ClosedTrade[]): WinLossSummary {
  const closed = trades.filter(isClosedTrade);
  const wins = closed.filter((t) => t.outcome === "profit").length;
  const losses = closed.filter((t) => t.outcome === "loss").length;
  return {
    trades: closed.length,
    wins,
    losses,
    winRatePct: closed.length === 0 ? null : (wins / closed.length) * 100,
    winLossRatio: losses === 0 ? null : wins / losses,
  };
}

/**
 * Gross profit / gross loss (absolute value). Null when there's no closed
 * trade data at all, or when there's no losing trade to divide by (an
 * all-winners sample has no defined profit factor — reported as null rather
 * than Infinity, which the UI shows as "N/A (no losses)").
 */
export function profitFactor(trades: ClosedTrade[]): number | null {
  const closed = trades.filter(isClosedTrade);
  if (closed.length === 0) return null;
  const grossProfit = closed
    .filter((t) => t.profit_loss_dollars! > 0)
    .reduce((s, t) => s + t.profit_loss_dollars!, 0);
  const grossLoss = closed
    .filter((t) => t.profit_loss_dollars! < 0)
    .reduce((s, t) => s + Math.abs(t.profit_loss_dollars!), 0);
  if (grossLoss === 0) return null;
  return grossProfit / grossLoss;
}

// ---------------------------------------------------------------------------
// Sharpe ratio
// ---------------------------------------------------------------------------

/**
 * Sharpe ratio on the per-trade return series (`profit_loss_percent`, in
 * percentage points, converted to a fraction).
 *
 * Assumption: each closed trade is treated as one "period" — this is a
 * per-trade Sharpe, not a daily one, because `trade_logs` rows are irregular
 * in time (a trade can be minutes or weeks) and bucketing sparse retail
 * trade counts into calendar days would mostly produce single-trade days
 * anyway. To annualize a per-trade series we scale by sqrt(trades per year),
 * estimated from the sample's own trade frequency: trades / (span in days /
 * 365). A risk-free rate of 0 is assumed (retail swing/day trades are held
 * far too briefly for the risk-free rate to matter at this timescale).
 *
 * Returns null below 2 trades (no variance to compute) or when the return
 * series has zero variance (would divide by zero).
 */
export function sharpeRatio(trades: ClosedTrade[]): number | null {
  const closed = closedTradesInOrder(trades).filter(
    (t) => t.profit_loss_percent != null,
  );
  if (closed.length < 2) return null;

  const returns = closed.map((t) => t.profit_loss_percent! / 100);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  if (variance <= 0) return null;
  const stdDev = Math.sqrt(variance);

  const first = new Date(closed[0].exit_timestamp!).getTime();
  const last = new Date(closed[closed.length - 1].exit_timestamp!).getTime();
  const spanDays = Math.max((last - first) / (1000 * 60 * 60 * 24), 1);
  const tradesPerYear = (closed.length / spanDays) * 365;
  const annualizationFactor = Math.sqrt(Math.max(tradesPerYear, 1));

  return (mean / stdDev) * annualizationFactor;
}

// ---------------------------------------------------------------------------
// Max drawdown
// ---------------------------------------------------------------------------

export interface EquityPoint {
  timestamp: string;
  /** Cumulative realized P/L in dollars, starting from a baseline of 0. */
  equity: number;
}

export interface DrawdownResult {
  curve: EquityPoint[];
  /** Largest peak-to-trough decline, in dollars. 0 when no drawdown occurred. */
  maxDrawdownDollars: number;
  /**
   * Largest peak-to-trough decline as a percent of the peak at that time.
   * Null when the peak at the point of max drawdown is 0 or negative (percent
   * drawdown is undefined against a non-positive baseline).
   */
  maxDrawdownPct: number | null;
}

/**
 * Builds a cumulative equity curve from closed trades ordered by exit time,
 * starting equity = 0 (a running sum of realized P/L, not account equity —
 * there's no entry-capital baseline recorded in `trade_logs`, so 0 is the
 * simplest choice that still makes peak-to-trough drawdown meaningful). Then
 * finds the largest peak-to-trough decline.
 */
export function maxDrawdown(trades: ClosedTrade[]): DrawdownResult {
  const closed = closedTradesInOrder(trades);
  if (closed.length === 0) {
    return { curve: [], maxDrawdownDollars: 0, maxDrawdownPct: null };
  }

  let running = 0;
  const curve: EquityPoint[] = closed.map((t) => {
    running += t.profit_loss_dollars!;
    return { timestamp: t.exit_timestamp!, equity: running };
  });

  let peak = curve[0].equity;
  let peakForMaxDrawdown = peak;
  let maxDrawdownDollars = 0;

  for (const point of curve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak - point.equity;
    if (drawdown > maxDrawdownDollars) {
      maxDrawdownDollars = drawdown;
      peakForMaxDrawdown = peak;
    }
  }

  const maxDrawdownPct =
    peakForMaxDrawdown > 0 ? (maxDrawdownDollars / peakForMaxDrawdown) * 100 : null;

  return { curve, maxDrawdownDollars, maxDrawdownPct };
}

// ---------------------------------------------------------------------------
// Monthly / quarterly P&L rollups
// ---------------------------------------------------------------------------

export interface PnlBucket {
  /** "2026-08" for monthly, "2026-Q3" for quarterly. */
  key: string;
  pnlDollars: number;
  trades: number;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function bucketPnl(trades: ClosedTrade[], keyFn: (d: Date) => string): PnlBucket[] {
  const closed = closedTradesInOrder(trades);
  const buckets = new Map<string, PnlBucket>();
  for (const t of closed) {
    const key = keyFn(new Date(t.exit_timestamp!));
    const existing = buckets.get(key);
    if (existing) {
      existing.pnlDollars += t.profit_loss_dollars!;
      existing.trades += 1;
    } else {
      buckets.set(key, { key, pnlDollars: t.profit_loss_dollars!, trades: 1 });
    }
  }
  // Map insertion order follows the sorted trades, so buckets already come
  // out chronological — no separate sort needed.
  return Array.from(buckets.values());
}

/** Sum of `profit_loss_dollars` per calendar month (UTC), by exit_timestamp. */
export function monthlyPnl(trades: ClosedTrade[]): PnlBucket[] {
  return bucketPnl(trades, monthKey);
}

/** Sum of `profit_loss_dollars` per calendar quarter (UTC), by exit_timestamp. */
export function quarterlyPnl(trades: ClosedTrade[]): PnlBucket[] {
  return bucketPnl(trades, quarterKey);
}

// ---------------------------------------------------------------------------
// Performance by pattern / signal type
// ---------------------------------------------------------------------------

export interface PatternPerformance {
  /** `signal_called` value — the free-text pattern/signal description. */
  pattern: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalPnlDollars: number;
  avgPnlDollars: number;
}

/**
 * Groups closed trades by `signal_called` and reports per-group win rate,
 * count, total P&L, and average P&L. Sorted by total P&L descending, so the
 * most profitable pattern reads first.
 */
export function performanceByPattern(trades: ClosedTrade[]): PatternPerformance[] {
  const closed = trades.filter(isClosedTrade);
  const groups = new Map<string, ClosedTrade[]>();
  for (const t of closed) {
    const key = t.signal_called?.trim() || "Unspecified";
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const out: PatternPerformance[] = [];
  for (const [pattern, group] of groups) {
    const wins = group.filter((t) => t.outcome === "profit").length;
    const losses = group.filter((t) => t.outcome === "loss").length;
    const totalPnlDollars = group.reduce((s, t) => s + t.profit_loss_dollars!, 0);
    out.push({
      pattern,
      trades: group.length,
      wins,
      losses,
      winRatePct: (wins / group.length) * 100,
      totalPnlDollars,
      avgPnlDollars: totalPnlDollars / group.length,
    });
  }

  return out.sort((a, b) => b.totalPnlDollars - a.totalPnlDollars);
}

// ---------------------------------------------------------------------------
// Combined summary (what the API route returns)
// ---------------------------------------------------------------------------

export interface PortfolioAnalytics {
  winLoss: WinLossSummary;
  profitFactor: number | null;
  sharpeRatio: number | null;
  drawdown: DrawdownResult;
  monthlyPnl: PnlBucket[];
  quarterlyPnl: PnlBucket[];
  byPattern: PatternPerformance[];
}

export function computePortfolioAnalytics(trades: ClosedTrade[]): PortfolioAnalytics {
  return {
    winLoss: winLossSummary(trades),
    profitFactor: profitFactor(trades),
    sharpeRatio: sharpeRatio(trades),
    drawdown: maxDrawdown(trades),
    monthlyPnl: monthlyPnl(trades),
    quarterlyPnl: quarterlyPnl(trades),
    byPattern: performanceByPattern(trades),
  };
}
