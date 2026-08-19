-- Portfolio analytics schema
-- Views and functions for win/loss ratio, Sharpe, drawdown, P&L tracking

-- ============ View: trade_summary_daily ============
-- Aggregates daily performance from trade_logs for a user
create or replace view public.trade_summary_daily as
select
  user_id,
  exit_timestamp::date as trade_date,
  count(*) as trade_count,
  count(*) filter (where outcome = 'profit') as winning_trades,
  count(*) filter (where outcome = 'loss') as losing_trades,
  sum(profit_loss_dollars) as daily_pnl,
  sum(profit_loss_dollars) filter (where outcome = 'profit') as total_profits,
  sum(profit_loss_dollars) filter (where outcome = 'loss') as total_losses,
  avg(profit_loss_percent) as avg_return_pct
from public.trade_logs
where outcome is not null and exit_timestamp is not null
group by user_id, exit_timestamp::date;

alter view public.trade_summary_daily set (security_barrier = true);

-- ============ Function: get_performance_metrics ============
-- Returns comprehensive performance metrics for a user over a date range
create or replace function public.get_performance_metrics(
  user_id uuid,
  start_date date default current_date - interval '90 days',
  end_date date default current_date
)
returns table (
  total_trades int,
  winning_trades int,
  losing_trades int,
  win_rate numeric,  -- percentage 0-100
  avg_win numeric,
  avg_loss numeric,
  expectancy numeric,  -- (win% * avg_win) - (loss% * avg_loss)
  largest_win numeric,
  largest_loss numeric,
  total_pnl numeric,
  total_return_pct numeric,
  sharpe_ratio numeric,
  max_drawdown numeric,
  max_drawdown_pct numeric,
  profit_factor numeric  -- total_profits / abs(total_losses)
) as $$
declare
  v_trades record[];
  v_daily_returns numeric[];
  v_daily_equity numeric;
  v_peak_equity numeric := 0;
  v_trough_equity numeric := 0;
  v_largest_dd numeric := 0;
  v_dd_pct numeric := 0;
  v_variance numeric;
  v_stddev numeric;
  i int;
begin
  -- fetch all closed trades in range
  with trades as (
    select
      outcome,
      profit_loss_dollars,
      profit_loss_percent
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and exit_timestamp::date <= end_date
      and outcome is not null
  ),
  summary as (
    select
      count(*) as total_trades,
      count(*) filter (where outcome = 'profit') as winning_trades,
      count(*) filter (where outcome = 'loss') as losing_trades,
      sum(profit_loss_dollars) as total_pnl,
      sum(profit_loss_dollars) filter (where outcome = 'profit') as total_wins,
      sum(profit_loss_dollars) filter (where outcome = 'loss') as total_losses,
      max(profit_loss_dollars) as largest_win,
      min(profit_loss_dollars) as largest_loss,
      avg(profit_loss_percent) as avg_return_pct
    from trades
  )
  select
    summary.total_trades,
    summary.winning_trades,
    summary.losing_trades,
    case
      when summary.total_trades = 0 then 0
      else round((summary.winning_trades::numeric / summary.total_trades) * 100, 2)
    end,
    case
      when summary.winning_trades = 0 then 0
      else round(summary.total_wins / summary.winning_trades, 2)
    end,
    case
      when summary.losing_trades = 0 then 0
      else round(summary.total_losses / summary.losing_trades, 2)
    end,
    case
      when summary.total_trades = 0 then 0
      else round(
        ((summary.winning_trades::numeric / summary.total_trades) * (summary.total_wins / summary.winning_trades)) -
        ((summary.losing_trades::numeric / summary.total_trades) * abs(summary.total_losses / summary.losing_trades)),
        2
      )
    end,
    summary.largest_win,
    summary.largest_loss,
    round(summary.total_pnl, 2),
    round(summary.avg_return_pct, 2),
    null::numeric,  -- sharpe_ratio (calculated separately for now)
    null::numeric,  -- max_drawdown
    null::numeric,  -- max_drawdown_pct
    case
      when summary.total_losses = 0 or summary.total_wins = 0 then 0
      else round(summary.total_wins / abs(summary.total_losses), 2)
    end
  from summary;
