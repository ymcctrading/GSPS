-- get_performance_metrics declares total_trades/winning_trades/losing_trades
-- as `int`, but count(*) returns `bigint` — Postgres does not implicitly
-- narrow that in a RETURN QUERY, so the function raised
-- `42804: structure of query does not match function result type` on its
-- first real invocation (caught immediately after fixing the variable_conflict
-- bug in 0026 and actually running this function for the first time). The
-- other five functions already cast their count(*) outputs to ::int; this one
-- was the one that didn't.

create or replace function public.get_performance_metrics(
  user_id uuid,
  start_date date default current_date - interval '90 days',
  end_date date default current_date
)
returns table (
  total_trades int,
  winning_trades int,
  losing_trades int,
  win_rate numeric,
  avg_win numeric,
  avg_loss numeric,
  expectancy numeric,
  largest_win numeric,
  largest_loss numeric,
  total_pnl numeric,
  total_return_pct numeric,
  sharpe_ratio numeric,
  max_drawdown numeric,
  max_drawdown_pct numeric,
  profit_factor numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> user_id) then
    raise exception 'not authorized to read another user''s performance data'
      using errcode = '42501';
  end if;

  return query
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
      count(*)::int as total_trades,
      count(*) filter (where outcome = 'profit')::int as winning_trades,
      count(*) filter (where outcome = 'loss')::int as losing_trades,
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
    null::numeric,
    null::numeric,
    null::numeric,
    case
      when summary.total_losses = 0 or summary.total_wins = 0 then 0
      else round(summary.total_wins / abs(summary.total_losses), 2)
    end
  from summary;
end;
$$;
