/**
 * `get_performance_metrics` (migration 0023) returns `sharpe_ratio` and
 * `max_drawdown`/`max_drawdown_pct` as `null` — its own comment says
 * "calculated separately for now". `get_equity_curve` does give the raw
 * per-trade running equity though, so these two fill that gap client-side
 * from data the backend already serves, rather than duplicating the rest of
 * what `get_performance_metrics` already computes server-side.
 */

export interface EquityPoint {
  trade_date: string;
  pnl: number;
  equity: number;
}

export interface MaxDrawdown {
  amount: number;
  /** Percent of the peak equity at the point of maximum drawdown. `null` when
   * the peak was 0 (a percentage would be undefined, not zero). */
  percent: number | null;
}

/** Peak-to-trough max drawdown over the equity curve, in order. */
export function maxDrawdown(points: EquityPoint[]): MaxDrawdown | null {
  if (points.length === 0) return null;
  let peak = points[0].equity;
  let worst = 0;
  let worstPct: number | null = null;
  for (const p of points) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > worst) {
      worst = dd;
      worstPct = peak !== 0 ? (dd / Math.abs(peak)) * 100 : null;
    }
  }
  return { amount: worst, percent: worstPct };
}

/**
 * Per-trade Sharpe ratio, annualized by the sample's own trade frequency
 * (trades/year estimated from the span between the first and last trade).
 * Risk-free rate is treated as 0. Returns `null` for fewer than 2 trades or
 * zero variance (a straight line has no ratio, not an infinite one).
 */
export function sharpeRatio(points: EquityPoint[]): number | null {
  if (points.length < 2) return null;

  const returns = points.map((p) => p.pnl);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  if (variance === 0) return null;
  const stddev = Math.sqrt(variance);

  const first = new Date(points[0].trade_date).getTime();
  const last = new Date(points[points.length - 1].trade_date).getTime();
  const spanDays = Math.max(1, (last - first) / 86_400_000);
  const tradesPerYear = points.length / (spanDays / 365);

  return (mean / stddev) * Math.sqrt(tradesPerYear);
}
