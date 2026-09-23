-- Historical performance query optimization (BACKLOG.md's "Database query
-- optimization" item, this session's audit).
--
-- Every query in 0023_portfolio_analytics.sql's four SQL functions plus the
-- trade_summary_daily view (get_performance_metrics, get_pnl_by_period,
-- get_performance_by_pattern, get_equity_curve — all four backing
-- GET /api/portfolio/analytics, read every time a user opens the Portfolio
-- page's analytics dashboard) filters `trade_logs` by `user_id = $1`
-- combined with an `exit_timestamp` range/order, and every one of them also
-- requires `outcome is not null` (a trade log row's outcome is only ever
-- set once the trade has actually closed). trade_logs' only existing index
-- (0002_trade_logging.sql) is `(user_id, entry_timestamp desc)` — the wrong
-- timestamp column for a closed-trade analytics read, which entry_timestamp
-- can only partially help (user_id prefix) before falling back to an
-- unindexed sort/filter on exit_timestamp.
--
-- This index matches the shape every one of those queries actually needs:
-- filter by user_id, then range/order by exit_timestamp, scoped to rows
-- that could ever be included (outcome is not null).

create index trade_logs_user_exit_idx
  on public.trade_logs (user_id, exit_timestamp)
  where outcome is not null;