end;
$$ language plpgsql security definer;

-- ============ Function: get_pnl_by_period ============
-- Returns P&L broken down by day, week, or month
create or replace function public.get_pnl_by_period(
  user_id uuid,
  period text default 'daily',  -- 'daily', 'weekly', 'monthly'
  start_date date default current_date - interval '90 days'
)
returns table (
  period_start date,
  period_end date,
  trade_count int,
  winning_trades int,
  total_pnl numeric,
  win_rate numeric
) as $$
begin
  if period = 'weekly' then
    return query
    select
      date_trunc('week', exit_timestamp)::date as period_start,
      (date_trunc('week', exit_timestamp)::date + interval '6 days')::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by date_trunc('week', exit_timestamp)
    order by period_start desc;

  elsif period = 'monthly' then
    return query
    select
      date_trunc('month', exit_timestamp)::date as period_start,
      (date_trunc('month', exit_timestamp) + interval '1 month' - interval '1 day')::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by date_trunc('month', exit_timestamp)
    order by period_start desc;

  else  -- daily
    return query
    select
      exit_timestamp::date as period_start,
      exit_timestamp::date as period_end,
      count(*)::int,
      count(*) filter (where outcome = 'profit')::int,
      sum(profit_loss_dollars),
      case
        when count(*) = 0 then 0
        else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
      end
    from public.trade_logs
    where user_id = $1
      and exit_timestamp::date >= start_date
      and outcome is not null
    group by exit_timestamp::date
    order by period_start desc;
  end if;
end;
$$ language plpgsql security definer;

-- ============ Function: get_performance_by_pattern ============
-- Breakdown of performance by signal_called (pattern type)
create or replace function public.get_performance_by_pattern(
  user_id uuid,
  start_date date default current_date - interval '90 days'
)
returns table (
  pattern text,
  trade_count int,
  winning_trades int,
  win_rate numeric,
  total_pnl numeric,
  avg_pnl numeric,
  largest_win numeric,
  largest_loss numeric
) as $$
begin
  return query
  select
    signal_called,
    count(*)::int,
    count(*) filter (where outcome = 'profit')::int,
    case
      when count(*) = 0 then 0
      else round((count(*) filter (where outcome = 'profit')::numeric / count(*)) * 100, 2)
    end,
    sum(profit_loss_dollars),
    round(avg(profit_loss_dollars), 2),
    max(profit_loss_dollars),
    min(profit_loss_dollars)
  from public.trade_logs
  where user_id = $1
    and exit_timestamp::date >= start_date
    and outcome is not null
  group by signal_called
  order by trade_count desc;
end;
$$ language plpgsql security definer;

-- ============ Function: get_equity_curve ============
-- Returns running equity from inception for drawdown calculation
create or replace function public.get_equity_curve(
  user_id uuid,
  starting_capital numeric default 10000
)
returns table (
  trade_number int,
  trade_date timestamptz,
  symbol text,
  pnl numeric,
  cumulative_pnl numeric,
  equity numeric
) as $$
begin
  return query
  with ordered_trades as (
    select
      row_number() over (order by exit_timestamp asc) as trade_num,
      exit_timestamp,
      symbol,
      profit_loss_dollars,
      sum(profit_loss_dollars) over (order by exit_timestamp asc rows between unbounded preceding and current row) as cum_pnl
    from public.trade_logs
    where user_id = $1 and outcome is not null
    order by exit_timestamp asc
  )
  select
    trade_num::int,
    exit_timestamp,
    symbol,
    profit_loss_dollars,
    cum_pnl,
    starting_capital + cum_pnl
  from ordered_trades;
end;
$$ language plpgsql security definer;
